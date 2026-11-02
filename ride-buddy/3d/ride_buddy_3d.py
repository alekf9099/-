"""
Ride Buddy 3D — Blender 모델링 + 모션 렌더 파이프라인
=====================================================
Blender(5.x) 로 캐릭터와 바이크를 실제 3D 메시로 모델링하고,
Cycles 로 모션별 프레임(투명 PNG)을 렌더링합니다.

  # 정지 이미지 미리보기
  python ride_buddy_3d.py --still out.png [--motion notify --t 0.8] [--res 800]
  # 전체 모션 렌더 → out_dir/<motion>/frame_000.png ...
  python ride_buddy_3d.py --motions out_dir [--only ride_r,talk] [--res 400] [--samples 48]
  # .blend / .glb 저장
  python ride_buddy_3d.py --blend ride_buddy.blend --glb ride_buddy.glb

(Blender 앱에서 열려면: blender --background --python ride_buddy_3d.py -- --blend ride_buddy.blend)

좌표계: Z-up. 바이크 정면 = -Y, 탑승자 오른쪽 = -X.
루트(Root)를 Z 축으로 yaw 회전시켜 3/4 정면 뷰를 만듭니다 (+yaw → 화면 오른쪽으로 주행).
"""
import bpy
import bmesh
import math
import sys
import os
import argparse
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion

# --------------------------------------------------------------------------------------
# 공통 유틸
# --------------------------------------------------------------------------------------
TAU = math.tau
COL = bpy.context.scene.collection if bpy.context.scene else None


def srgb(h):
    """'#RRGGBB' → 선형 RGBA"""
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    o.empty_display_size = 0.1
    return link(o, parent)


def smooth(obj, subsurf=0, auto=True):
    for p in obj.data.polygons:
        p.use_smooth = True
    if subsurf:
        m = obj.modifiers.new('sub', 'SUBSURF')
        m.levels = subsurf
        m.render_levels = subsurf
    return obj


def mesh_obj(name, bm, parent=None, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o, parent)
    if mat:
        o.data.materials.append(mat)
    return o


def sphere(name, loc, scale, mat, parent=None, seg=48, rings=24, sub=1, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    o = mesh_obj(name, bm, parent, mat)
    o.location = loc
    o.scale = scale
    o.rotation_euler = rot
    return smooth(o, sub)


def cyl(name, p0, p1, r0, r1=None, mat=None, parent=None, seg=40, caps=True, sub=0):
    """p0 → p1 을 잇는 원기둥/원뿔 (부모 로컬 좌표)"""
    r1 = r0 if r1 is None else r1
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=d.length)
    o = mesh_obj(name, bm, parent, mat)
    o.location = (p0 + p1) / 2
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    smooth(o, sub)
    if sub == 0:
        for p in o.data.polygons:
            p.use_smooth = abs(p.normal.z) < 0.9  # 옆면만 부드럽게
    return o


def capsule(name, p0, p1, r0, r1, mat, parent=None):
    """둥근 팔다리: 원뿔 + 양끝 구"""
    g = empty(name, parent=parent)
    cyl(name + '_body', p0, p1, r0, r1, mat, g, caps=False)
    sphere(name + '_a', p0, (r0, r0, r0), mat, g, sub=0, seg=32, rings=16)
    sphere(name + '_b', p1, (r1, r1, r1), mat, g, sub=0, seg=32, rings=16)
    return g


def rbox(name, loc, size, mat, parent=None, bevel=0.03, rot=(0, 0, 0), sub=0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    o = mesh_obj(name, bm, parent, mat)
    o.location = loc
    o.scale = size
    o.rotation_euler = rot
    if bevel:
        m = o.modifiers.new('bev', 'BEVEL')
        m.width = bevel
        m.segments = 4
        m.affect = 'EDGES'
    smooth(o, sub)
    for p in o.data.polygons:
        p.use_smooth = True
    m = o.modifiers.new('wn', 'WEIGHTED_NORMAL') if bevel else None
    return o


def torus(name, loc, R, r, mat, parent=None, rot=(0, 0, 0), seg=64, mseg=24, arc=None):
    """arc=(a0,a1) 라디안이면 해당 각도 구간만 (펜더용)"""
    bm = bmesh.new()
    a0, a1 = arc if arc else (0, TAU)
    full = arc is None
    n = seg if full else max(8, int(seg * (a1 - a0) / TAU))
    rings = []
    for i in range(n if full else n + 1):
        a = a0 + (a1 - a0) * i / (n if full else n)
        c = Vector((math.cos(a) * R, math.sin(a) * R, 0))
        out = Vector((math.cos(a), math.sin(a), 0))
        ring = []
        for j in range(mseg):
            b = TAU * j / mseg
            ring.append(bm.verts.new(c + out * (r * math.cos(b)) + Vector((0, 0, r * math.sin(b)))))
        rings.append(ring)
    for i in range(len(rings) - (0 if full else 1)):
        A, B = rings[i], rings[(i + 1) % len(rings)]
        for j in range(mseg):
            bm.faces.new((A[j], A[(j + 1) % mseg], B[(j + 1) % mseg], B[j]))
    if not full:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    o = mesh_obj(name, bm, parent, mat)
    o.location = loc
    o.rotation_euler = rot
    return smooth(o)


def curve_obj(name, pts, bevel, mat, parent=None, cyclic=False, kind='NURBS', order=3, caps=True):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = bevel
    cu.bevel_resolution = 6
    cu.use_fill_caps = caps
    cu.resolution_u = 16
    sp = cu.splines.new(kind)
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (*q, 1.0)
    if kind == 'NURBS':
        sp.order_u = min(order, len(pts))
        sp.use_endpoint_u = not cyclic
    sp.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, cu)
    link(o, parent)
    o.data.materials.append(mat)
    return o


def text_obj(name, body, size, mat, parent=None, extrude=0.03, bevel=0.012):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bevel
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    o = bpy.data.objects.new(name, cu)
    link(o, parent)
    o.data.materials.append(mat)
    return o


