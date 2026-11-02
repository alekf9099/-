# ECHOLING (에코링) 🐾

> 15분 몬스터 테이밍 로그라이크 · 안드로이드 퍼스트 · 100% 오리지널 IP

에코링을 포획하고, 같은 속성끼리 **공명** 시너지를 맞추고, **부적** 조합으로 빌드를 완성해 3개의 액트를 돌파하세요.
기획 전문은 [`docs/GDD.md`](docs/GDD.md).

## 주요 특징
| | |
|---|---|
| ⚔️ **EN 전투** | 매 턴 충전되는 에코 에너지(최대 3)로 기술 사용 — 아껴서 궁극기 or 매 턴 견제 |
| 🔗 **공명** | 같은 속성 2/3마리 → 세트 보너스 (화상 부여, 흡혈, 상태이상 면역 등 8종) |
| 🧿 **부적 35종** | 런 한정 패시브 — 조합으로 사기 빌드 만들기 |
| 🔵 **포획** | 확률을 버튼에 그대로 표시, 3단 흔들림 연출, 포획 즉시 풀HP 합류 |
| 🧬 **에코 퓨전** | 한 마리를 떠나보내고 기술·경험치를 다른 에코링에 계승 |
| 🗺️ **분기 맵** | 야생/테이머/엘리트/상점/캠프/이벤트/보물/보스 |
| 📅 **데일리** | 전 세계 동일 시드 + 오늘의 규칙 6종 |
| 🔬 **메타 진행** | 에코 결정으로 연구소 업그레이드 · 스타터 해금 · 도감 |
| 🎯 **행동 예고** (v0.2) | 적의 이번 턴 기술·예상 피해 공개 → 보고 상성 교체 |
| 🌅 **출발 축복** (v0.2) | 런 시작 3택1, 대가형 계약 포함 |
| 💢 **보스 분노 · 엘리트 접두사** (v0.2) | HP 50% 페이즈 전환, 가시·재생·철갑 등 6종 |
| 🌈 **전설 부적** (v0.2) | 눈덩이·메아리 방·불사조·미다스 등 빌드 정의 부적 |
| 🔥 **각성 0~10** (v0.2) | 클리어할 때마다 다음 난이도 해금, 결정 보너스 |
| 📸 **결과 카드** (v0.2) | 빌드·시드 요약 + 결과 복사로 공유 |
| 🏆 **업적 16종** (v0.5) | 달성 시 결정 보상 · 특별 부적 7종 해금 |
| 🎵 **BGM·효과음** (v0.5) | CC0 음원 4곡 + 효과음 20종, 화면별 자동 전환 |
| 📱 **모바일 UX** | 세로·한 손 조작, 하단 시트, 햅틱, AUTO·x3 배속, 백버튼, 노드 단위 자동저장 |

## 🎨 아트 파이프라인
- 34종 전부 **Canva AI로 생성한 오리지널 3D 치비 일러스트** (`public/sprites/*.webp`, 384px · 투명 배경 · 총 ~1.2MB)
- 재생성 절차: Canva `generate-image` → 6×6 시트(3072px)로 배치·PNG 내보내기 → `python3 tools/cutout.py art/sheet-3072.webp public/sprites art/canva-media.json`
  - 흰 배경 자동 제거(테두리 flood fill + 경계 알파 + halo 제거), 자동 크롭·하단 정렬
- 일러스트가 없는 종은 `src/ui/sprite.ts`의 벡터 렌더러로 자동 폴백

### UI 에셋 (v0.3) — 직접 그린 그래픽 없이 도구로 제작
| 영역 | 도구 | 산출물 |
|---|---|---|
| 배경 일러스트 (액트 3 + 타이틀) | Canva AI `generate-image` | `public/ui/bg_*.webp` (720×1280) |
| 맵 노드 아이콘 8 · 아이템 아이콘 8 · 속성 엠블럼 8 | Canva AI `generate-image` | `public/ui/{node,item,el}_*.webp` (투명) |
| UI 컨트롤 아이콘 (뒤로·닫기·가방·파티 등) | [Lucide](https://lucide.dev) (ISC) | `src/ui/assets.ts` `ico()` |
| 서체 | Pretendard(본문) · Jua(제목) · Lilita One(숫자/로고), OFL | `src/fonts/*.woff2` — **fonttools**로 게임 글자만 서브셋 (총 240KB) |

- 원본 시트(3072px)는 `art/`에 보관, Canva 미디어 ID는 `art/canva-ui-media.json`
- 재생성: `npm run assets:ui` (시트 → 아이콘 배경 제거·리사이즈), `npm run assets:fonts` (텍스트 변경 시 서브셋 재생성)

## 빠른 시작
```bash
cd echoling
npm install
npm run dev        # http://localhost:5173 (폰에서 같은 와이파이로 접속 가능: --host)
npm test           # 단위 테스트 + 300런 밸런스 시뮬레이션
npm run build      # dist/ 생성 (코드 ~51KB gzip + 일러스트·폰트 ~2.2MB)
```

## 📦 안드로이드 APK/AAB 빌드 (Capacitor)
필요: Android Studio (JDK 17+, Android SDK)
```bash
npm run build
npx cap add android      # 최초 1회: android/ 프로젝트 생성
npx cap sync android     # 웹 빌드 → 네이티브 프로젝트 복사
npx cap open android     # Android Studio 열기 → Build > Generate Signed Bundle (AAB)
```
- 세로 고정: `android/app/src/main/AndroidManifest.xml`의 `<activity>`에 `android:screenOrientation="portrait"` 추가
- 하드웨어 뒤로가기는 `@capacitor/app` 리스너로 이미 처리됨 (`src/main.ts`)
- Play Console 출시 체크리스트는 [`docs/GDD.md` §10](docs/GDD.md#10-로드맵)

## 프로젝트 구조
```
src/
├─ core/   types.ts · rng.ts (시드 RNG)
├─ data/   elements · species(34) · moves(50) · charms(24+아이템) · world(액트·공명·데일리·메타)
├─ game/   battle (전투 엔진) · map (맵 생성) · run (런 진행) · events · monster (성장) · meta (저장)
└─ ui/     app (라우터) · dom · fx (햅틱/사운드) · sprite (SVG 생성) · components · flow · screens/*
tests/     core · battle · balance(시뮬레이터) · sim.ts
```
게임 로직(`game/`)은 DOM 의존이 없어 Node에서 그대로 테스트·시뮬레이션됩니다.

## 라이선스 / IP
모든 몬스터·이름·아트·세계관은 ECHOLING 오리지널입니다. 특정 상용 게임의 이름·캐릭터·에셋을 사용하지 않습니다.
