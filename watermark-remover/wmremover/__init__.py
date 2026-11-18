"""wmremover — 문서/이미지 워터마크 제거 도구.

지원 형식: PDF, DOCX, PPTX, XLSX, PNG/JPG/BMP/TIFF/WEBP
"""
from .core import Options, Report, remove_watermark, SUPPORTED_EXTENSIONS

__all__ = ["Options", "Report", "remove_watermark", "SUPPORTED_EXTENSIONS"]
__version__ = "1.0.0"
