"""PDF 워터마크 제거.

적용 순서 (모두 원본 벡터/텍스트를 그대로 유지하는 '비파괴' 방식)
1. 워터마크 주석(/Watermark annotation) 삭제, 키워드가 들어간 스탬프·텍스트 주석 삭제
2. 표준 워터마크 태그 삭제 : /Artifact <</Subtype /Watermark>> BDC … EMC (Acrobat·Word·대부분 PDF 도구)
3. 이름에 'watermark' / 키워드가 들어간 레이어(OCG) 콘텐츠 삭제
4. 키워드와 일치하는 텍스트 오브젝트의 글자 그리기 명령 삭제 (ToUnicode 해석 → 한글 지원)
5. [aggressive] 대각선으로 회전된 텍스트, 반투명 텍스트·이미지 삭제
6. [repeated_images] 대부분의 페이지에 반복되는 동일 이미지 삭제
7. [raster] 스캔 PDF: 페이지를 렌더링 후 이미지 방식으로 정리하여 재조립
"""
from __future__ import annotations

import math
import re

import pikepdf
from pikepdf import Name, Dictionary, Array, Operator

from .core import Options, Report

TEXT_SHOW_OPS = {"Tj", "TJ", "'", '"'}
WM_WORDS = ("watermark", "워터마크")


# ------------------------------------------------------------ ToUnicode
_HEX = re.compile(rb"<([0-9A-Fa-f]+)>")


def _hex_to_text(h: bytes) -> str:
    b = bytes.fromhex(h.decode())
    try:
        return b.decode("utf-16-be")
    except UnicodeDecodeError:
        return b.decode("latin-1")


def parse_tounicode(data: bytes) -> tuple[dict[bytes, str], int]:
    """ToUnicode CMap의 bfchar / bfrange 해석 → {코드바이트: 문자}, 코드 길이."""
    cmap: dict[bytes, str] = {}
    width = 1
    for block in re.findall(rb"beginbfchar(.*?)endbfchar", data, re.S):
        hexes = _HEX.findall(block)
        for src, dst in zip(hexes[0::2], hexes[1::2]):
            width = max(width, len(src) // 2)
            cmap[bytes.fromhex(src.decode())] = _hex_to_text(dst)
    for block in re.findall(rb"beginbfrange(.*?)endbfrange", data, re.S):
        for line in block.strip().splitlines():
            parts = _HEX.findall(line)
            if len(parts) < 3:
                continue
            lo, hi = int(parts[0], 16), int(parts[1], 16)
            n = len(parts[0]) // 2
            width = max(width, n)
            if b"[" in line:
                for i, dst in enumerate(parts[2:]):
                    cmap[(lo + i).to_bytes(n, "big")] = _hex_to_text(dst)
            else:
                start = bytes.fromhex(parts[2].decode())
                for i in range(min(hi - lo + 1, 65536)):
                    val = (int.from_bytes(start, "big") + i).to_bytes(len(start), "big")
                    try:
                        cmap[(lo + i).to_bytes(n, "big")] = val.decode("utf-16-be")
                    except UnicodeDecodeError:
                        pass
    return cmap, width


class FontDecoder:
    def __init__(self, font):
        self.cmap, self.width = {}, 1
        self.utf16 = False
        try:
            if font is not None and "/ToUnicode" in font:
                self.cmap, self.width = parse_tounicode(font.ToUnicode.read_bytes())
            elif font is not None:
                # 한/중/일 표준 CMap (UniKS-UTF16-H, UniGB-UCS2-H 등)은 코드 자체가 UTF-16
                enc = str(font.get("/Encoding", ""))
                self.utf16 = enc.startswith("/Uni") and ("UTF16" in enc or "UCS2" in enc)
        except Exception:
            pass

    def decode(self, raw: bytes) -> str:
        if self.utf16:
            return raw.decode("utf-16-be", "ignore")
        if not self.cmap:
            if raw[:2] == b"\xfe\xff":
                return raw[2:].decode("utf-16-be", "ignore")
            return raw.decode("latin-1")
        out, i, w = [], 0, self.width
        while i < len(raw):
            chunk = raw[i:i + w]
            if chunk in self.cmap:
                out.append(self.cmap[chunk]); i += w
            elif raw[i:i + 1] in self.cmap:
                out.append(self.cmap[raw[i:i + 1]]); i += 1
            else:
                i += w
        return "".join(out)


# ------------------------------------------------------------ helpers
def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s).lower()


