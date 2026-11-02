# ECHOLING v0.5 — 업적·해금 + 배경음악·효과음

## 1. 업적 · 해금 시스템 (재방문 동기)
- **업적 16종**: 첫 승리, 도감 8/15종, 액트 1·2 보스, 클리어, 각성 3 클리어, 1마리 솔로 클리어, 공명 2단계, 부적 6개, 이로치, 최종 진화, 엘리트 누적 5, 데일리 완주, 에코 퓨전, 골드 500
- **특별 부적 7종은 처음엔 잠김** → 업적으로 해금 (눈덩이·메아리 방·불사조 깃털·미다스의 손·유리 심장·외로운 늑대·과충전)
  - 첫 플레이 선택지를 단순하게 유지하고, 성장할수록 빌드 폭이 넓어지는 구조
  - 해금 즉시 진행 중인 런에서도 등장
- 진행도 막대(도감·부적·엘리트·골드), 달성 시 상단 금색 팝업 + 보상 지급
- 판정 시점: 노드 완료마다 + 런 종료 시 (`src/data/achievements.ts` 순수 로직, 테스트 4종)

## 2. 오디오 (모두 CC0 — 상업적 이용·수정 자유, 표기 의무 없음, 크레딧은 설정 화면에 표시)
| 용도 | 출처 (OpenGameArt) |
|---|---|
| 타이틀 BGM | Blue Meadow In Green Sky |
| 맵 BGM | Flowerbed Fields [Loop] |
| 전투 BGM | Fast fight / battle music (looped) |
| 보스 BGM | Determined Pursuit (epic orchestra loop) |
| UI 효과음 | Kenney — Interface Sounds |
| 타격·마법·코인·보석·포효 | 80 CC0 RPG SFX |
| 레벨업·승리·진화·패배 징글 | Level up, power up, Coin get (13 Sounds) |

- 처리: ffmpeg로 라우드니스 정규화(BGM -18 LUFS, SFX -16 LUFS) + Vorbis 압축 → BGM 2.8MB(트랙별 필요 시 로드), SFX 208KB
- 엔진(`src/ui/audio.ts`): WebAudio 샘플(재생마다 피치 ±4%로 반복 피로 감소) + 로드 전 합성음 폴백, BGM 크로스페이드, 첫 터치 후 재생(모바일 자동재생 정책), 앱 백그라운드 시 일시정지
- 설정: 배경음악 / 효과음 개별 토글
