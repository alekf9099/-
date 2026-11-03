"""
렌더 프레임 → 앱용 스프라이트 + 배포용 모션 에셋 패킹 (2D / 3D 공통)
=====================================================================
  python tools/pack_sprites.py <render_dir> --skin 2d|3d [--fps 30] [--width 300] [--display-scale 1.45] [--icons]

입력: <render_dir>/<motion>/frame_000.png ...
출력:
  앱  src/renderer/sprites/<skin>/ : <motion>.webp (스프라이트 시트) + sprites.json / sprites.js
  배포 motions/<skin>/             : <motion>.webp (투명 애니메이션) / <motion>.gif (200px, 15fps) / motions.json

- 모든 모션이 같은 기준 프레임(frameW x frameH)을 쓰므로 전환 시 캐릭터 위치가 흔들리지 않습니다.
- 메모리 절약: 모션마다 실제로 그려지는 영역만 잘라(ox, oy, w, h) 시트로 저장합니다.
"""
import argparse
import glob
import json
import math
import os

from PIL import Image

MOTION_INFO = {
    'ride_r': ('오른쪽으로 주행', True), 'ride_l': ('왼쪽으로 주행', True),
    'idle_r': ('정차 (오른쪽)', True), 'idle_l': ('정차 (왼쪽)', True),
    'face_r': ('오른쪽→정면 돌아보기', False), 'face_l': ('왼쪽→정면 돌아보기', False),
    'front': ('정면 대기', True), 'notify': ('알림 도착', False), 'talk': ('알림 읽어주기', True),
    'happy': ('기쁨', True), 'sleep': ('졸기 (방해 금지)', True), 'turn': ('유턴 (왼→오)', False),
    'wheelie_r': ('윌리 (앞바퀴 들기)', False), 'rev': ('제자리 공회전 "달달달달"', True),
    'bow': ('꾸벅 인사 "감사하고~"', False), 'look_r': ('두리번', False), 'yawn_r': ('하품', False),
    'groove': ('신나서 리듬 타기', True), 'wink': ('윙크', False), 'wave_out': ('손 내리기', False),
    'brake_r': ('브레이크 → 정지 → 발 내리기', False), 'go_r': ('출발 (발 올리기 + 가속)', False),
    'parked': ('세워둔 오토바이 (킥스탠드)', True), 'dismount': ('오토바이에서 내리기 (역재생 = 타기)', False),
    # 3등신 도보 모션
    'stand': ('서 있기', True), 'walk_r': ('걷기', True), 'wave_s': ('손 흔들기', True), 'jump_s': ('점프', False),
    'stretch_s': ('기지개', False), 'sit_down': ('앉기 (역재생 = 일어나기)', False), 'sit': ('앉아 쉬기', True),
    'nap': ('앉아서 졸기', True), 'look_s': ('두리번', False), 'talk_s': ('알림 읽어주기', True), 'dance_s': ('춤', True),
    'bow_s': ('꾸벅 인사', False), 'surprise_s': ('깜짝 (알림 도착)', False),
}


def alpha_box(im, th=6):
    return im.getchannel('A').point(lambda v: 255 if v > th else 0).getbbox()


