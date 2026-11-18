"""이미지 / 스캔 문서 워터마크 제거 (OpenCV).

방식
- threshold : 문서 스캔용. 진한 본문 글자는 남기고, 그보다 옅은 회색·반투명 워터마크를 흰 배경으로 치환
- color     : 특정 색(예: 빨간 도장, 파란 로고) ± 허용오차 영역을 마스크로 잡아 인페인팅
- region    : 사용자가 지정한 사각형 영역 / 마스크 파일을 인페인팅
- auto      : 영역·마스크가 있으면 region, 문서형(밝은 배경)이면 threshold, 그 외에는 옅은 무채색 오버레이 검출 후 인페인팅
"""
from __future__ import annotations

import cv2
import numpy as np

from .core import Options, Report


# ---------------------------------------------------------------- utilities
def _read(path: str) -> np.ndarray:
    data = np.fromfile(path, dtype=np.uint8)  # 한글 경로 대응
    img = cv2.imdecode(data, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"이미지를 읽을 수 없습니다: {path}")
    return img


def _write(path: str, img: np.ndarray) -> None:
    ext = "." + path.rsplit(".", 1)[-1].lower()
    params = [cv2.IMWRITE_JPEG_QUALITY, 95] if ext in (".jpg", ".jpeg") else []
    ok, buf = cv2.imencode(ext, img, params)
    if not ok:
        raise ValueError(f"이미지를 저장할 수 없습니다: {path}")
    buf.tofile(path)


def _split_alpha(img: np.ndarray) -> tuple[np.ndarray, np.ndarray | None]:
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), None
    if img.shape[2] == 4:
        return img[:, :, :3].copy(), img[:, :, 3]
    return img, None


def _inpaint(bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    if not mask.any():
        return bgr
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=2)
    radius = max(3, int(min(bgr.shape[:2]) * 0.004))
    return cv2.inpaint(bgr, mask, radius, cv2.INPAINT_TELEA)


def is_document_like(bgr: np.ndarray) -> bool:
    """밝은 배경이 대부분이면 문서(스캔)로 간주."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray > 200)) > 0.5


def auto_threshold(gray: np.ndarray) -> int:
    """본문(진한 글자)과 워터마크(옅은 회색)를 가르는 밝기 기준 추정.

    배경 피크보다 충분히 어둡고, 본문 글자 피크보다 밝은 구간의 하한을 사용.
    """
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel()
    bg = int(np.argmax(hist[128:])) + 128  # 배경 밝기
    # Otsu는 배경 vs 나머지 를 가르므로, '나머지' 안에서 다시 Otsu → 본문 vs 워터마크
    fg = gray[gray < bg - 25]
    if fg.size < 50:
        return max(0, bg - 40)
    t, _ = cv2.threshold(fg.reshape(-1, 1), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return int(np.clip(t, 60, bg - 15))


# ---------------------------------------------------------------- methods
def remove_by_threshold(bgr: np.ndarray, threshold: int = 0) -> tuple[np.ndarray, int]:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    t = threshold or auto_threshold(gray)
    # 기준보다 밝은 무채색(채도 낮음) 픽셀 → 워터마크/배경 얼룩으로 보고 흰색 처리
    wm = (gray > t) & (hsv[:, :, 1] < 60)
    out = bgr.copy()
    out[wm] = 255
    changed = int(np.count_nonzero(wm & (gray < 250)))
    return out, changed


def color_mask(bgr: np.ndarray, color_rgb: tuple[int, int, int], tol: int) -> np.ndarray:
    target = np.array(color_rgb[::-1], dtype=np.int16)  # RGB → BGR
    diff = np.abs(bgr.astype(np.int16) - target).max(axis=2)
    return (diff <= tol).astype(np.uint8) * 255


def region_mask(shape: tuple[int, int], regions, mask_path: str | None) -> np.ndarray:
    h, w = shape
    mask = np.zeros((h, w), np.uint8)
    for (x, y, rw, rh) in regions:
        cv2.rectangle(mask, (int(x), int(y)), (int(x + rw), int(y + rh)), 255, -1)
    if mask_path:
        m = _read(mask_path)
        if m.ndim == 3:
            m = cv2.cvtColor(m[:, :, :3], cv2.COLOR_BGR2GRAY)
        m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
        mask |= (m > 127).astype(np.uint8) * 255
    return mask


def overlay_mask(bgr: np.ndarray) -> np.ndarray:
    """사진 위 옅은 흰색/회색 반투명 텍스트 오버레이 검출.

    주변(블러)보다 살짝 밝고 채도가 떨어진 얇은 획을 찾는다.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.int16)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.int16)
    k = max(15, (min(bgr.shape[:2]) // 40) | 1)
    bg_gray = cv2.medianBlur(gray.astype(np.uint8), k).astype(np.int16)
    bg_sat = cv2.medianBlur(hsv[:, :, 1].astype(np.uint8), k).astype(np.int16)
    brighter = (gray - bg_gray) > 18
    desat = (bg_sat - hsv[:, :, 1]) > 10
    mask = (brighter & (desat | (hsv[:, :, 1] < 40))).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # 너무 큰 덩어리(자연스러운 밝은 영역)는 제외
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    limit = bgr.shape[0] * bgr.shape[1] * 0.02
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > limit:
            mask[labels == i] = 0
    return mask


def clean_image(img: np.ndarray, options: Options, report: Report | None = None) -> np.ndarray:
    bgr, alpha = _split_alpha(img)
    mode = options.image_mode
    if mode == "auto":
        if options.regions or options.mask_path:
            mode = "region"
        elif options.target_color:
            mode = "color"
        elif is_document_like(bgr):
            mode = "threshold"
        else:
            mode = "overlay"

    if mode == "threshold":
        out, n = remove_by_threshold(bgr, options.threshold)
        label = "옅은 워터마크 픽셀(배경 치환)"
    elif mode == "color":
        if not options.target_color:
            raise ValueError("color 방식은 --color R,G,B 가 필요합니다.")
        m = color_mask(bgr, options.target_color, options.color_tolerance)
        out, n = _inpaint(bgr, m), int(np.count_nonzero(m))
        label = "지정 색상 픽셀(인페인팅)"
    elif mode == "region":
        m = region_mask(bgr.shape[:2], options.regions, options.mask_path)
        out, n = _inpaint(bgr, m), int(np.count_nonzero(m))
        label = "지정 영역 픽셀(인페인팅)"
    elif mode == "overlay":
        m = overlay_mask(bgr)
        out, n = _inpaint(bgr, m), int(np.count_nonzero(m))
        label = "반투명 오버레이 픽셀(인페인팅)"
    else:
        raise ValueError(f"알 수 없는 이미지 방식: {mode}")

    if report is not None:
        report.add(label, n)
    if alpha is not None:
        out = np.dstack([out, alpha])
    return out


def process_file(src: str, dst: str, options: Options, report: Report) -> None:
    img = _read(src)
    _write(dst, clean_image(img, options, report))