def _matches(text: str, keywords: list[str]) -> bool:
    t = _norm(text)
    return bool(t) and any(_norm(k) in t for k in keywords if k.strip())


def _is_wm_name(s: str, keywords: list[str]) -> bool:
    low = s.lower()
    return any(w in low for w in WM_WORDS) or _matches(s, keywords)


def _rotated(m) -> bool:
    """행렬 [a b c d e f]이 0/90/180/270도가 아닌 각도로 회전되어 있는지."""
    a, b = float(m[0]), float(m[1])
    if abs(a) < 1e-9 and abs(b) < 1e-9:
        return False
    ang = math.degrees(math.atan2(b, a)) % 90
    return 3 < ang < 87


def _mul(m1, m2):
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (a1 * a2 + b1 * c2, a1 * b2 + b1 * d2, c1 * a2 + d1 * c2,
            c1 * b2 + d1 * d2, e1 * a2 + f1 * c2 + e2, e1 * b2 + f1 * d2 + f2)


def _resource(resources, cat: str, name):
    try:
        return resources[cat][name]
    except Exception:
        return None


def _bdc_props(resources, operand):
    if isinstance(operand, Dictionary):
        return operand
    if isinstance(operand, Name):
        return _resource(resources, "/Properties", operand)
    return None


def _is_wm_marked(tag, props, keywords) -> bool:
    if props is None:
        return False
    try:
        if str(tag) == "/Artifact":
            if str(props.get("/Subtype", "")) == "/Watermark":
                return True
            if str(props.get("/Type", "")) == "/Pagination" and str(props.get("/Subtype", "")) == "/Watermark":
                return True
        if str(tag) == "/OC":
            name = props.get("/Name")
            if name is not None and _is_wm_name(str(name), keywords):
                return True
    except Exception:
        pass
    return False


