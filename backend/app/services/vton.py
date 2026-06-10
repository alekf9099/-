import hashlib
import time
from abc import ABC, abstractmethod

import requests
from PIL import Image, ImageDraw, ImageFilter

from app.config import settings


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


def get_vton_provider() -> VTONProvider:
    if settings.vton_provider == "replicate" and settings.replicate_api_token:
        return ReplicateVTONProvider(settings.replicate_api_token)
    return MockVTONProvider()


class MockVTONProvider(VTONProvider):
    """실제 Virtual Try-On 모델(IDM-VTON 등) 연동 전 데모용 합성 결과 생성기.

    GPU 추론 서버가 준비되면 ReplicateVTONProvider 등 동일 인터페이스의
    구현체로 교체하면 라우터 코드는 변경할 필요가 없음.
    """

    SIZE = (768, 1024)
    SCALE = 2  # 슈퍼샘플링 배율 (안티앨리어싱)

    def generate(
        self,
        garment_path: str,
        model_id: str,
        model_name: str,
        output_path: str,
    ) -> None:
        bg_top, bg_bottom, accent_color = self._colors_for(model_id)

        w, h = self.SIZE[0] * self.SCALE, self.SIZE[1] * self.SCALE
        canvas = Image.new("RGB", (w, h))
        draw = ImageDraw.Draw(canvas)

        self._draw_gradient_bg(draw, w, h, bg_top, bg_bottom)
        self._draw_silhouette(draw, w, h, accent_color)

        canvas = canvas.resize(self.SIZE, Image.LANCZOS)

        # 의류 이미지를 실루엣 위치에 합성 (그림자 + 합성)
        garment = Image.open(garment_path).convert("RGBA")
        garment.thumbnail((420, 520))
        gx = (self.SIZE[0] - garment.width) // 2
        gy = 250

        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        shadow_alpha = garment.split()[3].point(lambda a: int(a * 0.35))
        shadow_layer = Image.new("RGBA", garment.size, (0, 0, 0, 0))
        shadow_layer.putalpha(shadow_alpha)
        shadow.paste(shadow_layer, (gx + 10, gy + 14), shadow_layer)
        shadow = shadow.filter(ImageFilter.GaussianBlur(8))

        canvas = canvas.convert("RGBA")
        canvas.alpha_composite(shadow)
        canvas.alpha_composite(garment, (gx, gy))
        canvas = canvas.convert("RGB")

        draw = ImageDraw.Draw(canvas, "RGBA")

        # 상단 라벨 바 (PIL 기본 폰트는 한글을 지원하지 않으므로 ASCII인 model_id 사용)
        draw.rectangle([(0, 0), (self.SIZE[0], 56)], fill=(0, 0, 0, 130))
        draw.text((20, 16), f"AI MODEL - {model_id}", fill=(255, 255, 255))

        # 하단 워터마크 바
        draw.rectangle([(0, self.SIZE[1] - 40), (self.SIZE[0], self.SIZE[1])], fill=(0, 0, 0, 200))
        draw.text((20, self.SIZE[1] - 28), "DEMO RESULT - Mock VTON Provider", fill=(255, 255, 255))

        canvas.save(output_path, "JPEG", quality=92)

    def _colors_for(self, model_id: str) -> tuple[tuple, tuple, tuple]:
        seed = int(hashlib.md5(model_id.encode()).hexdigest(), 16)
        hue_options = [
            ((250, 240, 255), (225, 205, 245), (197, 170, 230)),  # 라벤더
            ((255, 248, 238), (250, 230, 205), (240, 195, 150)),  # 베이지
            ((235, 246, 255), (210, 230, 250), (160, 200, 240)),  # 블루
            ((238, 255, 244), (210, 240, 220), (160, 220, 180)),  # 민트
        ]
        return hue_options[seed % len(hue_options)]

    def _draw_gradient_bg(self, draw, w, h, top, bottom):
        for y in range(h):
            t = y / h
            color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
            draw.line([(0, y), (w, y)], fill=color)

    def _shade(self, color: tuple, factor: float) -> tuple:
        return tuple(max(0, min(255, int(c * factor))) for c in color)

    def _draw_silhouette(self, draw, w, h, color: tuple) -> None:
        s = self.SCALE
        cx = w // 2

        # 머리 (그라디언트 셰이딩)
        for i in range(6):
            t = i / 5
            shade = self._shade(color, 1.15 - 0.25 * t)
            inset = i * 2 * s
            draw.ellipse([(cx - 60 * s + inset, 80 * s + inset), (cx + 60 * s - inset, 200 * s - inset)], fill=shade)

        # 목
        draw.rectangle([(cx - 18 * s, 195 * s), (cx + 18 * s, 230 * s)], fill=self._shade(color, 0.95))

        # 몸통/어깨 (아래로 갈수록 살짝 어둡게)
        steps = 40
        for i in range(steps):
            t0 = i / steps
            t1 = (i + 1) / steps
            y0 = int(320 * s + (760 * s - 320 * s) * t0)
            y1 = int(320 * s + (760 * s - 320 * s) * t1)
            lx = int(-130 * s + (-160 * s - (-130 * s)) * t0)
            rx = int(130 * s + (160 * s - 130 * s) * t0)
            shade = self._shade(color, 1.05 - 0.15 * t0)
            draw.polygon(
                [(cx + lx, y0), (cx + rx, y0), (cx + rx, y1), (cx + lx, y1)],
                fill=shade,
            )

        # 다리
        draw.rectangle([(cx - 80 * s, 760 * s), (cx - 10 * s, 980 * s)], fill=self._shade(color, 0.95))
        draw.rectangle([(cx + 10 * s, 760 * s), (cx + 80 * s, 980 * s)], fill=self._shade(color, 0.95))


