# AI 샷메이커 (AiShotMaker)

쇼핑몰 사장님을 위한 AI 모델 착용샷 & 누끼 자동화 앱

## 핵심 기능
- **CameraX 고화질 촬영**: 격자 가이드, 터치 포커스, 플래시 제어
- **On-Device 누끼 처리**: ML Kit Subject Segmentation으로 즉시 배경 제거
- **AI 착용샷 생성**: 서버 API 연동 (IDM-VTON 기반 Virtual Try-On)
- **크레딧 / 구독 결제**: Google Play Billing 통합

## 수익 모델
| 플랜 | 가격 | 혜택 |
|------|------|------|
| 무료 | 0원 | 5장 |
| 크레딧 30장 | 9,900원 | 장당 333원 |
| 크레딧 100장 | 29,000원 | 장당 290원 |
| 크레딧 300장 | 69,900원 | 장당 233원 |
| 월 구독 | 29,000원/월 | 100장, 장당 290원 |

## 기술 스택
- **언어**: Kotlin
- **아키텍처**: MVVM + Clean Architecture
- **DI**: Hilt
- **카메라**: CameraX 1.3
- **On-Device AI**: ML Kit Subject Segmentation
- **네트워크**: Retrofit 2 + OkHttp
- **이미지 로딩**: Coil
- **Navigation**: Navigation Component + Safe Args
- **결제**: Google Play Billing KTX

## 화면 구조
```
홈 (히스토리 그리드)
 └── 카메라 (CameraX 촬영 / 갤러리 선택)
      └── 편집 (누끼 미리보기 + AI 모델 선택)
           └── 처리중 (Lottie 애니메이션 + 진행률)
                └── 결과 (저장 / 공유)
구독 (크레딧 패키지 / 월 구독)
```

## 서버 API 연동 (백엔드 별도 구현 필요)
- `POST /generate` — 착용샷 생성 요청
- `GET /generate/{jobId}/status` — 생성 상태 폴링
- `GET /models` — AI 모델 목록
- `GET /user/profile` — 크레딧 / 구독 정보
