from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user
from app.models import CREDIT_PACKAGES

router = APIRouter()


def _to_millis(dt: datetime | None) -> int | None:
    return int(dt.timestamp() * 1000) if dt else None


@router.get("/user/profile", response_model=schemas.ApiResponse[schemas.UserProfileDto])
def get_profile(user: models.User = Depends(get_current_user)):
    data = schemas.UserProfileDto(
        id=user.id,
        email=user.email,
        credits=user.credits,
        subscription_type=user.subscription_type,
        subscription_expires_at=_to_millis(user.subscription_expires_at),
    )
    return schemas.ApiResponse(success=True, data=data)


@router.post("/user/credits/purchase", response_model=schemas.ApiResponse[schemas.CreditBalanceDto])
def purchase_credits(
    payload: schemas.PurchaseRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    added = CREDIT_PACKAGES.get(payload.package_id)
    if added is None:
        raise HTTPException(status_code=400, detail="유효하지 않은 크레딧 패키지입니다.")

    # TODO: 프로덕션에서는 Google Play Developer API로 purchase_token 검증 필요
    user.credits += added
    db.commit()

    data = schemas.CreditBalanceDto(credits=user.credits, added_credits=added)
    return schemas.ApiResponse(success=True, data=data)
