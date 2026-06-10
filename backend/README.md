# AI 샷메이커 백엔드

쇼핑몰 의류 사진 → AI 모델 착샷 자동 생성 서비스의 백엔드 API입니다.
Android 앱(`ApiService.kt`)과 1:1로 매칭되는 `/v1` REST API를 FastAPI로 제공합니다.

## 기술 스택

- Python 3.11 + FastAPI
- SQLAlchemy ORM (SQLite)
- JWT 인증 (python-jose) + bcrypt (passlib)
- Pillow (이미지 처리)
- Pydantic v2 (camelCase 직렬화로 Android DTO와 매칭)

## 아키텍처

배경 제거(누끼)와 가상 피팅(VTON)은 추상 인터페이스로 분리되어 있어,
지금은 Mock 구현체로 동작하고 추후 실제 AI 모델/외부 API로 교체할 수 있습니다.

- `app/services/bg_removal.py`
  - `BgRemovalProvider` (ABC) → `FloodFillBgRemoval` (현재 사용, 단순 플러드필 기반)
  - 추후 `RembgProvider`, 클라우드 API 등으로 교체 가능
- `app/services/vton.py`
  - `VTONProvider` (ABC) → `MockVTONProvider` (현재 사용, 합성 이미지 생성)
  - 추후 `RemoteVTONProvider` (Replicate, RunPod 등 IDM-VTON 호스팅)로 교체 가능

## 실행 방법

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env  # 필요시 값 수정

uvicorn app.main:app --reload
```

서버가 시작되면:
- `Base.metadata.create_all()`로 SQLite 테이블 자동 생성
- `app/seed.py`가 데모 AI 모델 6종을 자동 시딩 (썸네일 이미지 자동 생성)
- 업로드/생성 결과 파일은 `storage/` 디렉토리에 저장되고 `/static`으로 서빙됨

## API 엔드포인트 (`/v1`)

| Method | Path | 설명 |
| --- | --- | --- |
| POST | `/v1/auth/register` | 회원가입 (이메일/비밀번호), 무료 크레딧 5개 지급 |
| POST | `/v1/auth/login` | 로그인, JWT 토큰 발급 |
| GET | `/v1/models` | AI 모델(가상 피팅 모델) 목록 조회 |
| POST | `/v1/generate` | 옷 사진 업로드 → 배경 제거 + 모델 착샷 생성 작업 시작 |
| GET | `/v1/generate/{jobId}/status` | 생성 작업 상태/결과 조회 |
| GET | `/v1/history` | 생성 이력 조회 (페이지네이션) |
| GET | `/v1/user/profile` | 내 프로필(크레딧, 구독 정보) 조회 |
| POST | `/v1/user/credits/purchase` | 크레딧 패키지 구매 (인앱결제 토큰 검증은 TODO) |

모든 인증 필요 엔드포인트는 `Authorization: Bearer <accessToken>` 헤더가 필요합니다.

## 간단한 테스트

```bash
# 회원가입
curl -X POST http://localhost:8000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass1234"}'

# 모델 목록 (위에서 받은 accessToken 사용)
curl http://localhost:8000/v1/models -H "Authorization: Bearer <TOKEN>"

# 생성 요청
curl -X POST http://localhost:8000/v1/generate \
  -H "Authorization: Bearer <TOKEN>" \
  -F "image=@garment.jpg" \
  -F "model_id=model_emma" \
  -F "remove_bg=true"

# 작업 상태 폴링
curl http://localhost:8000/v1/generate/<jobId>/status -H "Authorization: Bearer <TOKEN>"
```
