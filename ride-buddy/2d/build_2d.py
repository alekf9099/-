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
FPS = 30
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
SHOULDERS = [(222, 565), (262, 515), (330, 470), (500, 452), (668, 466), (742, 508), (800, 565)]

# 오른손 (손 흔들기): 그립 잡은 손을 지우고 핸들바/그립을 다시 그린 뒤, 소매에서 팔을 들어 올림
HAND_R_BOX = (730, 600, 850, 712)
BAR_R = [(740, 657), (772, 671)]     # 크롬 핸들바
GRIP_R = [(770, 671), (852, 704)]    # 검정 그립
ELBOW_R = (752, 628)                 # 팔 회전 축 (소매 끝)
# 오른쪽 소매 (팔이 소매 안에서 나오도록 팔 위에 다시 그림)
SLEEVE_R = [(680, 525), (735, 545), (766, 590), (770, 640), (748, 662), (690, 668)]
SKIN_SHADE = (240, 200, 176)
# 타이어 트레드 (굴러가는 줄무늬) — 타원 위 각도 구간
TIRES = [dict(cx=630, cy=1143, rx=118, ry=196, a0=-65, span=150, w=8),
         dict(cx=168, cy=1160, rx=66, ry=86, a0=50, span=120, w=5)]

# ---- 워프 리그 (Live2D 방식 부드러운 변형) ----
REAR_AXLE, FRONT_AXLE = (180, 1140), (585, 1150)
STEER = (610, 700)                 # 조향축 (핸들·전조등 회전 중심)
SEAT = (450, 780)                  # 라이더 엉덩이 (라이더 회전 중심)
SEAT_F = (SEAT[0] - REAR_AXLE[0]) / (FRONT_AXLE[0] - REAR_AXLE[0])
ZONE_FRONT = dict(
    circles=[(660, 790, 108), (490, 780, 44), (790, 808, 44), (237, 467, 62), (848, 568, 60), (283, 606, 52), (790, 682, 56)],
    lines=[([(225, 606), (330, 640), (430, 668), (560, 690), (700, 690), (855, 706)], 42),
           ([(237, 467), (330, 640)], 24), ([(848, 568), (760, 662)], 24)],
    polys=[[(500, 870), (790, 870), (770, 935), (520, 935)]])
ZONE_WHEEL_F = dict(ellipses=[(625, 1150, 172, 222)], polys=[[(535, 945), (600, 905), (705, 905), (782, 958), (786, 1012), (535, 1012)]])
ZONE_WHEEL_R = dict(ellipses=[(190, 1150, 108, 108)], ymin=1112)
ZONE_RIDER = dict(polys=[[(300, 470), (780, 470), (805, 560), (775, 650), (700, 690), (560, 700), (430, 690), (330, 690)],
                         [(140, 520), (250, 485), (335, 560), (350, 700), (305, 770), (195, 770), (140, 700)],
                         [(690, 515), (785, 520), (808, 600), (775, 662), (700, 672)]])
THIGH_POLY = [(186, 690), (360, 690), (366, 888), (186, 888)]
KNEE = (284, 862)                  # 발 내릴 때 정강이 시작점
PEG = (300, 930)                   # 발판 (발 올린 상태)
FOOT_GROUND = (244, 1270)          # 발 내린 상태 발목 위치

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


def premult(im):
    a = np.asarray(im, np.float32) / 255.0
    a[..., :3] *= a[..., 3:4]
    return a


def unpremult(a):
    out = a.copy()
    al = np.clip(out[..., 3:4], 1e-6, 1)
    out[..., :3] = np.where(out[..., 3:4] > 1e-4, out[..., :3] / al, 0)
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


