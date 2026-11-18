"""모바일 친화 웹 UI (Flask). 실행: python -m wmremover.web.app  → http://<PC IP>:8000"""
from __future__ import annotations

import io
import os
import shutil
import tempfile

from flask import Flask, jsonify, render_template, request, send_file

from ..core import Options, SUPPORTED_EXTENSIONS, remove_watermark

MAX_MB = 50
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024
_results: dict[str, tuple[str, bytes]] = {}


def _opts(form) -> Options:
    kws = [k.strip() for k in (form.get("keywords") or "").replace("\n", ",").split(",") if k.strip()]
    regions = []
    for r in (form.get("regions") or "").split(";"):
        parts = [p for p in r.split(",") if p.strip()]
        if len(parts) == 4:
            regions.append(tuple(int(float(p)) for p in parts))
    color = None
    if form.get("color"):
        c = form["color"].lstrip("#")
        color = (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))
    return Options(
        keywords=kws,
        aggressive=form.get("aggressive") == "1",
        raster=form.get("raster") == "1",
        repeated_images=form.get("repeated") == "1",
        image_mode=form.get("mode") or "auto",
        regions=regions,
        target_color=color,
        color_tolerance=int(form.get("tol") or 40),
        password=form.get("password") or None,
    )


@app.get("/")
def index():
    return render_template("index.html", exts=", ".join(sorted(SUPPORTED_EXTENSIONS)), max_mb=MAX_MB)


@app.post("/api/clean")
def clean():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(error="파일을 선택하세요."), 400
    name = os.path.basename(f.filename)
    base, ext = os.path.splitext(name)
    if ext.lower() not in SUPPORTED_EXTENSIONS:
        return jsonify(error=f"지원하지 않는 형식입니다: {ext}"), 400
    tmp = tempfile.mkdtemp(prefix="wm_")
    try:
        src = os.path.join(tmp, "input" + ext.lower())
        dst = os.path.join(tmp, "output" + ext.lower())
        f.save(src)
        rep = remove_watermark(src, dst, _opts(request.form))
        with open(dst, "rb") as fh:
            data = fh.read()
        token = os.urandom(12).hex()
        if len(_results) > 20:
            _results.pop(next(iter(_results)))
        _results[token] = (f"{base}_clean{ext}", data)
        return jsonify(token=token, filename=f"{base}_clean{ext}", removed=rep.removed,
                       total=rep.total, notes=rep.notes, size=len(data))
    except Exception as e:
        return jsonify(error=str(e)), 422
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@app.get("/api/download/<token>")
def download(token):
    item = _results.get(token)
    if not item:
        return jsonify(error="만료된 결과입니다. 다시 처리하세요."), 404
    name, data = item
    return send_file(io.BytesIO(data), as_attachment=True, download_name=name)


def main():
    app.run(host=os.environ.get("HOST", "0.0.0.0"), port=int(os.environ.get("PORT", 8000)))


if __name__ == "__main__":
    main()
