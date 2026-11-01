"""폰트 서브셋 빌더 — 게임에 실제로 쓰이는 글자만 남겨 용량 최소화
- 대상 글자: src/**/*.ts, index.html 의 모든 문자 + ASCII + 한글 자모/기호 일부
- Pretendard Variable(본문), Jua(한글 제목), Lilita One(숫자/로고)
사용: python3 tools/fonts.py  (텍스트를 추가/수정했다면 다시 실행)
"""
import glob, io, os
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.merge import Merger

ROOT = __file__.rsplit('/tools/', 1)[0]
NM = f'{ROOT}/node_modules'
OUT = f'{ROOT}/src/fonts'

chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set('·…→←↑↓▲▼★☆◆◇●○■□※“”‘’「」『』%+−×÷~₩')
for f in glob.glob(f'{ROOT}/src/**/*.ts', recursive=True) + [f'{ROOT}/index.html']:
    chars |= set(open(f, encoding='utf-8').read())
chars = {c for c in chars if c.isprintable() and ord(c) < 0x1F000}  # 이모지는 시스템 폰트로
text = ''.join(sorted(chars))
print('glyph chars:', len(text))


def subset_font(src_font: TTFont, out_path: str, keep_var=True):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(src_font)
    src_font.flavor = 'woff2'
    src_font.save(out_path)
    print(os.path.basename(out_path), round(os.path.getsize(out_path) / 1024), 'KB')


# Pretendard Variable
subset_font(TTFont(f'{NM}/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'), f'{OUT}/pretendard-game.woff2')

# Jua: fontsource가 유니코드 범위별로 쪼갠 조각 → 필요한 글자를 가진 조각만 골라 병합
needed = set(ord(c) for c in text)
pieces = []
for p in sorted(glob.glob(f'{NM}/@fontsource/jua/files/jua-*-400-normal.woff2')):
    f = TTFont(p)
    cmap = set(f.getBestCmap().keys())
    if cmap & needed:
        f.flavor = None
        buf = io.BytesIO(); f.save(buf); buf.seek(0)
        pieces.append(buf)
print('jua pieces used:', len(pieces))
merged = Merger().merge(pieces)
subset_font(merged, f'{OUT}/jua-game.woff2')

# Lilita One (라틴)
lil = sorted(glob.glob(f'{NM}/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2'))[0]
subset_font(TTFont(lil), f'{OUT}/lilita-game.woff2')