def remap_pm(pm, mx, my):
    return cv2.remap(pm, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


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
        # 어깨선 아래 머리(턱·볼 아래쪽)는 실제 피부 영역을 따라 잘라 외곽선이 남지 않게
        rgb = np.array(src.convert('RGB')).astype(int)
        skin = (rgb[..., 0] > 200) & (rgb[..., 1] > 160) & (rgb[..., 2] > 125) & (rgb[..., 0] - rgb[..., 2] > 18) & (alpha > 128)
        n, lab = cv2.connectedComponents(skin.astype(np.uint8))
        face = (lab == lab[HEAD['cy'] + 40, HEAD['cx']]).astype(np.uint8) * 255
        face = cv2.morphologyEx(face, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
        cnts, _ = cv2.findContours(face, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        face = np.zeros_like(face)
        cv2.drawContours(face, cnts, -1, 255, -1)
        face = cv2.dilate(face, np.ones((15, 15), np.uint8)) > 0
        head_np |= face & (yy >= 430) & (yy < 570) & ~mir_np
        head_m = Image.fromarray((head_np * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
        self.head_mask = head_m

        # 머리 레이어: 미러에 가려졌던 부분은 인페인트로 복원
        ha = np.array(src)
        ha[mir_np & head_np, :3] = SKIN                 # 미러 뒤 = 피부색
        self.mirror_hole = mir_np & head_np
        head = Image.fromarray(ha)
        head.putalpha(head_m)
        self.head = head

        # 몸+바이크 레이어: 머리 자리를 셔츠색으로 메우고(목·어깨), 나머지는 투명
        a = np.array(src)
        sh = Image.new('L', src.size, 0)
        ImageDraw.Draw(sh).polygon(SHOULDERS, fill=255)
        fill = head_np & ((np.array(sh) > 0) | (yy >= 500))   # 턱 아래(몸 안쪽)는 모두 셔츠로
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
        self.bases = {}
        for key, im in (('', self.base), ('on', self.base_on), ('off', self.base_off)):
            self.bases[(key, False)] = im
            self.bases[(key, True)] = self.erase_hand(im)
        self.tire_mask = self.make_tire_mask()
        sm = Image.new('L', self.size, 0)
        ImageDraw.Draw(sm).polygon(SLEEVE_R, fill=255)
        sm = ImageChops.multiply(sm.filter(ImageFilter.GaussianBlur(1)), self.base.getchannel('A'))
        self.sleeve_r = self.base.copy()
        self.sleeve_r.putalpha(sm)
        self.faces = self.face_variants()
        self.build_zones()

    # ---------- 워프 (부드러운 변형) ----------
    def zone_mask(self, z):
        m = Image.new('L', self.size, 0)
        d = ImageDraw.Draw(m)
        for (x, y, r) in z.get('circles', []):
            d.ellipse((x - r, y - r, x + r, y + r), fill=255)
        for (x, y, rx, ry) in z.get('ellipses', []):
            d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=255)
        for pts, w in z.get('lines', []):
            d.line(pts, fill=255, width=w, joint='curve')
            for (x, y) in pts:
                d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=255)
        for pts in z.get('polys', []):
            d.polygon(pts, fill=255)
        a = np.array(m) > 0
        if 'ymin' in z:
            a[:z['ymin']] = False
        return a

    def build_zones(self):
        """영역별 가중치: 앞부분(핸들·전조등·손·미러) > 앞바퀴 > 뒷바퀴 > 라이더 > 차체(나머지)"""
        W, H = self.size
        label = np.full((H, W), 0, np.uint8)          # 0 = body
        rider = self.zone_mask(ZONE_RIDER)
        label[rider] = 4
        thigh = Image.new('L', self.size, 0)
        ImageDraw.Draw(thigh).polygon(THIGH_POLY, fill=255)
        thigh_np = np.array(thigh) > 0
        label[thigh_np & ~rider] = 5                  # 허벅지: 라이더/차체 반반
        label[self.zone_mask(ZONE_WHEEL_R)] = 3
        label[self.zone_mask(ZONE_WHEEL_F)] = 2
        label[self.zone_mask(ZONE_FRONT)] = 1
        sig = 11
        ws = {}
        for name, ids in (('body', [0]), ('front', [1]), ('wf', [2]), ('wr', [3]), ('rider', [4])):
            ws[name] = cv2.GaussianBlur(np.isin(label, ids).astype(np.float32), (0, 0), sig)
        th = cv2.GaussianBlur((label == 5).astype(np.float32), (0, 0), sig)
        ws['rider'] += th * 0.6
        ws['body'] += th * 0.4
        tot = sum(ws.values()) + 1e-6
        self.zones = {k: (v / tot).astype(np.float32) for k, v in ws.items()}
        self.gx, self.gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
        # 프리멀티 알파 (워프 시 가장자리 번짐 방지)
        self.pm = {}
        for key, im in self.bases.items():
            self.pm[key] = premult(im)
        self.pm_front = premult(self.front)
        tm = ImageChops.multiply(thigh.filter(ImageFilter.GaussianBlur(1)), self.base.getchannel('A'))
        self.thigh_mask = np.array(tm, np.float32) / 255
        sm = np.array(self.sleeve_r.getchannel('A'), np.float32) / 255
        self.sleeve_mask = sm

    def warp_maps(self, T):
        """T: 영역별 3x3 행렬 dict → cv2.remap 용 역방향 맵"""
        X, Y = self.gx, self.gy
        Dx = np.zeros_like(X); Dy = np.zeros_like(Y)
        for k, w in self.zones.items():
            M = T.get(k)
            if M is None:
                continue
            dx = (M[0, 0] - 1) * X + M[0, 1] * Y + M[0, 2]
            dy = M[1, 0] * X + (M[1, 1] - 1) * Y + M[1, 2]
            Dx += w * dx; Dy += w * dy
        # 역변환 근사 1회 보정: p = q - D(q - D(q))
        mx0, my0 = X - Dx, Y - Dy
        Dx2 = cv2.remap(Dx, mx0, my0, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        Dy2 = cv2.remap(Dy, mx0, my0, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        return X - Dx2, Y - Dy2, (Dx, Dy)

    def point(self, D, pt):
        """원본 좌표 pt 가 워프 후 어디로 가는지 (정방향 변위)"""
        x, y = int(round(pt[0])), int(round(pt[1]))
        return (pt[0] + float(D[0][y, x]), pt[1] + float(D[1][y, x]))

    # ---------- 손 흔들기 ----------
    def erase_hand(self, img):
        """그립 잡은 오른손을 지우고 핸들바·그립을 다시 그림"""
        a = np.array(img)
        x0, y0, x1, y1 = HAND_R_BOX
        reg = a[y0:y1, x0:x1].astype(int)
        skin = (reg[..., 0] > 185) & (reg[..., 1] > 150) & (reg[..., 2] > 120) & (reg[..., 0] - reg[..., 2] > 22) & (reg[..., 3] > 100)
        m = np.zeros(a.shape[:2], np.uint8)
        m[y0:y1, x0:x1] = skin * 255
        m = cv2.dilate(m, np.ones((13, 13), np.uint8))
        a[m > 0, 3] = 0
        im = Image.fromarray(a)
        ov = Image.new('RGBA', (self.size[0] * SS, self.size[1] * SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        S = lambda pt: (pt[0] * SS, pt[1] * SS)

        def stroke(p0, p1, w, color):
            d.line([S(p0), S(p1)], fill=color, width=int(w * SS))
            for q in (p0, p1):
                r = w * SS / 2
                d.ellipse((q[0] * SS - r, q[1] * SS - r, q[0] * SS + r, q[1] * SS + r), fill=color)
        stroke(*BAR_R, 30, LINE)
        stroke(*BAR_R, 17, (214, 217, 221, 255))
        d.line([S((BAR_R[0][0], BAR_R[0][1] - 4)), S((BAR_R[1][0], BAR_R[1][1] - 4))], fill=(250, 250, 250, 255), width=4 * SS)
        stroke(*GRIP_R, 42, LINE)
        stroke(*GRIP_R, 29, (44, 37, 36, 255))
        im.alpha_composite(ov.resize(self.size, Image.LANCZOS))
        return im

    def arm(self, angle):
        """소매 끝(ELBOW_R)에서 angle(도) 방향으로 들어 올린 팔 + 손 (원본 선 스타일)"""
        ov = Image.new('RGBA', (self.size[0] * SS, self.size[1] * SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        ex, ey = ELBOW_R
        dx, dy = math.cos(math.radians(angle)), -math.sin(math.radians(angle))
        nx, ny = -dy, dx
        S = lambda x, y: (x * SS, y * SS)
        wx, wy = ex + dx * 118, ey + dy * 118
        hx, hy = ex + dx * 158, ey + dy * 158

        def capsule(r0, r1, color):
            poly = [S(ex + nx * r0, ey + ny * r0), S(wx + nx * r1, wy + ny * r1), S(wx - nx * r1, wy - ny * r1), S(ex - nx * r0, ey - ny * r0)]
            d.polygon(poly, fill=color)
            for (cx, cy, r) in ((ex, ey, r0), (wx, wy, r1)):
                d.ellipse(S(cx - r, cy - r) + S(cx + r, cy + r), fill=color)
        capsule(41, 36, LINE)
        capsule(34, 29, SKIN + (255,))
        # 팔 아래쪽 음영
        d.line([S(ex - nx * 22 + dx * 24, ey - ny * 22 + dy * 24), S(wx - nx * 19, wy - ny * 19)], fill=SKIN_SHADE + (255,), width=8 * SS)
        # 손 (둥근 주먹 + 손가락 + 엄지)
        tx, ty = hx + nx * 36 - dx * 6, hy + ny * 36 - dy * 6
        d.ellipse(S(tx - 21, ty - 21) + S(tx + 21, ty + 21), fill=LINE)
        d.ellipse(S(hx - 48, hy - 46) + S(hx + 48, hy + 46), fill=LINE)
        d.ellipse(S(tx - 14, ty - 14) + S(tx + 14, ty + 14), fill=SKIN + (255,))
        d.ellipse(S(hx - 41, hy - 39) + S(hx + 41, hy + 39), fill=SKIN + (255,))
        for k in (-1, 0, 1):
            fx_, fy_ = hx + dx * 40 + nx * 19 * k, hy + dy * 40 + ny * 19 * k
            d.line([S(fx_, fy_), S(fx_ - dx * 17, fy_ - dy * 17)], fill=LINE, width=6 * SS)
        # 흔드는 표시
        for k, r in ((1, 64), (1, 80)):
            box = S(hx - r, hy - r) + S(hx + r, hy + r)
            a0 = -math.degrees(math.atan2(dy, dx))
            d.arc(box, a0 - 70, a0 - 35, fill=LINE[:3] + (200,), width=5 * SS)
        return ov.resize(self.size, Image.LANCZOS)

    # ---------- 타이어 트레드 ----------
    def make_tire_mask(self):
        rgb = np.array(self.src).astype(int)
        lum = (rgb[..., :3] * [0.3, 0.59, 0.11]).sum(axis=2)
        sat = rgb[..., :3].max(axis=2) - rgb[..., :3].min(axis=2)
        H, W = lum.shape
        yy, xx = np.mgrid[0:H, 0:W]
        inside = np.zeros((H, W), bool)
        for t in TIRES:
            inside |= ((xx - t['cx']) / (t['rx'] * 1.25)) ** 2 + ((yy - t['cy']) / (t['ry'] * 1.15)) ** 2 < 1
        m = inside & (lum < 105) & (sat < 45) & (rgb[..., 3] > 200)
        m = cv2.erode(m.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
        return Image.fromarray(m).filter(ImageFilter.GaussianBlur(1.5))

    def treads(self, phase):
        ov = Image.new('RGBA', (self.size[0] * 2, self.size[1] * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        for t in TIRES:
            for k in range(4):
                s0 = t['a0'] + ((phase + k / 4) % 1.0) * t['span']
                pts = []
                for i in range(9):
                    a = math.radians(s0 + 18 * i / 8)
                    pts.append(((t['cx'] + t['rx'] * math.cos(a)) * 2, (t['cy'] + t['ry'] * math.sin(a)) * 2))
                d.line(pts, fill=(30, 22, 21, 150), width=t['w'] * 4, joint='curve')
                d.line([(x + 6, y - 4) for x, y in pts], fill=(140, 124, 118, 90), width=4)
        ov = ov.resize(self.size, Image.LANCZOS)
        ov.putalpha(ImageChops.multiply(ov.getchannel('A'), self.tire_mask))
        return ov

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

    # ---------- 머리 합성 (표정) ----------
    HEAD_BOX = (190, 20, 820, 560)           # 덧그림 영역 (속도 최적화)

    def compose_head(self, eyes='normal', mouth='w', mouth_h=24, blink=1.0, look=0.0):
        """eyes: normal|closed|happy|wow|look|wink   mouth: w|open|o|yawn|grin|smile
        blink: 1=뜸 0=감음   look: 눈동자 좌우 이동(px)"""
        mouth = 'w'                          # 입은 항상 원본 ㅅ(ω) 모양 유지 (캐릭터 정체성)
        if eyes in ('normal', 'look') and blink < 0.999:
            eyes = 'closed' if blink < 0.25 else 'half'
        if eyes == 'normal' and abs(look) > 0.5:
            eyes = 'look'
        key = (eyes, mouth, int(round(mouth_h)), int(round(look)))
        cache = self.__dict__.setdefault('_head_cache', {})
        if key in cache:
            return cache[key]

        keep_eyes, keep_mouth = eyes == 'normal', mouth == 'w'
        base_key = {(True, True): 'head', (False, True): 'no_eyes', (True, False): 'no_mouth', (False, False): 'blank'}
        img = self.faces[base_key[(keep_eyes, keep_mouth)]].copy()

        bx0, by0, bx1, by1 = self.HEAD_BOX
        over = Image.new('RGBA', ((bx1 - bx0) * SS, (by1 - by0) * SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(over)
        lw = 7 * SS
        S = lambda p: ((p[0] - bx0) * SS, (p[1] - by0) * SS)

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

        def paste_eye(k, dx=0, dy=0, sx=1.0, sy=1.0):
            crop, box = self.eye_crops[k]
            ex, ey = (EYE_L if k == 'L' else EYE_R)
            im = crop if (sx == 1 and sy == 1) else crop.resize((max(2, int(crop.width * sx)), max(2, int(crop.height * sy))), Image.LANCZOS)
            img.alpha_composite(im, (int(ex - im.width / 2 + dx), int(ey - im.height / 2 + dy)))

        def star(cx, cy, r, color=(255, 255, 255, 255)):
            pts = []
            for i in range(8):
                a = math.pi / 4 * i
                rr = r if i % 2 == 0 else r * 0.33
                pts.append(S((cx + rr * math.sin(a), cy - rr * math.cos(a))))
            d.polygon(pts, fill=color)

        for (x, y), k in ((EYE_L, 'L'), (EYE_R, 'R')):
            if eyes == 'closed':
                curve((x - 30, y - 2), (x, y + 24), (x + 30, y - 2))
            elif eyes == 'happy' or (eyes == 'wink' and k == 'R'):
                curve((x - 30, y + 10), (x, y - 26), (x + 30, y + 10))
            elif eyes == 'wink' and k == 'L':
                paste_eye('L')
            elif eyes == 'half':
                paste_eye(k, dy=6, sy=0.42)
            elif eyes == 'look':
                paste_eye(k, dx=look, dy=-abs(look) * 0.12)
            elif eyes == 'wow':
                paste_eye(k, sx=1.24, sy=1.24)
                star(x - 14, y + 16, 9)

        mx, my = MOUTH

        def mouth_shape(box, radius, fill, tongue=None):
            m = Image.new('L', over.size, 0)
            ImageDraw.Draw(m).rounded_rectangle(box, radius=radius, fill=255)
            inside = Image.new('RGBA', over.size, fill)
            if tongue:
                ImageDraw.Draw(inside).ellipse(tongue, fill=(238, 118, 124, 255))
            over.paste(inside, (0, 0), m)
            d.rounded_rectangle(box, radius=radius, outline=LINE, width=6 * SS)

        if mouth == 'open':
            h = mouth_h
            (x0, y0), (x1, y1) = S((mx - 30, my - 10)), S((mx + 30, my - 10 + h))
            mouth_shape((x0, y0, x1, y1), int(min(h, 30) * SS * 0.48), (126, 38, 36, 255),
                        S((mx - 20, my - 10 + h * 0.55)) + S((mx + 20, my - 10 + h * 1.25)))
        elif mouth == 'o':
            d.ellipse(S((mx - 15, my - 8)) + S((mx + 15, my + 26)), fill=(126, 38, 36, 255), outline=LINE, width=6 * SS)
        elif mouth == 'yawn':                      # 하품: 세로로 긴 타원
            h = max(10, mouth_h)
            box = S((mx - 22 - h * 0.08, my - 6)) + S((mx + 22 + h * 0.08, my - 6 + h))
            m = Image.new('L', over.size, 0)
            ImageDraw.Draw(m).ellipse(box, fill=255)
            inside = Image.new('RGBA', over.size, (110, 30, 30, 255))
            ImageDraw.Draw(inside).ellipse(S((mx - 18, my - 6 + h * 0.62)) + S((mx + 18, my - 6 + h * 1.15)), fill=(238, 118, 124, 255))
            over.paste(inside, (0, 0), m)
            d.ellipse(box, outline=LINE, width=6 * SS)
        elif mouth == 'grin':                      # 이를 드러낸 씨익 (공회전)
            (x0, y0), (x1, y1) = S((mx - 34, my - 8)), S((mx + 34, my + 20))
            d.rounded_rectangle((x0, y0, x1, y1), radius=10 * SS, fill=(255, 255, 255, 255), outline=LINE, width=6 * SS)
            d.line([S((mx - 30, my + 6)), S((mx + 30, my + 6))], fill=LINE, width=4 * SS)
            for k in (-17, 0, 17):
                d.line([S((mx + k, my - 6)), S((mx + k, my + 18))], fill=LINE, width=3 * SS)
        elif mouth == 'smile':                     # 활짝 웃는 D 입
            h = max(14, mouth_h)
            pts = [S((mx - 32, my - 6))]
            for i in range(21):
                a = math.pi * i / 20
                pts.append(S((mx - 32 * math.cos(a), my - 6 + h * math.sin(a))))
            pts.append(S((mx + 32, my - 6)))
            m = Image.new('L', over.size, 0)
            ImageDraw.Draw(m).polygon(pts, fill=255)
            inside = Image.new('RGBA', over.size, (126, 38, 36, 255))
            ImageDraw.Draw(inside).ellipse(S((mx - 20, my - 6 + h * 0.5)) + S((mx + 20, my - 6 + h * 1.3)), fill=(238, 118, 124, 255))
            over.paste(inside, (0, 0), m)
            d.line(pts + [pts[0]], fill=LINE, width=6 * SS, joint='curve')

        over = over.resize((bx1 - bx0, by1 - by0), Image.LANCZOS)
        full = Image.new('RGBA', self.size, (0, 0, 0, 0))
        full.paste(over, (bx0, by0))
        full.putalpha(ImageChops.multiply(full.getchannel('A'), self.head_mask))
        img.alpha_composite(full)
        cache[key] = img
        return img


# ======================================================================================
# 효과 (원본 선 스타일)
# ======================================================================================
def _fx_extent(it):
    s = it.get('s', 1.0)
    k = it['kind']
    if k == 'speed':
        return (it['x'] - 10, it['y'] - 10, it['x'] + it['len'] + 10, it['y'] + 10)
    r = {'notice': 60 * s, 'heart': 50 * s, 'z': it.get('size', 40) * s, 'puff': it.get('r', 20) + 6, 'dust': it.get('r', 20) + 6,
         'sweat': 34 * s, 'note': it.get('size', 60) * s, 'spark': 30 * s, 'tear': 26 * s}.get(k, 60)
    return (it['x'] - r, it['y'] - r, it['x'] + r, it['y'] + r)


def fx_layer(size, items):
    W, H = size
    ex = [_fx_extent(it) for it in items]
    x0 = int(max(0, min(e[0] for e in ex) - 8)); y0 = int(max(0, min(e[1] for e in ex) - 8))
    x1 = int(min(W, max(e[2] for e in ex) + 8)); y1 = int(min(H, max(e[3] for e in ex) + 8))
    if x1 <= x0 or y1 <= y0:
        return None, (0, 0)
    over = Image.new('RGBA', ((x1 - x0) * SS, (y1 - y0) * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    S = lambda v: v * SS
    P = lambda x, y: ((x - x0) * SS, (y - y0) * SS)
    fonts = {}

    def font(px):
        px = max(8, int(px))
        if px not in fonts:
            fonts[px] = ImageFont.truetype(FONT, px)
        return fonts[px]

    for it in items:
        k = it['kind']
        x, y, s, a = it['x'], it['y'], it.get('s', 1.0), it.get('a', 1.0)
        al = int(255 * max(0, min(1, a)))
        if al <= 0:
            continue
        line = LINE[:3] + (al,)
        if k == 'notice':
            r = 50 * s
            d.ellipse(P(x - r, y - r) + P(x + r, y + r), fill=(255, 216, 74, al), outline=line, width=int(S(7)))
            d.rounded_rectangle(P(x - 7 * s, y - 30 * s) + P(x + 7 * s, y + 8 * s), radius=int(S(7 * s)), fill=line)
            d.ellipse(P(x - 8 * s, y + 16 * s) + P(x + 8 * s, y + 32 * s), fill=line)
        elif k == 'heart':
            pts = []
            for i in range(60):
                t = TAU * i / 60
                hx = 16 * math.sin(t) ** 3
                hy = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
                pts.append(P(x + hx * 2.6 * s, y + hy * 2.6 * s))
            d.polygon(pts, fill=it.get('color', (255, 107, 129)) + (al,), outline=line, width=int(S(6)))
        elif k in ('z', 'note'):
            col = it.get('color', (142, 163, 201))
            d.text(P(x, y), it.get('text', 'Z'), font=font(S(it.get('size', 60) * s)), fill=col + (al,),
                   stroke_width=int(S(5)), stroke_fill=line, anchor='mm')
        elif k == 'puff':
            r = it['r']
            d.ellipse(P(x - r, y - r) + P(x + r, y + r), fill=(228, 231, 235, al), outline=(150, 158, 168, al), width=int(S(4)))
        elif k == 'dust':
            r = it['r']
            d.ellipse(P(x - r, y - r * 0.7) + P(x + r, y + r * 0.7), fill=(214, 200, 182, al), outline=(168, 150, 128, al), width=int(S(3)))
        elif k == 'speed':
            d.line([P(x, y), P(x + it['len'], y)], fill=(150, 165, 182, al), width=int(S(9)), joint='curve')
        elif k == 'sweat' or k == 'tear':
            d.polygon([P(x, y - 26 * s), P(x + 14 * s, y), P(x - 14 * s, y)], fill=(143, 211, 255, al))
            d.ellipse(P(x - 14 * s, y - 12 * s) + P(x + 14 * s, y + 16 * s), fill=(143, 211, 255, al), outline=line, width=int(S(4)))
        elif k == 'spark':
            pts = []
            for i in range(8):
                ang = math.pi / 4 * i + it.get('rot', 0)
                rr = (26 if i % 2 == 0 else 9) * s
                pts.append(P(x + rr * math.sin(ang), y - rr * math.cos(ang)))
            d.polygon(pts, fill=it.get('color', (255, 228, 92)) + (al,), outline=line, width=int(S(4)))
    return over.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0)


# ======================================================================================
# 합성
# ======================================================================================
def affine(img, canvas_size, offset, pivot=(0, 0), dx=0, dy=0, rot=0.0, sx=1.0, sy=1.0):
    """레이어(img)를 canvas 의 offset 위치에 놓고 pivot(레이어 좌표) 기준 회전/스케일/이동"""
    px, py = pivot[0] + offset[0], pivot[1] + offset[1]
    M = mat_about((px, py), rot, sx, sy, dx, dy) @ mat_t(offset[0], offset[1])
    return warp(img, canvas_size, M)


def mat_t(tx, ty):
    return np.array([[1, 0, tx], [0, 1, ty], [0, 0, 1]], float)


def mat_about(pivot, rot=0.0, sx=1.0, sy=1.0, dx=0, dy=0):
    """pivot 기준 (스케일 → 회전) 후 (dx, dy) 이동하는 3x3 정방향 행렬"""
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    A = np.array([[c * sx, -s * sy, 0], [s * sx, c * sy, 0], [0, 0, 1]], float)
    return mat_t(pivot[0] + dx, pivot[1] + dy) @ A @ mat_t(-pivot[0], -pivot[1])


def warp(img, canvas_size, M):
    Mi = np.linalg.inv(M)
    return img.transform(canvas_size, Image.AFFINE, tuple(Mi[:2].ravel()), resample=Image.BICUBIC)


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

    @staticmethod
    def transforms(p):
        """포즈 → 영역별 변형 행렬 (원본 좌표)"""
        yF = p.get('susp_f', 0.0) + p.get('body_dy', 0.0)
        yR = p.get('susp_r', 0.0) + p.get('body_dy', 0.0)
        theta = math.degrees(math.atan2(yF - yR, FRONT_AXLE[0] - REAR_AXLE[0]))
        body = mat_t(p.get('body_dx', 0.0), yR) @ mat_about(REAR_AXLE, theta)
        return {
            'body': body,
            'front': body @ mat_about(STEER, p.get('steer', 0.0)),
            'rider': body @ mat_t(p.get('rider_dx', 0.0), p.get('rider_dy', 0.0)) @ mat_about(SEAT, p.get('rider_rot', 0.0)),
            'wf': mat_t(0, p.get('wf', 0.0)),
            'wr': mat_t(0, p.get('wr', 0.0)),
        }

    def frame(self, p):
        """p: 포즈 dict → RGBA 프레임"""
        R = self.rig
        cs, off = self.size, self.off
        T = self.transforms(p)
        mx, my, D = R.warp_maps(T)
        body = Image.new('RGBA', cs, (0, 0, 0, 0))

        # 뒤 효과 (연기, 먼지, 스피드라인)
        back = [it for it in p.get('fx', []) if it['kind'] in ('puff', 'speed', 'dust')]
        if back:
            self.paste_fx(body, back, D)

        wave = p.get('wave')
        base_pm = remap_pm(R.pm[(p.get('hazard') or '', wave is not None)], mx, my)
        body.alpha_composite(unpremult(base_pm), off)

        to_canvas = mat_t(*off)
        if wave is not None:   # 미러 앞, 소매 안쪽에서 나오는 팔
            body.alpha_composite(warp(R.arm(wave), cs, to_canvas @ T['rider']))
            sm = cv2.remap(R.sleeve_mask, mx, my, cv2.INTER_LINEAR, borderValue=0)
            body.alpha_composite(unpremult(base_pm * sm[..., None]), off)

        foot = p.get('foot', 0.0)
        if foot > 0.01:        # 발 내리기: 정강이+신발을 그리고 그 위에 허벅지를 다시 올림
            knee = R.point(D, KNEE)
            peg = R.point(D, PEG)
            k = ease(foot)
            ankle = (peg[0] + (FOOT_GROUND[0] - peg[0]) * k - 34 * math.sin(math.pi * k),
                     peg[1] + (FOOT_GROUND[1] - peg[1]) * k + p.get('foot_dy', 0.0) * k)
            body.alpha_composite(self.leg(knee, ankle, min(1.0, foot / 0.2)), off)
            tm = cv2.remap(R.thigh_mask, mx, my, cv2.INTER_LINEAR, borderValue=0)
            body.alpha_composite(unpremult(base_pm * tm[..., None]), off)

        if p.get('roll') is not None:
            body.alpha_composite(R.treads(p['roll']), (off[0], off[1] + int(round(p.get('wf', 0)))))

        if p.get('headlight', 0) > 0:
            hx, hy = apply_pt(T['front'], HEADLIGHT)
            gl = Image.new('RGBA', cs, (0, 0, 0, 0))
            hx, hy, r = hx + off[0], hy + off[1], 150
            ImageDraw.Draw(gl).ellipse((hx - r, hy - r, hx + r, hy + r), fill=(255, 244, 196, int(170 * p['headlight'])))
            body.alpha_composite(gl.filter(ImageFilter.GaussianBlur(40)))

        head = R.compose_head(p.get('eyes', 'normal'), p.get('mouth', 'w'), p.get('mouth_h', 24), p.get('blink', 1.0), p.get('look', 0.0))
        hs = p.get('head_s', 1.0)
        Mh = to_canvas @ T['rider'] @ mat_about(NECK, p.get('head_rot', 0), hs, hs * p.get('head_sy', 1.0), p.get('head_dx', 0), p.get('head_dy', 0))
        body.alpha_composite(warp(head, cs, Mh))
        body.alpha_composite(unpremult(remap_pm(R.pm_front, mx, my)), off)

        frontfx = [it for it in p.get('fx', []) if it['kind'] not in ('puff', 'speed', 'dust')]
        if frontfx:
            self.paste_fx(body, frontfx, D)

        # 전체 변형: 윌리 회전(뒷바퀴 접지점 기준) → 점프/찌그러짐/좌우 반전(바닥 중심 기준)
        gsx, gsy, gdy, grot = p.get('sx', 1.0), p.get('sy', 1.0), p.get('dy', 0), p.get('rot', 0.0)
        ground = (self.cw / 2, off[1] + GROUND_Y)
        M = mat_about(ground, 0, gsx, gsy, 0, gdy)
        if grot:
            rp = p.get('rot_pivot', REAR_CONTACT)
            M = M @ mat_about((rp[0] + off[0], rp[1] + off[1]), grot)
        if not np.allclose(M, np.eye(3)):
            body = warp(body, cs, M)

        # 그림자 (항상 바닥에)
        out = Image.new('RGBA', cs, (0, 0, 0, 0))
        sk = p.get('shadow', 1.0)
        gx = self.cw / 2 + (off[0] + 470 - self.cw / 2) * gsx
        gy = off[1] + GROUND_Y
        rx = 400 * sk * max(0.35, abs(gsx))
        sh = Image.new('RGBA', cs, (0, 0, 0, 0))
        dsh = ImageDraw.Draw(sh)
        dsh.ellipse((gx - rx, gy - 20, gx + rx, gy + 20), fill=(30, 22, 18, int(70 * min(1, sk + 0.15))))
        if foot > 0.3:
            fx_ = self.cw / 2 + (off[0] + FOOT_GROUND[0] + 34 - self.cw / 2) * gsx
            fy_ = off[1] + FOOT_GROUND[1] + 74
            dsh.ellipse((fx_ - 70, fy_ - 12, fx_ + 70, fy_ + 12), fill=(30, 22, 18, int(60 * min(1, (foot - 0.3) / 0.5))))
        out.alpha_composite(sh.filter(ImageFilter.GaussianBlur(9)))
        out.alpha_composite(body)
        return out

    def leg(self, knee, ankle, alpha):
        """정강이(살짝 굽은 통통한 종아리) + 흰 양말 + 운동화 — 원본 선 스타일, 원본 좌표 레이어"""
        W, H = self.rig.size
        x0 = int(min(knee[0], ankle[0]) - 150); x1 = int(max(knee[0], ankle[0]) + 170)
        y0 = int(min(knee[1], ankle[1]) - 70); y1 = int(max(knee[1], ankle[1]) + 110)
        ov = Image.new('RGBA', ((x1 - x0) * SS, (y1 - y0) * SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        P = lambda x, y: ((x - x0) * SS, (y - y0) * SS)
        kx, ky = knee
        ax, ay = ankle
        L = math.hypot(ax - kx, ay - ky) or 1
        ux, uy = (ax - kx) / L, (ay - ky) / L
        nx, ny = -uy, ux
        cx, cy = (kx + ax) / 2 - nx * 22, (ky + ay) / 2 - ny * 22     # 무릎이 살짝 앞으로 굽음

        def center(t):
            return ((1 - t) ** 2 * kx + 2 * (1 - t) * t * cx + t * t * ax, (1 - t) ** 2 * ky + 2 * (1 - t) * t * cy + t * t * ay)

        def halfw(t):        # 무릎 → 종아리(통통) → 발목
            return 50 + 8 * math.sin(math.pi * min(t / 0.6, 1)) - 18 * max(0, (t - 0.45) / 0.55) ** 1.4

        def outline(extra):
            left, right = [], []
            n = 28
            for i in range(n + 1):
                t = i / n
                x, y = center(t)
                x2, y2 = center(min(1, t + 0.01))
                x1_, y1_ = center(max(0, t - 0.01))
                tx, ty = x2 - x1_, y2 - y1_
                tl = math.hypot(tx, ty) or 1
                qx, qy = -ty / tl, tx / tl
                w = halfw(t) + extra
                left.append(P(x + qx * w, y + qy * w)); right.append(P(x - qx * w, y - qy * w))
            return left + right[::-1]
        d.polygon(outline(7), fill=LINE)
        d.ellipse(P(ax - 39, ay - 39) + P(ax + 39, ay + 39), fill=LINE)
        d.polygon(outline(0), fill=SKIN + (255,))
        # 종아리 음영 (뒤쪽)
        sh = []
        for i in range(16):
            t = 0.12 + 0.7 * i / 15
            x, y = center(t)
            sh.append(P(x - nx * (halfw(t) - 12), y - ny * (halfw(t) - 12)))
        d.line(sh, fill=SKIN_SHADE + (255,), width=12 * SS, joint='curve')
        # 흰 양말
        sx0, sy0 = center(0.84)
        sock = [P(sx0 + nx * 40, sy0 + ny * 40), P(ax + nx * 36, ay + ny * 36), P(ax - nx * 36, ay - ny * 36), P(sx0 - nx * 40, sy0 - ny * 40)]
        d.polygon(sock, fill=(250, 248, 244, 255), outline=LINE, width=6 * SS)
        d.line([P(sx0 + nx * 34 + ux * 12, sy0 + ny * 34 + uy * 12), P(sx0 - nx * 34 + ux * 12, sy0 - ny * 34 + uy * 12)], fill=(214, 210, 204, 255), width=4 * SS)
        # 운동화: 통통한 앞코 + 두꺼운 흰 밑창 + 끈
        fx_, fy_ = ax + 30, ay + 34
        rot = math.radians(10)

        def shoe_pts(rx_, ry_, dy=0):
            pts = []
            for i in range(56):
                t = TAU * i / 56
                ex = rx_ * math.cos(t)
                ey = ry_ * math.sin(t) * (0.82 if math.sin(t) < 0 and math.cos(t) < 0 else 1.0)
                if math.cos(t) > 0:
                    ey *= 1.08                       # 앞코 통통
                pts.append(P(fx_ + ex * math.cos(rot) - ey * math.sin(rot), fy_ + dy + ex * math.sin(rot) + ey * math.cos(rot)))
            return pts
        d.polygon(shoe_pts(86, 30, 16), fill=(246, 244, 240, 255), outline=LINE, width=7 * SS)     # 밑창
        d.polygon(shoe_pts(80, 40, 0), fill=(52, 44, 42, 255), outline=LINE, width=7 * SS)         # 갑피
        d.ellipse(P(fx_ + 26, fy_ - 26) + P(fx_ + 58, fy_ - 10), fill=(110, 100, 96, 255))         # 하이라이트
        for k in range(3):                                                                            # 끈
            lx, ly = fx_ - 24 + k * 14, fy_ - 26 + k * 3
            d.line([P(lx - 8, ly - 4), P(lx + 8, ly + 4)], fill=(240, 236, 230, 255), width=4 * SS)
        layer = ov.resize((x1 - x0, y1 - y0), Image.LANCZOS)
        if alpha < 1:
            layer.putalpha(layer.getchannel('A').point(lambda v: int(v * alpha)))
        full = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        full.alpha_composite(layer, (max(0, x0), max(0, y0)), (max(0, -x0), max(0, -y0)))
        return full

    def paste_fx(self, canvas, items, D=None):
        moved = []
        for it in items:
            it = dict(it)
            if D is not None and it.get('anchor') == 'body':      # 차체를 따라가는 효과 (배기 연기)
                nx_, ny_ = self.rig.point(D, (min(max(it['ax'], 0), self.rig.size[0] - 1), min(max(it['ay'], 0), self.rig.size[1] - 1)))
                it['x'] += nx_ - it['ax']; it['y'] += ny_ - it['ay']
            it['x'] += self.off[0]; it['y'] += self.off[1]
            moved.append(it)
        layer, pos = fx_layer(self.size, moved)
        if layer is not None:
            canvas.alpha_composite(layer, pos)


def apply_pt(M, pt):
    v = M @ np.array([pt[0], pt[1], 1.0])
    return float(v[0]), float(v[1])


# ======================================================================================
# 모션 — 스프링 시뮬레이션으로 자연스러운 2차 움직임
#   앞/뒤 서스펜션(바퀴는 땅, 차체가 출렁) · 라이더 관성(한 박자 늦게) · 머리 관성 · 라이더↔차체 반작용
# ======================================================================================
REAR_CONTACT = (175, 1248)        # 뒷바퀴 접지점 (윌리 회전 축)
FRONT_CONTACT = (640, 1360)       # 앞바퀴 접지점

MOTIONS = {
    'ride_r': 3.2, 'ride_l': 3.2,       # 주행 (노면 요철 → 바퀴 → 서스펜션 → 라이더)
    'brake_r': 1.0,                     # ★ 브레이크: 앞쏠림(포크 눌림) → 정지 → 왼발 내리기
    'go_r': 0.6,                        # ★ 출발: 발 올리기 → 뒤 눌림(가속) → 라이더 뒤로
    'idle_r': 2.4, 'idle_l': 2.4,       # 정차 (발 내리고 체중 이동)
    'face_r': 0.4, 'face_l': 0.4, 'turn': 0.8,
    'front': 2.4, 'notify': 1.6, 'talk': 1.6, 'wave_out': 0.4,
    'happy': 1.6, 'groove': 1.6, 'wink': 1.2, 'bow': 1.0,
    'look_r': 2.6, 'yawn_r': 2.4, 'sleep': 3.2,
    'wheelie_r': 2.2, 'rev': 0.8,
}
LOOPS = {'ride_r', 'ride_l', 'idle_r', 'idle_l', 'front', 'talk', 'happy', 'groove', 'sleep', 'rev'}
STANDING = {'idle_r', 'idle_l', 'face_r', 'face_l', 'turn', 'front', 'notify', 'talk', 'wave_out', 'happy', 'groove',
            'wink', 'bow', 'look_r', 'yawn_r', 'sleep', 'rev'}


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def ease_out(x, p=3):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** p


def back_out(x, s=1.7):
    x = min(max(x, 0.0), 1.0) - 1
    return x * x * ((s + 1) * x + s) + 1


def seg(t, a, b):
    """t 가 [a, b] 구간에서 0→1"""
    return min(max((t - a) / (b - a), 0.0), 1.0)


def blink_at(t, at, dur=0.24):
    d = abs(t - at)
    return 1.0 if d > dur / 2 else d / (dur / 2)


def bump(t, tb, amp, w=0.13):
    """노면 요철: 바퀴가 위로(-) 들렸다 내려옴"""
    return -amp * math.sin(math.pi * (t - tb) / w) if tb <= t <= tb + w else 0.0


def wheelie_angle(t):
    hold_end = -17 + 1.6 * math.sin((1.5 - 0.55) / 0.45 * TAU)
    if t < 0.55:
        return -17 * back_out(t / 0.55, 1.2)
    if t < 1.5:
        return -17 + 1.6 * math.sin((t - 0.55) / 0.45 * TAU)
    if t < 1.8:
        q = seg(t, 1.5, 1.8)
        return hold_end * (1 - q * q)
    return 0.0


def drivers(motion, t):
    """시뮬레이션 입력: 바퀴 높이(wf, wr), 서스펜션 목표(dF, dR), 라이더 목표(x, y, rot)"""
    L = MOTIONS[motion]
    d = dict(wf=0.0, wr=0.0, dF=0.0, dR=0.0, rx=0.0, ry=0.0, rr=0.0)
    if motion in LOOPS:
        t = t % L
    if motion in ('ride_r', 'ride_l'):
        for tb, amp in ((0.35, 8), (1.55, 5), (2.45, 7)):
            d['wf'] += bump(t, tb, amp)
            d['wr'] += bump(t, tb + 0.15, amp * 0.9)
        d['rr'] = 1.1 * math.sin(t / L * TAU)
        d['rx'] = 1.5 * math.sin(t / 1.6 * TAU)
    elif motion == 'brake_r':
        env = ease(seg(t, 0, 0.3)) * (1 - ease(seg(t, 0.42, 0.6)))
        d.update(dF=15 * env, dR=-4 * env, rx=10 * env, ry=4 * env, rr=4.5 * env)
    elif motion == 'go_r':
        env = math.sin(math.pi * min(t / 0.5, 1.0))
        d.update(dF=-8 * env, dR=7 * env, rx=-9 * env, ry=-2 * env, rr=-4 * env)
    elif motion in ('idle_r', 'idle_l', 'front', 'look_r', 'face_r', 'face_l', 'wave_out', 'talk', 'wink'):
        d['ry'] = 1.5 * math.sin(t / 1.2 * TAU)
        d['rr'] = -1.3 + 0.7 * math.sin(t / 2.4 * TAU)        # 발 디딘 쪽으로 살짝 기댐
    elif motion == 'turn':
        k = ease(t / (L - 1 / FPS))
        d['rr'] = -4 * math.sin(k * math.pi)
        d['ry'] = -4 * math.sin(k * math.pi)
    elif motion == 'notify':
        hop = math.sin(math.pi * min(t / 0.45, 1.0))
        d['ry'] = -14 * hop                                     # 라이더가 엉덩이를 들썩 → 착지 때 서스펜션 눌림
        d['rr'] = -1.3
    elif motion == 'happy':
        d['ry'] = -11 * abs(math.sin(t / 0.8 * TAU))
    elif motion == 'groove':
        d['ry'] = -8 * abs(math.sin(t / 0.4 * math.pi))
        d['rr'] = 4.0 * math.sin(t / 0.8 * TAU)
        d['rx'] = 5 * math.sin(t / 0.8 * TAU)
    elif motion == 'bow':
        k = math.sin(ease(t / L) * math.pi)
        d.update(ry=8 * k, rr=3.5 * k, rx=4 * k)
    elif motion == 'yawn_r':
        k = ease(seg(t, 0.15, 0.75)) * (1 - ease(seg(t, 1.45, 1.95)))
        d.update(ry=-5 * k, rr=-3 * k, rx=-3 * k)                # 기지개: 뒤로 젖힘
    elif motion == 'sleep':
        d.update(ry=6 + 1.6 * math.sin(t / 1.6 * TAU), rr=2.6, rx=2)
    elif motion == 'rev':
        d.update(dR=6 + 2.5 * math.sin(t / 0.2 * TAU), dF=-2, rx=3, ry=3, rr=2.5)
    elif motion == 'wheelie_r':
        lift = min(1.0, -wheelie_angle(t) / 17)
        d.update(dR=7 * lift, dF=-10 * lift, rx=-11 * lift, ry=-3 * lift, rr=-6 * lift)
        if 1.78 <= t <= 1.98:
            d['dF'] += 18 * math.sin(math.pi * (t - 1.78) / 0.2)   # 착지 충격
    return d


_SIM = {}


def simulate(motion):
    """스프링-댐퍼 적분 (dt=1/600). 루프 모션은 3주기 예열 → 끊김 없는 반복"""
    if motion in _SIM:
        return _SIM[motion]
    L = MOTIONS[motion]
    n = int(round(L * FPS))
    dt = 1 / 600
    kF, cF, kR, cR = 900, 36, 760, 34
    kRy, cRy, kRx, cRx, kRr, cRr = 240, 17, 200, 18, 170, 15
    kH, cH = 320, 16
    loop = motion in LOOPS
    t = -3 * L if loop else 0.0
    d0 = drivers(motion, t)
    yF, yR = d0['wf'] + d0['dF'], d0['wr'] + d0['dR']
    seat0 = yR + SEAT_F * (yF - yR)
    st = dict(yF=yF, vF=0.0, yR=yR, vR=0.0, y=seat0 + d0['ry'], vy=0.0, x=d0['rx'], vx=0.0, r=d0['rr'], vr=0.0, h=seat0 + d0['ry'], vh=0.0)
    out = {}
    frame_times = [(i, i / FPS) for i in range(n)]
    fi = 0
    while fi < n:
        d = drivers(motion, t)
        seat = st['yR'] + SEAT_F * (st['yF'] - st['yR'])
        press = (st['y'] - (seat + d['ry']))           # 라이더가 누르는 정도 → 차체 반작용
        tF = d['wf'] + d['dF'] + 0.35 * press
        tR = d['wr'] + d['dR'] + 0.35 * press
        st['vF'] += (-kF * (st['yF'] - tF) - cF * st['vF']) * dt
        st['vR'] += (-kR * (st['yR'] - tR) - cR * st['vR']) * dt
        st['yF'] += st['vF'] * dt
        st['yR'] += st['vR'] * dt
        st['vy'] += (-kRy * (st['y'] - (seat + d['ry'])) - cRy * st['vy']) * dt
        st['y'] += st['vy'] * dt
        st['vx'] += (-kRx * (st['x'] - d['rx']) - cRx * st['vx']) * dt
        st['x'] += st['vx'] * dt
        st['vr'] += (-kRr * (st['r'] - d['rr']) - cRr * st['vr']) * dt
        st['r'] += st['vr'] * dt
        st['vh'] += (-kH * (st['h'] - st['y']) - cH * st['vh']) * dt
        st['h'] += st['vh'] * dt
        while fi < n and t >= frame_times[fi][1] - 1e-9:
            seat_now = st['yR'] + SEAT_F * (st['yF'] - st['yR'])
            out[fi] = dict(wf=d['wf'], wr=d['wr'], susp_f=st['yF'] - d['wf'] * 0, susp_r=st['yR'],
                           rider_dy=st['y'] - seat_now, rider_dx=st['x'], rider_rot=st['r'], head_lag=st['h'] - st['y'])
            fi += 1
        t += dt
    _SIM[motion] = out
    return out


def sim_at(motion, t):
    s = simulate(motion)
    i = int(round(t * FPS))
    return s[min(i, len(s) - 1)]


def engine_vib(t, amp=2.0, hz=7.5):
    return amp * math.sin(TAU * hz * t)


def exhaust(t, period=0.8, n=4, big=1.0, dy=0.0):
    fx = []
    for i in range(n):
        ph = ((t / period) + i / n) % 1.0
        fx.append(dict(kind='puff', x=EXHAUST_TIP[0] - 170 * ph * big, y=EXHAUST_TIP[1] - 70 * ph + dy,
                       r=(12 + 30 * ph) * big, a=(1 - ph) ** 1.3, anchor='body', ax=EXHAUST_TIP[0] + 30, ay=EXHAUST_TIP[1]))
    return fx


def speedlines(t, period=0.6):
    fx = []
    for i, (yy, ln) in enumerate(((560, 120), (880, 160), (1180, 110))):
        ph = ((t / period) + i / 3) % 1.0
        fx.append(dict(kind='speed', x=-40 - 160 * ph, y=yy, len=ln, a=math.sin(ph * math.pi) * 0.75))
    return fx


def pose(motion, t):
    L = MOTIONS[motion]
    sim = sim_at(motion, t)
    p = dict(wf=sim['wf'], wr=sim['wr'], susp_f=sim['susp_f'] - sim['wf'] + sim['wf'], susp_r=sim['susp_r'],
             rider_dx=sim['rider_dx'], rider_dy=sim['rider_dy'], rider_rot=sim['rider_rot'])
    head_lag = sim['head_lag']
    p['head_dy'] = clamp(head_lag * 0.8, -10, 10)
    p['foot'] = 1.0 if motion in STANDING else 0.0
    p['steer'] = 0.0

    if motion in ('ride_r', 'ride_l'):
        p['body_dy'] = engine_vib(t, 0.9)
        p['steer'] = 1.4 * math.sin(t / 1.6 * TAU + 0.6) + 0.12 * (sim['wf'])
        p['head_rot'] = 2.0 * math.sin(t / 1.6 * TAU - 0.5)
        p['blink'] = blink_at(t, 2.4)
        p['roll'] = (t / 0.4) % 1.0
        p['fx'] = exhaust(t) + speedlines(t)
        if motion == 'ride_l':
            p['sx'] = -1
    elif motion == 'brake_r':
        # 브레이크 → 정지 → 발 내리기
        v = max(0.0, 1 - t / 0.5)
        p['roll'] = ((t - t * t / 1.0) / 0.4) % 1.0 if t < 0.5 else (0.25 / 0.4) % 1.0
        p['foot'] = ease(seg(t, 0.32, 0.72))
        p['foot_dy'] = -10 * math.sin(math.pi * seg(t, 0.32, 0.72))   # 발을 살짝 들었다가 디딤
        p['eyes'] = 'normal'
        p['head_rot'] = 2.5 * math.sin(math.pi * seg(t, 0, 0.6))
        p['steer'] = -2.0 * ease(seg(t, 0.4, 0.8))
        p['body_dy'] = engine_vib(t, 0.9 * v + 0.4)
        fx = exhaust(t, period=0.8, n=3, big=0.8)
        if 0.66 < t < 1.0:
            q = seg(t, 0.66, 1.0)
            fx += [dict(kind='dust', x=FOOT_GROUND[0] - 70 - 50 * q, y=FOOT_GROUND[1] + 38, r=16 + 22 * q, a=(1 - q) * 0.8),
                   dict(kind='dust', x=FOOT_GROUND[0] + 110 + 50 * q, y=FOOT_GROUND[1] + 36, r=14 + 20 * q, a=(1 - q) * 0.8)]
        p['fx'] = fx
    elif motion == 'go_r':
        p['foot'] = 1 - ease(seg(t, 0.0, 0.24))
        p['foot_dy'] = -14 * math.sin(math.pi * seg(t, 0.0, 0.24))
        p['roll'] = ((t * t / 0.6) / 0.4) % 1.0
        p['head_rot'] = -2.5 * math.sin(math.pi * min(t / 0.5, 1))
        p['eyes'], p['mouth'], p['mouth_h'] = 'normal', 'smile', 18
        p['body_dy'] = engine_vib(t, 1.2)
        fx = exhaust(t, period=0.3, n=3, big=1.4)
        q = seg(t, 0.05, 0.6)
        fx += [dict(kind='dust', x=REAR_CONTACT[0] - 40 - 150 * q, y=REAR_CONTACT[1] + 40 - 30 * q, r=18 + 34 * q, a=(1 - q) * 0.9)]
        p['fx'] = fx
    elif motion in ('idle_r', 'idle_l', 'front'):
        p['body_dy'] = engine_vib(t, 0.5)
        p['steer'] = -2.0 + 0.6 * math.sin(t / 2.4 * TAU)
        p['head_rot'] = 2.0 * math.sin(t / L * TAU)
        p['blink'] = blink_at(t, 1.0 if motion != 'front' else 1.4)
        if t % 1.2 < 0.6:
            p['fx'] = exhaust(t, period=1.2, n=2, big=0.6)
        if motion == 'idle_l':
            p['sx'] = -1
    elif motion == 'face_r':
        k = math.sin(ease(t / (L - 1 / FPS)) * math.pi)
        p['head_rot'] = -3 * k
        p['steer'] = -2.0
    elif motion in ('face_l', 'turn'):
        k = ease(t / (L - 1 / FPS))
        sx = -1 + 2 * k
        p['sx'] = sx if abs(sx) > 0.04 else (0.04 if sx >= 0 else -0.04)
        p['dy'] = -10 * math.sin(k * math.pi)
        p['sy'] = 1 + 0.02 * math.sin(k * math.pi)
        p['shadow'] = 0.75 + 0.25 * abs(sx)
        p['head_rot'] = 5 * math.sin(k * math.pi) * (1 if k < 0.5 else -1)
        p['steer'] = -4 * math.sin(k * math.pi)
        if motion == 'turn':
            p['roll'] = (t / 0.4) % 1.0
    elif motion == 'notify':
        hop = math.sin(min(t / 0.5, 1) * math.pi)
        p['eyes'], p['mouth'] = 'wow', 'o'
        p['head_s'] = 1 + 0.03 * hop
        p['head_rot'] = 4 * math.sin(t / 0.4 * TAU) * min(1, t / 0.5)
        on = (int(t / 0.2) % 2) == 0
        p['hazard'] = 'on' if on else 'off'
        p['headlight'] = 0.5 + 0.5 * math.sin(t / 0.4 * TAU)
        p['wave'] = 54 + 16 * math.sin(t / 0.4 * TAU) * min(1, t / 0.3)
        pop = back_out(t / 0.45)
        sw = (t % 0.8) / 0.8
        p['fx'] = [dict(kind='notice', x=860, y=70, s=max(0.05, pop)), dict(kind='sweat', x=245, y=150 + 40 * sw, s=1.0, a=1 - sw)]
        p['steer'] = -2.0
    elif motion == 'talk':
        p['mouth'] = 'open'
        p['mouth_h'] = 14 + 24 * (0.5 + 0.5 * math.sin(t / 0.4 * TAU))
        p['head_rot'] = 2.0 * math.sin(t / 0.8 * TAU)
        p['head_dy'] += -3 * (0.5 + 0.5 * math.sin(t / 0.4 * TAU))
        p['blink'] = blink_at(t, 1.2)
        p['hazard'] = 'on' if (int(t / 0.4) % 2) == 0 else 'off'
        p['wave'] = 54 + 14 * math.sin(t / 0.4 * TAU)
        p['steer'] = -2.0
    elif motion == 'wave_out':
        k = ease(t / (L - 1 / FPS))
        p['wave'] = 54 - 50 * k
        p['head_rot'] = 2.0 * (1 - k)
        p['mouth'] = 'smile' if k < 0.6 else 'w'
        p['mouth_h'] = 20
        p['steer'] = -2.0
    elif motion == 'happy':
        bnc = abs(math.sin(t / 0.8 * TAU))
        p['eyes'] = 'happy'
        p['mouth'], p['mouth_h'] = 'smile', 22 + 8 * bnc
        p['head_rot'] = 4 * math.sin(t / 0.8 * TAU)
        p['body_dy'] = engine_vib(t, 0.6)
        p['steer'] = -2 + 1.5 * math.sin(t / 0.8 * TAU)
        fx = []
        for i, (hx, hy) in enumerate(((150, 170), (880, 130))):
            ph = ((t / 1.6) + i * 0.5) % 1.0
            fx.append(dict(kind='heart', x=hx, y=hy - 110 * ph, s=0.6 + 0.6 * math.sin(min(ph * 2, 1) * math.pi / 2), a=1 - max(0, ph - 0.7) / 0.3))
        p['fx'] = fx
    elif motion == 'sleep':
        ph = t / L
        p['eyes'] = 'closed'
        p['head_rot'] = -3.5 - 2 * math.sin(ph * TAU)
        p['head_dy'] += 6 + 4 * math.sin(ph * TAU)
        p['steer'] = -3.0
        fx = []
        for i, (sz, txt) in enumerate(((78, 'Z'), (60, 'z'), (46, 'z'))):
            q = (ph + i / 3) % 1.0
            fx.append(dict(kind='z', x=800 + 70 * q + i * 10, y=150 - 150 * q, size=sz, text=txt,
                           s=0.6 + 0.5 * math.sin(q * math.pi), a=math.sin(q * math.pi) * 1.3))
        p['fx'] = fx
    elif motion == 'wheelie_r':
        a = wheelie_angle(t)
        land = seg(t, 1.8, 2.2)
        squash = math.sin(land * math.pi) * (1 - land) if t >= 1.8 else 0
        p['rot'] = a
        p['sy'] = 1 - 0.03 * squash
        p['head_rot'] = -a * 0.4 + 2 * math.sin(t / 0.45 * TAU) * (1 if 0.55 < t < 1.5 else 0)
        p['shadow'] = 1 - 0.25 * min(1, -a / 17)
        if t < 0.35:
            p['eyes'], p['mouth'] = 'wow', 'o'
        elif t < 1.75:
            p['eyes'], p['mouth'], p['mouth_h'] = 'happy', 'smile', 30
        else:
            p['mouth'], p['mouth_h'] = 'smile', 22
        p['roll'] = (t / 0.25) % 1.0
        p['body_dy'] = engine_vib(t, 1.5, 10)
        p['steer'] = 2.5 * math.sin(t / 0.45 * TAU) * (1 if 0.55 < t < 1.5 else 0)   # 균형 잡는 핸들
        fx = exhaust(t, period=0.5, n=4, big=1.3) + speedlines(t, 0.45)
        if t >= 1.78:
            q = seg(t, 1.78, 2.2)
            fx += [dict(kind='dust', x=FRONT_CONTACT[0] - 40 - 90 * q, y=FRONT_CONTACT[1] - 6, r=24 + 40 * q, a=(1 - q) * 0.95),
                   dict(kind='dust', x=FRONT_CONTACT[0] + 90 + 90 * q, y=FRONT_CONTACT[1] - 12, r=20 + 34 * q, a=(1 - q) * 0.9),
                   dict(kind='spark', x=FRONT_CONTACT[0] + 150, y=FRONT_CONTACT[1] - 120 - 40 * q, s=0.9 * (1 - q * 0.5), a=1 - q, rot=q)]
        p['fx'] = fx
    elif motion == 'rev':
        p['body_dy'] = engine_vib(t, 3.0, 10)
        p['body_dx'] = engine_vib(t + 0.025, 1.2, 10)
        p['head_dx'] = engine_vib(t + 0.05, 1.5, 10)
        p['head_rot'] = 1.8 * math.sin(t / 0.4 * TAU)
        p['eyes'], p['mouth'] = 'normal', 'grin'
        p['hazard'] = 'on' if (int(t / 0.2) % 2) == 0 else 'off'
        p['headlight'] = 0.35 + 0.35 * math.sin(t / 0.2 * TAU)
        p['roll'] = (t / 0.2) % 1.0
        p['steer'] = 1.5 * math.sin(t / 0.2 * TAU)
        fx = exhaust(t, period=0.4, n=5, big=1.5)
        for i in range(3):
            q = ((t / 0.4) + i / 3) % 1.0
            fx.append(dict(kind='dust', x=REAR_CONTACT[0] - 30 - 160 * q, y=REAR_CONTACT[1] + 60 - 50 * q, r=18 + 40 * q, a=(1 - q) * 0.85))
        p['fx'] = fx
    elif motion == 'bow':
        k = math.sin(ease(t / L) * math.pi)
        p['head_dy'] += 22 * k
        p['head_sy'] = 1 - 0.08 * k
        p['head_rot'] = 3 * k
        p['eyes'] = 'happy'
        p['mouth'], p['mouth_h'] = 'smile', 18 + 8 * k
        p['steer'] = -2.0
        fx = []
        if t > 0.25:
            q = seg(t, 0.25, L)
            fx += [dict(kind='spark', x=200 - 40 * q, y=170 - 70 * q, s=0.6 + 0.4 * math.sin(q * math.pi), a=math.sin(q * math.pi), rot=q * 2),
                   dict(kind='spark', x=830 + 40 * q, y=150 - 80 * q, s=0.5 + 0.4 * math.sin(q * math.pi), a=math.sin(q * math.pi), rot=-q * 2),
                   dict(kind='heart', x=860 + 30 * q, y=260 - 90 * q, s=0.45 + 0.3 * q, a=math.sin(q * math.pi))]
        p['fx'] = fx
    elif motion == 'look_r':
        def track(tt):
            if tt < 0.3:
                return 0.0
            if tt < 0.7:
                return -ease(seg(tt, 0.3, 0.7))
            if tt < 1.1:
                return -1.0
            if tt < 1.6:
                return -1 + 2 * ease(seg(tt, 1.1, 1.6))
            if tt < 2.0:
                return 1.0
            return 1 - ease(seg(tt, 2.0, 2.45))
        eye, head = track(t + 0.08), track(t - 0.04)
        p['look'] = 10 * eye
        p['head_dx'] = 7 * head
        p['head_rot'] = 4.5 * head
        p['head_dy'] += -3 * abs(head)
        p['rider_rot'] += 1.5 * track(t - 0.12)                 # 몸도 살짝 따라 돔
        p['blink'] = blink_at(t, 1.35, 0.2)
        p['body_dy'] = engine_vib(t, 0.5)
        p['steer'] = -2.0
    elif motion == 'yawn_r':
        open_k = ease(seg(t, 0.15, 0.75)) * (1 - ease(seg(t, 1.45, 1.95)))
        p['mouth'] = 'yawn' if open_k > 0.12 else 'w'
        p['mouth_h'] = 14 + 50 * open_k
        p['eyes'] = 'closed' if 0.35 < t < 1.75 else 'normal'
        if 1.75 <= t < 2.3:
            p['blink'] = 0.5 if t < 2.05 else 1.0
        p['head_rot'] = -6 * open_k
        p['head_dy'] += -10 * open_k
        p['head_sy'] = 1 + 0.03 * open_k
        p['body_dy'] = engine_vib(t, 0.5)
        p['steer'] = -2.0
        fx = []
        if 0.9 < t < 1.9:
            q = seg(t, 0.9, 1.9)
            fx.append(dict(kind='tear', x=EYE_R[0] + 42, y=EYE_R[1] + 10 + 30 * q, s=0.55, a=math.sin(q * math.pi)))
        p['fx'] = fx
    elif motion == 'groove':
        beat = t / 0.4
        sway = math.sin(t / 0.8 * TAU)
        bounce = abs(math.sin(beat * math.pi))
        p['eyes'] = 'happy'
        p['mouth'] = 'open' if int(beat) % 2 == 0 else 'smile'
        p['mouth_h'] = 16 + 12 * bounce
        p['head_dx'] = 7 * sway
        p['head_rot'] = 7 * sway
        p['hazard'] = 'on' if int(beat) % 2 == 0 else 'off'
        p['headlight'] = 0.3 * bounce
        p['steer'] = -2 + 2.5 * sway
        notes = [('♪', (155, 123, 255)), ('♫', (79, 179, 255)), ('♪', (255, 120, 160))]
        fx = []
        for i, (ch, col) in enumerate(notes):
            q = ((t / 1.6) + i / 3) % 1.0
            side = -1 if i % 2 == 0 else 1
            fx.append(dict(kind='note', text=ch, color=col, size=70,
                           x=(150 if side < 0 else 860) + side * 30 * q + 18 * math.sin(q * TAU),
                           y=230 - 200 * q, s=0.7 + 0.4 * math.sin(q * math.pi), a=math.sin(q * math.pi) * 1.4))
        p['fx'] = fx
    elif motion == 'wink':
        k = ease(seg(t, 0.12, 0.3)) * (1 - ease(seg(t, 0.85, 1.05)))
        p['eyes'] = 'wink' if k > 0.5 else 'normal'
        p['mouth'], p['mouth_h'] = ('smile', 20) if k > 0.3 else ('w', 24)
        p['head_rot'] = 7 * k
        p['head_dx'] = 5 * k
        p['head_dy'] += -4 * k
        p['rider_rot'] += 1.5 * k
        p['body_dy'] = engine_vib(t, 0.5)
        p['steer'] = -2.0
        fx = []
        if 0.25 < t < 1.0:
            q = seg(t, 0.25, 1.0)
            fx += [dict(kind='spark', x=EYE_R[0] + 95 + 25 * q, y=EYE_R[1] - 60 - 30 * q, s=0.5 + 0.5 * math.sin(q * math.pi), a=math.sin(q * math.pi), rot=q * 1.5),
                   dict(kind='heart', x=EYE_R[0] + 150 + 30 * q, y=EYE_R[1] - 10 - 60 * q, s=0.35 + 0.25 * q, a=math.sin(q * math.pi))]
        p['fx'] = fx
    return p


def clamp(v, a, b):
    return min(b, max(a, v))


# ======================================================================================
_R = None


def _init():
    global _R
    _R = Renderer()


def _render_task(args):
    name, i, out_dir = args
    _R.frame(pose(name, i / FPS)).save(os.path.join(out_dir, name, f'frame_{i:03d}.png'))
    return name


def main():
    global FPS
    ap = argparse.ArgumentParser()
    ap.add_argument('--cut')
    ap.add_argument('--frames')
    ap.add_argument('--only', default='')
    ap.add_argument('--still')
    ap.add_argument('--motion', default='idle_r')
    ap.add_argument('--t', type=float, default=0.0)
    ap.add_argument('--fps', type=int, default=FPS)
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    a = ap.parse_args()
    FPS = a.fps
    if a.cut:
        make_cut(a.cut)
    if a.still:
        Renderer().frame(pose(a.motion, a.t)).save(a.still)
    if a.frames:
        only = [x for x in a.only.split(',') if x]
        tasks = []
        for name, L in MOTIONS.items():
            if only and name not in only:
                continue
            os.makedirs(os.path.join(a.frames, name), exist_ok=True)
            tasks += [(name, i, a.frames) for i in range(int(round(L * FPS)))]
        import multiprocessing as mp
        done = {}
        with mp.get_context('fork').Pool(a.jobs, initializer=_init) as pool:
            for name in pool.imap_unordered(_render_task, tasks, chunksize=4):
                done[name] = done.get(name, 0) + 1
        for name, n in done.items():
            print(f'[motion] {name} {n} frames', flush=True)


if __name__ == '__main__':
    main()
