"""ECHOLING UI 에셋 파이프라인 (Canva 내보내기 → 게임 에셋)
- 아이콘 시트(6열, 512px 셀, 흰 배경) → 투명 WebP (노드/아이템 192px, 속성 96px)
- 배경 시트(1080x1920 x 4, 가로 배치) → 720x1280 WebP
사용: python3 tools/ui_assets.py
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = __file__.rsplit('/tools/', 1)[0]
media = json.load(open(f'{ROOT}/art/canva-ui-media.json'))


def cutout(img: np.ndarray, thr: int = 14) -> Image.Image:
    dist = 255 - img.min(axis=2)
    lab, _ = ndimage.label(dist < thr)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    obj = ndimage.binary_fill_holes(ndimage.binary_closing(~bg, iterations=3))
    bg = ~obj
    band = ndimage.binary_dilation(bg, iterations=2) & ~bg
    alpha = np.ones(dist.shape, np.float32)
    alpha[bg] = 0
    soft = np.clip((dist - 4) / 40.0, 0, 1)
    alpha[band] = soft[band]
    alpha = ndimage.gaussian_filter(alpha, 0.6) * (~bg | band)
    a = np.clip(alpha, 1e-3, 1)[..., None]
    rgb = np.clip((img - (1 - a) * 255) / a, 0, 255)
    im = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
    bbox = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    im = im.crop(bbox)
    w, h = im.size
    side = int(max(w, h) * 1.04)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    return canvas


sheet = np.asarray(Image.open(f'{ROOT}/art/ui-icons-3072.webp').convert('RGB')).astype(np.float32)
for i, name in enumerate(media['icons'].keys()):
    r, c = divmod(i, 6)
    cell = sheet[r * 512:(r + 1) * 512, c * 512:(c + 1) * 512]
    size = 96 if name.startswith('el_') else 192
    cutout(cell).resize((size, size), Image.LANCZOS).save(f'{ROOT}/public/ui/{name}.webp', 'WEBP', quality=90, method=6)
    print('icon', name)

bgs = Image.open(f'{ROOT}/art/ui-bg-4320.jpg').convert('RGB')
for i, name in enumerate(media['backgrounds'].keys()):
    bgs.crop((i * 1080, 0, (i + 1) * 1080, 1920)).resize((720, 1280), Image.LANCZOS).save(f'{ROOT}/public/ui/{name}.webp', 'WEBP', quality=80, method=6)
    print('bg', name)

# 부적 아이콘: 4개 시트(각 1264px, 3x3) 가로 배치 → 셀별 배경 제거
charms = np.asarray(Image.open(f'{ROOT}/art/charm-icons-5056.webp').convert('RGB')).astype(np.float32)
CELL = 1264 / 3
for i, name in enumerate(media['charmOrder']):
    if name.startswith('_'):
        continue
    sheet_i, k = divmod(i, 9)
    r, c = divmod(k, 3)
    x0 = int(sheet_i * 1264 + c * CELL); y0 = int(r * CELL)
    cell = charms[y0:y0 + int(CELL), x0:x0 + int(CELL)]
    cutout(cell).resize((128, 128), Image.LANCZOS).save(f'{ROOT}/public/ui/charm_{name}.webp', 'WEBP', quality=90, method=6)
    print('charm', name)

# 전투 이펙트 텍스처 (v0.6): 3x3 시트(1264px). 빛·연기류는 흰 배경에 부드럽게 번진 형태라
# 일반 컷아웃 대신 color-to-alpha(흰색 키)로 반투명 글로우를 보존하고, 밝은 코어는 채워서 유지한다.
GLOW = {'fire', 'spark', 'wind', 'wisp', 'star', 'burst'}


def white_key(img: np.ndarray, radial: float = 0) -> Image.Image:
    a = (255 - img.min(axis=2)) / 255.0
    a = np.clip((a - 0.03) / 0.97, 0, 1)
    if radial:  # 흰 코어가 광선 사이로 배경과 이어진 폭발형: 중심 방사형 알파로 코어 복원
        h, w = a.shape
        yy, xx = np.mgrid[0:h, 0:w]
        d = np.hypot((yy - h / 2) / (h / 2), (xx - w / 2) / (w / 2)) / radial
        a = np.maximum(a, np.clip(1 - d, 0, 1) ** 0.8)
    core = ndimage.binary_fill_holes(ndimage.binary_closing(a > 0.35, iterations=4))
    core = ndimage.binary_erosion(core, iterations=3)
    a = np.maximum(a, ndimage.gaussian_filter(core.astype(np.float32), 4) * 0.97)
    aa = np.clip(a, 1e-3, 1)[..., None]
    rgb = np.clip((img - (1 - aa) * 255) / aa, 0, 255)
    im = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')
    bbox = im.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    im = im.crop(bbox)
    w, h = im.size
    side = int(max(w, h) * 1.04)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    return canvas


import os
os.makedirs(f'{ROOT}/public/fx', exist_ok=True)
vfx = np.asarray(Image.open(f'{ROOT}/art/vfx-1264.webp').convert('RGB')).astype(np.float32)
for i, name in enumerate(media['vfxSheet']['order']):
    r, c = divmod(i, 3)
    x0 = int(c * CELL) + 6; y0 = int(r * CELL) + 6
    cell = vfx[y0:y0 + int(CELL) - 12, x0:x0 + int(CELL) - 12]
    out = (white_key(cell, 0.42 if name == 'burst' else 0)) if name in GLOW else cutout(cell)
    out.resize((160, 160), Image.LANCZOS).save(f'{ROOT}/public/fx/fx_{name}.webp', 'WEBP', quality=88, method=6)
    print('fx', name)
