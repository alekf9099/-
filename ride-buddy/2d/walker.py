"""
Ride Buddy 2D — 오토바이에서 내린 3등신 캐릭터 + 세워둔 빈 오토바이
=====================================================================
- 빈 오토바이: 원본에서 라이더 픽셀만 지우고, 가려졌던 시트·탱크·계기판·그립을 원본 스타일로 그려 넣음 (+ 킥스탠드)
- 3등신 캐릭터: 머리는 원본(표정 시스템 그대로), 몸은 원본 선/색으로 그린 관절 리그
- 모션: 하차(dismount) / 탑승(mount = 역재생) / 서 있기 / 걷기 / 손 흔들기 / 점프 / 기지개 / 앉기 / 앉아 쉬기 /
        두리번 / 말하기 / 춤 / 꾸벅 / 세워둔 오토바이

  python walker.py --still out.png --motion walk_r --t 0.3
  python walker.py --frames out_dir [--only walk_r,stand]       # 캐릭터 단독 모션 (foot 스프라이트)
  python walker.py --bike-frames out_dir                        # parked / dismount (오토바이 캔버스와 같은 좌표)
"""
import argparse
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_2d as B  # noqa: E402

LINE, SKIN, SHADE, SS = B.LINE, B.SKIN, B.SKIN_SHADE, B.SS
SHIRT = (40, 33, 31, 255)
SHIRT_HI = (66, 56, 52, 255)
FLAME = [((217, 52, 28), 1.0), ((242, 128, 28), 0.72), ((255, 201, 60), 0.44)]
RED, RED_HI, RED_DK = (216, 54, 34, 255), (246, 118, 92, 255), (168, 34, 26, 255)
CHROME, CHROME_HI = (205, 210, 214, 255), (246, 247, 248, 255)
BLACK = (42, 36, 35, 255)
TAU = math.tau


# ======================================================================================
# 빈 오토바이 (라이더 제거 + 가려졌던 부분 그리기)
# ======================================================================================
BAR_PATH = [(205, 668), (300, 645), (360, 622), (430, 668), (560, 690), (700, 690), (790, 680), (852, 704)]
TANK_KEEP = [(275, 756), (445, 752), (452, 900), (275, 900)]
GRIP_L = [(212, 668), (300, 645)]


def empty_bike(rig):
    src = rig.src
    W, H = src.size
    a = np.array(src)
    rgb = a[..., :3].astype(int)
    alpha = a[..., 3]
    lum = (rgb * [0.3, 0.59, 0.11]).sum(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)

    rider = rig.zone_mask(B.ZONE_RIDER)
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    d.polygon(B.THIGH_POLY, fill=255)
    d.polygon([(150, 690), (200, 690), (200, 860), (150, 860)], fill=255)        # 반바지 끝
    d.polygon([(258, 668), (610, 676), (606, 738), (447, 751), (272, 755)], fill=255)  # 셔츠 밑단 (탱크 위)
    for (x, y, r) in ((283, 606, 56), (790, 682, 60)):                          # 손
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    rider |= np.array(m) > 0
    rider |= np.array(rig.head_mask) > 40                                       # 머리 자리
    rider[:470] |= alpha[:470] > 0                                               # 어깨선 위는 전부 (미러 제외는 아래 보호)

    prot = rig.zone_mask(dict(circles=[(660, 790, 110), (490, 780, 46), (790, 808, 46)], polys=[TANK_KEEP]))
    mirrors = rig.zone_mask(dict(circles=[(237, 467, 57), (848, 568, 56)]))
    skin = (rgb[..., 0] > 185) & (rgb[..., 1] > 150) & (rgb[..., 2] > 120) & (rgb[..., 0] - rgb[..., 2] > 18)
    keep = (prot & ~skin) | (mirrors & (sat < 70))       # 미러 안의 불꽃(소매) 픽셀은 제외
    remove = rider & ~keep
    out = a.copy()
    out[remove, 3] = 0
    out[~remove, 3] = alpha[~remove]
    cleaned = Image.fromarray(out)

    # ---- 가려졌던 부분 (뒤에서 앞 순서) ----
    ov = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    P = lambda x, y: (x * SS, y * SS)
    lw = 7 * SS

    def poly(pts, fill, outline=True):
        d.polygon([P(*q) for q in pts], fill=fill)
        if outline:
            d.line([P(*q) for q in pts + [pts[0]]], fill=LINE, width=lw, joint='curve')

    def smooth(pts, n=10):
        """닫힌 다각형 → 부드러운 곡선 (Catmull-Rom)"""
        out = []
        k = len(pts)
        for i in range(k):
            p0, p1, p2, p3 = pts[(i - 1) % k], pts[i], pts[(i + 1) % k], pts[(i + 2) % k]
            for j in range(n):
                t = j / n
                t2, t3 = t * t, t * t * t
                x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
                y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
                out.append((x, y))
        return out

    # 테일 카울 (빨강) + 시트 (검정, 뒤쪽 왼편으로 길게)
    poly(smooth([(118, 812), (160, 790), (190, 808), (186, 858), (140, 868), (112, 846)]), RED)
    seat = smooth([(150, 786), (240, 752), (350, 738), (455, 732), (470, 790), (360, 826), (240, 842), (158, 832)])
    poly(seat, BLACK)
    d.line([P(x, y) for x, y in smooth([(175, 790), (260, 764), (360, 752), (440, 748)], 6)[:30]], fill=(96, 88, 86, 255), width=6 * SS, joint='curve')
    # 사이드커버 위쪽 (빨강)
    poly(smooth([(205, 846), (280, 836), (342, 846), (346, 900), (232, 906)]), RED)
    # 연료탱크 (뒤로 이어지는 큰 물방울 모양) + 흰 줄무늬 + 하이라이트
    tank = smooth([(262, 868), (256, 808), (300, 744), (390, 712), (500, 704), (586, 724), (604, 800), (560, 880), (420, 900), (300, 896)])
    poly(tank, RED)
    d.line([P(x, y) for x, y in smooth([(282, 812), (320, 760), (400, 728), (500, 720), (570, 736)], 8)[:34]], fill=(250, 248, 244, 255), width=12 * SS, joint='curve')
    d.line([P(x, y) for x, y in smooth([(300, 790), (340, 755), (420, 738)], 8)[:14]], fill=RED_HI, width=10 * SS, joint='curve')
    d.ellipse(P(452, 704) + P(492, 722), fill=CHROME, outline=LINE, width=5 * SS)                       # 주유구
    # 핸들 라이저 + 계기판
    for x0 in (520, 590):
        d.rounded_rectangle(P(x0, 652) + P(x0 + 30, 700), radius=8 * SS, fill=CHROME, outline=LINE, width=5 * SS)
    d.ellipse(P(522, 600) + P(598, 676), fill=BLACK, outline=LINE, width=6 * SS)
    d.ellipse(P(532, 610) + P(588, 666), fill=(246, 244, 238, 255))
    for k in range(9):
        ang = math.radians(220 - k * 32.5)
        cx, cy = 560, 638
        d.line([P(cx + 22 * math.cos(ang), cy - 22 * math.sin(ang)), P(cx + 27 * math.cos(ang), cy - 27 * math.sin(ang))], fill=LINE, width=3 * SS)
    d.line([P(560, 638), P(560 + 20 * math.cos(math.radians(150)), 638 - 20 * math.sin(math.radians(150)))], fill=(217, 52, 28, 255), width=4 * SS)
    behind = ov.resize((W, H), Image.LANCZOS)

    # 핸들바·그립·레버·미러대 (원본 스타일로 새로 그림) — 앞쪽
    ov2 = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    d2 = ImageDraw.Draw(ov2)

    def tube(pts, w, color, out=True):
        if out:
            d2.line([P(*q) for q in pts], fill=LINE, width=int((w + 13) * SS), joint='curve')
            for q in (pts[0], pts[-1]):
                r = (w + 13) * SS / 2
                d2.ellipse((q[0] * SS - r, q[1] * SS - r, q[0] * SS + r, q[1] * SS + r), fill=LINE)
        d2.line([P(*q) for q in pts], fill=color, width=int(w * SS), joint='curve')
        for q in (pts[0], pts[-1]):
            r = w * SS / 2
            d2.ellipse((q[0] * SS - r, q[1] * SS - r, q[0] * SS + r, q[1] * SS + r), fill=color)
    # 미러대 (검정 막대)
    tube([(262, 512), (288, 570), (312, 632)], 9, (52, 46, 45, 255))
    tube([(826, 604), (782, 626), (748, 650)], 9, (52, 46, 45, 255))
    # 레버 (그립 아래 얇은 검정)
    tube([(322, 666), (250, 690)], 9, (52, 46, 45, 255))
    tube([(742, 676), (815, 712)], 9, (52, 46, 45, 255))
    # 크롬 핸들바 (에이프행어)
    def bez(p0, c0, c1, p1, n=24):
        pts = []
        for i in range(n + 1):
            t = i / n
            mt = 1 - t
            pts.append((mt ** 3 * p0[0] + 3 * mt * mt * t * c0[0] + 3 * mt * t * t * c1[0] + t ** 3 * p1[0],
                        mt ** 3 * p0[1] + 3 * mt * mt * t * c0[1] + 3 * mt * t * t * c1[1] + t ** 3 * p1[1]))
        return pts
    bar = bez((300, 648), (360, 606), (440, 640), (505, 684)) + [(560, 690)] + bez((615, 684), (680, 640), (730, 628), (772, 668))
    tube(bar, 17, (214, 217, 221, 255))
    d2.line([P(x, y - 4) for x, y in bar], fill=(250, 250, 250, 255), width=4 * SS, joint='curve')
    # 핸들 클램프
    d2.rounded_rectangle(P(520, 670) + P(600, 700), radius=8 * SS, fill=CHROME, outline=LINE, width=5 * SS)
    # 그립 (검정)
    tube([(214, 670), (304, 646)], 29, (44, 37, 36, 255))
    tube([(770, 667), (852, 704)], 29, (44, 37, 36, 255))
    for (x, y) in ((214, 670), (852, 704)):                                   # 바 엔드
        d2.ellipse(P(x - 12, y - 12) + P(x + 12, y + 12), fill=CHROME, outline=LINE, width=4 * SS)
    front = ov2.resize((W, H), Image.LANCZOS)

    bike = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bike.alpha_composite(behind)
    bike.alpha_composite(cleaned)
    bike.alpha_composite(front)
    return bike, Image.fromarray(remove.astype(np.uint8) * 255)


