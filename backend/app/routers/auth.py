from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, security
from app.config import settings
from app.database import get_db

router = APIRouter()


@router.post("/register", response_model=schemas.ApiResponse[schemas.TokenResponse])
def register(payload: schemas.RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 가입된 이메일입니다.")

    user = models.User(
        email=payload.email,
        hashed_password=security.hash_password(payload.password),
        credits=settings.free_credits,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = security.create_access_token(user.id)
    return schemas.ApiResponse(success=True, data=schemas.TokenResponse(access_token=token))


@router.post("/login", response_model=schemas.ApiResponse[schemas.TokenResponse])
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not security.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    token = security.create_access_token(user.id)
    return schemas.ApiResponse(success=True, data=schemas.TokenResponse(access_token=token))
