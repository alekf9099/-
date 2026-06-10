import hashlib
from abc import ABC, abstractmethod

from PIL import Image, ImageDraw


class VTONProvider(ABC):
    @abstractmethod
    def generate(
        self,
        garment_path: str,
        model_id: str,
        model_name: str,
        output_path: str,
    ) -> None:
        """garment_path 의류 이미지를 model_id 모델에 합성하여 output_path에 저장."""


class MockVTONProvider(VTONProvider):
    """실제 Virtual Try-On 모델(IDM-VTON 등) 연동 전 데모용 합성 결과 생성기.

    GPU 추론 서버가 준비되면 이 클래스를 동일 인터페이스의
    RemoteVTONProvider(예: Replicate/RunPod API 호출)로 교체하면
    라우터 코드는 변경할 필요가 없음.
    """

    CANVAS_SIZE = (768, 1024)

    def generate(
        self,
        garment_path: str,
        model_id: str,
        model_name: str,
        output_path: str,
    ) -> None:
        bg_color, accent_color = self._colors_for(model_id)

        canvas = Image.new("RGB", self.CANVAS_SIZE, bg_color)
        draw = ImageDraw.Draw(canvas)

        # 모델 실루엣 (간단한 사람 형상)
        self._draw_silhouette(draw, accent_color)

        # 의류 이미지를 실루엣 위치에 합성
        garment = Image.open(garment_path).convert("RGBA")
        garment.thumbnail((420, 520))
        gx = (self.CANVAS_SIZE[0] - garment.width) // 2
        gy = 260
        canvas.paste(garment, (gx, gy), garment)

        # 워터마크 / 라벨
        draw.rectangle([(0, 0), (self.CANVAS_SIZE[0], 56)], fill=(0, 0, 0, 120))
        draw.text((20, 16), f"AI MODEL · {model_name}", fill=(255, 255, 255))
        draw.rectangle(
            [(0, self.CANVAS_SIZE[1] - 40), (self.CANVAS_SIZE[0], self.CANVAS_SIZE[1])],
            fill=(0, 0, 0),
        )
        draw.text((20, self.CANVAS_SIZE[1] - 28), "DEMO RESULT — Mock VTON Provider", fill=(255, 255, 255))

        canvas.save(output_path, "JPEG", quality=92)

    def _colors_for(self, model_id: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
        seed = int(hashlib.md5(model_id.encode()).hexdigest(), 16)
        hue_options = [
            ((247, 243, 255), (197, 170, 230)),  # 라벤더
            ((255, 246, 235), (240, 195, 150)),  # 베이지
            ((235, 246, 255), (160, 200, 240)),  # 블루
            ((240, 255, 244), (160, 220, 180)),  # 민트
        ]
        return hue_options[seed % len(hue_options)]

    def _draw_silhouette(self, draw: ImageDraw.ImageDraw, color: tuple[int, int, int]) -> None:
        cx = self.CANVAS_SIZE[0] // 2
        # 머리
        draw.ellipse([(cx - 60, 80), (cx + 60, 200)], fill=color)
        # 목
        draw.rectangle([(cx - 18, 195), (cx + 18, 230)], fill=color)
        # 몸통/어깨
        draw.polygon(
            [
                (cx - 130, 320),
                (cx + 130, 320),
                (cx + 160, 760),
                (cx - 160, 760),
            ],
            fill=color,
        )
        # 다리
        draw.rectangle([(cx - 80, 760), (cx - 10, 980)], fill=color)
        draw.rectangle([(cx + 10, 760), (cx + 80, 980)], fill=color)
