"""
Ride Buddy 2D — 원본 일러스트 기반 컷아웃 리그 + 모션 프레임 렌더
=================================================================
원본 캐릭터 이미지를 AI 누끼(rembg / BiRefNet)로 분리한 뒤,
파츠(몸+바이크 / 머리 / 왼쪽 미러)로 나누고 표정·효과를 원본 선 스타일에 맞춰 추가해
3D 버전과 같은 이름의 모션 프레임을 렌더링합니다. (그림체 = 원본 그대로)

  # (선택) 원본 스크린샷에서 누끼 다시 따기 → source/character_cut.png
  python build_2d.py --cut 원본.jpg
  # 모션 프레임 렌더 → out/<motion>/frame_000.png ...
  python build_2d.py --frames out
  # 한 장 미리보기
  python build_2d.py --still preview.png --motion notify --t 0.6

필요: pillow, numpy, opencv-python-headless  (누끼: rembg[cpu])
좌표계: source/character_cut.png 픽셀 좌표 (980x1410)
"""
import argparse
import math
import os

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source', 'character_cut.png')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FPS = 15
TAU = math.tau

LINE = (54, 37, 31, 255)          # 원본 외곽선 색
SKIN = (252, 225, 202)            # 원본 피부색
SHIRT = (38, 31, 29)              # 원본 셔츠색
SS = 3                            # 덧그림 슈퍼샘플링 배율

# ---- 원본 기준 파츠 좌표 (character_cut.png) ----
HEAD = dict(cx=502, cy=285, rx=292, ry=245)
NECK = (492, 520)                 # 머리 회전 축
EYE_L, EYE_R = (412, 300), (590, 322)
EYE_RX, EYE_RY = 34, 38
MOUTH = (497, 380)
MIRROR_L = (237, 467, 55)         # 머리 앞을 가리는 왼쪽 미러 (x, y, r)
# 미러 뒤에 가려진 머리 아래쪽 왼편 (실루엣 보정)
HEAD_BEHIND_MIRROR = [(228, 398), (330, 398), (360, 470), (275, 470), (248, 440)]
SIGNALS = [(490, 780, 36), (790, 808, 36), (120, 868, 28)]
HEADLIGHT = (660, 790)
EXHAUST_TIP = (70, 1020)
GROUND_Y = 1362
# 머리 뒤에 가려진 목/어깨 영역 (셔츠로 채움)
SHOULDERS = [(222, 545), (250, 478), (320, 440), (500, 425), (690, 438), (772, 478), (800, 545)]

# 캔버스: 캐릭터 중심(가로) 기준 좌우 대칭 여백 → 좌우 반전 시 위치가 흔들리지 않음
PAD_X, PAD_T, PAD_B = 190, 170, 24


# ======================================================================================
# 누끼
# ======================================================================================
def make_cut(ref_path):
    from rembg import new_session, remove
    im = Image.open(ref_path).convert('RGB')
    crop = im.crop((30, 470, 1010, 1880))   # 원본 1080x2316 스크린샷 기준 캐릭터 영역
    out = remove(crop, session=new_session('birefnet-general'))
    os.makedirs(os.path.dirname(SRC), exist_ok=True)
    out.save(SRC)
    print('cut →', SRC)


def clean_overlay(im):
    """스크린샷 UI('팔로우' 버튼 테두리)가 앞바퀴에 겹친 부분 복원"""
    a = np.array(im)
    x0, y0, x1, y1 = 455, 1270, 585, 1375
    reg = a[y0:y1, x0:x1]
    rgb = reg[..., :3].astype(int)
    bright = (rgb.min(axis=2) > 120) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 45)
    m = (bright * 255).astype(np.uint8)
    m = cv2.dilate(m, np.ones((5, 5), np.uint8))
    bgr = cv2.inpaint(cv2.cvtColor(reg[..., :3], cv2.COLOR_RGB2BGR), m, 6, cv2.INPAINT_TELEA)
    reg[..., :3] = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    reg[..., 3] = cv2.inpaint(reg[..., 3], m, 6, cv2.INPAINT_TELEA)
    a[y0:y1, x0:x1] = reg
    return Image.fromarray(a)