# ------------------------------------------------------------ content filter
class StreamCleaner:
    def __init__(self, pdf: pikepdf.Pdf, options: Options, report: Report, drop_images: set):
        self.pdf = pdf
        self.opt = options
        self.report = report
        self.drop_images = drop_images  # objgen 집합
        self.done_forms: set = set()

    def clean(self, owner, resources) -> None:
        """owner: Page 또는 Form XObject."""
        try:
            instructions = pikepdf.parse_content_stream(owner)
        except Exception as e:  # 손상된 스트림은 건드리지 않음
            self.report.notes.append(f"콘텐츠 해석 실패(건너뜀): {e}")
            return
        new, changed = self._filter(instructions, resources)
        if changed:
            data = pikepdf.unparse_content_stream(new)
            if isinstance(owner, pikepdf.Page):
                owner.obj.Contents = self.pdf.make_stream(data)
            else:
                owner.write(data)
        # 하위 Form XObject 재귀 처리
        xobjs = resources.get("/XObject") if resources is not None else None
        if xobjs is not None:
            for _, xo in xobjs.items():
                try:
                    if xo.get("/Subtype") != "/Form" or xo.objgen in self.done_forms:
                        continue
                    self.done_forms.add(xo.objgen)
                    self.clean(xo, xo.get("/Resources", resources))
                except Exception:
                    continue

    def _filter(self, instructions, resources):
        kw = self.opt.keywords
        aggressive = self.opt.aggressive
        out = []
        changed = False

        mc_stack: list[bool] = []      # BMC/BDC 중첩: 워터마크 태그 여부
        drop_depth = 0                 # 워터마크 마크드 콘텐츠 내부 깊이
        gstack = [(1.0, (1, 0, 0, 1, 0, 0))]  # (alpha, ctm)
        in_text = False
        text_ops: list = []            # 현재 BT 블록의 명령
        text_str = []
        text_rot = False
        font_dec = FontDecoder(None)
        dec_cache: dict = {}

        def flush_text_block():
            nonlocal changed
            alpha, ctm = gstack[-1]
            text = "".join(text_str)
            drop = False
            reason = ""
            if kw and _matches(text, kw):
                drop, reason = True, "키워드 일치 텍스트"
            elif aggressive and (text_rot or _rotated(ctm)) and text.strip():
                drop, reason = True, "회전된(대각선) 텍스트"
            elif aggressive and alpha < 0.95 and text.strip():
                drop, reason = True, "반투명 텍스트"
            if drop:
                changed = True
                self.report.add(reason)
                # 글꼴/색 등 상태 명령은 유지하고 '그리기'만 삭제 → 뒤 텍스트 상태 보존
                out.extend(i for i in text_ops if str(i.operator) not in TEXT_SHOW_OPS)
            else:
                out.extend(text_ops)

        for ins in instructions:
            if isinstance(ins, pikepdf.ContentStreamInlineImage):
                if drop_depth:
                    changed = True
                    continue
                (text_ops if in_text else out).append(ins)
                continue
            op = str(ins.operator)
            operands = ins.operands

            # --- 마크드 콘텐츠
            if op in ("BMC", "BDC"):
                props = _bdc_props(resources, operands[1]) if op == "BDC" and len(operands) > 1 else None
                is_wm = drop_depth > 0 or _is_wm_marked(operands[0] if operands else None, props, kw)
                mc_stack.append(is_wm)
                if is_wm:
                    if drop_depth == 0:
                        self.report.add("워터마크 태그 블록(/Artifact·레이어)")
                    drop_depth += 1
                    changed = True
                    continue
            elif op == "EMC":
                was_wm = mc_stack.pop() if mc_stack else False
                if was_wm:
                    drop_depth -= 1
                    continue
            if drop_depth:
                # 워터마크 내부라도 q/Q 균형은 그래픽 상태에 영향 → 함께 삭제해도 블록 단위라 안전
                continue

            # --- 그래픽 상태
            if op == "q":
                gstack.append(gstack[-1])
            elif op == "Q":
                if len(gstack) > 1:
                    gstack.pop()
            elif op == "cm" and len(operands) == 6:
                a, c = gstack[-1]
                gstack[-1] = (a, _mul(tuple(float(x) for x in operands), c))
            elif op == "gs" and operands:
                gs = _resource(resources, "/ExtGState", operands[0])
                if gs is not None:
                    a = min(float(gs.get("/ca", 1)), float(gs.get("/CA", 1)))
                    gstack[-1] = (a, gstack[-1][1])

            # --- 텍스트 블록
            if op == "BT":
                in_text, text_ops, text_str, text_rot = True, [ins], [], False
                continue
            if in_text:
                text_ops.append(ins)
                if op == "Tf" and operands:
                    fname = operands[0]
                    key = str(fname)
                    if key not in dec_cache:
                        dec_cache[key] = FontDecoder(_resource(resources, "/Font", fname))
                    font_dec = dec_cache[key]
                elif op == "Tm" and len(operands) == 6:
                    text_rot = text_rot or _rotated(operands)
                elif op in ("Tj", "'", '"') and operands:
                    s = operands[-1]
                    if isinstance(s, pikepdf.String):
                        text_str.append(font_dec.decode(bytes(s)))
                elif op == "TJ" and operands:
                    for el in operands[0]:
                        if isinstance(el, pikepdf.String):
                            text_str.append(font_dec.decode(bytes(el)))
                if op == "ET":
                    in_text = False
                    flush_text_block()
                continue

            # --- 이미지 XObject
            if op == "Do" and operands:
                xo = _resource(resources, "/XObject", operands[0])
                if xo is not None and xo.get("/Subtype") == "/Image":
                    if xo.objgen in self.drop_images:
                        self.report.add("반복 이미지(로고)")
                        changed = True
                        continue
                    if aggressive and gstack[-1][0] < 0.95:
                        self.report.add("반투명 이미지")
                        changed = True
                        continue
                elif xo is not None and xo.get("/Subtype") == "/Form":
                    # 이름이 워터마크인 폼, 또는 OC가 워터마크 레이어인 폼
                    oc = xo.get("/OC")
                    oc_name = str(oc.get("/Name", "")) if isinstance(oc, Dictionary) else ""
                    if _is_wm_name(str(operands[0]).lstrip("/"), []) or (oc_name and _is_wm_name(oc_name, kw)):
                        self.report.add("워터마크 폼 오브젝트")
                        changed = True
                        continue
            out.append(ins)

        if in_text:  # 비정상 종료된 BT
            out.extend(text_ops)
        return out, changed


