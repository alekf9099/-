"""공통 옵션, 결과 리포트, 형식별 디스패처."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Options:
    # 제거할 워터마크 문구 (대소문자 무시, 부분 일치). 예: ["CONFIDENTIAL", "대외비"]
    keywords: list[str] = field(default_factory=list)
    # 공격적 모드: 회전된 텍스트 / 반투명 텍스트 / 반복 이미지 등 휴리스틱 제거
    aggressive: bool = False
    # 이미지·스캔 문서용: 직접 지정한 영역 [(x, y, w, h), ...] → 인페인팅
    regions: list[tuple[int, int, int, int]] = field(default_factory=list)
    # 이미지용: 마스크 파일 경로 (흰색=제거할 영역)
    mask_path: str | None = None
    # 이미지용 방식: auto | threshold | color | region
    image_mode: str = "auto"
    # threshold 방식 밝기 기준 (0~255, 이 값보다 밝은 회색은 흰색으로)
    threshold: int = 0  # 0 = 자동 계산
    # color 방식: 제거할 워터마크 색상 (R, G, B)과 허용 오차
    target_color: tuple[int, int, int] | None = None
    color_tolerance: int = 40
    # PDF: 페이지를 이미지로 렌더링해 이미지 방식으로 처리 (스캔 PDF용)
    raster: bool = False
    raster_dpi: int = 200
    # PDF: 여러 페이지에 반복되는 동일 이미지를 워터마크로 간주해 제거
    repeated_images: bool = False
    # PDF 암호 (사용자가 정당하게 알고 있는 경우만)
    password: str | None = None


@dataclass
class Report:
    input_path: str
    output_path: str = ""
    file_type: str = ""
    removed: dict[str, int] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def add(self, key: str, n: int = 1) -> None:
        if n:
            self.removed[key] = self.removed.get(key, 0) + n

    @property
    def total(self) -> int:
        return sum(self.removed.values())

    def summary(self) -> str:
        lines = [f"[{self.file_type}] {os.path.basename(self.input_path)} → {self.output_path}"]
        if self.removed:
            for k, v in self.removed.items():
                lines.append(f"  - {k}: {v}")
        else:
            lines.append("  - 제거된 워터마크 없음 (옵션 --text / --aggressive / --raster 를 시도해보세요)")
        for n in self.notes:
            lines.append(f"  * {n}")
        return "\n".join(lines)


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx"} | IMAGE_EXTS


def _handler(ext: str) -> Callable[[str, str, Options, Report], None]:
    if ext == ".pdf":
        from .pdf import process
    elif ext == ".docx":
        from .office import process_docx as process
    elif ext == ".pptx":
        from .office import process_pptx as process
    elif ext == ".xlsx":
        from .office import process_xlsx as process
    elif ext in IMAGE_EXTS:
        from .image import process_file as process
    else:
        raise ValueError(
            f"지원하지 않는 형식입니다: {ext} (지원: {', '.join(sorted(SUPPORTED_EXTENSIONS))})"
        )
    return process


def default_output_path(input_path: str, out_dir: str | None = None) -> str:
    base, ext = os.path.splitext(os.path.basename(input_path))
    folder = out_dir or os.path.dirname(os.path.abspath(input_path))
    return os.path.join(folder, f"{base}_clean{ext}")


def remove_watermark(input_path: str, output_path: str | None = None,
                     options: Options | None = None) -> Report:
    options = options or Options()
    ext = os.path.splitext(input_path)[1].lower()
    output_path = output_path or default_output_path(input_path)
    if os.path.abspath(output_path) == os.path.abspath(input_path):
        raise ValueError("출력 파일이 원본과 같습니다. 원본 보호를 위해 다른 경로를 지정하세요.")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    report = Report(input_path=input_path, output_path=output_path, file_type=ext.lstrip(".").upper())
    _handler(ext)(input_path, output_path, options, report)
    return report
