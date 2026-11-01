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
