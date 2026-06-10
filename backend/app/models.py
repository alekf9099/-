import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    auth_provider = Column(String, default="EMAIL", nullable=False)  # EMAIL, GOOGLE
    credits = Column(Integer, default=5, nullable=False)
    subscription_type = Column(String, default="FREE", nullable=False)
    subscription_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    jobs = relationship("GenerationJob", back_populates="user")


class AiModel(Base):
    __tablename__ = "ai_models"

    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    thumbnail_url = Column(String, nullable=False)
    ethnicity = Column(String, nullable=False)  # ASIAN, WESTERN, DIVERSE
    gender = Column(String, nullable=False)  # FEMALE, MALE, UNISEX
    is_premium = Column(Boolean, default=False, nullable=False)


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="PENDING", nullable=False)  # PENDING/PROCESSING/COMPLETED/FAILED
    original_image_url = Column(String, nullable=False)
    removed_bg_image_url = Column(String, nullable=True)
    result_image_url = Column(String, nullable=True)
    selected_model_id = Column(String, ForeignKey("ai_models.id"), nullable=False)
    credits_used = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(String, nullable=True)

    user = relationship("User", back_populates="jobs")
    ai_model = relationship("AiModel")


# 크레딧 패키지 (스마트스토어 사장님 대상 가격 정책)
CREDIT_PACKAGES = {
    "credits_30": 30,
    "credits_100": 100,
    "credits_300": 300,
}
