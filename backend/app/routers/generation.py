import os
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.database import SessionLocal, get_db
from app.deps import get_current_user
from app.services.bg_removal import FloodFillBgRemoval
from app.services.vton import get_vton_provider

router = APIRouter()

bg_remover = FloodFillBgRemoval()
vton_provider = get_vton_provider()


def _to_millis(dt: datetime | None) -> int | None:
    return int(dt.timestamp() * 1000) if dt else None


def _job_to_dto(job: models.GenerationJob, remaining_credits: int | None = None) -> schemas.GenerationJobDto:
    return schemas.GenerationJobDto(
        id=job.id,
        status=job.status,
        original_image_url=job.original_image_url,
        removed_bg_image_url=job.removed_bg_image_url,
        result_image_url=job.result_image_url,
        selected_model_id=job.selected_model_id,
        created_at=_to_millis(job.created_at),
        completed_at=_to_millis(job.completed_at),
        credits_used=job.credits_used,
        remaining_credits=remaining_credits,
    )


@router.post("/generate", response_model=schemas.ApiResponse[schemas.GenerationJobDto])
def generate(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    model_id: str = Form(...),
    remove_bg: str = Form("true"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.credits <= 0:
        raise HTTPException(status_code=402, detail="크레딧이 부족합니다.")

    ai_model = db.query(models.AiModel).filter(models.AiModel.id == model_id).first()
    if not ai_model:
        raise HTTPException(status_code=404, detail="선택한 AI 모델을 찾을 수 없습니다.")

    job_id = uuid.uuid4().hex
    job_dir = os.path.join(settings.storage_dir, "jobs", job_id)
    os.makedirs(job_dir, exist_ok=True)

    original_path = os.path.join(job_dir, "original.jpg")
    with open(original_path, "wb") as f:
        f.write(image.file.read())

    job = models.GenerationJob(
        id=job_id,
        user_id=user.id,
        status="PENDING",
        original_image_url=f"{settings.base_url}/static/jobs/{job_id}/original.jpg",
        selected_model_id=model_id,
        credits_used=1,
    )
    db.add(job)
    user.credits -= 1
    db.commit()
    db.refresh(job)

    background_tasks.add_task(
        _process_generation_job,
        job_id=job_id,
        original_path=original_path,
        job_dir=job_dir,
        model_id=model_id,
        model_name=ai_model.name,
        do_remove_bg=remove_bg.lower() == "true",
    )

    return schemas.ApiResponse(success=True, data=_job_to_dto(job, remaining_credits=user.credits))


def _process_generation_job(
    job_id: str,
    original_path: str,
    job_dir: str,
    model_id: str,
    model_name: str,
    do_remove_bg: bool,
) -> None:
    """백그라운드에서 실행되는 생성 파이프라인 (배경제거 → VTON 합성).

    독립적인 DB 세션을 사용하며, 실패 시 사용한 크레딧을 환불한다.
    """
    db = SessionLocal()
    try:
        job = db.query(models.GenerationJob).filter(models.GenerationJob.id == job_id).first()
        if job is None:
            return

        job.status = "PROCESSING"
        db.commit()

        time.sleep(1.5)  # 처리 단계를 체감할 수 있도록 약간의 지연

        garment_path = original_path
        if do_remove_bg:
            removed_path = os.path.join(job_dir, "removed_bg.png")
            try:
                bg_remover.remove_background(original_path, removed_path)
                job.removed_bg_image_url = f"{settings.base_url}/static/jobs/{job_id}/removed_bg.png"
                garment_path = removed_path
            except Exception:
                pass  # 배경 제거 실패 시 원본으로 계속 진행
            db.commit()

        time.sleep(1.5)

        result_path = os.path.join(job_dir, "result.jpg")
        vton_provider.generate(garment_path, model_id, model_name, result_path)

        job.result_image_url = f"{settings.base_url}/static/jobs/{job_id}/result.jpg"
        job.status = "COMPLETED"
        job.completed_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        job = db.query(models.GenerationJob).filter(models.GenerationJob.id == job_id).first()
        if job:
            job.status = "FAILED"
            job.error_message = str(e)
            user = db.query(models.User).filter(models.User.id == job.user_id).first()
            if user:
                user.credits += job.credits_used
            db.commit()
    finally:
        db.close()


@router.get("/generate/{job_id}/status", response_model=schemas.ApiResponse[schemas.GenerationJobDto])
def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    job = (
        db.query(models.GenerationJob)
        .filter(models.GenerationJob.id == job_id, models.GenerationJob.user_id == user.id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    return schemas.ApiResponse(success=True, data=_job_to_dto(job, remaining_credits=user.credits))


@router.get("/history", response_model=schemas.ApiResponse[list[schemas.GenerationJobDto]])
def get_history(
    page: int = 0,
    size: int = 20,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    jobs = (
        db.query(models.GenerationJob)
        .filter(models.GenerationJob.user_id == user.id)
        .order_by(models.GenerationJob.created_at.desc())
        .offset(page * size)
        .limit(size)
        .all()
    )
    data = [_job_to_dto(j) for j in jobs]
    return schemas.ApiResponse(success=True, data=data)