def union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument('render_dir')
    ap.add_argument('--skin', default='2d', help='캐릭터 스타일 이름 (2d / 3d)')
    ap.add_argument('--fps', type=int, default=15)
    ap.add_argument('--app')
    ap.add_argument('--out')
    ap.add_argument('--width', type=int, default=300)
    ap.add_argument('--display-scale', type=float, default=1.0, help='앱에서 표시 배율 (효과 여백이 큰 스킨 보정)')
    ap.add_argument('--icons', action='store_true', help='front 프레임으로 앱/트레이 아이콘 생성')
    ap.add_argument('--icon-scale', type=float, default=0.64, help='아이콘 크롭 크기 (캐릭터 높이 대비)')
    ap.add_argument('--scale', type=float, help='원본 px → 스프라이트 px 배율 고정 (다른 스킨과 크기 맞춤)')
    ap.add_argument('--point', action='append', default=[], help='이름=x,y (렌더 캔버스 좌표) → 메타데이터에 스프라이트 좌표로 기록')
    a = ap.parse_args()
    a.app = a.app or os.path.join(here, '..', 'src', 'renderer', 'sprites', a.skin)
    a.out = a.out or os.path.join(here, '..', 'motions', a.skin)
    FPS = a.fps

    dirs = sorted(d for d in os.listdir(a.render_dir) if os.path.isdir(os.path.join(a.render_dir, d)))
    motions = [m for m in MOTION_INFO if m in dirs] + [m for m in dirs if m not in MOTION_INFO]
    files = {m: sorted(glob.glob(os.path.join(a.render_dir, m, 'frame_*.png'))) for m in motions}

    # 1차: 모션별 / 전체 실제 그림 영역
    mbox, gbox = {}, None
    for m in motions:
        b = None
        for f in files[m]:
            with Image.open(f) as im:
                b = union(b, alpha_box(im.convert('RGBA')))
        mbox[m] = b
        gbox = union(gbox, b)
    with Image.open(files[motions[0]][0]) as im:
        W0, H0 = im.size
    pad = 6
    gbox = (max(0, gbox[0] - pad), max(0, gbox[1] - pad), min(W0, gbox[2] + pad), min(H0, gbox[3] + pad))
    cw, ch = gbox[2] - gbox[0], gbox[3] - gbox[1]
    scale = a.scale if a.scale else min(1.0, a.width / cw)
    fw, fh = round(cw * scale), round(ch * scale)
    print(f'crop {gbox} → frame {fw}x{fh} @ {FPS}fps')

    os.makedirs(a.app, exist_ok=True)
    os.makedirs(a.out, exist_ok=True)
    for old in glob.glob(os.path.join(a.out, '*_sheet.webp')):   # 이전 버전 중복 시트 정리
        os.remove(old)

    def load(f):
        with Image.open(f) as im:
            im = im.convert('RGBA').crop(gbox)
            return im.resize((fw, fh), Image.LANCZOS) if scale < 1 else im

    head_top = 0.15
    hk = 'front' if 'front' in files else ('stand' if 'stand' in files else None)
    if hk:
        f0 = load(files[hk][0])
        b0 = alpha_box(f0, 20)
        head_top = round(b0[1] / fh, 4)
    points = {}
    for spec in a.point:
        name, xy = spec.split('=')
        x, y = (float(v) for v in xy.split(','))
        points[name] = [round((x - gbox[0]) * scale, 2), round((y - gbox[1]) * scale, 2)]
    app_meta = {'skin': a.skin, 'fps': FPS, 'frameW': fw, 'frameH': fh, 'displayScale': a.display_scale,
                'headTop': head_top, 'scale': round(scale, 6), 'points': points, 'motions': {}}
    out_meta = {'fps': FPS, 'frameSize': {'w': fw, 'h': fh}, 'generatedBy': f'{a.skin} pipeline + tools/pack_sprites.py', 'motions': []}

    total_px = 0
    for m in motions:
        fr = [load(f) for f in files[m]]
        n = len(fr)
        # 2차: 이 모션이 실제로 쓰는 영역만 (기준 프레임 좌표)
        b = None
        for im in fr:
            b = union(b, alpha_box(im))
        ox, oy = max(0, b[0] - 2), max(0, b[1] - 2)
        w, h = min(fw, b[2] + 2) - ox, min(fh, b[3] + 2) - oy
        cols = min(8, n)
        rows = math.ceil(n / cols)
        sheet = Image.new('RGBA', (cols * w, rows * h), (0, 0, 0, 0))
        for i, im in enumerate(fr):
            sheet.paste(im.crop((ox, oy, ox + w, oy + h)), ((i % cols) * w, (i // cols) * h))
        sheet.save(os.path.join(a.app, f'{m}.webp'), 'WEBP', quality=86, method=6, alpha_quality=100)
        total_px += sheet.width * sheet.height
        label, loop = MOTION_INFO.get(m, (m, True))
        app_meta['motions'][m] = {'file': f'{m}.webp', 'frames': n, 'cols': cols, 'loop': loop, 'ox': ox, 'oy': oy, 'w': w, 'h': h}

        # 배포용: 투명 애니메이션 WebP (원래 fps) + GIF (200px, 최대 15fps)
        fr[0].save(os.path.join(a.out, f'{m}.webp'), 'WEBP', save_all=True, append_images=fr[1:], duration=round(1000 / FPS),
                   loop=0, quality=84, method=6, alpha_quality=90)
        step = max(1, round(FPS / 15))
        gw = 200
        g0 = []
        for im in fr[::step]:
            im = im.resize((gw, round(fh * gw / fw)), Image.LANCZOS)
            alpha = im.getchannel('A').point(lambda v: 255 if v > 128 else 0)
            p = im.convert('RGB').quantize(255, method=Image.Quantize.MEDIANCUT)
            p.paste(255, mask=Image.eval(alpha, lambda v: 255 - v))
            p.info['transparency'] = 255
            g0.append(p)
        g0[0].save(os.path.join(a.out, f'{m}.gif'), save_all=True, append_images=g0[1:], duration=round(1000 * step / FPS),
                   loop=0, transparency=255, disposal=2)
        out_meta['motions'].append({'name': m, 'label': label, 'loop': loop, 'frames': n, 'durationSec': round(n / FPS, 3),
                                    'sheet': {'file': f'../../src/renderer/sprites/{a.skin}/{m}.webp', 'columns': cols, 'rows': rows,
                                              'cell': {'x': ox, 'y': oy, 'w': w, 'h': h}},
                                    'webp': f'{m}.webp', 'gif': f'{m}.gif'})
        print(f'✔ {m:10s} {n:3d} frames  cell {w}x{h}')

    print(f'디코딩 메모리(전체 시트) ≈ {total_px * 4 / 1e6:.0f} MB')
    json.dump(app_meta, open(os.path.join(a.app, 'sprites.json'), 'w'), ensure_ascii=False, indent=1)
    with open(os.path.join(a.app, 'sprites.js'), 'w') as f:   # file:// + CSP 대응 (fetch 없이 로드)
        f.write('window.RIDE_BUDDY_SKINS = window.RIDE_BUDDY_SKINS || {};\n')
        f.write(f'window.RIDE_BUDDY_SKINS[{json.dumps(a.skin)}] = ' + json.dumps(app_meta, ensure_ascii=False) + ';\n')
    json.dump(out_meta, open(os.path.join(a.out, 'motions.json'), 'w'), ensure_ascii=False, indent=2)

    if a.icons and 'front' in files:
        with Image.open(files['front'][0]) as im:
            make_icons(im.convert('RGBA'), os.path.join(here, '..', 'assets'), a.icon_scale)


def make_icons(im, out_dir, scale=0.64):
    os.makedirs(out_dir, exist_ok=True)
    b = alpha_box(im, 20)
    h = b[3] - b[1]
    size = int(h * scale)
    cx = (b[0] + b[2]) // 2
    top = b[1] - int(size * 0.02)
    face = im.crop((cx - size // 2, top, cx + size // 2, top + size))
    icon = face.resize((512, 512), Image.LANCZOS)
    icon.save(os.path.join(out_dir, 'icon.png'))
    icon.resize((64, 64), Image.LANCZOS).save(os.path.join(out_dir, 'tray@2x.png'))
    icon.resize((32, 32), Image.LANCZOS).save(os.path.join(out_dir, 'tray.png'))
    icon.save(os.path.join(out_dir, 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print('✔ icons →', out_dir)


if __name__ == '__main__':
    main()
