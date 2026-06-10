from abc import ABC, abstractmethod

from PIL import Image


class BgRemovalProvider(ABC):
    @abstractmethod
    def remove_background(self, input_path: str, output_path: str) -> None:
        """input_path 이미지의 배경을 제거하여 output_path에 RGBA PNG로 저장."""


class FloodFillBgRemoval(BgRemovalProvider):
    """코너 플러드필 기반 경량 배경 제거.

    스튜디오 촬영(흰색/단색 배경) 의류 사진에 적합한 CPU 전용 구현체.
    프로덕션에서는 rembg, 클라우드 Segmentation API 등으로 교체 가능
    (BgRemovalProvider 인터페이스만 구현하면 됨).
    """

    def __init__(self, tolerance: int = 28, max_dimension: int = 500):
        self.tolerance = tolerance
        self.max_dimension = max_dimension

    def remove_background(self, input_path: str, output_path: str) -> None:
        img = Image.open(input_path).convert("RGBA")

        width, height = img.size
        scale = min(1.0, self.max_dimension / max(width, height))
        if scale < 1.0:
            img = img.resize((int(width * scale), int(height * scale)))

        width, height = img.size
        pixels = img.load()
        corner_color = pixels[0, 0][:3]

        visited = bytearray(width * height)
        stack = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]

        def similar(c1, c2) -> bool:
            return all(abs(a - b) <= self.tolerance for a, b in zip(c1, c2))

        while stack:
            x, y = stack.pop()
            if x < 0 or y < 0 or x >= width or y >= height:
                continue
            idx = y * width + x
            if visited[idx]:
                continue
            visited[idx] = 1

            r, g, b, a = pixels[x, y]
            if not similar((r, g, b), corner_color):
                continue

            pixels[x, y] = (r, g, b, 0)
            stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

        img.save(output_path, "PNG")
