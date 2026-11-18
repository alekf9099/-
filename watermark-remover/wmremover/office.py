"""Office(OOXML) 문서 워터마크 제거: DOCX / PPTX / XLSX.

OOXML은 ZIP + XML 이므로, 워터마크를 이루는 XML 요소만 정확히 삭제하고 나머지는 바이트 그대로 유지한다.
"""
from __future__ import annotations

import re
import zipfile

from lxml import etree

from .core import Options, Report

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "v": "urn:schemas-microsoft-com:vml",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
WM_ID = re.compile(r"(PowerPlusWaterMark|WordPictureWatermark|watermark|워터마크)", re.I)


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s or "").lower()


def _kw_match(text: str, keywords) -> bool:
    t = _norm(text)
    return bool(t) and any(_norm(k) in t for k in keywords if k.strip())


def _rewrite_zip(src: str, dst: str, editor) -> None:
    """editor(name, bytes) -> bytes | None(변경 없음)."""
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            new = editor(info.filename, data)
            zout.writestr(info, new if new is not None else data)


def _parse(data: bytes):
    return etree.fromstring(data, etree.XMLParser(remove_blank_text=False, huge_tree=True))


def _dump(root) -> bytes:
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def _remove(el) -> None:
    parent = el.getparent()
    if parent is not None:
        # tail 텍스트 보존
        if el.tail:
            prev = el.getprevious()
            if prev is not None:
                prev.tail = (prev.tail or "") + el.tail
            else:
                parent.text = (parent.text or "") + el.tail
        parent.remove(el)


def _texts(el) -> str:
    parts = [t.text or "" for t in el.iter("{%s}t" % NS["w"], "{%s}t" % NS["a"])]
    parts += [tp.get("string", "") for tp in el.iter("{%s}textpath" % NS["v"])]
    return "".join(parts)


# =================================================================== DOCX
def _docx_graphic_is_wm(el, keywords, aggressive, in_header) -> bool:
    for node in el.iter():
        for attr in ("id", "name", "{urn:schemas-microsoft-com:office:office}spid"):
            if WM_ID.search(node.get(attr, "") or ""):
                return True
        if node.tag == "{%s}textpath" % NS["v"] and keywords and _kw_match(node.get("string", ""), keywords):
            return True
    if keywords and _kw_match(_texts(el), keywords):
        return True
    if aggressive and in_header:
        # 헤더에 '글 뒤로' 배치된 그림/도형 또는 VML 워드아트 = 전형적인 워터마크
        for anchor in el.iter("{%s}anchor" % NS["wp"]):
            if anchor.get("behindDoc") == "1":
                return True
        if any(True for _ in el.iter("{%s}textpath" % NS["v"])):
            return True
    return False


def _clean_docx_part(root, keywords, aggressive, in_header, report: Report) -> bool:
    w = NS["w"]
    changed = False
    # 1) Word '워터마크' 갤러리 SDT 블록
    for sdt in list(root.iter("{%s}sdt" % w)):
        for g in sdt.iter("{%s}docPartGallery" % w):
            if "watermark" in (g.get("{%s}val" % w, "") or "").lower():
                _remove(sdt); report.add("워터마크 블록(SDT)"); changed = True
                break
    # 2) 그래픽 요소(VML pict / DrawingML / AlternateContent)
    graphic_tags = ["{%s}AlternateContent" % NS["mc"], "{%s}pict" % w, "{%s}drawing" % w, "{%s}object" % w]
    for tag in graphic_tags:
        for el in list(root.iter(tag)):
            if el.getparent() is None:
                continue
            # AlternateContent 안의 pict/drawing은 AlternateContent 단위로 처리
            if tag != graphic_tags[0] and any(a.tag == graphic_tags[0] for a in el.iterancestors()):
                continue
            if _docx_graphic_is_wm(el, keywords, aggressive, in_header):
                _remove(el); report.add("워터마크 도형/워드아트/그림"); changed = True
    # 3) 머리글·바닥글에서 키워드만 있는 텍스트 런
    if in_header and keywords:
        for run in list(root.iter("{%s}r" % w)):
            t = "".join(x.text or "" for x in run.iter("{%s}t" % w))
            if t.strip() and _kw_match(t, keywords):
                _remove(run); report.add("머리글/바닥글 키워드 텍스트"); changed = True
    # 4) 페이지 배경(색/그림)
    if aggressive:
        for bg in list(root.iter("{%s}background" % w)):
            _remove(bg); report.add("페이지 배경"); changed = True
    return changed


