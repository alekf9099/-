import os

from PIL import Image, ImageDraw

from app import models
from app.config import settings
from app.database import SessionLocal

# 데모용 AI 모델 목록 (실제 서비스에서는 자체 촬영/생성 모델 이미지로 교체)
AI_MODELS = [
    {"id": "model_soyeon", "name": "소연", "ethnicity": "ASIAN", "gender": "FEMALE", "is_premium": False, "skin": (255, 224, 196), "hair": (60, 40, 30), "bg": (245, 230, 250)},
    {"id": "model_minjun", "name": "민준", "ethnicity": "ASIAN", "gender": "MALE", "is_premium": False, "skin": (240, 210, 180), "hair": (30, 30, 30), "bg": (220, 235, 250)},
    {"id": "model_emma", "name": "Emma", "ethnicity": "WESTERN", "gender": "FEMALE", "is_premium": False, "skin": (255, 219, 186), "hair": (200, 160, 80), "bg": (255, 240, 225)},
    {"id": "model_liam", "name": "Liam", "ethnicity": "WESTERN", "gender": "MALE", "is_premium": False, "skin": (255, 213, 170), "hair": (90, 60, 40), "bg": (225, 245, 230)},
    {"id": "model_jia", "name": "지아", "ethnicity": "ASIAN", "gender": "FEMALE", "is_premium": True, "skin": (255, 228, 200), "hair": (20, 20, 20), "bg": (250, 235, 245)},
    {"id": "model_sophia", "name": "Sophia", "ethnicity": "WESTERN", "gender": "FEMALE", "is_premium": True, "skin": (255, 224, 200), "hair": (120, 80, 50), "bg": (255, 248, 225)},
]


def _generate_avatar(path: str, skin: tuple, hair: tuple, bg: tuple) -> None:
    """간단한 도형 기반 아바타 썸네일 생성 (실제 모델 사진으로 교체 예정)."""
    w, h = 300, 400
    img = Image.new("RGB", (w, h), bg)
    draw = ImageDraw.Draw(img)

    cx = w // 2
    # 머리카락 (얼굴보다 큰 원, 뒤쪽)
    draw.ellipse([(cx - 65, 60), (cx + 65, 190)], fill=hair)
    # 얼굴
    draw.ellipse([(cx - 52, 75), (cx + 52, 180)], fill=skin)
    # 목
    draw.rectangle([(cx - 16, 170), (cx + 16, 205)], fill=skin)
    # 어깨/상체 (의류 실루엣)
    draw.polygon(
        [(cx - 90, 260), (cx + 90, 260), (cx + 110, 400), (cx - 110, 400)],
        fill=(120, 120, 130),
    )

    img.save(path, "JPEG", quality=90)


def run() -> None:
    models_dir = os.path.join(settings.storage_dir, "models")
    os.makedirs(models_dir, exist_ok=True)

    db = SessionLocal()
    try:
        if db.query(models.AiModel).count() > 0:
            return

        for m in AI_MODELS:
            thumb_path = os.path.join(models_dir, f"{m['id']}.jpg")
            _generate_avatar(thumb_path, m["skin"], m["hair"], m["bg"])

            db.add(
                models.AiModel(
                    id=m["id"],
                    name=m["name"],
                    thumbnail_url=f"{settings.base_url}/static/models/{m['id']}.jpg",
                    ethnicity=m["ethnicity"],
                    gender=m["gender"],
                    is_premium=m["is_premium"],
                )
            )
        db.commit()
    finally:
        db.close()
