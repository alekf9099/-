"""ECHOLING 스프라이트 파이프라인
Canva에서 내보낸 6x6 시트(흰 배경) → 종별 투명 WebP

1) 512px 셀로 자르기
2) 테두리에서 시작하는 flood fill로 '배경 흰색' 영역만 선택 (캐릭터 내부 흰색은 보존)
3) 경계 2px 띠에 부드러운 알파 + 흰 테두리(halo) 제거(언프리멀티플라이)
4) 여백 자동 크롭 → 정사각 캔버스 중앙/하단 정렬 → 384px WebP
"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1]
OUT = sys.argv[2]
ORDER = list(json.load(open(sys.argv[3])).keys())
CELL = 512
SIZE = 384
STRICT = {'cloudlamb': 3, 'puffeather': 8, 'starbun': 8, 'halorion': 8}

sheet = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)

for i, name in enumerate(ORDER):
    r, c = divmod(i, 6)
    img = sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL]
    # 흰색으로부터의 거리 (0 = 순백)
    dist = 255 - img.min(axis=2)
    # 흰 털 캐릭터는 배경 판정을 엄격하게 (털이 배경으로 새는 것 방지)
    thr = STRICT.get(name, 14)
    near_white = dist < thr
    lab, _ = ndimage.label(near_white)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    # 물체 마스크 닫기 + 구멍 메우기 → 배경이 좁은 틈으로 파고든 부분 복구
    obj = ndimage.binary_closing(~bg, iterations=3)
    obj = ndimage.binary_fill_holes(obj)
    bg = ~obj
    # 배경과 맞닿은 경계 띠에서만 부드러운 알파
    band = ndimage.binary_dilation(bg, iterations=2) & ~bg
    alpha = np.ones(dist.shape, np.float32)
    alpha[bg] = 0
    soft = np.clip((dist - 4) / 40.0, 0, 1)
    alpha[band] = soft[band]
    alpha = ndimage.gaussian_filter(alpha, 0.6) * (~bg | band)
    # 흰 halo 제거: c = (c_obs - (1-a)*255) / a
    a = np.clip(alpha, 1e-3, 1)[..., None]
    rgb = np.clip((img - (1 - a) * 255) / a, 0, 255)
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    bbox = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    im = im.crop(bbox)
    # 정사각 캔버스: 가로 중앙, 세로는 하단 정렬(발이 바닥에)
    w, h = im.size
    side = int(max(w, h) * 1.06)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, side - h - int(side * 0.03)))
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    canvas.save(f'{OUT}/{name}.webp', 'WEBP', quality=88, method=6)
    print(name, bbox, 'bg%.0f%%' % (bg.mean() * 100))