# ------------------------------------------------------------ annotations
def _clean_annots(page: pikepdf.Page, options: Options, report: Report) -> None:
    annots = page.obj.get("/Annots")
    if annots is None:
        return
    keep = Array()
    for a in annots:
        try:
            st = str(a.get("/Subtype", ""))
            contents = str(a.get("/Contents", "")) + str(a.get("/NM", "")) + str(a.get("/T", ""))
            drop = st == "/Watermark"
            drop = drop or (options.keywords and st in ("/Stamp", "/FreeText", "/Text")
                            and _matches(contents, options.keywords))
            drop = drop or (options.aggressive and st == "/Stamp")
            if drop:
                report.add("워터마크/스탬프 주석")
                continue
        except Exception:
            pass
        keep.append(a)
    if len(keep) != len(annots):
        if len(keep):
            page.obj.Annots = keep
        else:
            del page.obj["/Annots"]


def _wm_ocgs(pdf: pikepdf.Pdf, keywords) -> int:
    """워터마크 레이어(OCG)를 꺼짐(OFF)으로 설정 — 다른 뷰어에서도 숨김."""
    try:
        ocp = pdf.Root.OCProperties
    except (AttributeError, KeyError):
        return 0
    targets = [g for g in ocp.get("/OCGs", []) if _is_wm_name(str(g.get("/Name", "")), keywords)]
    if not targets:
        return 0
    d = ocp.D
    off = d.get("/OFF", Array())
    on = d.get("/ON")
    for g in targets:
        off.append(g)
        if on is not None:
            d.ON = Array([x for x in on if x.objgen != g.objgen])
    d.OFF = off
    return len(targets)


def _repeated_image_set(pdf: pikepdf.Pdf) -> set:
    from collections import Counter
    cnt: Counter = Counter()
    n = len(pdf.pages)
    for page in pdf.pages:
        seen = set()
        res = page.obj.get("/Resources")
        xobjs = res.get("/XObject") if res is not None else None
        if xobjs is None:
            continue
        for _, xo in xobjs.items():
            if xo.get("/Subtype") == "/Image":
                seen.add(xo.objgen)
        cnt.update(seen)
    need = max(2, math.ceil(n * 0.6))
    return {og for og, c in cnt.items() if c >= need} if n >= 2 else set()


# ------------------------------------------------------------ raster mode
def _raster(src: str, dst: str, options: Options, report: Report) -> None:
    import fitz  # PyMuPDF
    import numpy as np
    import cv2
    from .image import clean_image

    doc = fitz.open(src)
    if doc.needs_pass and not doc.authenticate(options.password or ""):
        raise ValueError("암호가 걸린 PDF입니다. 정당한 암호를 --password 로 입력하세요.")
    out = fitz.open()
    zoom = options.raster_dpi / 72
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        cleaned = clean_image(bgr, options, report)
        ok, png = cv2.imencode(".png", cleaned)
        np_page = out.new_page(width=page.rect.width, height=page.rect.height)
        np_page.insert_image(np_page.rect, stream=png.tobytes())
    out.save(dst, garbage=3, deflate=True)
    report.notes.append(f"래스터 모드: {len(doc)}페이지를 {options.raster_dpi}DPI 이미지로 재구성 (텍스트 선택 불가)")


# ------------------------------------------------------------ entry
def process(src: str, dst: str, options: Options, report: Report) -> None:
    if options.raster:
        _raster(src, dst, options, report)
        return
    try:
        pdf = pikepdf.open(src, password=options.password or "")
    except pikepdf.PasswordError:
        raise ValueError("암호가 걸린 PDF입니다. 정당한 암호를 --password 로 입력하세요.")
    with pdf:
        if pdf.is_encrypted and not options.password:
            raise ValueError("암호화된 PDF는 문서 소유자의 암호(--password)가 필요합니다.")
        report.add("워터마크 레이어 숨김", _wm_ocgs(pdf, options.keywords))
        drop_images = _repeated_image_set(pdf) if options.repeated_images else set()
        cleaner = StreamCleaner(pdf, options, report, drop_images)
        for page in pdf.pages:
            _clean_annots(page, options, report)
            res = page.obj.get("/Resources", Dictionary())
            cleaner.clean(page, res)
        pdf.save(dst)

    if report.total == 0:
        _hint_scanned(src, report)


def _hint_scanned(src: str, report: Report) -> None:
    try:
        import fitz
        with fitz.open(src) as d:
            if d.page_count and not any(p.get_text().strip() for p in d):
                report.notes.append("텍스트가 없는 스캔 PDF로 보입니다 → --raster 옵션을 사용하세요.")
    except Exception:
        pass
