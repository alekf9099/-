# ECHOLING (에코링) 🐾

> 15분 몬스터 테이밍 로그라이크 · 안드로이드 퍼스트 · 100% 오리지널 IP

에코링을 포획하고, 같은 속성끼리 **공명** 시너지를 맞추고, **부적** 조합으로 빌드를 완성해 3개의 액트를 돌파하세요.
기획 전문은 [`docs/GDD.md`](docs/GDD.md).

## 주요 특징
| | |
|---|---|
| ⚔️ **EN 전투** | 매 턴 충전되는 에코 에너지(최대 3)로 기술 사용 — 아껴서 궁극기 or 매 턴 견제 |
| 🔗 **공명** | 같은 속성 2/3마리 → 세트 보너스 (화상 부여, 흡혈, 상태이상 면역 등 8종) |
| 🧿 **부적 24종** | 런 한정 패시브 — 조합으로 사기 빌드 만들기 |
| 🔵 **포획** | 확률을 버튼에 그대로 표시, 3단 흔들림 연출, 포획 즉시 풀HP 합류 |
| 🧬 **에코 퓨전** | 한 마리를 떠나보내고 기술·경험치를 다른 에코링에 계승 |
| 🗺️ **분기 맵** | 야생/테이머/엘리트/상점/캠프/이벤트/보물/보스 |
| 📅 **데일리** | 전 세계 동일 시드 + 오늘의 규칙 6종 |
| 🔬 **메타 진행** | 에코 결정으로 연구소 업그레이드 · 스타터 해금 · 도감 |
| 📱 **모바일 UX** | 세로·한 손 조작, 하단 시트, 햅틱, AUTO·x3 배속, 백버튼, 노드 단위 자동저장 |

## 빠른 시작
```bash
cd echoling
npm install
npm run dev        # http://localhost:5173 (폰에서 같은 와이파이로 접속 가능: --host)
npm test           # 단위 테스트 + 300런 밸런스 시뮬레이션
npm run build      # dist/ 생성 (gzip ~46KB)
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
