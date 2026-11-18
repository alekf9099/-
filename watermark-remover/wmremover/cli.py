"""명령줄 인터페이스.

예)
  wmremove report.pdf                         # 표준 워터마크 자동 제거
  wmremove report.pdf -t "대외비" -t DRAFT     # 문구 지정
  wmremove *.docx *.pptx -o cleaned/ --aggressive
  wmremove scan.pdf --raster                  # 스캔 PDF
  wmremove photo.jpg --region 20,30,300,80    # 영역 지정 인페인팅
  wmremove stamp.png --color 220,30,30 --tol 60
"""
from __future__ import annotations

import argparse
import glob
import os
import sys

from . import __version__
from .core import Options, SUPPORTED_EXTENSIONS, default_output_path, remove_watermark


def _region(s: str):
    try:
        x, y, w, h = (int(v) for v in s.split(","))
        return x, y, w, h
    except ValueError:
        raise argparse.ArgumentTypeError("영역 형식: x,y,너비,높이 (예: 10,20,300,80)")


def _color(s: str):
    s = s.strip().lstrip("#")
    try:
        if "," in s:
            r, g, b = (int(v) for v in s.split(","))
        else:
            r, g, b = int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
        return r, g, b
    except (ValueError, IndexError):
        raise argparse.ArgumentTypeError("색상 형식: R,G,B 또는 #RRGGBB")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="wmremove", description="문서·이미지 워터마크 제거 도구",
                                formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    p.add_argument("inputs", nargs="+", help="입력 파일 (와일드카드 가능)")
    p.add_argument("-o", "--out", help="출력 폴더 (기본: 원본 폴더에 *_clean.*)")
    p.add_argument("-t", "--text", action="append", default=[], help="제거할 워터마크 문구 (여러 번 지정 가능)")
    p.add_argument("-a", "--aggressive", action="store_true", help="회전·반투명 텍스트/이미지 등 휴리스틱 제거")
    p.add_argument("--repeated-images", action="store_true", help="PDF: 여러 페이지에 반복되는 동일 이미지 제거")
    p.add_argument("--raster", action="store_true", help="PDF: 페이지를 이미지로 변환 후 정리 (스캔 문서)")
    p.add_argument("--dpi", type=int, default=200, help="--raster 해상도 (기본 200)")
    p.add_argument("--mode", choices=["auto", "threshold", "color", "region", "overlay"], default="auto",
                   help="이미지 처리 방식 (기본 auto)")
    p.add_argument("--threshold", type=int, default=0, help="threshold 방식 밝기 기준 0~255 (0=자동)")
    p.add_argument("--region", type=_region, action="append", default=[], help="인페인팅 영역 x,y,w,h")
    p.add_argument("--mask", help="마스크 이미지 (흰색=제거)")
    p.add_argument("--color", type=_color, help="제거할 색상 R,G,B 또는 #RRGGBB")
    p.add_argument("--tol", type=int, default=40, help="색상 허용 오차 (기본 40)")
    p.add_argument("--password", help="PDF 암호 (본인 소유 문서)")
    p.add_argument("-V", "--version", action="version", version=f"%(prog)s {__version__}")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    opts = Options(keywords=args.text, aggressive=args.aggressive, regions=args.region,
                   mask_path=args.mask, image_mode=args.mode, threshold=args.threshold,
                   target_color=args.color, color_tolerance=args.tol, raster=args.raster,
                   raster_dpi=args.dpi, repeated_images=args.repeated_images, password=args.password)
    files = []
    for pattern in args.inputs:
        files.extend(sorted(glob.glob(pattern)) or [pattern])
    failed = 0
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            print(f"[건너뜀] {f}: 지원하지 않는 형식", file=sys.stderr); failed += 1; continue
        if not os.path.isfile(f):
            print(f"[오류] {f}: 파일이 없습니다", file=sys.stderr); failed += 1; continue
        try:
            rep = remove_watermark(f, default_output_path(f, args.out), opts)
            print(rep.summary())
        except Exception as e:
            print(f"[오류] {f}: {e}", file=sys.stderr); failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
