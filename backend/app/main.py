import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import seed
from app.config import settings
from app.database import Base, engine
from app.routers import auth, generation, models, user

Base.metadata.create_all(bind=engine)

os.makedirs(settings.storage_dir, exist_ok=True)
seed.run()

app = FastAPI(title="AI 샷메이커 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=settings.storage_dir), name="static")

app.include_router(auth.router, prefix="/v1/auth", tags=["auth"])
app.include_router(models.router, prefix="/v1", tags=["models"])
app.include_router(generation.router, prefix="/v1", tags=["generation"])
app.include_router(user.router, prefix="/v1", tags=["user"])


@app.get("/")
def health_check():
    return {"status": "ok", "service": "ai-shot-maker-api"}
