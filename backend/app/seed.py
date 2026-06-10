import os

from app import models
from app.config import settings
from app.database import SessionLocal
from app.services.model_images import get_model_image_provider

# 데모용 AI 모델 목록 (실제 서비스에서는 자체 촬영/생성 모델 이미지로 교체)
AI_MODELS = [
    {"id": "model_soyeon", "name": "소연", "ethnicity": "ASIAN", "gender": "FEMALE", "is_premium": False},
    {"id": "model_minjun", "name": "민준", "ethnicity": "ASIAN", "gender": "MALE", "is_premium": False},
    {"id": "model_emma", "name": "Emma", "ethnicity": "WESTERN", "gender": "FEMALE", "is_premium": False},
    {"id": "model_liam", "name": "Liam", "ethnicity": "WESTERN", "gender": "MALE", "is_premium": False},
    {"id": "model_jia", "name": "지아", "ethnicity": "ASIAN", "gender": "FEMALE", "is_premium": True},
    {"id": "model_sophia", "name": "Sophia", "ethnicity": "WESTERN", "gender": "FEMALE", "is_premium": True},
]


def run() -> None:
    models_dir = os.path.join(settings.storage_dir, "models")
    os.makedirs(models_dir, exist_ok=True)

    image_provider = get_model_image_provider()

    db = SessionLocal()
    try:
        if db.query(models.AiModel).count() > 0:
            return

        for m in AI_MODELS:
            thumb_path = os.path.join(models_dir, f"{m['id']}.jpg")
            image_provider.generate_portrait(
                thumb_path,
                model_id=m["id"],
                name=m["name"],
                ethnicity=m["ethnicity"],
                gender=m["gender"],
            )

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