def process_docx(src: str, dst: str, options: Options, report: Report) -> None:
    def edit(name: str, data: bytes):
        m = re.match(r"word/(document|header\d*|footer\d*)\.xml$", name)
        if not m:
            return None
        root = _parse(data)
        in_header = not m.group(1).startswith("document")
        if _clean_docx_part(root, options.keywords, options.aggressive, in_header, report):
            return _dump(root)
        return None
    _rewrite_zip(src, dst, edit)


# =================================================================== PPTX
def process_pptx(src: str, dst: str, options: Options, report: Report) -> None:
    from pptx import Presentation
    from pptx.util import Emu  # noqa: F401  (python-pptx 존재 확인용)

    prs = Presentation(src)
    containers = []
    for master in prs.slide_masters:
        containers.append(master)
        containers.extend(master.slide_layouts)
    containers.extend(prs.slides)

    for c in containers:
        for shape in list(c.shapes):
            el = shape._element
            name = shape.name or ""
            text = _texts(el)
            drop = bool(WM_ID.search(name))
            drop = drop or (options.keywords and _kw_match(text, options.keywords))
            if not drop and options.aggressive:
                rot = (shape.rotation or 0) % 90
                if text.strip() and 3 < rot < 87:
                    drop = True  # 대각선 텍스트
                elif el.find(".//{%s}alphaModFix" % NS["a"]) is not None:
                    drop = True  # 반투명 이미지(로고)
                elif text.strip() and el.find(".//{%s}alpha" % NS["a"]) is not None:
                    drop = True  # 반투명 텍스트
            if drop:
                el.getparent().remove(el)
                report.add("워터마크 도형/텍스트/이미지")
    prs.save(dst)


# =================================================================== XLSX
_HF_IMG = re.compile(r"&G")


def process_xlsx(src: str, dst: str, options: Options, report: Report) -> None:
    x = NS["x"]

    def edit(name: str, data: bytes):
        if not re.match(r"xl/(worksheets|chartsheets)/sheet\d+\.xml$", name):
            return None
        root = _parse(data)
        changed = False
        # 1) 머리글/바닥글 그림(엑셀의 '워터마크' 방식)
        for el in list(root.iter("{%s}legacyDrawingHF" % x)):
            _remove(el); report.add("머리글/바닥글 그림 워터마크"); changed = True
        for hf in root.iter("{%s}headerFooter" % x):
            for part in hf:
                if part.text and (_HF_IMG.search(part.text) or (options.keywords and _kw_match(part.text, options.keywords))):
                    new = _HF_IMG.sub("", part.text)
                    for k in options.keywords:
                        if k.strip():
                            new = re.sub(re.escape(k), "", new, flags=re.I)
                    if new != part.text:
                        part.text = new; changed = True
                        report.add("머리글/바닥글 워터마크 코드")
        # 2) 시트 배경 그림
        for el in list(root.iter("{%s}picture" % x)):
            _remove(el); report.add("시트 배경 그림"); changed = True
        return _dump(root) if changed else None

    _rewrite_zip(src, dst, edit)
    if options.aggressive or options.keywords:
        _xlsx_shapes(dst, options, report)


def _xlsx_shapes(path: str, options: Options, report: Report) -> None:
    """드로잉(도형/텍스트상자/워드아트) 중 워터마크 삭제."""
    import os
    import shutil
    import tempfile
    xdr = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"

    def edit(name: str, data: bytes):
        if not re.match(r"xl/drawings/drawing\d+\.xml$", name):
            return None
        root = _parse(data)
        changed = False
        for anchor in list(root):
            if not anchor.tag.startswith("{%s}" % xdr):
                continue
            names = " ".join(n.get("name", "") for n in anchor.iter("{%s}cNvPr" % xdr))
            text = _texts(anchor)
            drop = bool(WM_ID.search(names)) or (options.keywords and _kw_match(text, options.keywords))
            if not drop and options.aggressive:
                drop = anchor.find(".//{%s}alphaModFix" % NS["a"]) is not None
            if drop:
                _remove(anchor); report.add("워터마크 도형/텍스트상자"); changed = True
        return _dump(root) if changed else None

    fd, tmp = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    try:
        _rewrite_zip(path, tmp, edit)
        shutil.move(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