# ======================================================================================
# 파츠 분리
# ======================================================================================
def ellipse_mask(size, cx, cy, rx, ry, feather=1.5):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather)) if feather else m


def mirror_mask(src):
    """머리 앞의 왼쪽 미러 (원형 거울 + 미러 대)"""
    x, y, r = MIRROR_L
    m = Image.new('L', src.size, 0)
    d = ImageDraw.Draw(m)
    d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    d.line([(x + 25, y + 35), (x + 75, y + 110)], fill=255, width=20)   # 미러 대
    return m.filter(ImageFilter.GaussianBlur(0.9))


def inpaint_rgba(im, mask, radius=7):
    a = np.array(im)
    m = (np.array(mask) > 40).astype(np.uint8) * 255
    bgr = cv2.inpaint(cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2BGR), m, radius, cv2.INPAINT_TELEA)
    a[..., :3] = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(a)


class Rig:
    def __init__(self):
        src = clean_overlay(Image.open(SRC).convert('RGBA'))
        self.src = src
        W, H = src.size
        self.size = (W, H)

        mir = mirror_mask(src)
        mir_np = np.array(mir) > 60
        alpha = np.array(src.getchannel('A'))
        H_, W_ = alpha.shape
        yy = np.arange(H_)[:, None].repeat(W_, 1)
        ell = np.array(ellipse_mask(src.size, **HEAD)) > 127
        # 머리 실루엣: 어깨선 위 누끼 영역(미러 제외) + 미러 뒤/어깨선 아래는 타원으로 보정
        hb = Image.new('L', src.size, 0)
        ImageDraw.Draw(hb).polygon(HEAD_BEHIND_MIRROR, fill=255)
        behind = np.array(hb) > 0
        head_np = ((alpha > 8) & (yy < 470) & ~mir_np) | ((ell | behind) & mir_np & (yy < 470)) | (ell & (yy >= 470))
        head_m = Image.fromarray((head_np * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
        self.head_mask = head_m

        # 머리 레이어: 미러에 가려졌던 부분은 인페인트로 복원
        ha = np.array(src)
        ha[mir_np & head_np, :3] = SKIN                 # 미러 뒤 = 피부색
        head = Image.fromarray(ha)
        head.putalpha(head_m)
        self.head = head

        # 몸+바이크 레이어: 머리 자리를 셔츠색으로 메우고(목·어깨), 나머지는 투명
        a = np.array(src)
        sh = Image.new('L', src.size, 0)
        ImageDraw.Draw(sh).polygon(SHOULDERS, fill=255)
        fill = head_np & (np.array(sh) > 0)
        a[fill, :3] = SHIRT                             # 머리 뒤 목/어깨 = 셔츠색
        al = alpha.copy()
        al[head_np] = 0
        al[fill] = 255
        a[..., 3] = al
        base = Image.fromarray(a)
        self.base = base

        # 머리 앞 미러
        front = src.copy()
        front.putalpha(ImageChops.multiply(src.getchannel('A'), mir))
        self.front = front

        self.base_on, self.base_off = self.hazard_variants()
        self.faces = self.face_variants()

    # ---------- 비상등 ----------
    def hazard_variants(self):
        a = np.array(self.base).astype(np.float32)
        hsv = cv2.cvtColor(a[..., :3].astype(np.uint8), cv2.COLOR_RGB2HSV)
        H, W = a.shape[:2]
        yy, xx = np.mgrid[0:H, 0:W]
        near = np.zeros((H, W), bool)
        for x, y, r in SIGNALS:
            near |= (xx - x) ** 2 + (yy - y) ** 2 < r * r
        orange = near & (hsv[..., 0] >= 5) & (hsv[..., 0] <= 26) & (hsv[..., 1] > 110) & (hsv[..., 2] > 120)
        on = a.copy()
        on[orange, :3] = np.clip(on[orange, :3] * 1.18 + np.array([40, 40, 10]), 0, 255)
        off = a.copy()
        off[orange, :3] = off[orange, :3] * 0.62
        on_im = Image.fromarray(on.astype(np.uint8))
        glow = Image.new('RGBA', self.size, (0, 0, 0, 0))
        g = ImageDraw.Draw(glow)
        for x, y, r in SIGNALS:
            g.ellipse((x - r * 2.2, y - r * 2.2, x + r * 2.2, y + r * 2.2), fill=(255, 196, 70, 120))
        glow = glow.filter(ImageFilter.GaussianBlur(22))
        on_im = Image.alpha_composite(on_im, glow)
        return on_im, Image.fromarray(off.astype(np.uint8))

    # ---------- 표정 ----------
    def face_variants(self):
        head = self.head
        W, H = self.size
        eye_m = Image.new('L', self.size, 0)
        d = ImageDraw.Draw(eye_m)
        for (x, y) in (EYE_L, EYE_R):
            d.ellipse((x - EYE_RX - 6, y - EYE_RY - 6, x + EYE_RX + 6, y + EYE_RY + 6), fill=255)
        mouth_m = Image.new('L', self.size, 0)
        ImageDraw.Draw(mouth_m).ellipse((MOUTH[0] - 52, MOUTH[1] - 30, MOUTH[0] + 52, MOUTH[1] + 40), fill=255)

        no_eyes = inpaint_rgba(head, eye_m, 9)
        no_eyes.putalpha(head.getchannel('A'))
        no_mouth = inpaint_rgba(head, mouth_m, 9)
        no_mouth.putalpha(head.getchannel('A'))
        blank = inpaint_rgba(no_eyes, mouth_m, 9)
        blank.putalpha(head.getchannel('A'))

        eyes = {}
        for k, (x, y) in (('L', EYE_L), ('R', EYE_R)):
            box = (x - EYE_RX - 4, y - EYE_RY - 4, x + EYE_RX + 4, y + EYE_RY + 4)
            eyes[k] = (head.crop(box), box)
        self.eye_crops = eyes
        return dict(head=head, no_eyes=no_eyes, no_mouth=no_mouth, blank=blank)

    def compose_head(self, eyes='normal', mouth='w', mouth_h=24, blink=1.0):
        """eyes: normal|closed|happy|wow   mouth: w|open|o   blink: 1=뜸, 0=감음"""
        if eyes == 'normal' and blink < 0.999:
            eyes = 'closed' if blink < 0.25 else 'half'
        base_key = {(True, True): 'head', (False, True): 'no_eyes', (True, False): 'no_mouth', (False, False): 'blank'}
        img = self.faces[base_key[(eyes == 'normal', mouth == 'w')]].copy()

        over = Image.new('RGBA', (self.size[0] * SS, self.size[1] * SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(over)
        lw = 7 * SS
        S = lambda p: (p[0] * SS, p[1] * SS)

        def curve(p0, c, p1, width=lw, color=LINE, n=24):
            pts = []
            for i in range(n + 1):
                t = i / n
                x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0]
                y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]
                pts.append(S((x, y)))
            d.line(pts, fill=color, width=width, joint='curve')
            r = width / 2
            for q in (pts[0], pts[-1]):
                d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=color)

        for (x, y), k in ((EYE_L, 'L'), (EYE_R, 'R')):
            if eyes == 'closed':
                curve((x - 30, y - 2), (x, y + 24), (x + 30, y - 2))
            elif eyes == 'happy':
                curve((x - 30, y + 10), (x, y - 26), (x + 30, y + 10))
            elif eyes == 'half':
                crop, box = self.eye_crops[k]
                h = max(4, int(crop.height * 0.42))
                sm = crop.resize((crop.width, h), Image.LANCZOS)
                img.alpha_composite(sm, (box[0], int(y - h / 2 + 6)))
            elif eyes == 'wow':
                crop, box = self.eye_crops[k]
                s = 1.24
                big = crop.resize((int(crop.width * s), int(crop.height * s)), Image.LANCZOS)
                img.alpha_composite(big, (int(x - big.width / 2), int(y - big.height / 2)))
                sx, sy = x - 14, y + 16       # 반짝이 별
                star = [S((sx, sy - 9)), S((sx + 3, sy - 3)), S((sx + 9, sy)), S((sx + 3, sy + 3)),
                        S((sx, sy + 9)), S((sx - 3, sy + 3)), S((sx - 9, sy)), S((sx - 3, sy - 3))]
                d.polygon(star, fill=(255, 255, 255, 255))

        mx, my = MOUTH
        if mouth == 'open':
            h = mouth_h
            box = (S((mx - 30, my - 10)), S((mx + 30, my - 10 + h)))
            m = Image.new('L', over.size, 0)
            ImageDraw.Draw(m).rounded_rectangle((box[0][0], box[0][1], box[1][0], box[1][1]), radius=int(min(h, 30) * SS * 0.48), fill=255)
            inside = Image.new('RGBA', over.size, (126, 38, 36, 255))
            ImageDraw.Draw(inside).ellipse(S((mx - 20, my - 10 + h * 0.55)) + S((mx + 20, my - 10 + h * 1.25)), fill=(238, 118, 124, 255))
            over.paste(inside, (0, 0), m)
            d.rounded_rectangle((box[0][0], box[0][1], box[1][0], box[1][1]), radius=int(min(h, 30) * SS * 0.48), outline=LINE, width=6 * SS)
        elif mouth == 'o':
            d.ellipse(S((mx - 15, my - 8)) + S((mx + 15, my + 26)), fill=(126, 38, 36, 255), outline=LINE, width=6 * SS)

        over = over.resize(self.size, Image.LANCZOS)
        over.putalpha(ImageChops.multiply(over.getchannel('A'), self.head_mask))
        img.alpha_composite(over)
        return img


# ======================================================================================
# 효과 (원본 선 스타일)
# ======================================================================================
def fx_layer(size, items):
    W, H = size
    over = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    S = lambda v: v * SS
    for it in items:
        k = it['kind']
        x, y, s, a = it['x'], it['y'], it.get('s', 1.0), it.get('a', 1.0)
        al = int(255 * max(0, min(1, a)))
        line = LINE[:3] + (al,)
        if k == 'notice':
            r = 50 * s
            d.ellipse((S(x - r), S(y - r), S(x + r), S(y + r)), fill=(255, 216, 74, al), outline=line, width=int(S(7)))
            d.rounded_rectangle((S(x - 7 * s), S(y - 30 * s), S(x + 7 * s), S(y + 8 * s)), radius=int(S(7 * s)), fill=line)
            d.ellipse((S(x - 8 * s), S(y + 16 * s), S(x + 8 * s), S(y + 32 * s)), fill=line)
        elif k == 'heart':
            pts = []
            for i in range(60):
                t = TAU * i / 60
                hx = 16 * math.sin(t) ** 3
                hy = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
                pts.append((S(x + hx * 2.6 * s), S(y + hy * 2.6 * s)))
            d.polygon(pts, fill=(255, 107, 129, al), outline=line, width=int(S(6)))
        elif k == 'z':
            f = ImageFont.truetype(FONT, int(S(it['size'] * s)))
            d.text((S(x), S(y)), it.get('text', 'Z'), font=f, fill=(142, 163, 201, al), stroke_width=int(S(5)), stroke_fill=line, anchor='mm')
        elif k == 'puff':
            r = it['r']
            d.ellipse((S(x - r), S(y - r), S(x + r), S(y + r)), fill=(228, 231, 235, al), outline=(150, 158, 168, al), width=int(S(4)))
        elif k == 'speed':
            d.line([(S(x), S(y)), (S(x + it['len']), S(y))], fill=(150, 165, 182, al), width=int(S(9)), joint='curve')
        elif k == 'sweat':
            d.polygon([(S(x), S(y - 26 * s)), (S(x + 14 * s), S(y)), (S(x - 14 * s), S(y))], fill=(143, 211, 255, al))
            d.ellipse((S(x - 14 * s), S(y - 12 * s), S(x + 14 * s), S(y + 16 * s)), fill=(143, 211, 255, al), outline=line, width=int(S(4)))
    return over.resize((W, H), Image.LANCZOS)


# ======================================================================================
# 합성
# ======================================================================================
def affine(img, canvas_size, offset, pivot=(0, 0), dx=0, dy=0, rot=0.0, sx=1.0, sy=1.0):
    """레이어(img)를 canvas 의 offset 위치에 놓고 pivot(레이어 좌표) 기준 회전/스케일/이동"""
    px, py = pivot[0] + offset[0], pivot[1] + offset[1]
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    # forward: p' = P + D + R*S*(p - P)  (p 는 캔버스 좌표)
    A = np.array([[c * sx, -s * sy], [s * sx, c * sy]])
    Ai = np.linalg.inv(A)
    t = np.array([px + dx, py + dy])
    # inverse: p = P + Ai (p' - t)
    b = np.array([px, py]) - Ai @ t
    # PIL: input = (a x + b y + c, d x + e y + f), input 좌표는 레이어 좌표 → offset 빼기
    coeffs = (Ai[0, 0], Ai[0, 1], b[0] - offset[0], Ai[1, 0], Ai[1, 1], b[1] - offset[1])
    return img.transform(canvas_size, Image.AFFINE, coeffs, resample=Image.BICUBIC)


class Renderer:
    def __init__(self):
        self.rig = Rig()
        W, H = self.rig.size
        a = np.array(self.rig.src.getchannel('A'))
        ys, xs = np.where(a > 20)
        self.cx = (xs.min() + xs.max()) / 2
        self.cw = int(2 * max(self.cx, W - self.cx) + 2 * PAD_X)
        self.ch = H + PAD_T + PAD_B
        self.off = (int(self.cw / 2 - self.cx), PAD_T)
        self.size = (self.cw, self.ch)

    def frame(self, p):
        """p: 포즈 dict → RGBA 프레임"""
        R = self.rig
        cs, off = self.size, self.off
        out = Image.new('RGBA', cs, (0, 0, 0, 0))

        # 그림자
        sh = Image.new('RGBA', cs, (0, 0, 0, 0))
        k = p.get('shadow', 1.0)
        gx, gy = off[0] + 470, off[1] + GROUND_Y
        ImageDraw.Draw(sh).ellipse((gx - 400 * k, gy - 20, gx + 400 * k, gy + 20), fill=(30, 22, 18, 70))
        out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))

        # 뒤 효과 (연기, 스피드라인)
        back = [it for it in p.get('fx', []) if it['kind'] in ('puff', 'speed')]
        if back:
            out.alpha_composite(self.fx(back))

        base = {'on': R.base_on, 'off': R.base_off}.get(p.get('hazard'), R.base)
        bdy = p.get('base_dy', 0)
        out.alpha_composite(affine(base, cs, off, pivot=(470, GROUND_Y), dy=bdy, sy=p.get('base_sy', 1.0), sx=p.get('base_sx', 1.0)))

        if p.get('headlight', 0) > 0:
            gl = Image.new('RGBA', cs, (0, 0, 0, 0))
            hx, hy = HEADLIGHT[0] + off[0], HEADLIGHT[1] + off[1] + bdy
            r = 150
            ImageDraw.Draw(gl).ellipse((hx - r, hy - r, hx + r, hy + r), fill=(255, 244, 196, int(170 * p['headlight'])))
            out.alpha_composite(gl.filter(ImageFilter.GaussianBlur(40)))

        head = R.compose_head(p.get('eyes', 'normal'), p.get('mouth', 'w'), p.get('mouth_h', 24), p.get('blink', 1.0))
        out.alpha_composite(affine(head, cs, off, pivot=NECK, dx=p.get('head_dx', 0), dy=bdy + p.get('head_dy', 0),
                                   rot=p.get('head_rot', 0), sx=p.get('head_s', 1.0), sy=p.get('head_s', 1.0) * p.get('head_sy', 1.0)))
        out.alpha_composite(affine(R.front, cs, off, pivot=(470, GROUND_Y), dy=bdy))

        frontfx = [it for it in p.get('fx', []) if it['kind'] not in ('puff', 'speed')]
        if frontfx:
            out.alpha_composite(self.fx(frontfx))

        # 전체 변형 (점프/찌그러짐/좌우 반전)
        gsx, gsy, gdy = p.get('sx', 1.0), p.get('sy', 1.0), p.get('dy', 0)
        if gsx != 1 or gsy != 1 or gdy:
            pivot = (self.cw / 2, off[1] + GROUND_Y)
            out = affine(out, cs, (0, 0), pivot=pivot, dy=gdy, sx=gsx, sy=gsy)
        return out

    def fx(self, items):
        moved = [dict(it, x=it['x'] + self.off[0], y=it['y'] + self.off[1]) for it in items]
        return fx_layer(self.size, moved)