class ReplicateVTONProvider(VTONProvider):
    """Replicate에 호스팅된 IDM-VTON 모델을 호출하는 실제 Virtual Try-On 구현체.

    REPLICATE_API_TOKEN이 설정되어 있을 때만 사용되며,
    동일한 VTONProvider 인터페이스를 구현하므로 라우터 코드 변경이 필요 없음.
    """

    API_URL = "https://api.replicate.com/v1/predictions"
    # cuuupid/idm-vton 모델 버전 (필요 시 최신 버전 해시로 교체)
    MODEL_VERSION = "c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff"

    def __init__(self, api_token: str):
        self.api_token = api_token

    def generate(
        self,
        garment_path: str,
        model_id: str,
        model_name: str,
        output_path: str,
    ) -> None:
        from app.services.model_images import get_model_image_provider

        # 모델 인물 이미지(인물 사진)와 의류 이미지를 함께 전달
        model_image_path = output_path + ".model_ref.jpg"
        get_model_image_provider().generate_portrait(
            model_image_path, model_id=model_id, name=model_name, ethnicity="ASIAN", gender="FEMALE"
        )

        with open(model_image_path, "rb") as f:
            human_data = f.read()
        with open(garment_path, "rb") as f:
            garm_data = f.read()

        import base64

        human_b64 = "data:image/jpeg;base64," + base64.b64encode(human_data).decode()
        garm_b64 = "data:image/png;base64," + base64.b64encode(garm_data).decode()

        headers = {
            "Authorization": f"Token {self.api_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "version": self.MODEL_VERSION,
            "input": {
                "human_img": human_b64,
                "garm_img": garm_b64,
                "garment_des": f"garment for {model_name}",
            },
        }
        resp = requests.post(self.API_URL, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        prediction = resp.json()

        status_url = prediction["urls"]["get"]
        image_url = None
        for _ in range(120):
            poll = requests.get(status_url, headers=headers, timeout=30)
            poll.raise_for_status()
            data = poll.json()
            if data["status"] == "succeeded":
                output = data["output"]
                image_url = output[0] if isinstance(output, list) else output
                break
            if data["status"] == "failed":
                raise RuntimeError(f"Replicate prediction failed: {data.get('error')}")
            time.sleep(2)

        if image_url is None:
            raise TimeoutError("Replicate VTON prediction timed out")

        result = requests.get(image_url, timeout=60)
        result.raise_for_status()
        with open(output_path, "wb") as f:
            f.write(result.content)
