import hashlib
import time
from abc import ABC, abstractmethod

import requests
from PIL import Image, ImageDraw

from app.config import settings


class ModelImageProvider(ABC):
    @abstractmethod
    def generate_portrait(
        self,
        output_path: str,
        model_id: str,
        name: str,
        ethnicity: str,
        gender: str,
    ) -> None:
        """AI 모델 선택용 인물 썸네일을 output_path(JPEG)에 생성."""


def get_model_image_provider() -> ModelImageProvider:
    if settings.model_image_provider == "replicate" and settings.replicate_api_token:
        return ReplicateModelImageProvider(settings.replicate_api_token)
    return LocalAvatarProvider()


class LocalAvatarProvider(ModelImageProvider):
    """외부 AI API 없이 동작하는 데모용 인물 일러스트 생성기.

    2배 해상도로 그린 뒤 다운샘플링(supersampling)하여 부드러운 윤곽선을 얻고,
    그라디언트 배경 / 입체감 있는 얼굴·헤어 셰이딩 / 간단한 이목구비를 추가해
    기존의 단순 도형 아바타보다 자연스러운 인물 실루엣을 만든다.
    """

    SIZE = (300, 400)
    SCALE = 3

    PALETTES = {
        "model_soyeon": {"skin": (255, 224, 196), "hair": (45, 32, 28), "bg": ((250, 235, 250), (235, 215, 245))},
        "model_minjun": {"skin": (240, 210, 180), "hair": (28, 28, 30), "bg": ((225, 238, 252), (205, 222, 245))},
        "model_emma": {"skin": (255, 219, 186), "hair": (190, 150, 80), "bg": ((255, 245, 230), (250, 230, 210))},
        "model_liam": {"skin": (255, 213, 170), "hair": (80, 55, 40), "bg": ((228, 248, 233), (205, 235, 215))},
        "model_jia": {"skin": (255, 228, 200), "hair": (20, 20, 20), "bg": ((253, 238, 247), (240, 215, 232))},
        "model_sophia": {"skin": (255, 224, 200), "hair": (110, 75, 48), "bg": ((255, 250, 230), (250, 235, 205))},
    }

    def generate_portrait(
        self,
        output_path: str,
        model_id: str,
        name: str,
        ethnicity: str,
        gender: str,
    ) -> None:
        palette = self.PALETTES.get(model_id) or self._fallback_palette(model_id)
        skin, hair, (bg_top, bg_bottom) = palette["skin"], palette["hair"], palette["bg"]

        w, h = self.SIZE[0] * self.SCALE, self.SIZE[1] * self.SCALE
        img = Image.new("RGB", (w, h))
        draw = ImageDraw.Draw(img)

        self._draw_gradient_bg(draw, w, h, bg_top, bg_bottom)
        self._draw_body(draw, w, h, skin, hair, model_id, gender)

        img = img.resize(self.SIZE, Image.LANCZOS)
        img.save(output_path, "JPEG", quality=92)

    def _fallback_palette(self, model_id: str) -> dict:
        seed = int(hashlib.md5(model_id.encode()).hexdigest(), 16)
        skins = [(255, 224, 196), (240, 210, 180), (255, 219, 186), (255, 213, 170)]
        hairs = [(45, 32, 28), (28, 28, 30), (190, 150, 80), (110, 75, 48)]
        bgs = [
            ((250, 235, 250), (235, 215, 245)),
            ((225, 238, 252), (205, 222, 245)),
            ((255, 245, 230), (250, 230, 210)),
            ((228, 248, 233), (205, 235, 215)),
        ]
        i = seed % 4
        return {"skin": skins[i], "hair": hairs[i], "bg": bgs[i]}

    def _draw_gradient_bg(self, draw, w, h, top, bottom):
        for y in range(h):
            t = y / h
            color = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
            draw.line([(0, y), (w, y)], fill=color)

    def _shade(self, color: tuple, factor: float) -> tuple:
        return tuple(max(0, min(255, int(c * factor))) for c in color)

    def _draw_body(self, draw, w, h, skin, hair, model_id, gender):
        cx = w // 2
        s = self.SCALE

        # 어깨 너비를 성별에 따라 살짝 다르게
        shoulder_half = 145 * s if gender == "MALE" else 130 * s

        # 옷(상의) - 모델 id 기반 색상 + 그라디언트
        seed = int(hashlib.md5(model_id.encode()).hexdigest(), 16)
        outfit_colors = [
            (90, 95, 120), (110, 85, 95), (80, 100, 90), (100, 90, 70), (70, 85, 110), (115, 100, 110),
        ]
        outfit = outfit_colors[seed % len(outfit_colors)]

        torso_top = 250 * s
        for y in range(torso_top, h):
            t = (y - torso_top) / (h - torso_top)
            color = self._shade(outfit, 1.05 - 0.25 * t)
            half_w = min(int(shoulder_half + 40 * s * t), w // 2 + 20 * s)
            draw.line([(cx - half_w, y), (cx + half_w, y)], fill=color)

        # 목
        draw.rectangle([(cx - 20 * s, 175 * s), (cx + 20 * s, 255 * s)], fill=self._shade(skin, 0.92))

        # 머리카락 (얼굴보다 넓고 둥근 형태, 입체감을 위한 그라디언트)
        hair_box = [(cx - 78 * s, 55 * s), (cx + 78 * s, 195 * s)]
        for i in range(6):
            t = i / 5
            shrink = i * 3 * s
            color = self._shade(hair, 1.15 - 0.3 * t)
            draw.ellipse(
                [(hair_box[0][0] + shrink, hair_box[0][1] + shrink),
                 (hair_box[1][0] - shrink, hair_box[1][1] - shrink)],
                fill=color,
            )

        # 얼굴 (그라디언트 셰이딩: 위쪽이 밝고 아래쪽이 살짝 어둡게)
        face_box = [(cx - 58 * s, 70 * s), (cx + 58 * s, 185 * s)]
        for i in range(8):
            t = i / 7
            color = self._shade(skin, 1.06 - 0.12 * t)
            inset = i * (1.5 * s)
            draw.ellipse(
                [(face_box[0][0] + inset * 0.3, face_box[0][1] + inset),
                 (face_box[1][0] - inset * 0.3, face_box[1][1] - inset * 0.2)],
                fill=color,
            )

        # 볼터치
        blush = self._shade(skin, 0.92)
        draw.ellipse([(cx - 48 * s, 130 * s), (cx - 22 * s, 148 * s)], fill=blush)
        draw.ellipse([(cx + 22 * s, 130 * s), (cx + 48 * s, 148 * s)], fill=blush)

        # 눈
        eye_y = 110 * s
        eye_color = (60, 45, 40)
        draw.ellipse([(cx - 32 * s, eye_y), (cx - 14 * s, eye_y + 8 * s)], fill=eye_color)
        draw.ellipse([(cx + 14 * s, eye_y), (cx + 32 * s, eye_y + 8 * s)], fill=eye_color)

        # 눈썹
        brow_color = self._shade(hair, 1.1)
        draw.line([(cx - 34 * s, eye_y - 10 * s), (cx - 12 * s, eye_y - 14 * s)], fill=brow_color, width=int(2.5 * s))
        draw.line([(cx + 12 * s, eye_y - 14 * s), (cx + 34 * s, eye_y - 10 * s)], fill=brow_color, width=int(2.5 * s))

        # 코 (살짝 어두운 선)
        nose_color = self._shade(skin, 0.85)
        draw.line([(cx, eye_y + 10 * s), (cx - 4 * s, eye_y + 26 * s)], fill=nose_color, width=int(1.5 * s))

        # 입
        mouth_color = (190, 110, 110)
        draw.arc(
            [(cx - 18 * s, eye_y + 30 * s), (cx + 18 * s, eye_y + 50 * s)],
            start=20, end=160, fill=mouth_color, width=int(3 * s),
        )


class ReplicateModelImageProvider(ModelImageProvider):
    """Replicate API(SDXL 등)를 사용해 실제 AI 인물 이미지를 생성.

    REPLICATE_API_TOKEN이 설정되어 있을 때만 사용되며,
    동일한 ModelImageProvider 인터페이스를 구현하므로 seed.py 등
    호출부 코드 변경 없이 LocalAvatarProvider와 교체 가능.
    """

    API_URL = "https://api.replicate.com/v1/predictions"
    # SDXL (stability-ai/sdxl) - 필요 시 최신 버전 해시로 교체
    MODEL_VERSION = "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"

    def __init__(self, api_token: str):
        self.api_token = api_token

    def generate_portrait(
        self,
        output_path: str,
        model_id: str,
        name: str,
        ethnicity: str,
        gender: str,
    ) -> None:
        prompt = self._build_prompt(name, ethnicity, gender)
        image_url = self._run_prediction(prompt)

        resp = requests.get(image_url, timeout=60)
        resp.raise_for_status()

        tmp_path = output_path + ".tmp"
        with open(tmp_path, "wb") as f:
            f.write(resp.content)

        img = Image.open(tmp_path).convert("RGB")
        img = img.resize((300, 400), Image.LANCZOS)
        img.save(output_path, "JPEG", quality=92)

    def _build_prompt(self, name: str, ethnicity: str, gender: str) -> str:
        ethnicity_desc = "Korean" if ethnicity == "ASIAN" else "Western"
        gender_desc = "woman" if gender == "FEMALE" else "man"
        return (
            f"professional studio portrait photo of a {ethnicity_desc} {gender_desc} fashion model, "
            "plain background, soft lighting, high detail, full body, fashion catalog photo"
        )

    def _run_prediction(self, prompt: str) -> str:
        headers = {
            "Authorization": f"Token {self.api_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "version": self.MODEL_VERSION,
            "input": {"prompt": prompt, "width": 768, "height": 1024},
        }
        resp = requests.post(self.API_URL, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        prediction = resp.json()

        status_url = prediction["urls"]["get"]
        for _ in range(60):
            poll = requests.get(status_url, headers=headers, timeout=30)
            poll.raise_for_status()
            data = poll.json()
            if data["status"] == "succeeded":
                output = data["output"]
                return output[0] if isinstance(output, list) else output
            if data["status"] == "failed":
                raise RuntimeError(f"Replicate prediction failed: {data.get('error')}")
            time.sleep(2)

        raise TimeoutError("Replicate prediction timed out")
