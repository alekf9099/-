"""형식별 워터마크 제거 테스트 — 샘플 문서를 직접 만들어 검증한다."""
import os
import re
import zipfile

import cv2
import fitz
import numpy as np
import pytest

from wmremover import Options, remove_watermark

BODY = "Quarterly report body text"


# ------------------------------------------------------------------ PDF
def _pdf_artifact(path):
    """표준 /Artifact Watermark 태그 워터마크."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), BODY, fontsize=12)
    xref = page.get_contents()[0]
    wm = (b"/Artifact <</Subtype /Watermark /Type /Pagination>> BDC q BT /helv 48 Tf "
          b"1 0 0 1 100 400 Tm (TOPSECRET) Tj ET Q EMC\n")
    doc.update_stream(xref, doc.xref_stream(xref) + b"\n" + wm)
    # 폰트 리소스 이름 맞추기
    page.insert_text((72, 120), "x", fontsize=1, fontname="helv")
    doc.save(path)


def _pdf_rotated(path, word="CONFIDENTIAL"):
    doc = fitz.open()
    for _ in range(2):
        page = doc.new_page()
        page.insert_text((72, 100), BODY, fontsize=12)
        page.insert_text((150, 500), word, fontsize=60, rotate=0,
                         morph=(fitz.Point(150, 500), fitz.Matrix(45)), fill_opacity=0.3,
                         color=(0.6, 0.6, 0.6))
    doc.save(path)


def _pdf_korean(path):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), BODY, fontsize=12)
    page.insert_text((150, 400), "대외비 문서", fontsize=40, fontname="korea")
    doc.save(path)


def _text(path):
    with fitz.open(path) as d:
        return "".join(p.get_text() for p in d)


def test_pdf_artifact_watermark(tmp_path):
    src, dst = tmp_path / "a.pdf", tmp_path / "a_out.pdf"
    _pdf_artifact(str(src))
    assert "TOPSECRET" in _text(src)
    rep = remove_watermark(str(src), str(dst))
    out = _text(dst)
    assert "TOPSECRET" not in out and BODY in out
    assert rep.total >= 1


def test_pdf_keyword(tmp_path):
    src, dst = tmp_path / "k.pdf", tmp_path / "k_out.pdf"
    _pdf_rotated(str(src))
    remove_watermark(str(src), str(dst), Options(keywords=["confidential"]))
    out = _text(dst)
    assert "CONFIDENTIAL" not in out and BODY in out


def test_pdf_aggressive_rotated_without_keyword(tmp_path):
    src, dst = tmp_path / "r.pdf", tmp_path / "r_out.pdf"
    _pdf_rotated(str(src), "DRAFT COPY")
    remove_watermark(str(src), str(dst), Options(aggressive=True))
    out = _text(dst)
    assert "DRAFT" not in out and BODY in out


def test_pdf_korean_keyword_via_tounicode(tmp_path):
    src, dst = tmp_path / "ko.pdf", tmp_path / "ko_out.pdf"
    _pdf_korean(str(src))
    assert "대외비" in _text(src)
    remove_watermark(str(src), str(dst), Options(keywords=["대외비"]))
    out = _text(dst)
    assert "대외비" not in out and BODY in out


def test_pdf_stamp_annotation(tmp_path):
    src, dst = tmp_path / "s.pdf", tmp_path / "s_out.pdf"
    doc = fitz.open(); page = doc.new_page(); page.insert_text((72, 100), BODY)
    a = page.add_stamp_annot(fitz.Rect(100, 300, 400, 400), stamp=0)
    a.set_info(content="SAMPLE"); a.update()
    doc.save(str(src))
    remove_watermark(str(src), str(dst), Options(keywords=["sample"]))
    with fitz.open(str(dst)) as d:
        assert len(list(d[0].annots())) == 0


def test_pdf_raster_mode(tmp_path):
    src, dst = tmp_path / "sc.pdf", tmp_path / "sc_out.pdf"
    img = _doc_image()
    ok, png = cv2.imencode(".png", img)
    doc = fitz.open(); page = doc.new_page(width=400, height=300)
    page.insert_image(page.rect, stream=png.tobytes()); doc.save(str(src))
    rep = remove_watermark(str(src), str(dst), Options(raster=True, raster_dpi=72))
    assert rep.total > 0
    with fitz.open(str(dst)) as d:
        pix = d[0].get_pixmap()
        arr = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w, pix.n)
        assert arr[:, :, 0].min() < 80  # 진한 본문은 유지


def test_same_path_rejected(tmp_path):
    src = tmp_path / "a.pdf"; _pdf_artifact(str(src))
    with pytest.raises(ValueError):
        remove_watermark(str(src), str(src))


# ------------------------------------------------------------------ DOCX
VML_WM = (
    '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
    '<w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" o:spid="_x0000_s2049" type="#_x0000_t136" '
    'style="position:absolute;rotation:315" fillcolor="silver" stroked="f">'
    '<v:textpath style="font-family:&quot;Calibri&quot;" string="CONFIDENTIAL"/></v:shape></w:pict></w:r></w:p>'
)


def _docx(path):
    from docx import Document
    from lxml import etree
    d = Document()
    d.add_paragraph(BODY)
    hdr = d.sections[0].header
    hdr.paragraphs[0].text = "Company header"
    hdr._element.append(etree.fromstring(VML_WM))
    d.save(path)


def _zip_text(path, pattern):
    with zipfile.ZipFile(path) as z:
        return "".join(z.read(n).decode("utf-8", "ignore") for n in z.namelist() if re.search(pattern, n))


def test_docx_vml_watermark(tmp_path):
    src, dst = tmp_path / "d.docx", tmp_path / "d_out.docx"
    _docx(str(src))
    assert "PowerPlusWaterMarkObject" in _zip_text(src, r"header")
    rep = remove_watermark(str(src), str(dst))
    hdr = _zip_text(dst, r"header")
    assert "PowerPlusWaterMarkObject" not in hdr and "CONFIDENTIAL" not in hdr
    assert "Company header" in hdr
    from docx import Document
    assert Document(str(dst)).paragraphs[0].text == BODY
    assert rep.total >= 1


# ------------------------------------------------------------------ PPTX
def test_pptx_watermark_shapes(tmp_path):
    from pptx import Presentation
    from pptx.util import Inches
    src, dst = tmp_path / "p.pptx", tmp_path / "p_out.pptx"
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1)).text_frame.text = BODY
    tb = s.shapes.add_textbox(Inches(2), Inches(3), Inches(5), Inches(1))
    tb.text_frame.text = "SAMPLE"; tb.rotation = 45
    named = s.shapes.add_textbox(Inches(1), Inches(5), Inches(3), Inches(1))
    named.name = "Watermark 1"; named.text_frame.text = "xyz"
    prs.save(str(src))

    remove_watermark(str(src), str(dst), Options(aggressive=True))
    texts = [sh.text_frame.text for sh in Presentation(str(dst)).slides[0].shapes if sh.has_text_frame]
    assert texts == [BODY]


# ------------------------------------------------------------------ XLSX
def test_xlsx_header_picture(tmp_path):
    import openpyxl
    src, mid, dst = tmp_path / "x0.xlsx", tmp_path / "x.xlsx", tmp_path / "x_out.xlsx"
    wb = openpyxl.Workbook(); wb.active["A1"] = BODY; wb.save(str(src))
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(mid, "w") as zout:
        for n in zin.namelist():
            data = zin.read(n)
            if n == "xl/worksheets/sheet1.xml":
                data = data.decode().replace(
                    "</worksheet>",
                    '<headerFooter><oddHeader>&amp;C&amp;G</oddHeader></headerFooter>'
                    '<legacyDrawingHF r:id="rId9"/></worksheet>')
                if 'xmlns:r=' not in data:
                    data = data.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ', 1)
                data = data.encode()
            zout.writestr(n, data)
    rep = remove_watermark(str(mid), str(dst))
    sheet = _zip_text(dst, r"worksheets/sheet1\.xml")
    assert "legacyDrawingHF" not in sheet and "&amp;G" not in sheet
    assert openpyxl.load_workbook(str(dst)).active["A1"].value == BODY
    assert rep.total >= 2


# ------------------------------------------------------------------ Image
def _doc_image():
    img = np.full((300, 400, 3), 255, np.uint8)
    cv2.putText(img, "WATERMARK", (40, 200), cv2.FONT_HERSHEY_SIMPLEX, 2, (200, 200, 200), 6)
    cv2.putText(img, "Body text", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (20, 20, 20), 3)
    return img


def test_image_threshold(tmp_path):
    src, dst = tmp_path / "i.png", tmp_path / "i_out.png"
    cv2.imwrite(str(src), _doc_image())
    remove_watermark(str(src), str(dst))
    out = cv2.imread(str(dst))
    wm_zone = out[150:220, 40:390]
    assert wm_zone.min() > 240                 # 옅은 워터마크 제거
    assert out[30:70, 20:220].min() < 60       # 진한 본문 유지


def test_image_region_inpaint(tmp_path):
    src, dst = tmp_path / "ph.jpg", tmp_path / "ph_out.jpg"
    img = np.zeros((200, 300, 3), np.uint8)
    img[:] = np.linspace(40, 200, 300, dtype=np.uint8)[None, :, None]
    cv2.putText(img, "LOGO", (100, 110), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 4)
    cv2.imwrite(str(src), img)
    remove_watermark(str(src), str(dst), Options(regions=[(90, 70, 130, 55)]))
    out = cv2.imread(str(dst))
    assert out[70:125, 90:220].max() < 230      # 흰 글씨 사라짐


def test_image_color(tmp_path):
    src, dst = tmp_path / "st.png", tmp_path / "st_out.png"
    img = np.full((200, 200, 3), 255, np.uint8)
    cv2.circle(img, (100, 100), 50, (30, 30, 220), 5)  # 빨간 도장 (BGR)
    cv2.imwrite(str(src), img)
    remove_watermark(str(src), str(dst), Options(target_color=(220, 30, 30), color_tolerance=50))
    out = cv2.imread(str(dst)).astype(int)
    redness = out[:, :, 2] - out[:, :, 1]
    assert redness.max() < 60


# ------------------------------------------------------------------ Web
def test_web_api(tmp_path):
    from wmremover.web.app import app
    src = tmp_path / "w.pdf"; _pdf_artifact(str(src))
    c = app.test_client()
    assert c.get("/").status_code == 200
    with open(src, "rb") as fh:
        r = c.post("/api/clean", data={"file": (fh, "w.pdf"), "keywords": ""},
                   content_type="multipart/form-data")
    j = r.get_json()
    assert r.status_code == 200 and j["total"] >= 1
    d = c.get(f"/api/download/{j['token']}")
    assert d.status_code == 200 and d.data[:4] == b"%PDF"
