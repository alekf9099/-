"""
3D 렌더 프레임 → 앱용 스프라이트 + 배포용 모션 에셋 패킹
=========================================================
  python pack_sprites.py <render_dir> [--app ../src/renderer/sprites] [--out ../motions] [--width 300]

입력: <render_dir>/<motion>/frame_000.png ...  (ride_buddy_3d.py --motions 결과)
출력:
  app 폴더   : <motion>.webp (스프라이트 시트, 알파 포함) + sprites.json
  out 폴더   : <motion>.webp (애니메이션 WebP, 투명) / <motion>.gif (200px) / <motion>_sheet.webp / motions.json
모든 모션은 동일한 크롭 박스를 사용하므로 전환 시 캐릭터 위치가 흔들리지 않습니다.
"""
import argparse
import json
import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
FPS = 15
MOTION_INFO = {
    'ride_r': ('오른쪽으로 주행', True), 'ride_l': ('왼쪽으로 주행', True),
    'idle_r': ('정차 (오른쪽)', True), 'idle_l': ('정차 (왼쪽)', True),
    'face_r': ('오른쪽→정면 돌아보기', False), 'face_l': ('왼쪽→정면 돌아보기', False),
    'front': ('정면 대기', True), 'notify': ('알림 도착', False), 'talk': ('알림 읽어주기', True),
    'happy': ('기쁨', True), 'sleep': ('졸기 (방해 금지)', True), 'turn': ('유턴 (왼→오)', False),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('render_dir')
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument('--app', default=os.path.join(here, '..', 'src', 'renderer', 'sprites'))
    ap.add_argument('--out', default=os.path.join(here, '..', 'motions'))
    ap.add_argument('--width', type=int, default=300)
    a = ap.parse_args()

    motions = [m for m in MOTION_INFO if os.path.isdir(os.path.join(a.render_dir, m))]
    frames = {}
    bbox = None
    for m in motions:
        d = os.path.join(a.render_dir, m)
        fs = sorted(f for f in os.listdir(d) if f.endswith('.png'))
        frames[m] = [Image.open(os.path.join(d, f)).convert('RGBA') for f in fs]
        for im in frames[m]:
            b = im.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox()
            if b:
                bbox = b if bbox is None else (min(bbox[0], b[0]), min(bbox[1], b[1]), max(bbox[2], b[2]), max(bbox[3], b[3]))
    pad = 6
    W0, H0 = frames[motions[0]][0].size
    bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(W0, bbox[2] + pad), min(H0, bbox[3] + pad))
    cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
    scale = min(1.0, a.width / cw)
    fw, fh = round(cw * scale), round(ch * scale)
    print(f'crop {bbox} → frame {fw}x{fh}')

    os.makedirs(a.app, exist_ok=True)
    os.makedirs(a.out, exist_ok=True)
    app_meta = {'fps': FPS, 'frameW': fw, 'frameH': fh, 'motions': {}}
    out_meta = {'fps': FPS, 'frameSize': {'w': fw, 'h': fh}, 'generatedBy': '3d/ride_buddy_3d.py + 3d/pack_sprites.py', 'motions': []}

    for m in motions:
        fr = [im.crop(bbox).resize((fw, fh), Image.LANCZOS) if scale < 1 else im.crop(bbox) for im in frames[m]]
        n = len(fr)
        cols = min(8, n)
        rows = math.ceil(n / cols)
        sheet = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
        for i, im in enumerate(fr):
            sheet.paste(im, ((i % cols) * fw, (i // cols) * fh))
        sheet.save(os.path.join(a.app, f'{m}.webp'), 'WEBP', quality=88, method=6, alpha_quality=100)
        label, loop = MOTION_INFO[m]
        app_meta['motions'][m] = {'file': f'{m}.webp', 'frames': n, 'cols': cols, 'loop': loop}

        # 배포용 에셋
        sheet.save(os.path.join(a.out, f'{m}_sheet.webp'), 'WEBP', quality=88, method=6, alpha_quality=100)
        fr[0].save(os.path.join(a.out, f'{m}.webp'), 'WEBP', save_all=True, append_images=fr[1:], duration=int(1000 / FPS),
                   loop=0, quality=85, method=6, alpha_quality=90)
        gw = 200  # GIF 는 용량 때문에 축소
        gif = [im.resize((gw, round(fh * gw / fw)), Image.LANCZOS) for im in fr]
        g0 = []
        for im in gif:  # GIF: 1비트 투명
            bg = Image.new('RGBA', im.size, (0, 0, 0, 0))
            alpha = im.getchannel('A').point(lambda v: 255 if v > 128 else 0)
            p = im.convert('RGB').quantize(255, method=Image.Quantize.MEDIANCUT)
            p.paste(255, mask=Image.eval(alpha, lambda v: 255 - v))
            p.info['transparency'] = 255
            g0.append(p)
        g0[0].save(os.path.join(a.out, f'{m}.gif'), save_all=True, append_images=g0[1:], duration=int(1000 / FPS),
                   loop=0, transparency=255, disposal=2)
        out_meta['motions'].append({'name': m, 'label': label, 'loop': loop, 'frames': n, 'durationSec': round(n / FPS, 3),
                                    'sheet': {'file': f'{m}_sheet.webp', 'columns': cols, 'rows': rows},
                                    'webp': f'{m}.webp', 'gif': f'{m}.gif'})
        print(f'✔ {m:8s} {n:3d} frames')

    json.dump(app_meta, open(os.path.join(a.app, 'sprites.json'), 'w'), ensure_ascii=False, indent=1)
    # 앱에서 fetch 없이 쓰도록 JS 로도 출력 (file:// + CSP 대응)
    with open(os.path.join(a.app, 'sprites.js'), 'w') as f:
        f.write('window.RIDE_BUDDY_SPRITES = ' + json.dumps(app_meta, ensure_ascii=False) + ';\n')
    json.dump(out_meta, open(os.path.join(a.out, 'motions.json'), 'w'), ensure_ascii=False, indent=2)

    # 앱/트레이 아이콘: 정면 프레임에서 얼굴 부분 크롭
    if 'front' in frames:
        make_icons(frames['front'][0], os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets'))


def make_icons(im, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    b = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    h = b[3] - b[1]
    size = int(h * 0.64)
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
