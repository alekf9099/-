# 🎤 싱턴 노래방 (SingTurn)

한 폰으로 **돌아가며 부르고, 실시간 채점으로 겨루는** 안드로이드 노래방 앱

## 핵심 기능

| 기능 | 내용 |
|---|---|
| 🎉 **파티 모드** | 참가자 등록 → 각자 곡 예약 → 순서 자동 진행 (차례대로 / 랜덤 / 꼴찌 먼저), 넘기기, 3·2·1 카운트다운, 차례 진동 알림, 오늘의 순위, 벌칙 룰렛 |
| 🎯 **실시간 채점** | YIN 음정 검출로 기준 멜로디와 비교 → 음정·박자·안정감 점수, PERFECT/GREAT/GOOD/MISS 판정, 콤보 |
| 🏆 **랭킹** | 곡별 TOP(플레이어별 최고점) · 이번 주 시즌(매주 월요일 초기화) · 플레이어 평균 순위, 개인 최고 기록 배지 |
| 🎹 **합성 반주** | 악보 데이터(멜로디+코드)로 반주를 앱에서 직접 합성 → 가이드 멜로디 볼륨 조절, 키 ±6 |
| 📁 **내 MR 불러오기** | 기기의 음원 파일 + 선택적 LRC 가사. 업로드 없음, 참고용 점수(랭킹 제외) |
| 🎧 **지연 보정** | 스피커 클릭 → 마이크 왕복 지연 자동 측정, 블루투스용 수동 조절 |

## 저작권 설계

| 구성 요소 | 처리 방식 |
|---|---|
| 내장곡 (작사·작곡) | 저작자 사후 70년이 지난 **퍼블릭 도메인** 곡만 수록 |
| 반주 | 녹음 음원 없이 **앱이 실시간 합성** → 반주 녹음물 권리 문제 없음 |
| 사용자 MR | 기기에서 **재생만**, 업로드·공유 기능 없음 |
| 마이크 | 실시간 분석에만 사용, **녹음·저장·전송 안 함** |
| 신고 창구 | 설정 > 권리침해 신고 (출시 전 `SettingsScreen.kt`의 `RIGHTS_EMAIL` 교체 필요) |

> 저작권이 있는 인기곡을 넣으려면 한국음악저작권협회(KOMCA) 이용허락과, 반주를 쓰는 경우 반주 제작사 계약이 필요합니다.

## 곡 추가하기

`app/src/main/assets/songs.json`에 다음 형식으로 추가합니다.

```json
{
  "id": "my-song", "title": "곡 제목", "credit": "작사·작곡", "license": "퍼블릭 도메인",
  "bpm": 100, "beatsPerBar": 4,
  "lines": ["C4/1/가- D4/1/사 E4/2/한줄"],
  "chords": "C/4"
}
```

- 음표: `음이름/박자/가사` (`C4`=가온 도, `F#4`, `Bb3`), 쉼표 `R/박자`
- 가사 끝의 `-`는 다음 음절과 붙여 표시 (`생-` `일` → "생일")
- 코드: `코드/박자` (`C`, `Am`, `G7`, 코드 없음 `N`), 전체 길이가 멜로디와 같아야 합니다 (테스트로 검증)

## 기술 스택

- Kotlin 2.0 · Jetpack Compose (Material 3) · Navigation Compose
- Room (점수·내 MR 저장) · kotlinx.serialization
- AudioTrack 스트리밍(합성 반주) · MediaPlayer(내 MR) · AudioRecord + 에코 캔슬러(마이크)

```
app/src/main/java/com/singturn/
├── audio/      Synth(반주 합성) · PitchDetector(YIN) · MicCapture · SongPlayer · LatencyCalibrator
├── scoring/    Scorer (음정·박자·안정감, 판정·콤보, MR용 참고 점수)
├── party/      PartySession (순서 규칙 · 예약 · 순위, 순수 로직)
├── data/       곡 파서 · Room DB · 설정
└── ui/         home · party · songs · sing · result · ranking · settings
```

## 빌드 & 테스트

```bash
./gradlew testDebugUnitTest   # 26개 단위 테스트 (채점·순서 규칙·파서·음정 검출·합성→채점 통합)
./gradlew assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
```

Android Studio에서 프로젝트 폴더를 열고 ▶ 실행해도 됩니다. (minSdk 26 / targetSdk 35)