# ======================================================================================
# 모션
# ======================================================================================
MOTIONS = {
    'ride_r': 3.2, 'ride_l': 3.2, 'idle_r': 2.4, 'idle_l': 2.4, 'face_r': 0.4, 'face_l': 0.4,
    'front': 2.4, 'notify': 1.6, 'talk': 1.6, 'happy': 1.6, 'sleep': 3.2, 'turn': 0.8,
}


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def back_out(x, s=1.7):
    x = min(max(x, 0.0), 1.0) - 1
    return x * x * ((s + 1) * x + s) + 1


def blink_at(t, at, dur=0.27):
    d = abs(t - at)
    if d > dur / 2:
        return 1.0
    return d / (dur / 2)


def pose(motion, t):
    L = MOTIONS[motion]
    p = {}
    if motion in ('ride_r', 'ride_l'):
        vib = 3 if int(round(t * FPS)) % 2 else -3
        p['base_dy'] = vib
        p['head_dy'] = -10 * (0.5 + 0.5 * math.sin(t / 0.8 * TAU - 0.9))
        p['head_rot'] = 2.2 * math.sin(t / 1.6 * TAU)
        p['blink'] = blink_at(t, 2.4)
        fx = []
        for i in range(4):
            ph = ((t / 0.8) + i / 4) % 1.0
            fx.append(dict(kind='puff', x=EXHAUST_TIP[0] - 170 * ph, y=EXHAUST_TIP[1] - 70 * ph + vib, r=12 + 30 * ph, a=(1 - ph) ** 1.3))
        for i, (yy, ln) in enumerate(((560, 120), (880, 160), (1180, 110))):
            ph = ((t / 0.6) + i / 3) % 1.0
            fx.append(dict(kind='speed', x=-40 - 160 * ph, y=yy, len=ln, a=math.sin(ph * math.pi) * 0.75))
        p['fx'] = fx
        if motion == 'ride_l':
            p['sx'] = -1
    elif motion in ('idle_r', 'idle_l', 'front'):
        b = 0.5 + 0.5 * math.sin(t / 1.2 * TAU)
        p['base_sy'] = 1 + 0.006 * b
        p['head_dy'] = -5 * b
        p['head_rot'] = 2.0 * math.sin(t / L * TAU)
        p['blink'] = blink_at(t, 1.0 if motion != 'front' else 1.4)
        if motion == 'idle_l':
            p['sx'] = -1
    elif motion == 'face_r':
        k = math.sin(min(t / (L - 1 / FPS), 1) * math.pi)
        p['dy'] = -22 * k
        p['sy'] = 1 + 0.03 * k
        p['sx'] = 1 - 0.02 * k
    elif motion in ('face_l', 'turn'):
        k = ease(t / (L - 1 / FPS))
        sx = -1 + 2 * k
        p['sx'] = sx if abs(sx) > 0.04 else (0.04 if sx >= 0 else -0.04)
        p['dy'] = -34 * math.sin(k * math.pi)
        p['sy'] = 1 + 0.04 * math.sin(k * math.pi)
        p['shadow'] = 0.75 + 0.25 * abs(sx)
    elif motion == 'notify':
        hop = math.sin(min(t / 0.5, 1) * math.pi)
        p['eyes'], p['mouth'] = 'wow', 'o'
        p['dy'] = -46 * hop
        p['sy'] = 1 + 0.05 * hop
        p['sx'] = 1 - 0.03 * hop
        p['head_s'] = 1 + 0.03 * hop
        p['head_rot'] = 4 * math.sin(t / 0.4 * TAU) * min(1, t / 0.5)
        on = (int(t / 0.2) % 2) == 0
        p['hazard'] = 'on' if on else 'off'
        p['headlight'] = 0.5 + 0.5 * math.sin(t / 0.4 * TAU)
        pop = back_out(t / 0.45)
        fx = [dict(kind='notice', x=860, y=70, s=max(0.05, pop))]
        sw = (t % 0.8) / 0.8
        fx.append(dict(kind='sweat', x=245, y=150 + 40 * sw, s=1.0, a=1 - sw))
        p['fx'] = fx
    elif motion == 'talk':
        p['mouth'] = 'open'
        p['mouth_h'] = 14 + 24 * (0.5 + 0.5 * math.sin(t / 0.4 * TAU))
        p['head_rot'] = 2.0 * math.sin(t / 0.8 * TAU)
        p['head_dy'] = -3 * (0.5 + 0.5 * math.sin(t / 0.4 * TAU))
        p['blink'] = blink_at(t, 1.2)
        p['hazard'] = 'on' if (int(t / 0.4) % 2) == 0 else 'off'
    elif motion == 'happy':
        bnc = abs(math.sin(t / 0.8 * TAU))
        p['eyes'] = 'happy'
        p['dy'] = -34 * bnc
        p['sy'] = 1 + 0.035 * (bnc - 0.5)
        p['sx'] = 1 - 0.02 * (bnc - 0.5)
        p['head_rot'] = 4 * math.sin(t / 0.8 * TAU)
        fx = []
        for i, (hx, hy) in enumerate(((150, 170), (880, 130))):
            ph = ((t / 1.6) + i * 0.5) % 1.0
            fx.append(dict(kind='heart', x=hx, y=hy - 110 * ph, s=0.6 + 0.6 * math.sin(min(ph * 2, 1) * math.pi / 2), a=1 - max(0, ph - 0.7) / 0.3))
        p['fx'] = fx
    elif motion == 'sleep':
        ph = t / L
        p['eyes'] = 'closed'
        p['head_rot'] = -3.5 - 2 * math.sin(ph * TAU)
        p['head_dy'] = 6 + 4 * math.sin(ph * TAU)
        b = 0.5 + 0.5 * math.sin(t / 1.6 * TAU)
        p['base_sy'] = 1 + 0.008 * b
        fx = []
        for i, (sz, txt) in enumerate(((78, 'Z'), (60, 'z'), (46, 'z'))):
            q = (ph + i / 3) % 1.0
            fx.append(dict(kind='z', x=800 + 70 * q + i * 10, y=150 - 150 * q, size=sz, text=txt,
                           s=0.6 + 0.5 * math.sin(q * math.pi), a=math.sin(q * math.pi) * 1.3))
        p['fx'] = fx
    return p


# ======================================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cut')
    ap.add_argument('--frames')
    ap.add_argument('--only', default='')
    ap.add_argument('--still')
    ap.add_argument('--motion', default='idle_r')
    ap.add_argument('--t', type=float, default=0.0)
    a = ap.parse_args()
    if a.cut:
        make_cut(a.cut)
    if not (a.frames or a.still):
        return
    R = Renderer()
    if a.still:
        R.frame(pose(a.motion, a.t)).save(a.still)
    if a.frames:
        only = [x for x in a.only.split(',') if x]
        for name, L in MOTIONS.items():
            if only and name not in only:
                continue
            d = os.path.join(a.frames, name)
            os.makedirs(d, exist_ok=True)
            n = int(round(L * FPS))
            for i in range(n):
                R.frame(pose(name, i / FPS)).save(os.path.join(d, f'frame_{i:03d}.png'))
            print(f'[motion] {name} {n} frames', flush=True)


if __name__ == '__main__':
    main()
