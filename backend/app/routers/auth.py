from fastapi import APIRouter, Depends, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
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


@router.post("/google", response_model=schemas.ApiResponse[schemas.TokenResponse])
def login_with_google(payload: schemas.GoogleLoginRequest, db: Session = Depends(get_db)):
    try:
        info = google_id_token.verify_oauth2_token(
            payload.id_token, google_requests.Request(), settings.google_client_id or None
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="유효하지 않은 Google 로그인 토큰입니다.")

    email = info.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Google 계정에서 이메일 정보를 가져올 수 없습니다.")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        user = models.User(
            email=email,
            hashed_password=None,
            auth_provider="GOOGLE",
            credits=settings.free_credits,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = security.create_access_token(user.id)
    return schemas.ApiResponse(success=True, data=schemas.TokenResponse(access_token=token))