# ======================================================================================
# 3등신 캐릭터 (서 있는 몸) — 원본 머리 + 원본 스타일로 그린 몸
# ======================================================================================
WC_W, WC_H = 1100, 1629            # 캐릭터 캔버스 (원본 픽셀 스케일과 동일)
FEET_Y = 1580                      # 발바닥 높이 (캔버스 아래 49px — 오토바이 캔버스와 지면 정렬)
BODY_DY = 310                      # 몸 전체를 아래로 → 다리·몸통이 짧은 통통 체형 (머리 잘림 방지 여백도 확보)
PELVIS_Y = 965                     # (BODY_DY 적용 전) 골반 높이
CX = 550


def _bez2(p0, c, p1, t):
    return ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1])


class Painter:
    """SS 배율 캔버스에 원본 선 스타일로 그리기"""

    def __init__(self, size, box=None):
        self.W, self.H = size
        self.x0, self.y0, x1, y1 = box or (0, 0, self.W, self.H)
        self.bw, self.bh = x1 - self.x0, y1 - self.y0
        self.im = Image.new('RGBA', (self.bw * SS, self.bh * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def P(self, x, y):
        return ((x - self.x0) * SS, (y - self.y0) * SS)

    def poly(self, pts, fill, outline=LINE, lw=8):
        pp = [self.P(*q) for q in pts]
        if outline:
            self.d.polygon(pp, fill=outline)
            # 외곽선: 바깥으로 lw 만큼 → 같은 모양을 fill 로 약간 줄여 덮는 대신, 선으로 그림
        self.d.polygon(pp, fill=fill)
        if outline:
            self.d.line(pp + [pp[0]], fill=outline, width=int(lw * SS), joint='curve')

    def limb(self, p0, c, p1, w0, w1, color, lw=7, bulge=0.0, shade=None, n=24):
        """곡선 팔다리: p0→(제어점 c)→p1, 폭 w0→w1 (반폭), bulge: 중간 통통함"""
        def edge(extra):
            L, Rr = [], []
            for i in range(n + 1):
                t = i / n
                x, y = _bez2(p0, c, p1, t)
                xa, ya = _bez2(p0, c, p1, min(1, t + 0.01))
                xb, yb = _bez2(p0, c, p1, max(0, t - 0.01))
                tx, ty = xa - xb, ya - yb
                tl = math.hypot(tx, ty) or 1
                qx, qy = -ty / tl, tx / tl
                w = w0 + (w1 - w0) * t + bulge * math.sin(math.pi * t) + extra
                L.append(self.P(x + qx * w, y + qy * w)); Rr.append(self.P(x - qx * w, y - qy * w))
            return L + Rr[::-1]
        self.d.polygon(edge(lw), fill=LINE)
        for (q, w) in ((p0, w0), (p1, w1)):
            self.d.ellipse(self.P(q[0] - w - lw, q[1] - w - lw) + self.P(q[0] + w + lw, q[1] + w + lw), fill=LINE)
        self.d.polygon(edge(0), fill=color)
        for (q, w) in ((p0, w0), (p1, w1)):
            self.d.ellipse(self.P(q[0] - w, q[1] - w) + self.P(q[0] + w, q[1] + w), fill=color)
        if shade:
            pts = []
            for i in range(12):
                t = 0.15 + 0.7 * i / 11
                x, y = _bez2(p0, c, p1, t)
                xa, ya = _bez2(p0, c, p1, min(1, t + 0.01))
                tl = math.hypot(xa - x, ya - y) or 1
                qx, qy = -(ya - y) / tl, (xa - x) / tl
                w = w0 + (w1 - w0) * t + bulge * math.sin(math.pi * t)
                pts.append(self.P(x - qx * (w - 10), y - qy * (w - 10)))
            self.d.line(pts, fill=shade, width=10 * SS, joint='curve')

    def ellipse(self, cx, cy, rx, ry, fill, lw=7, rot=0.0):
        pts = []
        for i in range(48):
            t = TAU * i / 48
            ex, ey = rx * math.cos(t), ry * math.sin(t)
            pts.append((cx + ex * math.cos(rot) - ey * math.sin(rot), cy + ex * math.sin(rot) + ey * math.cos(rot)))
        self.poly(pts, fill, lw=lw)

    def done(self):
        return self.im.resize((self.bw, self.bh), Image.LANCZOS), (self.x0, self.y0)


def flame_tongues(d, P, x0, x1, base_y, hmin, hmax, step, seed=3, up=True):
    rng = np.random.default_rng(seed)
    x = x0
    while x < x1:
        w = rng.uniform(46, 70)
        h = rng.uniform(hmin, hmax)
        lean = rng.uniform(-0.35, 0.35)
        for col, sc in FLAME:
            ww, hh = w * sc, h * sc
            pts = []
            for i in range(21):
                t = i / 20
                yy = base_y - hh * t if up else base_y + hh * t
                cx = x + lean * ww * math.sin(t * math.pi * 1.1) * 0.7
                half = (ww / 2) * (1 - t) ** 0.85 * min(1.0, 0.55 + 1.6 * t)
                pts.append((cx - half, yy))
            for i in range(20, -1, -1):
                t = i / 20
                yy = base_y - hh * t if up else base_y + hh * t
                cx = x + lean * ww * math.sin(t * math.pi * 1.1) * 0.7
                half = (ww / 2) * (1 - t) ** 0.85 * min(1.0, 0.55 + 1.6 * t)
                pts.append((cx + half, yy))
            d.polygon([P(*q) for q in pts], fill=col + (255,))
        x += w * 0.62


class Walker:
    """3등신 캐릭터 리그. pose 키:
       body_dx, body_dy, body_rot(골반 기준), lean, sx/sy(전체 스쿼시)
       hand_l/hand_r: (x, y) 손 위치 (어깨 기준 상대), elbow_l/elbow_r: 팔꿈치 휘는 양(+ 바깥)
       foot_l/foot_r: (x, y) 발 위치 (엉덩이 기준 상대), knee_l/knee_r: 무릎 휘는 양
       sit: 0..1 앉기 (무릎 앞으로, 엉덩이 내려감)
       + 머리/표정 키 (build_2d 와 같음)"""

    def __init__(self, rig):
        self.rig = rig
        self.size = (WC_W, WC_H)
        self._torso = {}

    # 몸통(셔츠) — 캐시
    def torso(self, breath=0.0):
        key = round(breath, 2)
        if key in self._torso:
            return self._torso[key]
        pt = Painter(self.size, (250, 520, 850, 960))
        P = pt.P
        top, hem = 560, 850
        shape = [(440, top), (660, top), (752, 608), (790 + 6 * breath, 700), (794 + 9 * breath, 790), (768, hem), (332, hem),
                 (306 - 9 * breath, 790), (310 - 6 * breath, 700), (348, 608)]
        sm = _smooth_closed(shape, 8)
        mask = Image.new('L', pt.im.size, 0)
        ImageDraw.Draw(mask).polygon([P(*q) for q in sm], fill=255)
        base = Image.new('RGBA', pt.im.size, SHIRT)
        fl = ImageDraw.Draw(base)
        flame_tongues(fl, P, 300, 800, hem + 6, 80, 140, 0, seed=4)
        flame_tongues(fl, P, 330, 450, 612, 44, 66, 0, seed=9)
        flame_tongues(fl, P, 650, 770, 612, 44, 66, 0, seed=11)
        # 하이라이트 (왼쪽 어깨 쪽 광택)
        fl.line([P(372, 650), P(346, 780)], fill=SHIRT_HI, width=16 * SS)
        pt.im.paste(base, (0, 0), mask)
        pt.d.line([P(*q) for q in sm + [sm[0]]], fill=LINE, width=8 * SS, joint='curve')
        # 오픈 칼라 V (턱 밑)
        pt.d.polygon([P(512, 588), P(550, 662), P(588, 588)], fill=SKIN + (255,))
        pt.d.line([P(498, 576), P(550, 664), P(602, 576)], fill=LINE, width=7 * SS, joint='curve')
        pt.d.line([P(470, 584), P(520, 640)], fill=(76, 66, 62, 255), width=5 * SS)
        pt.d.line([P(630, 584), P(580, 640)], fill=(76, 66, 62, 255), width=5 * SS)
        out = pt.done()
        self._torso[key] = out
        return out

    def sleeve(self, pt, sh, ang, flip):
        """퍼프 소매 (검정 + 불꽃 밑단). sh: 어깨, ang: 팔 방향(라디안, 아래=0)"""
        dx, dy = math.sin(ang), math.cos(ang)
        nx, ny = -dy, dx
        L = 112
        end = (sh[0] + dx * L, sh[1] + dy * L)
        pts = [(sh[0] + nx * 70, sh[1] + ny * 70), (end[0] + nx * 80, end[1] + ny * 80), (end[0] - nx * 80, end[1] - ny * 80),
               (sh[0] - nx * 70, sh[1] - ny * 70)]
        sm = _smooth_closed([(sh[0] - dx * 30, sh[1] - dy * 30)] + pts[:2] + [(end[0] + dx * 14, end[1] + dy * 14)] + pts[2:], 8)
        P = pt.P
        mask = Image.new('L', pt.im.size, 0)
        ImageDraw.Draw(mask).polygon([P(*q) for q in sm], fill=255)
        layer = Image.new('RGBA', pt.im.size, SHIRT)
        fl = ImageDraw.Draw(layer)
        # 소매 밑단 불꽃 (팔 방향 반대로 타오름)
        for k in range(-3, 4):
            bx, by = end[0] + nx * 24 * k + dx * 8, end[1] + ny * 24 * k + dy * 8
            hh0 = 58 + 22 * ((k * 7 + 3) % 3) / 2
            lean = 0.3 * ((k % 2) * 2 - 1)
            for col, sc in FLAME:
                hh, ww = hh0 * sc, 44 * sc
                left, right = [], []
                for i in range(15):
                    t = i / 14
                    cx = bx - dx * hh * t + nx * lean * ww * math.sin(t * math.pi)
                    cy = by - dy * hh * t + ny * lean * ww * math.sin(t * math.pi)
                    half = (ww / 2) * (1 - t) ** 0.85 * min(1.0, 0.55 + 1.6 * t)
                    left.append(P(cx + nx * half, cy + ny * half)); right.append(P(cx - nx * half, cy - ny * half))
                fl.polygon(left + right[::-1], fill=col + (255,))
        pt.im.paste(layer, (0, 0), mask)
        pt.d.line([P(*q) for q in sm + [sm[0]]], fill=LINE, width=8 * SS, joint='curve')
        return end

    def hand(self, pt, c, ang, open_=False):
        dx, dy = math.sin(ang), math.cos(ang)
        nx, ny = -dy, dx
        pt.ellipse(c[0], c[1], 54, 48, SKIN + (255,), rot=math.atan2(dy, dx))
        tx, ty = c[0] + nx * 42 - dx * 8, c[1] + ny * 42 - dy * 8
        pt.ellipse(tx, ty, 21, 18, SKIN + (255,), lw=6)
        for k in (-1, 0, 1):
            fx, fy = c[0] + dx * 40 + nx * 17 * k, c[1] + dy * 40 + ny * 17 * k
            pt.d.line([pt.P(fx, fy), pt.P(fx - dx * 18, fy - dy * 18)], fill=LINE, width=5 * SS)

    def shoe(self, pt, ankle, side=1, lift=0.0):
        ax, ay = ankle
        fx, fy = ax + 18 * side, ay + 44
        rot = math.radians(6 * side - 10 * lift)
        pt.ellipse(fx, fy + 18, 96, 34, (246, 244, 240, 255), rot=rot)
        pt.ellipse(fx, fy, 90, 46, (52, 44, 42, 255), rot=rot)
        hx0, hx1 = sorted((fx + 18 * side, fx + 48 * side))
        pt.d.ellipse(pt.P(hx0, fy - 26) + pt.P(hx1, fy - 12), fill=(110, 100, 96, 255))
        for k in range(3):
            lx, ly = fx - 22 + k * 14, fy - 24 + k * 3
            pt.d.line([pt.P(lx - 8, ly - 4), pt.P(lx + 8, ly + 4)], fill=(240, 236, 230, 255), width=4 * SS)

    def leg(self, pt, hip, foot, knee_amt, side, kdir=None):
        """엉덩이 → 무릎(곡선) → 발목 + 양말 + 운동화. 다리가 짧아지면 무릎이 자동으로 굽음"""
        ankle = (foot[0], foot[1] - 70)
        mx, my = (hip[0] + ankle[0]) / 2, (hip[1] + ankle[1]) / 2
        L = math.hypot(ankle[0] - hip[0], ankle[1] - hip[1]) or 1
        LN = FEET_Y - 70 - (PELVIS_Y + BODY_DY)
        knee_amt += math.sqrt(max(0.0, (LN / 2) ** 2 - (L / 2) ** 2)) * 1.6
        nx, ny = -(ankle[1] - hip[1]) / L, (ankle[0] - hip[0]) / L
        kd = side if kdir is None else kdir                     # +1 = 화면 오른쪽(진행 방향)으로 굽음
        c = (mx - nx * knee_amt * kd, my - ny * knee_amt * kd)
        pt.limb(hip, c, ankle, 84, 50, SKIN + (255,), bulge=10, shade=SHADE + (255,))
        # 양말
        sx_, sy_ = _bez2(hip, c, ankle, 0.86)
        dx, dy = (ankle[0] - sx_), (ankle[1] - sy_)
        dl = math.hypot(dx, dy) or 1
        qx, qy = -dy / dl * 56, dx / dl * 56
        pt.d.polygon([pt.P(sx_ + qx, sy_ + qy), pt.P(ankle[0] + qx * 0.9, ankle[1] + qy * 0.9 + 6),
                      pt.P(ankle[0] - qx * 0.9, ankle[1] - qy * 0.9 + 6), pt.P(sx_ - qx, sy_ - qy)], fill=(250, 248, 244, 255), outline=LINE, width=6 * SS)
        self.shoe(pt, ankle, side, lift=max(0.0, (FEET_Y - foot[1]) / 80))

    def arm(self, pt, sh, hand_pos, elbow_amt, side):
        ang = math.atan2(hand_pos[0] - sh[0], hand_pos[1] - sh[1])
        cuff = self.sleeve(pt, sh, ang, side)
        mx, my = (cuff[0] + hand_pos[0]) / 2, (cuff[1] + hand_pos[1]) / 2
        L = math.hypot(hand_pos[0] - cuff[0], hand_pos[1] - cuff[1]) or 1
        elbow_amt += math.sqrt(max(0.0, (75) ** 2 - (L / 2) ** 2)) * 1.2
        nx, ny = -(hand_pos[1] - cuff[1]) / L, (hand_pos[0] - cuff[0]) / L
        c = (mx - nx * elbow_amt * side, my - ny * elbow_amt * side)     # 팔꿈치는 바깥쪽
        pt.limb(cuff, c, hand_pos, 52, 44, SKIN + (255,), bulge=6, shade=SHADE + (255,))
        # 소매를 팔 위에 한 번 더 (팔이 소매 안에서 나오게)
        self.sleeve(pt, sh, ang, side)
        a2 = math.atan2(hand_pos[0] - c[0], hand_pos[1] - c[1])
        self.hand(pt, hand_pos, a2)

    def head_fix(self, head):
        """오토바이 미러에 가려졌던 머리 왼쪽 아래: 주변 피부로 인페인팅 + 윤곽선만 다시 그림"""
        if not hasattr(self, '_patch'):
            rig = self.rig
            hc = B.HEAD
            W, H = rig.size
            hole = rig.mirror_hole.astype(np.uint8) * 255
            hole = cv2.dilate(hole, np.ones((9, 9), np.uint8))
            ell = np.zeros((H, W), np.uint8)
            cv2.ellipse(ell, (hc['cx'], hc['cy']), (hc['rx'] - 9, hc['ry'] - 9), 0, 0, 360, 255, -1)
            hole = hole & ell                                        # 머리 안쪽만
            src = np.array(rig.head)
            bgr = cv2.cvtColor(src[..., :3], cv2.COLOR_RGB2BGR)
            fixed = cv2.cvtColor(cv2.inpaint(bgr, hole, 13, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
            patch = np.zeros((H, W, 4), np.uint8)
            patch[..., :3] = fixed
            patch[..., 3] = cv2.GaussianBlur(hole, (0, 0), 2)
            pimg = Image.fromarray(patch)
            pt = Painter((W, H), (140, 300, 480, 570))
            arc = []
            for i in range(61):
                ang = math.radians(128 + 82 * i / 60)               # 왼쪽 아래 둘레
                arc.append((hc['cx'] + hc['rx'] * math.cos(ang), hc['cy'] + hc['ry'] * math.sin(ang)))
            arc = [q for q in arc if q[1] > 330]
            pt.d.line([pt.P(*q) for q in arc], fill=LINE, width=9 * SS, joint='curve')
            layer, pos = pt.done()
            pimg.alpha_composite(layer, pos)
            outside = np.zeros((H, W), np.uint8)
            cv2.rectangle(outside, (140, 330), (470, 570), 255, -1)
            ell2 = np.zeros((H, W), np.uint8)
            cv2.ellipse(ell2, (hc['cx'], hc['cy']), (hc['rx'] + 4, hc['ry'] + 4), 0, 0, 360, 255, -1)
            self._outside = (outside > 0) & (ell2 == 0)
            self._patch = pimg
        a = np.array(head)
        a[self._outside, 3] = 0                                     # 머리 밖으로 삐져나온 미러 조각 제거
        h = Image.fromarray(a)
        h.alpha_composite(self._patch)
        return h

    def frame(self, p):
        """포즈 → (RGBA 이미지 WC_W x WC_H)"""
        bdx, bdy = p.get('body_dx', 0.0), p.get('body_dy', 0.0)
        sit = p.get('sit', 0.0)
        drop = 190 * sit
        bdy = bdy + BODY_DY
        pelvis = (CX + bdx, PELVIS_Y + bdy + drop)
        hips = {-1: (pelvis[0] - 112, pelvis[1]), 1: (pelvis[0] + 112, pelvis[1])}
        neck_base = (CX + bdx + p.get('lean', 0.0) * 4, 560 + bdy + drop + p.get('torso_dy', 0.0))
        shoulders = {-1: (neck_base[0] - 215, neck_base[1] + 92), 1: (neck_base[0] + 215, neck_base[1] + 92)}

        pt = Painter(self.size)
        # 다리 (뒤)
        for side in (-1, 1):
            f = p.get('foot_l' if side < 0 else 'foot_r', (0, 0))
            foot = (hips[side][0] + 6 * side + f[0], FEET_Y + f[1])
            if sit > 0:
                foot = (foot[0] + 70 * sit * side, foot[1] - 4 * sit)
            self.leg(pt, hips[side], foot, p.get('knee_l' if side < 0 else 'knee_r', 8), side, p.get('knee_dir'))
        # 반바지
        P = pt.P
        sh_y = pelvis[1] - 140
        shorts = _smooth_closed([(pelvis[0] - 222, sh_y), (pelvis[0] + 222, sh_y), (pelvis[0] + 232, pelvis[1] + 52),
                                 (pelvis[0] + 24, pelvis[1] + 44), (pelvis[0], pelvis[1] + 14), (pelvis[0] - 24, pelvis[1] + 44),
                                 (pelvis[0] - 232, pelvis[1] + 52)], 6)
        pt.d.polygon([P(*q) for q in shorts], fill=BLACK)
        pt.d.line([P(*q) for q in shorts + [shorts[0]]], fill=LINE, width=8 * SS, joint='curve')
        pt.d.line([P(pelvis[0], sh_y + 30), P(pelvis[0], pelvis[1] + 6)], fill=(70, 62, 60, 255), width=5 * SS)
        layer, pos = pt.done()
        out = Image.new('RGBA', self.size, (0, 0, 0, 0))
        out.alpha_composite(layer, pos)

        # 몸통 (셔츠) — 숨쉬기/기울기
        tor, tpos = self.torso(p.get('breath', 0.0))
        tl = Image.new('RGBA', self.size, (0, 0, 0, 0))
        tl.alpha_composite(tor, (int(tpos[0] + bdx + p.get('lean', 0) * 2), int(tpos[1] + bdy + drop + p.get('torso_dy', 0.0))))
        if p.get('torso_rot', 0.0):
            tl = B.warp(tl, self.size, B.mat_about((pelvis[0], pelvis[1] - 80), p['torso_rot']))
        out.alpha_composite(tl)

        # 팔 (앞)
        pa = Painter(self.size)
        for side in (-1, 1):
            hp = p.get('hand_l' if side < 0 else 'hand_r', (0, 0))
            sh = shoulders[side]
            hand = (sh[0] + 30 * side + hp[0], sh[1] + 205 + hp[1])
            self.arm(pa, sh, hand, p.get('elbow_l' if side < 0 else 'elbow_r', 10), side)
        layer, pos = pa.done()
        out.alpha_composite(layer, pos)

        # 머리 (원본) — 목에 붙임
        R = self.rig
        head = R.compose_head(p.get('eyes', 'normal'), p.get('mouth', 'w'), p.get('mouth_h', 24), p.get('blink', 1.0), p.get('look', 0.0))
        head = self.head_fix(head)
        hs = p.get('head_s', 1.0)
        M = B.mat_t(neck_base[0] - B.NECK[0] + p.get('head_dx', 0), neck_base[1] + 10 - B.NECK[1] + p.get('head_dy', 0)) @ \
            B.mat_about(B.NECK, p.get('head_rot', 0), hs, hs * p.get('head_sy', 1.0))
        out.alpha_composite(B.warp(head, self.size, M))

        # 전체 변형 (점프·스쿼시·좌우 반전) — 발바닥 기준
        gsx, gsy, gdy, grot = p.get('sx', 1.0), p.get('sy', 1.0), p.get('dy', 0.0), p.get('rot', 0.0)
        Mg = B.mat_about((CX, FEET_Y + 10), grot, gsx, gsy, 0, gdy)
        if not np.allclose(Mg, np.eye(3)):
            out = B.warp(out, self.size, Mg)
        # 그림자
        sh = Image.new('RGBA', self.size, (0, 0, 0, 0))
        k = max(0.45, 1 - abs(gdy) / 260)
        ImageDraw.Draw(sh).ellipse((CX - 230 * k, FEET_Y + 2, CX + 230 * k, FEET_Y + 40), fill=(30, 22, 18, int(70 * k)))
        final = Image.new('RGBA', self.size, (0, 0, 0, 0))
        final.alpha_composite(sh.filter(ImageFilter.GaussianBlur(9)))
        final.alpha_composite(out)
        fx = p.get('fx')
        if fx:
            fx = [dict(it, y=it['y'] + BODY_DY) for it in fx]          # 효과도 머리 위치에 맞춰
            layer, pos = B.fx_layer(self.size, fx)
            if layer is not None:
                final.alpha_composite(layer, pos)
        return final


def _smooth_closed(pts, n=10):
    out = []
    k = len(pts)
    for i in range(k):
        p0, p1, p2, p3 = pts[(i - 1) % k], pts[i], pts[(i + 1) % k], pts[(i + 2) % k]
        for j in range(n):
            t = j / n
            t2, t3 = t * t, t * t * t
            out.append((0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)))
    return out


# ======================================================================================
# 도보 모션 (30fps)
# ======================================================================================
FPS = 30
WMOTIONS = {
    'stand': 2.4,       # 서 있기 (숨쉬기·깜빡임)
    'walk_r': 1.6,      # 걷기 (0.8초 = 한 걸음 주기 x2) — 왼쪽은 앱에서 반전
    'wave_s': 1.6,      # 손 흔들기
    'jump_s': 1.0,      # 신나서 점프
    'stretch_s': 2.2,   # 기지개 + 하품
    'sit_down': 0.8,    # 앉기 (역재생 = 일어나기)
    'sit': 2.4,         # 앉아 쉬기 (발 까딱)
    'nap': 3.2,         # 앉아서 졸기 (방해 금지)
    'look_s': 2.6,      # 두리번
    'talk_s': 1.6,      # 알림 읽어주기 (손짓)
    'dance_s': 1.6,     # 춤 (음표)
    'bow_s': 1.0,       # 꾸벅 인사 ("감사하고~")
    'surprise_s': 1.0,  # 알림 도착 (깜짝 + 느낌표)
}
WLOOPS = {'stand', 'walk_r', 'wave_s', 'sit', 'nap', 'talk_s', 'dance_s'}
ease, seg, back_out, blink_at = B.ease, B.seg, B.back_out, B.blink_at


def wpose(m, t):
    L = WMOTIONS[m]
    p = {}
    br = math.sin(t / 1.2 * TAU)
    if m in ('stand', 'look_s'):
        p.update(breath=0.5 + 0.5 * br, body_dy=2 * br, torso_dy=-1.5 * br, head_dy=-3 * (0.5 + 0.5 * br),
                 hand_l=(-3 * br, 0), hand_r=(3 * br, 0), head_rot=1.8 * math.sin(t / L * TAU))
        p['blink'] = blink_at(t, 1.0)
        if m == 'look_s':
            def track(tt):
                if tt < 0.3: return 0.0
                if tt < 0.7: return -ease(seg(tt, 0.3, 0.7))
                if tt < 1.1: return -1.0
                if tt < 1.6: return -1 + 2 * ease(seg(tt, 1.1, 1.6))
                if tt < 2.0: return 1.0
                return 1 - ease(seg(tt, 2.0, 2.45))
            e, h = track(t + 0.08), track(t - 0.04)
            p.update(look=10 * e, head_dx=8 * h, head_rot=5 * h, torso_rot=1.2 * track(t - 0.12))
            p['blink'] = blink_at(t, 1.35, 0.2)
    elif m == 'walk_r':
        ph = t / 0.8 * TAU
        sl, sr = math.sin(ph), math.sin(ph + math.pi)
        p['foot_l'] = (26 * math.cos(ph), -58 * max(0.0, sl))
        p['foot_r'] = (26 * math.cos(ph + math.pi), -58 * max(0.0, sr))
        p['body_dy'] = -12 * abs(sl)
        p['body_dx'] = 7 * sl
        p['torso_rot'] = 2.5 + 1.5 * sl
        p['hand_l'] = (14 * math.cos(ph + math.pi), -26 * max(0.0, sr))
        p['hand_r'] = (14 * math.cos(ph), -26 * max(0.0, sl))
        p['head_rot'] = 3 * sl + 2
        p['head_dy'] = -5 * abs(math.sin(ph - 0.5))
        p['blink'] = blink_at(t, 1.1)
        p['mouth'], p['mouth_h'] = 'w', 24
        p['knee_dir'] = 1
    elif m == 'wave_s':
        w = math.sin(t / 0.4 * TAU)
        p.update(hand_r=(170 + 40 * w, -540), elbow_r=-20, hand_l=(-4, 0), eyes='happy', mouth='smile', mouth_h=24,
                 head_rot=-4 + 2 * w, torso_rot=-1.5, body_dy=2 * br, breath=0.5 + 0.5 * br)
    elif m == 'jump_s':
        if t < 0.25:
            k = ease(t / 0.25); p.update(body_dy=46 * k, hand_l=(-30 * k, -40 * k), hand_r=(30 * k, -40 * k))
        elif t < 0.7:
            q = seg(t, 0.25, 0.7)
            p.update(dy=-190 * math.sin(math.pi * q), body_dy=46 * (1 - ease(q * 3)), hand_l=(-190, -500), hand_r=(190, -500),
                     foot_l=(-10, -30 * math.sin(math.pi * q)), foot_r=(10, -30 * math.sin(math.pi * q)), sy=1 + 0.05 * math.sin(math.pi * q))
        else:
            q = seg(t, 0.7, 1.0)
            sq = math.sin(math.pi * q) * (1 - q)
            p.update(sy=1 - 0.09 * sq, sx=1 + 0.05 * sq, body_dy=30 * sq, hand_l=(-120 * (1 - q), -260 * (1 - q)), hand_r=(120 * (1 - q), -260 * (1 - q)))
        p.update(eyes='happy', mouth='smile', mouth_h=30)
        if 0.3 < t < 0.95:
            q = seg(t, 0.3, 0.95)
            p['fx'] = [dict(kind='spark', x=CX - 330 - 30 * q, y=420 - 90 * q, s=0.7 + 0.4 * math.sin(math.pi * q), a=math.sin(math.pi * q), rot=q * 2),
                       dict(kind='spark', x=CX + 330 + 30 * q, y=380 - 80 * q, s=0.6 + 0.4 * math.sin(math.pi * q), a=math.sin(math.pi * q), rot=-q * 2),
                       dict(kind='heart', x=CX + 360, y=560 - 100 * q, s=0.5 + 0.3 * q, a=math.sin(math.pi * q))]
    elif m == 'stretch_s':
        up = ease(seg(t, 0.15, 0.7)) * (1 - ease(seg(t, 1.5, 2.0)))
        p.update(hand_l=(-200 * up, -540 * up), hand_r=(200 * up, -540 * up), elbow_l=-10 * up, elbow_r=-10 * up,
                 torso_dy=-14 * up, body_dy=-10 * up, head_rot=-6 * up, head_dy=-14 * up, sy=1 + 0.03 * up)
        p['mouth'] = 'yawn' if up > 0.2 else 'w'
        p['mouth_h'] = 14 + 46 * up
        p['eyes'] = 'closed' if up > 0.35 else 'normal'
        if 0.9 < t < 1.8:
            q = seg(t, 0.9, 1.8)
            p['fx'] = [dict(kind='tear', x=CX + 130, y=360 + 30 * q, s=0.55, a=math.sin(math.pi * q))]
    elif m in ('sit_down', 'sit', 'nap'):
        k = ease(t / (L - 1 / FPS)) if m == 'sit_down' else 1.0
        dip = math.sin(math.pi * k) * 30 if m == 'sit_down' else 0
        p.update(sit=k, body_dy=-dip * 0.3, hand_l=(-60 * k, 120 * k), hand_r=(60 * k, 120 * k), elbow_l=20 * k, elbow_r=20 * k,
                 knee_l=-90 * k, knee_r=-90 * k)
        if m == 'sit':
            tap = math.sin(t / 0.6 * TAU)
            p.update(breath=0.5 + 0.5 * br, body_dy=2 * br, foot_r=(0, -18 * max(0.0, tap)), head_rot=2.5 * math.sin(t / L * TAU))
            p['blink'] = blink_at(t, 1.6)
        if m == 'nap':
            ph = t / L
            p.update(eyes='closed', head_rot=-4 - 2 * math.sin(ph * TAU), head_dy=10 + 5 * math.sin(ph * TAU), breath=0.5 + 0.5 * math.sin(t / 1.6 * TAU))
            fx = []
            for i, (sz, txt) in enumerate(((78, 'Z'), (60, 'z'), (46, 'z'))):
                q = (ph + i / 3) % 1.0
                fx.append(dict(kind='z', x=CX + 260 + 70 * q + i * 10, y=520 - 150 * q, size=sz, text=txt,
                               s=0.6 + 0.5 * math.sin(q * math.pi), a=math.sin(q * math.pi) * 1.3))
            p['fx'] = fx
    elif m == 'talk_s':
        g = math.sin(t / 0.8 * TAU)
        p.update(mouth='open', mouth_h=14 + 24 * (0.5 + 0.5 * math.sin(t / 0.4 * TAU)), head_rot=2 * math.sin(t / 0.8 * TAU),
                 head_dy=-3 * (0.5 + 0.5 * math.sin(t / 0.4 * TAU)), hand_r=(-60 + 20 * g, -170 - 30 * abs(g)), elbow_r=40,
                 hand_l=(-6, 0), breath=0.5 + 0.5 * br, body_dy=2 * br)
        p['blink'] = blink_at(t, 1.2)
    elif m == 'dance_s':
        beat = t / 0.4
        sway = math.sin(t / 0.8 * TAU)
        bounce = abs(math.sin(beat * math.pi))
        up_l = max(0.0, math.sin(t / 0.8 * TAU)); up_r = max(0.0, -math.sin(t / 0.8 * TAU))
        p.update(eyes='happy', mouth='open' if int(beat) % 2 == 0 else 'smile', mouth_h=16 + 12 * bounce,
                 body_dy=-16 * bounce + 8, body_dx=18 * sway, torso_rot=5 * sway, head_rot=7 * sway, head_dx=6 * sway,
                 hand_l=(-190 * up_l, -480 * up_l), hand_r=(190 * up_r, -480 * up_r),
                 foot_l=(10 * sway, -30 * max(0.0, -sway)), foot_r=(10 * sway, -30 * max(0.0, sway)))
        notes = [('♪', (155, 123, 255)), ('♫', (79, 179, 255)), ('♪', (255, 120, 160))]
        fx = []
        for i, (ch, col) in enumerate(notes):
            q = ((t / 1.6) + i / 3) % 1.0
            side = -1 if i % 2 == 0 else 1
            fx.append(dict(kind='note', text=ch, color=col, size=70, x=CX + side * (330 + 30 * q) + 18 * math.sin(q * TAU),
                           y=520 - 200 * q, s=0.7 + 0.4 * math.sin(q * math.pi), a=math.sin(q * math.pi) * 1.4))
        p['fx'] = fx
    elif m == 'bow_s':
        k = math.sin(ease(t / L) * math.pi)
        p.update(head_dy=40 * k, head_sy=1 - 0.08 * k, torso_dy=18 * k, body_dy=8 * k, hand_l=(80 * k, -60 * k), hand_r=(-80 * k, -60 * k),
                 eyes='happy', mouth='smile', mouth_h=18 + 8 * k)
        if t > 0.25:
            q = seg(t, 0.25, L)
            p['fx'] = [dict(kind='spark', x=CX - 320 - 40 * q, y=400 - 70 * q, s=0.6 + 0.4 * math.sin(q * math.pi), a=math.sin(q * math.pi), rot=q * 2),
                       dict(kind='heart', x=CX + 340 + 30 * q, y=420 - 90 * q, s=0.45 + 0.3 * q, a=math.sin(q * math.pi))]
    elif m == 'surprise_s':
        hop = math.sin(math.pi * min(t / 0.45, 1))
        pop = back_out(t / 0.45)
        p.update(eyes='wow', mouth='o', dy=-70 * hop, sy=1 + 0.05 * hop, hand_l=(-150 * hop, -320 * hop), hand_r=(150 * hop, -320 * hop),
                 head_s=1 + 0.03 * hop)
        p['fx'] = [dict(kind='notice', x=CX + 330, y=150, s=max(0.05, pop))]
    return p


# ======================================================================================
# 오토바이 캔버스 장면: 세워둔 오토바이 / 하차 (역재생 = 탑승)
# ======================================================================================
STAND_AT = (150, 1385)        # 하차 후 캐릭터가 서는 곳 (오토바이 원본 좌표, 발바닥 중심)
BMOTIONS = {'parked': 1 / FPS, 'dismount': 1.5}
KICK_TOP, KICK_FOOT = (338, 1100), (282, 1302)


class Scene:
    def __init__(self):
        self.R = B.Renderer()
        self.W = Walker(self.R.rig)
        bike, _ = empty_bike(self.R.rig)
        self.empty = bike
        self.empty_pm = B.premult(bike)

    def kickstand(self, deploy):
        """킥스탠드: deploy 0 = 접힘(뒤로 수평), 1 = 내려서 땅에"""
        Wd, Hd = self.R.rig.size
        pt = Painter((Wd, Hd), (150, 1000, 460, 1360))
        ang = math.radians(-70 + 70 * ease(deploy))      # 0° = 똑바로 아래
        L = math.hypot(KICK_FOOT[0] - KICK_TOP[0], KICK_FOOT[1] - KICK_TOP[1])
        base = math.atan2(KICK_FOOT[0] - KICK_TOP[0], KICK_FOOT[1] - KICK_TOP[1])
        a = base + ang
        foot = (KICK_TOP[0] + L * math.sin(a), KICK_TOP[1] + L * math.cos(a))
        pt.limb(KICK_TOP, ((KICK_TOP[0] + foot[0]) / 2, (KICK_TOP[1] + foot[1]) / 2), foot, 11, 9, (52, 46, 45, 255), lw=6)
        pt.ellipse(foot[0] - 6, foot[1] + 4, 26, 11, (52, 46, 45, 255), lw=5)
        layer, pos = pt.done()
        full = Image.new('RGBA', (Wd, Hd), (0, 0, 0, 0))
        full.alpha_composite(layer, pos)
        return full

    def empty_frame(self, p, kick=1.0, lean=0.0):
        """빈 오토바이 (서스펜션 워프 + 킥스탠드 + 기울기)"""
        R = self.R
        cs, off = R.size, R.off
        T = R.transforms(p)
        mx, my, D = R.rig.warp_maps(T)
        img = B.unpremult(B.remap_pm(self.empty_pm, mx, my))
        out = Image.new('RGBA', cs, (0, 0, 0, 0))
        if kick > 0:
            out.alpha_composite(self.kickstand(kick), off)
        out.alpha_composite(img, off)
        if lean:
            out = B.warp(out, cs, B.mat_about((R.cw / 2, off[1] + B.GROUND_Y), lean))
        sh = Image.new('RGBA', cs, (0, 0, 0, 0))
        gx, gy = off[0] + 470, off[1] + B.GROUND_Y
        ImageDraw.Draw(sh).ellipse((gx - 400, gy - 20, gx + 400, gy + 20), fill=(30, 22, 18, 70))
        final = Image.new('RGBA', cs, (0, 0, 0, 0))
        final.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
        final.alpha_composite(out)
        return final

    def place_walker(self, canvas, wimg, at=STAND_AT, dy=0.0):
        R = self.R
        M = B.mat_t(at[0] + R.off[0] - CX, at[1] + R.off[1] - FEET_Y + dy)
        canvas.alpha_composite(B.warp(wimg, R.size, M))

    def cloud(self, canvas, q, center=(440, 600)):
        """만화식 '펑' 먼지 구름 (q: 0→1 진행)"""
        R = self.R
        if q <= 0 or q >= 1:
            return
        items = []
        grow = ease(min(1, q / 0.35))
        fade = 1 - ease(seg(q, 0.45, 1.0))
        for i in range(9):
            a = TAU * i / 9 + 0.3
            r = 150 * grow + 30 * math.sin(i * 1.7)
            items.append(dict(kind='puff', x=center[0] + math.cos(a) * r * 1.3, y=center[1] + math.sin(a) * r * 0.9,
                              r=(70 + 25 * math.sin(i * 2.3)) * (0.5 + 0.7 * grow), a=fade))
        items.append(dict(kind='puff', x=center[0], y=center[1], r=150 * grow, a=fade))
        for i in range(4):
            a = TAU * i / 4 + 0.8
            items.append(dict(kind='spark', x=center[0] + math.cos(a) * 260 * grow, y=center[1] + math.sin(a) * 200 * grow,
                              s=0.8 * fade, a=fade, rot=q * 3))
        R.paste_fx(canvas, items)

    def bike_frame(self, m, t):
        if m == 'parked':
            return self.empty_frame({}, kick=1.0, lean=-2.2)
        # dismount: 웅크림(0~.25) → 튀어오름 + 펑(.25~.45) → 빈 오토바이 + 착지(.45~.95) → 정리(~1.5)
        if t < 0.38:
            crouch = ease(seg(t, 0, 0.25))
            spring = ease(seg(t, 0.25, 0.38))
            p = B.pose('idle_r', (t % 2.4))
            p['rider_dy'] = p.get('rider_dy', 0) + 10 * crouch - 34 * spring
            p['susp_f'] = p.get('susp_f', 0) + 5 * crouch - 3 * spring
            p['susp_r'] = p.get('susp_r', 0) + 6 * crouch - 3 * spring
            p['eyes'], p['mouth'], p['mouth_h'] = ('happy', 'smile', 24) if spring > 0 else ('normal', 'w', 24)
            p['fx'] = []
            img = self.R.frame(p)
            self.cloud(img, seg(t, 0.28, 0.9))
            return img
        # 짐이 빠진 오토바이: 서스펜션이 위로 튀었다 가라앉음
        q = seg(t, 0.38, 1.1)
        reb = -9 * math.sin(math.pi * min(1, q * 1.6)) * math.exp(-2.5 * q)
        img = self.empty_frame({'susp_f': reb, 'susp_r': reb * 1.2}, kick=ease(seg(t, 0.55, 0.85)), lean=-2.2 * ease(seg(t, 0.6, 1.0)))
        # 캐릭터: 포물선 점프 → 착지 스쿼시 → 서기
        if t < 0.75:
            # 구름 옆에서 작게 튀어나와 커지며 가볍게 뛰어 착지 (큰 머리가 화면 밖으로 잘리지 않게 낮게)
            k = seg(t, 0.38, 0.75)
            x = 300 + (STAND_AT[0] - 300) * ease(k)
            y = STAND_AT[1] - 48 * math.sin(math.pi * k)
            wp = wpose('jump_s', 0.45)
            wp.pop('dy', None); wp.pop('fx', None)
            wp.update(hand_l=(-40, -250), hand_r=(40, -250))          # 팔을 반만 들어 캔버스 밖으로 안 나가게
            sc = 0.55 + 0.45 * back_out(k, 1.4)
            wp.update(rot=-10 * (1 - k), sx=sc, sy=sc)
            wimg = self.W.frame(wp)
            if k < 0.2:
                wimg.putalpha(wimg.getchannel('A').point(lambda v: int(v * k / 0.2)))
            self.place_walker(img, wimg, (x, y))
        else:
            k = seg(t, 0.75, 1.1)
            sq = math.sin(math.pi * k) * (1 - k)
            wp = wpose('stand', t)
            wp.update(sy=1 - 0.1 * sq, sx=1 + 0.06 * sq, body_dy=34 * sq)
            if t > 1.0:
                wp.update(eyes='happy', mouth='smile', mouth_h=22)
            fx = []
            if k < 1:
                fx = [dict(kind='dust', x=STAND_AT[0] - 160 - 90 * k, y=STAND_AT[1] - 10, r=26 + 36 * k, a=(1 - k) * 0.9),
                      dict(kind='dust', x=STAND_AT[0] + 160 + 90 * k, y=STAND_AT[1] - 14, r=22 + 30 * k, a=(1 - k) * 0.9)]
            self.place_walker(img, self.W.frame(wp))
            if fx:
                self.R.paste_fx(img, fx)
        self.cloud(img, seg(t, 0.28, 0.9))
        return img


_S = None


def _init():
    global _S
    _S = Scene()


def _task(args):
    kind, name, i, out = args
    t = i / FPS
    img = _S.bike_frame(name, t) if kind == 'bike' else _S.W.frame(wpose(name, t))
    img.save(os.path.join(out, name, f'frame_{i:03d}.png'))
    return name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--empty', help='빈 오토바이 미리보기 저장')
    ap.add_argument('--stand', help='서 있는 캐릭터 미리보기 저장')
    ap.add_argument('--still')
    ap.add_argument('--motion', default='stand')
    ap.add_argument('--t', type=float, default=0.0)
    ap.add_argument('--frames', help='도보 모션 프레임 출력 폴더')
    ap.add_argument('--bike-frames', help='세워둔 오토바이/하차 프레임 출력 폴더')
    ap.add_argument('--only', default='')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    a = ap.parse_args()
    if a.still:
        S = Scene()
        img = S.bike_frame(a.motion, a.t) if a.motion in BMOTIONS else S.W.frame(wpose(a.motion, a.t))
        img.save(a.still)
        return
    if a.frames or a.bike_frames:
        only = [x for x in a.only.split(',') if x]
        tasks = []
        for out, table, kind in ((a.frames, WMOTIONS, 'walk'), (a.bike_frames, BMOTIONS, 'bike')):
            if not out:
                continue
            for name, L in table.items():
                if only and name not in only:
                    continue
                os.makedirs(os.path.join(out, name), exist_ok=True)
                tasks += [(kind, name, i, out) for i in range(max(1, int(round(L * FPS))))]
        import multiprocessing as mp
        done = {}
        with mp.get_context('fork').Pool(a.jobs, initializer=_init) as pool:
            for name in pool.imap_unordered(_task, tasks, chunksize=3):
                done[name] = done.get(name, 0) + 1
        for name, n in done.items():
            print(f'[motion] {name} {n} frames', flush=True)
        return
    R = B.Renderer()
    if a.stand:
        Walker(R.rig).frame({}).save(a.stand)
    if a.empty:
        bike, rm = empty_bike(R.rig)
        bike.save(a.empty)
        rm.save(a.empty.replace('.png', '_removed.png'))


if __name__ == '__main__':
    main()
