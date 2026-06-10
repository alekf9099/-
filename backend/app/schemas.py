from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class CamelModel(BaseModel):
    """Android Retrofit DTO와 매칭되도록 camelCase JSON으로 직렬화."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, protected_namespaces=())


class ApiResponse(CamelModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    message: Optional[str] = None
    error_code: Optional[str] = None


# ===== AI Model =====
class AiModelDto(CamelModel):
    id: str
    name: str
    thumbnail_url: str
    ethnicity: str
    gender: str
    is_premium: bool


# ===== Generation Job =====
class GenerationJobDto(CamelModel):
    id: str
    status: str
    original_image_url: str
    removed_bg_image_url: Optional[str] = None
    result_image_url: Optional[str] = None
    selected_model_id: str
    created_at: int
    completed_at: Optional[int] = None
    credits_used: Optional[int] = None
    remaining_credits: Optional[int] = None


# ===== User =====
class UserProfileDto(CamelModel):
    id: str
    email: str
    credits: int
    subscription_type: str
    subscription_expires_at: Optional[int] = None


class CreditBalanceDto(CamelModel):
    credits: int
    added_credits: int


class PurchaseRequest(CamelModel):
    package_id: str
    purchase_token: str


# ===== Auth =====
class RegisterRequest(CamelModel):
    email: EmailStr
    password: str


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