# --------------------------------------------------------------------------------------
# 재질
# --------------------------------------------------------------------------------------
def principled(name, color, rough=0.5, metal=0.0, coat=0.0, sss=0.0, emit=None, emit_str=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = srgb(color) if isinstance(color, str) else color
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.05
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (0.4, 0.15, 0.08)
        b.inputs['Subsurface Scale'].default_value = 0.05
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = emit_str
    b.inputs['Specular IOR Level'].default_value = spec
    return m


def add_bump(mat, scale=200.0, strength=0.3, kind='NOISE', detail=2.0):
    nt = mat.node_tree
    b = nt.nodes.get('Principled BSDF')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    if kind == 'NOISE':
        tx = nt.nodes.new('ShaderNodeTexNoise')
        tx.inputs['Scale'].default_value = scale
        tx.inputs['Detail'].default_value = detail
    else:
        tx = nt.nodes.new('ShaderNodeTexVoronoi')
        tx.inputs['Scale'].default_value = scale
    nt.links.new(tc.outputs['Object'], tx.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    nt.links.new(tx.outputs[0] if kind == 'NOISE' else tx.outputs['Distance'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return mat


def flame_texture(name='flames', w=1024, h=512, seed=7):
    """검정 바탕 + 아래에서 타오르는 불꽃 프린트 (셔츠 텍스처)"""
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 4), np.float32)
    img[..., :3] = np.array(srgb('#221C1A')[:3])
    img[..., 3] = 1
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    layers = [(1.0, '#D9341C'), (0.74, '#F2801C'), (0.46, '#FFC93C')]

    def draw(x0, base, fw, fh, lean):
        for s, col in layers:
            hh, ww = fh * s, fw * s
            yn = (yy - base) / hh
            inside_y = (yn >= 0) & (yn <= 1)
            cx = x0 + lean * ww * np.sin(yn * math.pi * 1.2) * 0.6
            prof = (ww / 2) * np.power(np.clip(1 - yn, 0, 1), 0.85) * np.clip(0.55 + 1.6 * yn, 0, 1.0)
            for off in (-w, 0, w):  # 가로 반복(이음매 없음)
                d = np.abs(xx - cx - off)
                m = inside_y & (d < prof)
                img[m, :3] = np.array(srgb(col)[:3])

    # 아랫단: 큰 불꽃 줄
    x = 0.0
    while x < w:
        fw = rng.uniform(70, 110)
        draw(x, -10, fw, rng.uniform(170, 300), rng.choice([-1, 1]) * rng.uniform(0.2, 0.5))
        x += fw * 0.62
    # 중간: 작은 불꽃 다발
    for _ in range(14):
        cx, cy = rng.uniform(0, w), rng.uniform(250, 420)
        for k in (-1, 0, 1):
            draw(cx + k * 18, cy, 26 if k else 32, 60 if k else 85, k * 0.4)
    im = bpy.data.images.new(name, w, h, alpha=True)
    im.pixels.foreach_set(img.ravel())
    im.pack()
    return im


def shirt_material(img, box=False):
    m = bpy.data.materials.new('ShirtBox' if box else 'Shirt')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    b.inputs['Roughness'].default_value = 0.62
    b.inputs['Sheen Weight'].default_value = 0.35
    tc = nt.nodes.new('ShaderNodeTexCoord')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'REPEAT'
    if box:  # 소매처럼 작은 파츠: 오브젝트 좌표 박스 투영
        tex.projection = 'BOX'
        tex.projection_blend = 0.3
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1.4, 1.4, 1.4)
        mp.inputs['Location'].default_value = (0.3, 0.3, 0.55)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
    else:
        tex.projection = 'TUBE'
        nt.links.new(tc.outputs['Generated'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    add_bump(m, 400, 0.08)
    return m


def skin_material():
    """피부 + 볼터치(볼 위치에 부드러운 핑크) — 볼 위치는 Head 로컬 좌표"""
    m = principled('Skin', '#F7DCC3', rough=0.48, sss=0.12, coat=0.08)
    return m


def head_material():
    """머리 전용 재질: 피부 + 스포츠머리(헤어라인 마스크) + 볼터치. 좌표 = 머리 로컬(단위 구)"""
    m = bpy.data.materials.new('HeadSkin')
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N.get('Principled BSDF')
    b.inputs['Subsurface Weight'].default_value = 0.1
    b.inputs['Subsurface Radius'].default_value = (0.4, 0.15, 0.08)
    b.inputs['Subsurface Scale'].default_value = 0.05
    b.inputs['Coat Weight'].default_value = 0.06
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Object'], sep.inputs['Vector'])

    def math_(op, a, b_=None, v=None):
        n = N.new('ShaderNodeMath')
        n.operation = op
        for i, x in enumerate((a, b_)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                L.new(x, n.inputs[i])
        return n.outputs[0]

    X, Y, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    front = math_('MAXIMUM', math_('MULTIPLY', Y, -1.0), 0.0)
    back = math_('MAXIMUM', Y, 0.0)
    # T = 0.12 + 0.44*front - 0.45*back + 0.08*front*exp(-((|x|-0.42)/0.15)^2)
    g = math_('DIVIDE', math_('SUBTRACT', math_('ABSOLUTE', X), 0.42), 0.15)
    gauss = math_('EXPONENT', math_('MULTIPLY', math_('MULTIPLY', g, g), -1.0))
    T = math_('ADD', math_('ADD', 0.12, math_('MULTIPLY', front, 0.44)), math_('MULTIPLY', back, -0.45))
    T = math_('ADD', T, math_('MULTIPLY', math_('MULTIPLY', front, gauss), 0.08))
    d = math_('SUBTRACT', Z, T)
    mr = N.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = -0.012
    mr.inputs['From Max'].default_value = 0.012
    L.new(d, mr.inputs['Value'])
    hair = mr.outputs['Result']

    # 볼터치: 두 점까지의 거리
    def blush_at(x0):
        v = N.new('ShaderNodeVectorMath')
        v.operation = 'DISTANCE'
        L.new(tc.outputs['Object'], v.inputs[0])
        v.inputs[1].default_value = (x0, -0.72, -0.3)
        r = N.new('ShaderNodeMapRange')
        r.interpolation_type = 'SMOOTHSTEP'
        r.inputs['From Min'].default_value = 0.30
        r.inputs['From Max'].default_value = 0.10
        L.new(v.outputs['Value'], r.inputs['Value'])
        return r.outputs['Result']
    blush = math_('MAXIMUM', blush_at(0.62), blush_at(-0.62))

    mix1 = N.new('ShaderNodeMix'); mix1.data_type = 'RGBA'
    mix1.inputs['A'].default_value = srgb('#FBE1C8')
    mix1.inputs['B'].default_value = srgb('#F7A1A6')
    L.new(math_('MULTIPLY', blush, 0.85), mix1.inputs['Factor'])
    mix2 = N.new('ShaderNodeMix'); mix2.data_type = 'RGBA'
    L.new(mix1.outputs['Result'], mix2.inputs['A'])
    mix2.inputs['B'].default_value = srgb('#857869')
    L.new(hair, mix2.inputs['Factor'])
    L.new(mix2.outputs['Result'], b.inputs['Base Color'])
    rough = N.new('ShaderNodeMix'); rough.data_type = 'FLOAT'
    rough.inputs['A'].default_value = 0.45
    rough.inputs['B'].default_value = 0.95
    L.new(hair, rough.inputs['Factor'])
    L.new(rough.outputs['Result'], b.inputs['Roughness'])
    # 머리카락 결 (짧은 스포츠머리)
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 600; nz.inputs['Detail'].default_value = 3
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.004
    L.new(math_('MULTIPLY', hair, 0.6), bump.inputs['Strength'])
    L.new(nz.outputs['Fac'], bump.inputs['Height'])
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def blush_material():
    m = bpy.data.materials.new('Blush')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    pb = nt.nodes.new('ShaderNodeBsdfPrincipled')
    pb.inputs['Base Color'].default_value = srgb('#F59AA3')
    pb.inputs['Roughness'].default_value = 0.5
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    # 원판 중심에서 멀수록 투명 (가장자리 부드럽게)
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (-0.5, -0.5, -0.5)
    mp.inputs['Scale'].default_value = (1.0, 1.0, 1.0)
    vm = nt.nodes.new('ShaderNodeVectorMath')
    vm.operation = 'MULTIPLY'
    vm.inputs[1].default_value = (2, 2, 2)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], vm.inputs[0])
    nt.links.new(vm.outputs['Vector'], grad.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.55
    ramp.color_ramp.elements[1].color = (0.85, 0.85, 0.85, 1)
    nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], mix.inputs['Fac'])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(pb.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


def world_studio():
    w = bpy.data.worlds.new('Studio')
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes.get('Background')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -1
    mr.inputs['From Max'].default_value = 1
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.0, (0.05, 0.05, 0.06, 1)
    e[1].position, e[1].color = 1.0, (1.0, 1.0, 1.0, 1)
    mid = e.new(0.5)
    mid.color = (0.32, 0.34, 0.38, 1)
    hz = e.new(0.53)
    hz.color = (0.85, 0.88, 0.92, 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.45


# --------------------------------------------------------------------------------------
# 모델링
# --------------------------------------------------------------------------------------
class Model:
    pass


HEAD_R = Vector((0.80, 0.68, 0.655))   # 머리 타원체 반지름 (x, y, z)
HEAD_C = Vector((0.0, -0.04, 0.56))    # 목 피벗 기준 머리 중심


def head_surface(u, v, off=0.0):
    """얼굴 정면 정규좌표 (u: -1..1 좌우, v: -1..1 상하) → (목 피벗 로컬 위치, 법선)"""
    a, b, c = HEAD_R
    x, z = a * u, c * v
    t = max(0.0, 1 - u * u - v * v)
    y = -b * math.sqrt(t)
    n = Vector((x / a ** 2, y / b ** 2, z / c ** 2)).normalized()
    p = Vector((x, y, z)) + HEAD_C + n * off
    return p, n


def face_curve(name, uv_pts, bevel, mat, parent, off=0.012):
    pts = [head_surface(u, v, off)[0] for u, v in uv_pts]
    return curve_obj(name, pts, bevel, mat, parent)


def on_face(obj, u, v, off=0.0, spin=0.0):
    p, n = head_surface(u, v, off)
    obj.location = p
    obj.rotation_mode = 'QUATERNION'
    q = Vector((0, -1, 0)).rotation_difference(n)
    obj.rotation_quaternion = q @ Quaternion((0, 1, 0), spin)
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    world_studio()
    M = Model()

    # ---------------- 재질 ----------------
    mat = dict(
        skin=skin_material(),
        headskin=head_material(),
        hair=add_bump(principled('Hair', '#7E7268', rough=0.95), 900, 0.6),
        eye=principled('Eye', '#0E0A09', rough=0.28, coat=0.35, spec=0.25),
        white=principled('EyeHL', '#FFFFFF', rough=0.2, emit='#FFFFFF', emit_str=1.6),
        line=principled('Line', '#3A2A24', rough=0.6),
        mouth=principled('MouthIn', '#4A1716', rough=0.55),
        tongue=principled('Tongue', '#EF7B80', rough=0.45),
        blushline=principled('BlushLine', '#D9606C', rough=0.6),
        shirt=shirt_material(flame_texture()),
        shirtbox=shirt_material(bpy.data.images['flames'], box=True),
        black=add_bump(principled('Shorts', '#1F1B1A', rough=0.7), 300, 0.05),
        red=principled('RedPaint', '#D8301F', rough=0.22, coat=1.0),
        stripe=principled('Stripe', '#FFF6EE', rough=0.25, coat=1.0),
        chrome=principled('Chrome', '#F2F4F6', rough=0.08, metal=1.0),
        satin=principled('Satin', '#B9BEC4', rough=0.32, metal=1.0),
        engine=principled('Engine', '#4A4849', rough=0.42, metal=0.7),
        frame=principled('Frame', '#1C1A1A', rough=0.35, coat=0.6),
        tire=add_bump(principled('Tire', '#1E1A19', rough=0.8), 60, 0.25, kind='VORONOI'),
        orange=principled('Blinker', '#F7921E', rough=0.15, coat=1.0, emit='#FFA733', emit_str=0.0),
        lens=principled('Lens', '#F6E6C2', rough=0.12, emit='#FFE9B8', emit_str=0.12),
        taillight=principled('Tail', '#C8121A', rough=0.15, coat=1.0, emit='#FF2A2A', emit_str=0.3),
        mirror=principled('MirrorBack', '#141111', rough=0.18, coat=1.0),
        yellow=principled('Yellow', '#FFD23F', rough=0.3, coat=0.6),
        zzz=principled('Zzz', '#7F93B4', rough=0.4, coat=0.4),
        heart=principled('Heart', '#FF5D7A', rough=0.3, coat=0.8),
        smoke=principled('Smoke', '#D6DADF', rough=0.9),
        blush=blush_material(),
    )
    M.mat = mat

    # ---------------- 리그(계층) ----------------
    M.root = empty('Root')                       # yaw 회전
    M.bounce = empty('Bounce', parent=M.root)    # 차체 진동
    M.bike = empty('Bike', parent=M.bounce)
    M.rider = empty('Rider', (0, 0.12, 0), parent=M.bounce)
    M.neck = empty('Neck', (0, 0.0, 1.42), parent=M.rider)

    build_bike(M, mat)
    build_rider(M, mat)
    build_head(M, mat)
    build_fx(M, mat)
    setup_scene(M)
    return M


def build_bike(M, mat):
    B = M.bike
    # 바퀴 (축 = X)
    rotY = (0, math.pi / 2, 0)
    M.wheels = []
    for name, y in (('Front', -0.74), ('Rear', 0.66)):
        w = empty(f'Wheel{name}', (0, y, 0.335), B)
        tire = torus(f'Tire{name}', (0, 0, 0), 0.245, 0.1, mat['tire'], w, rot=rotY, seg=96, mseg=28)
        tire.scale = (1.25, 1, 1)  # 타이어 폭
        cyl(f'Rim{name}', (-0.055, 0, 0), (0.055, 0, 0), 0.2, mat=mat['engine'], parent=w, seg=64)
        cyl(f'RimFace{name}', (-0.058, 0, 0), (0.058, 0, 0), 0.165, mat=mat['satin'], parent=w, seg=64)
        cyl(f'Hub{name}', (-0.09, 0, 0), (0.09, 0, 0), 0.055, mat=mat['chrome'], parent=w)
        for k in range(5):  # 스포크
            a = TAU * k / 5
            p1 = (0, 0.17 * math.cos(a), 0.17 * math.sin(a))
            cyl(f'Spoke{name}{k}', (0, 0, 0), p1, 0.018, 0.024, mat['engine'], w)
        if name == 'Front':
            cyl('Disc', (-0.075, 0, 0), (-0.068, 0, 0), 0.15, mat=mat['satin'], parent=w)
        M.wheels.append(w)

    # 앞 펜더 / 포크 / 스티어링
    torus('FenderF', (0, -0.74, 0.335), 0.37, 0.09, mat['red'], B, rot=(0, math.pi / 2, 0), arc=(math.radians(20), math.radians(150)), mseg=20).scale = (1, 1, 1)
    for s in (-1, 1):
        cyl(f'Fork{s}', (0.115 * s, -0.6, 1.0), (0.115 * s, -0.74, 0.34), 0.032, 0.036, mat['chrome'], B)
        cyl(f'ForkBoot{s}', (0.115 * s, -0.66, 0.66), (0.115 * s, -0.73, 0.4), 0.045, mat=mat['satin'], parent=B)
    # 전조등
    hl = empty('Headlight', (0, -0.8, 0.94), B)
    hl.scale = (1.25, 1.25, 1.25)
    sphere('HLBucket', (0, 0.06, 0), (0.17, 0.13, 0.17), mat['chrome'], hl)
    torus('HLRim', (0, -0.035, 0), 0.158, 0.024, mat['chrome'], hl, rot=(math.pi / 2, 0, 0))
    lens = sphere('HLLens', (0, -0.03, 0), (0.15, 0.04, 0.15), mat['lens'], hl)
    M.lens = lens
    # 렌즈 세로 줄무늬
    for i in range(-3, 4):
        cyl(f'HLRib{i}', (i * 0.036, -0.068, -0.13 + abs(i) * 0.012), (i * 0.036, -0.068, 0.13 - abs(i) * 0.012), 0.004, mat=mat['stripe'], parent=hl, seg=8)
    # 깜빡이
    M.blinkers = []
    for s in (-1, 1):
        cyl(f'BlinkStalk{s}', (0.13 * s, -0.72, 0.95), (0.28 * s, -0.75, 0.96), 0.012, mat=mat['frame'], parent=B)
        M.blinkers.append(sphere(f'Blinker{s}', (0.31 * s, -0.76, 0.96), (0.065, 0.08, 0.065), mat['orange'], B))
    for s in (-1, 1):
        cyl(f'RBlinkStalk{s}', (0.08 * s, 0.98, 0.86), (0.2 * s, 1.0, 0.86), 0.01, mat=mat['frame'], parent=B)
        M.blinkers.append(sphere(f'RBlinker{s}', (0.22 * s, 1.0, 0.86), (0.04, 0.05, 0.04), mat['orange'], B))

    # 핸들바 + 그립 + 미러
    hb = [(-0.55, -0.3, 1.27), (-0.36, -0.4, 1.24), (-0.14, -0.58, 1.12), (0.14, -0.58, 1.12), (0.36, -0.4, 1.24), (0.55, -0.3, 1.27)]
    curve_obj('Handlebar', hb, 0.022, mat['chrome'], B, kind='NURBS', order=4)
    rbox('BarClamp', (0, -0.58, 1.1), (0.14, 0.05, 0.05), mat['satin'], B, bevel=0.012)
    for s in (-1, 1):
        cyl(f'Grip{s}', (0.42 * s, -0.36, 1.255), (0.6 * s, -0.28, 1.275), 0.038, mat=mat['frame'], parent=B)
        curve_obj(f'MirrorStalk{s}', [(0.36 * s, -0.4, 1.24), (0.52 * s, -0.42, 1.36), (0.7 * s, -0.43, 1.46)], 0.014, mat['frame'], B)
        mg = empty(f'Mirror{s}', (0.74 * s, -0.43, 1.5), B)
        sphere(f'MirrorHousing{s}', (0, 0, 0), (0.12, 0.04, 0.12), mat['mirror'], mg)
        cyl(f'MirrorGlass{s}', (0, 0.025, 0), (0, 0.036, 0), 0.085, mat=mat['chrome'], parent=mg)

    # 탱크 + 스트라이프 + 시트 + 사이드커버
    tank = sphere('Tank', (0, -0.2, 1.0), (0.3, 0.4, 0.19), mat['red'], B, rot=(math.radians(-8), 0, 0))
    # 탱크 아랫면 납작하게
    for v in tank.data.vertices:
        if v.co.z < -0.3:
            v.co.z = -0.3 + (v.co.z + 0.3) * 0.4
    pts = []
    for i in range(40):
        a = TAU * i / 40
        pts.append((0.285 * math.cos(a), -0.2 + 0.38 * math.sin(a) + 0.0, 1.0 + 0.085 - 0.03 * math.sin(a)))
    curve_obj('TankStripe', pts, 0.011, mat['stripe'], B, cyclic=True)
    rbox('TankCap', (0, -0.14, 1.165), (0.07, 0.07, 0.02), mat['chrome'], B, bevel=0.02)
    sphere('Seat', (0, 0.36, 0.97), (0.22, 0.36, 0.075), mat['frame'], B)
    for s in (-1, 1):
        sphere(f'SideCover{s}', (0.17 * s, 0.32, 0.82), (0.05, 0.16, 0.09), mat['red'], B)

    # 프레임 튜브
    for a, b in [((0, -0.56, 1.02), (0, 0.15, 0.95)), ((0, -0.56, 1.0), (0, -0.25, 0.4)), ((0, 0.15, 0.95), (0, 0.95, 0.9)),
                 ((0, -0.25, 0.4), (0, 0.5, 0.42)), ((0, 0.5, 0.42), (0, 0.66, 0.34))]:
        for s in (-1, 1):
            cyl(f'FrameT{a}{s}', (a[0] + 0.1 * s, *a[1:]), (b[0] + 0.1 * s, *b[1:]), 0.022, mat=mat['frame'], parent=B, seg=16)
    cyl('SteerHead', (0, -0.55, 1.08), (0, -0.62, 0.86), 0.05, mat=mat['frame'], parent=B)

    # 리어 펜더 + 테일라이트
    torus('FenderR', (0, 0.66, 0.335), 0.34, 0.06, mat['red'], B, rot=(0, math.pi / 2, 0), arc=(math.radians(10), math.radians(105)), mseg=16)
    sphere('TailLight', (0, 1.0, 0.88), (0.07, 0.04, 0.05), mat['taillight'], B)

    # 엔진
    E = empty('Engine', (0, -0.04, 0.56), B)
    rbox('Crankcase', (0, 0.05, -0.08), (0.36, 0.48, 0.24), mat['engine'], E, bevel=0.05)
    rbox('Cylinder', (0, -0.12, 0.14), (0.3, 0.2, 0.22), mat['engine'], E, bevel=0.03, rot=(math.radians(-14), 0, 0))
    for i in range(6):
        rbox(f'Fin{i}', (0, -0.12 + i * 0.008, 0.06 + i * 0.035), (0.37, 0.24, 0.012), mat['satin'], E, bevel=0.005, rot=(math.radians(-14), 0, 0))
    for s in (-1, 1):
        cyl(f'CaseCover{s}', (0.18 * s, 0.08, -0.08), (0.205 * s, 0.08, -0.08), 0.12, mat=mat['chrome'], parent=E)
        cyl(f'CaseCover2{s}', (0.18 * s, -0.12, -0.1), (0.2 * s, -0.12, -0.1), 0.07, mat=mat['satin'], parent=E)

    # 머플러 (오른쪽 = -X)
    curve_obj('Header', [(-0.06, -0.24, 0.66), (-0.12, -0.38, 0.5), (-0.2, -0.3, 0.33), (-0.26, 0.05, 0.32), (-0.27, 0.22, 0.36)], 0.032, mat['chrome'], B, order=4)
    cyl('Muffler', (-0.27, 0.2, 0.36), (-0.29, 0.86, 0.5), 0.075, 0.085, mat['chrome'], B, seg=48)
    cyl('MufflerEnd', (-0.29, 0.86, 0.5), (-0.292, 0.9, 0.51), 0.085, 0.07, mat['satin'], B, seg=48)
    cyl('MufflerHole', (-0.292, 0.895, 0.51), (-0.293, 0.905, 0.512), 0.04, mat=mat['frame'], parent=B)
    M.exhaust_tip = Vector((-0.293, 0.92, 0.515))

    # 리어 쇼크 (스프링)
    for s in (-1, 1):
        p0, p1 = Vector((0.17 * s, 0.5, 0.88)), Vector((0.19 * s, 0.64, 0.38))
        cyl(f'ShockRod{s}', p0, p1, 0.018, mat=mat['chrome'], parent=B, seg=16)
        d = (p1 - p0)
        ax = d.normalized()
        ortho = ax.cross(Vector((1, 0, 0))).normalized()
        ortho2 = ax.cross(ortho)
        pts = []
        for i in range(120):
            t = i / 119
            a = t * TAU * 9
            c = p0 + d * (0.08 + 0.84 * t)
            pts.append(tuple(c + ortho * 0.04 * math.cos(a) + ortho2 * 0.04 * math.sin(a)))
        curve_obj(f'Spring{s}', pts, 0.008, mat['red' if False else 'chrome'], B, kind='POLY')

    # 발판
    for s in (-1, 1):
        cyl(f'Peg{s}', (0.12 * s, 0.05, 0.42), (0.26 * s, 0.05, 0.42), 0.02, mat=mat['frame'], parent=B)


def build_rider(M, mat):
    R = M.rider
    # 몸통 (불꽃 셔츠)
    torso = sphere('Torso', (0, 0.06, 1.2), (0.6, 0.33, 0.36), mat['shirt'], R, seg=64, rings=32)
    # 엉덩이 쪽 납작
    for v in torso.data.vertices:
        if v.co.z < -0.5:
            v.co.z = -0.5 + (v.co.z + 0.5) * 0.5
    sphere('Hips', (0, 0.12, 0.98), (0.38, 0.3, 0.16), mat['black'], R)
    # 카라 (오픈 칼라)
    for s in (-1, 1):
        rbox(f'Collar{s}', (0.1 * s, -0.22, 1.45), (0.1, 0.012, 0.08), mat['shirt'], R, bevel=0.01,
             rot=(math.radians(-20), math.radians(28 * s), math.radians(-30 * s)))

    # 다리: 허벅지(반바지) + 정강이 + 신발
    for s in (-1, 1):
        hip, knee, foot = Vector((0.2 * s, 0.16, 0.98)), Vector((0.33 * s, -0.24, 0.86)), Vector((0.31 * s, 0.0, 0.48))
        capsule(f'Thigh{s}', hip, knee, 0.155, 0.135, mat['skin'], R)
        cyl(f'Shorts{s}', hip + Vector((0, 0.02, 0.02)), hip.lerp(knee, 0.55), 0.17, 0.16, mat['black'], R)
        sphere(f'ShortsEnd{s}', hip.lerp(knee, 0.55), (0.16, 0.16, 0.16), mat['black'], R, sub=0, seg=32, rings=16)
        capsule(f'Shin{s}', knee, foot, 0.12, 0.09, mat['skin'], R)
        sphere(f'Shoe{s}', foot + Vector((0, -0.05, -0.04)), (0.095, 0.15, 0.075), mat['frame'], R)

    # 팔: 소매 + 팔뚝 + 손
    M.arms = {}
    for s in (-1, 1):
        sh = empty(f'Shoulder{s}', (0.52 * s, 0.0, 1.4), R)
        hand = Vector((-0.02 * s, -0.44, -0.135))        # 그립 위치 (어깨 로컬)
        sleeve_end = Vector((0.04 * s, -0.17, -0.06))
        cyl(f'Sleeve{s}', (0, 0, 0), sleeve_end, 0.16, 0.175, mat['shirtbox'], sh)
        sphere(f'SleeveTop{s}', (0, 0, 0), (0.16, 0.16, 0.16), mat['shirtbox'], sh, sub=0, seg=32, rings=16)
        capsule(f'Forearm{s}', sleeve_end * 0.85, hand, 0.1, 0.09, mat['skin'], sh)
        sphere(f'Hand{s}', hand + Vector((0, -0.01, 0.015)), (0.11, 0.105, 0.095), mat['skin'], sh)
        M.arms[s] = sh


def build_head(M, mat):
    N = M.neck
    M.head = head = empty('HeadRig', (0, 0, 0), N)
    # 머리 메시
    hm = sphere('Head', HEAD_C, HEAD_R, mat['headskin'], head, seg=96, rings=48, sub=1)

    # 볼터치 빗금 (볼터치 색은 head_material 셰이더)
    for s in (-1, 1):
        for k in (-1, 0, 1):
            u0 = 0.62 * s + k * 0.07
            face_curve(f'BlushLine{s}{k}', [(u0 - 0.03, -0.31), (u0 + 0.03, -0.17)], 0.005, mat['blushline'], head, off=0.008)

    # 눈 (기본)
    M.eyes = {}
    for key in ('normal', 'happy', 'closed', 'wow'):
        M.eyes[key] = empty(f'Eyes_{key}', parent=head)
    for s in (-1, 1):
        u, v = 0.3 * s, -0.08
        g = M.eyes['normal']
        e = sphere(f'Eye{s}', (0, 0, 0), (0.07, 0.03, 0.078), mat['eye'], g)
        on_face(e, u, v, 0.006)
        hl = sphere(f'EyeHL{s}', (0, 0, 0), (0.03, 0.012, 0.03), mat['white'], g)
        on_face(hl, u - 0.012, v + 0.06, 0.03)
        hl2 = sphere(f'EyeHL2{s}', (0, 0, 0), (0.01, 0.006, 0.01), mat['white'], g)
        on_face(hl2, u + 0.04, v - 0.07, 0.027)
        # 반짝 눈 (알림)
        g = M.eyes['wow']
        e = sphere(f'EyeWow{s}', (0, 0, 0), (0.085, 0.034, 0.095), mat['eye'], g)
        on_face(e, u, v, 0.007)
        for (du, dv, r) in ((-0.02, 0.07, 0.032), (0.05, -0.08, 0.014), (-0.04, -0.06, 0.011)):
            h = sphere(f'EyeWowHL{s}{du}', (0, 0, 0), (r, 0.012, r), mat['white'], g)
            on_face(h, u + du, v + dv, 0.036)
        # 웃는 눈 ^ ^
        face_curve(f'EyeHappy{s}', [(u - 0.1, v - 0.05), (u - 0.05, v + 0.06), (u, v + 0.09), (u + 0.05, v + 0.06), (u + 0.1, v - 0.05)],
                   0.016, mat['eye'], M.eyes['happy'])
        # 감은 눈 (졸기)
        face_curve(f'EyeClosed{s}', [(u - 0.1, v + 0.01), (u - 0.05, v - 0.05), (u, v - 0.065), (u + 0.05, v - 0.05), (u + 0.1, v + 0.01)],
                   0.014, mat['eye'], M.eyes['closed'])
        # 눈썹
        face_curve(f'Brow{s}', [(u - 0.07, v + 0.25), (u, v + 0.3), (u + 0.07, v + 0.26)], 0.011, mat['line'], head)

    # 입: ω / 말하기 / o
    M.mouth = {}
    M.mouth['w'] = empty('Mouth_w', parent=head)
    face_curve('MouthW', [(-0.115, -0.37), (-0.1, -0.45), (-0.05, -0.47), (0.0, -0.41), (0.0, -0.4), (0.0, -0.41), (0.05, -0.47), (0.1, -0.45), (0.115, -0.37)],
               0.011, mat['line'], M.mouth['w'])
    M.mouth['open'] = empty('Mouth_open', parent=head)
    mo = sphere('MouthOpen', (0, 0, 0), (0.115, 0.035, 0.09), mat['mouth'], M.mouth['open'])
    on_face(mo, 0, -0.46, -0.004)
    tg = sphere('Tongue', (0, 0, 0), (0.075, 0.02, 0.04), mat['tongue'], M.mouth['open'])
    on_face(tg, 0, -0.515, 0.016)
    M.mouth_open_obj = M.mouth['open']
    M.mouth['o'] = empty('Mouth_o', parent=head)
    mo2 = sphere('MouthO', (0, 0, 0), (0.055, 0.025, 0.068), mat['mouth'], M.mouth['o'])
    on_face(mo2, 0, -0.45, 0.0)
    # 턱수염
    for i in range(11):
        u = -0.2 + 0.04 * i
        vt = -0.66 - 0.04 * (1 - (u / 0.2) ** 2) * 0.5
        face_curve(f'Stubble{i}', [(u, vt), (u * 0.98, vt - 0.085)], 0.0065, mat['line'], head, off=0.006)
    M.head_mesh = hm


def build_fx(M, mat):
    # 느낌표 배지 (월드 기준 — 카메라를 향함)
    M.fx = empty('FX')
    M.notice = empty('Notice', (0.88, 0, 2.62), M.fx)
    sphere('NoticeBall', (0, 0, 0), (0.17, 0.06, 0.17), mat['yellow'], M.notice)
    t = text_obj('NoticeMark', '!', 0.3, mat['line'], M.notice, extrude=0.02, bevel=0.008)
    t.location = (0, -0.07, -0.01)
    t.rotation_euler = (math.pi / 2, 0, 0)
    # Zzz
    M.zzz = []
    for i, (sz, off) in enumerate(((0.26, (0.75, 0, 2.5)), (0.2, (0.98, 0, 2.7)), (0.15, (1.15, 0, 2.88)))):
        z = text_obj(f'Z{i}', 'Z' if i == 0 else 'z', sz, mat['zzz'], M.fx, extrude=0.03, bevel=0.01)
        z.location = off
        z.rotation_euler = (math.pi / 2, 0, 0)
        M.zzz.append((z, Vector(off)))
    # 하트
    M.hearts = []
    for i, off in enumerate(((-0.9, 0, 2.3), (0.92, 0, 2.45))):
        h = make_heart(f'Heart{i}', mat['heart'], M.fx)
        h.location = off
        M.hearts.append((h, Vector(off)))
    # 배기 연기
    M.puffs = []
    for i in range(4):
        p = sphere(f'Puff{i}', (0, 0, 0), (0.06, 0.06, 0.06), mat['smoke'], M.bounce, seg=24, rings=12)
        M.puffs.append(p)


def make_heart(name, mat, parent):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    cu.extrude = 0.03
    cu.bevel_depth = 0.02
    sp = cu.splines.new('BEZIER')
    pts = [((0, -0.12), (-0.05, -0.08), (0.05, -0.08)),
           ((-0.13, 0.03), (-0.13, -0.05), (-0.13, 0.1)),
           ((0, 0.06), (-0.04, 0.13), (0.04, 0.13)),
           ((0.13, 0.03), (0.13, 0.1), (0.13, -0.05))]
    sp.bezier_points.add(len(pts) - 1)
    for bp, (co, hl, hr) in zip(sp.bezier_points, pts):
        bp.co = (*co, 0)
        bp.handle_left = (*hl, 0)
        bp.handle_right = (*hr, 0)
        bp.handle_left_type = bp.handle_right_type = 'FREE'
    sp.bezier_points[0].handle_left_type = sp.bezier_points[0].handle_right_type = 'VECTOR'
    sp.use_cyclic_u = True
    o = bpy.data.objects.new(name, cu)
    link(o, parent)
    o.data.materials.append(mat)
    o.rotation_euler = (math.pi / 2, 0, 0)
    return o


def setup_scene(M, res=400, samples=48):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 6
    sc.render.film_transparent = True
    sc.render.resolution_x = res
    sc.render.resolution_y = int(res * 1.2)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = -0.25

    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    link(cam)
    cam.data.lens = 70
    cam.location = (0, -7.0, 1.9)
    target = Vector((0.02, 0, 1.42))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    M.cam = cam

    def area(name, loc, energy, size, color=(1, 1, 1)):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        l.data.energy = energy
        l.data.size = size
        l.data.color = color
        link(l)
        l.location = loc
        l.rotation_euler = (Vector((0, 0, 1.2)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return l

    area('Key', (-3.2, -4.0, 4.4), 420, 3.0, (1.0, 0.97, 0.93))
    area('Fill', (4.0, -3.5, 2.2), 200, 3.5, (0.92, 0.95, 1.0))
    area('Rim', (1.5, 4.0, 4.5), 450, 2.5, (1.0, 0.95, 0.9))
    area('Top', (0, -0.5, 6.0), 50, 4.0)
    area('Front', (0.3, -6.0, 2.2), 260, 4.0, (1.0, 0.98, 0.95))


# --------------------------------------------------------------------------------------
# 모션
# --------------------------------------------------------------------------------------
YAW = math.radians(32)
FPS = 15

MOTIONS = {
    # 이름: (길이 초, 루프 여부, 설명)
    'ride_r': (3.2, True, '오른쪽으로 주행'),
    'ride_l': (3.2, True, '왼쪽으로 주행'),
    'idle_r': (2.4, True, '정차 (오른쪽 방향)'),
    'idle_l': (2.4, True, '정차 (왼쪽 방향)'),
    'face_r': (0.4, False, '오른쪽 → 정면 돌아보기 (역재생 = 다시 출발)'),
    'face_l': (0.4, False, '왼쪽 → 정면 돌아보기 (역재생 = 다시 출발)'),
    'front': (2.4, True, '정면 대기 (말풍선 읽는 중)'),
    'notify': (1.6, False, '알림 도착 (정면)'),
    'talk': (1.6, True, '알림 읽어주기 (정면)'),
    'happy': (1.6, True, '기쁨 (정면)'),
    'sleep': (3.2, True, '졸기 / 방해 금지 (정면)'),
    'turn': (0.8, False, '유턴 왼쪽→오른쪽 (역재생 = 오른쪽→왼쪽)'),
}
HEAD_FOLLOW = 0.9   # 주행 중 머리를 카메라 쪽으로 돌리는 비율


def show(obj, on):
    for o in [obj] + list(obj.children_recursive):
        o.hide_render = not on
        o.hide_viewport = not on


def set_emission(mat, strength):
    mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = strength


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def back_out(x, s=1.7):
    x = min(max(x, 0.0), 1.0) - 1
    return x * x * ((s + 1) * x + s) + 1


def blink_scale(t, at, dur=0.2):
    d = abs(t - at)
    return 1.0 if d > dur / 2 else max(0.08, d / (dur / 2))


def reset(M):
    M.root.rotation_euler = (0, 0, YAW)
    M.bounce.location = (0, 0, 0)
    M.rider.location = (0, 0.12, 0)
    M.rider.rotation_euler = (0, 0, 0)
    M.rider.scale = (1, 1, 1)
    M.neck.rotation_euler = (0, 0, -YAW * HEAD_FOLLOW)
    M.head.location = (0, 0, 0)
    M.head.scale = (1, 1, 1)
    for w in M.wheels:
        w.rotation_euler = (0, 0, 0)
    for k, g in M.eyes.items():
        show(g, k == 'normal')
        g.scale = (1, 1, 1)
    for k, g in M.mouth.items():
        show(g, k == 'w')
    M.mouth['open'].scale = (1, 1, 1)
    for s, a in M.arms.items():
        a.rotation_mode = 'QUATERNION'
        a.rotation_quaternion = (1, 0, 0, 0)
        a.scale = (1, 1, 1)
    show(M.notice, False)
    for z, _ in M.zzz:
        show(z, False)
    for h, _ in M.hearts:
        show(h, False)
    for p in M.puffs:
        show(p, False)
    for b in M.blinkers:
        pass
    set_emission(M.mat['orange'], 0.0)
    set_emission(M.mat['lens'], 0.12)


def eyes_blink(M, t, at):
    sc = blink_scale(t, at)
    # 눈 그룹을 눈 높이 기준으로 세로 스케일
    g = M.eyes['normal']
    for o in g.children:
        if o.name.startswith('Eye'):
            base = o.get('base_scale')
            if base is None:
                o['base_scale'] = list(o.scale)
                base = o['base_scale']
            o.scale = (base[0], base[1], base[2] * sc) if not o.name.startswith('EyeHL') else (base[0], base[1], base[2] * (1 if sc > 0.5 else 0.01))


def puffs(M, t, period=0.8):
    tip = M.exhaust_tip
    for i, p in enumerate(M.puffs):
        ph = ((t / period) + i / len(M.puffs)) % 1.0
        show(p, True)
        p.location = tip + Vector((-0.05 * ph, 0.55 * ph, 0.22 * ph))
        r = 0.035 + 0.13 * ph
        a = (1 - ph) ** 1.5
        p.scale = (r * a ** 0.3, r * a ** 0.3, r * a ** 0.3)
        if ph > 0.92:
            show(p, False)


WAVE_FROM = Vector((-0.02, -0.44, -0.135)).normalized()   # 기본 팔 방향 (그립)
WAVE_TO = Vector((0.8, -0.22, 0.56)).normalized()         # 손을 머리 옆으로 번쩍


def wave_arm(M, t, period=0.8, amp=1.0):
    """탑승자 왼팔(화면 오른쪽)을 들어 올려 좌우로 흔들기"""
    a = M.arms[1]
    a.rotation_mode = 'QUATERNION'
    k = min(1.0, max(0.0, amp))
    lift = Quaternion().slerp(WAVE_FROM.rotation_difference(WAVE_TO), k)
    sw = math.sin(t / period * TAU)
    wig = Quaternion(Vector((0, -1, 0)), math.radians(15 * sw * k))
    a.rotation_quaternion = wig @ lift
    sc = 1 + 0.32 * k
    a.scale = (sc, sc, sc)


def face(M, yaw, head_extra=(0, 0, 0)):
    """차체 yaw + 머리는 카메라 쪽으로"""
    M.root.rotation_euler = (0, 0, yaw)
    M.neck.rotation_euler = (head_extra[0], head_extra[1], -yaw * HEAD_FOLLOW + head_extra[2])


def vibe(M, t, amp=0.006):
    M.bounce.location = (0, 0, amp * (1 if int(round(t * FPS)) % 2 else -1))


def apply(M, motion, t):
    reset(M)
    L = MOTIONS[motion][0]
    if motion in ('ride_r', 'ride_l'):
        sign = 1 if motion == 'ride_r' else -1
        face(M, YAW * sign, (0, math.radians(2.5 * math.sin(t / 1.6 * TAU)), 0))
        for w in M.wheels:
            w.rotation_euler = (-t / L * TAU * 4, 0, 0)  # 루프당 4바퀴
        vibe(M, t)
        M.rider.location = (0, 0.12, 0.025 * (0.5 + 0.5 * math.sin(t / 0.8 * TAU)))
        M.head.location = (0, 0, 0.012 * math.sin(t / 0.8 * TAU - 0.8))
        puffs(M, t)
        eyes_blink(M, t, 2.4)
    elif motion in ('idle_r', 'idle_l'):
        sign = 1 if motion == 'idle_r' else -1
        b = 0.5 + 0.5 * math.sin(t / 1.2 * TAU)
        M.rider.scale = (1 + 0.006 * b, 1 + 0.006 * b, 1 + 0.014 * b)
        look = ease((math.sin(t / L * TAU) + 1) / 2)
        face(M, YAW * sign, (math.radians(-3 * look), math.radians(-3 * look * sign), math.radians(14 * look) * sign))
        eyes_blink(M, t, 1.0)
    elif motion in ('face_r', 'face_l'):
        sign = 1 if motion == 'face_r' else -1
        k = ease(t / max(L - 1 / FPS, 1e-3))
        face(M, YAW * sign * (1 - k))
        M.rider.location = (0, 0.12, 0.03 * math.sin(k * math.pi))
    elif motion == 'front':
        b = 0.5 + 0.5 * math.sin(t / 1.2 * TAU)
        M.rider.scale = (1 + 0.006 * b, 1 + 0.006 * b, 1 + 0.014 * b)
        face(M, 0.0, (math.radians(-2 * b), math.radians(3 * math.sin(t / 2.4 * TAU)), 0))
        eyes_blink(M, t, 1.4)
    elif motion == 'notify':
        face(M, 0.0)
        show(M.eyes['normal'], False)
        show(M.eyes['wow'], True)
        show(M.mouth['w'], False)
        show(M.mouth['o'], True)
        hop = math.sin(min(t / 0.5, 1) * math.pi)
        M.rider.location = (0, 0.12, 0.09 * hop)
        M.head.scale = (1 + 0.04 * hop, 1 + 0.04 * hop, 1 - 0.03 * hop)
        M.neck.rotation_euler = (math.radians(-6 * hop), math.radians(4 * math.sin(t / 0.8 * TAU)), 0)
        pop = back_out(t / 0.45)
        show(M.notice, True)
        M.notice.scale = (max(0.01, pop),) * 3
        M.notice.rotation_euler = (0, math.radians(12 * math.sin(t / 0.4 * TAU) * min(1, t / 0.5)), 0)
        on = (int(t / 0.2) % 2) == 0
        set_emission(M.mat['orange'], 6.0 if on else 0.0)
        set_emission(M.mat['lens'], 0.12 + 2.0 * (0.5 + 0.5 * math.sin(t / 0.4 * TAU)))
        wave_arm(M, t, 0.4, amp=ease(t / 0.35))
    elif motion == 'talk':
        face(M, 0.0, (math.radians(3 * math.sin(t / 0.8 * TAU)), math.radians(2 * math.sin(t / 1.6 * TAU)), 0))
        show(M.mouth['w'], False)
        show(M.mouth['open'], True)
        m = 0.3 + 0.7 * (0.5 + 0.5 * math.sin(t / 0.4 * TAU))
        for o in M.mouth['open'].children:
            base = o.get('base_scale') or list(o.scale)
            o['base_scale'] = base
            o.scale = (base[0], base[1], base[2] * m)
        on = (int(t / 0.4) % 2) == 0
        set_emission(M.mat['orange'], 5.0 if on else 0.0)
        wave_arm(M, t, 0.8, amp=1.0)
        eyes_blink(M, t, 1.2)
    elif motion == 'happy':
        face(M, 0.0, (0, math.radians(5 * math.sin(t / 0.8 * TAU)), 0))
        show(M.eyes['normal'], False)
        show(M.eyes['happy'], True)
        bnc = abs(math.sin(t / 0.8 * TAU))
        M.rider.location = (0, 0.12, 0.08 * bnc)
        M.rider.scale = (1 + 0.02 * (1 - bnc), 1, 1 - 0.02 * (1 - bnc))
        vibe(M, t)
        for i, (h, base) in enumerate(M.hearts):
            ph = ((t / 1.6) + i * 0.5) % 1.0
            show(h, ph < 0.95)
            h.location = base + Vector((0, 0, 0.45 * ph))
            sc = 0.4 + 0.9 * math.sin(min(ph * 2, 1) * math.pi / 2)
            h.scale = (sc * (1 - ph * 0.3),) * 3
    elif motion == 'sleep':
        ph = t / L
        face(M, 0.0, (math.radians(8 + 5 * math.sin(ph * TAU)), math.radians(4), 0))
        show(M.eyes['normal'], False)
        show(M.eyes['closed'], True)
        b = 0.5 + 0.5 * math.sin(t / 1.6 * TAU)
        M.rider.scale = (1 + 0.006 * b, 1 + 0.006 * b, 1 + 0.016 * b)
        for i, (z, base) in enumerate(M.zzz):
            p = (ph + i / 3) % 1.0
            show(z, 0.05 < p < 0.95)
            z.location = base + Vector((0.12 * p, 0, 0.25 * p))
            z.scale = (0.6 + 0.6 * math.sin(p * math.pi),) * 3
    elif motion == 'turn':
        k = ease(t / max(L - 1 / FPS, 1e-3))
        face(M, -YAW + 2 * YAW * k)
        M.bounce.location = (0, 0, 0.06 * math.sin(k * math.pi))
        for w in M.wheels:
            w.rotation_euler = (-t * 6, 0, 0)


# --------------------------------------------------------------------------------------
# 실행
# --------------------------------------------------------------------------------------
def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--still')
    ap.add_argument('--motion', default='idle_r')
    ap.add_argument('--t', type=float, default=0.0)
    ap.add_argument('--motions')
    ap.add_argument('--only', default='')
    ap.add_argument('--res', type=int, default=400)
    ap.add_argument('--samples', type=int, default=48)
    ap.add_argument('--blend')
    ap.add_argument('--glb')
    a = ap.parse_args(argv)

    M = build()
    setup_res = bpy.context.scene.render
    setup_res.resolution_x = a.res
    setup_res.resolution_y = int(a.res * 1.2)
    bpy.context.scene.cycles.samples = a.samples

    if a.still:
        apply(M, a.motion, a.t)
        render_to(os.path.abspath(a.still))
    if a.motions:
        only = [x for x in a.only.split(',') if x]
        for name, (L, loop, label) in MOTIONS.items():
            if only and name not in only:
                continue
            n = int(round(L * FPS))
            d = os.path.join(os.path.abspath(a.motions), name)
            os.makedirs(d, exist_ok=True)
            for i in range(n):
                t = i / FPS
                apply(M, name, t)
                render_to(os.path.join(d, f'frame_{i:03d}.png'))
            print(f'[motion] {name} {n} frames', flush=True)
    if a.blend:
        apply(M, 'idle_r', 0)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.blend), compress=True)
    if a.glb:
        apply(M, 'idle_r', 0)
        bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.glb), export_format='GLB', use_visible=True, export_apply=True)


if __name__ == '__main__':
    main()
