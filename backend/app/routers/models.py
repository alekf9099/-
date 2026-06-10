from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_user

router = APIRouter()


@router.get("/models", response_model=schemas.ApiResponse[list[schemas.AiModelDto]])
def get_models(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    items = db.query(models.AiModel).all()
    data = [
        schemas.AiModelDto(
            id=m.id,
            name=m.name,
            thumbnail_url=m.thumbnail_url,
            ethnicity=m.ethnicity,
            gender=m.gender,
            is_premium=m.is_premium,
        )
        for m in items
    ]
    return schemas.ApiResponse(success=True, data=data)
