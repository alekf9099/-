# EasyAPI — 입문자도 쉽게 쓰는 API 테스트 · QA 도구

포스트맨과 같은 기능을 제공하되, **처음 써보는 사람도 헤매지 않고 QA 담당자가 빠르게 검증·자동화할 수 있도록** 만든 웹앱입니다.
PC·모바일(안드로이드/아이폰) 모두 지원하고, 앱처럼 홈 화면에 설치할 수 있어요(PWA). 외부 패키지 0개.

## 주요 기능

| 기능 | 설명 |
|---|---|
| **cURL 자동 가져오기** | 크롬 개발자도구 → Network → 요청 우클릭 → *Copy as cURL* → **주소창에 붙여넣기**만 하면 메서드·파라미터·헤더·바디·인증이 자동 입력. **bash(맥/리눅스)와 cmd(윈도우) 형식 모두 지원** |
| **입문자 모드** | 메서드별 설명, 탭별 도움말, 상태 코드(401, 404 등) 한국어 해설, 오류 원인 안내, 예제 요청, 첫 실행 가이드 |
| **프록시** | HTTP/HTTPS 프록시(아이디/비밀번호 인증, 제외 주소 목록), 연결 테스트 버튼, SSL 인증서 검증 끄기 |
| **요청 관리** | 여러 요청 **탭**, 메서드 색상 구분, 폴더(보관함), 최근 기록(테스트 결과 포함), 메서드 필터·검색 |
| **모바일 검증** | 하단 탭 내비게이션, 큰 터치 영역, 같은 Wi-Fi에서 QR로 접속, 홈 화면 설치, 공유 메뉴로 cURL 받기 |
| **미러링** | 요청 미러링(운영 ↔ 개발 응답 비교) · 기기 미러링(PC ↔ 휴대폰 실시간 동기화) |

## Postman 기능 대응표

| Postman | EasyAPI | 비고 |
|---|---|---|
| Params / Headers / Body / Auth | ✅ | Body: JSON · form-urlencoded · form-data(파일) · raw · **GraphQL** · **binary** |
| Path Variables (`/users/:id`) | ✅ | 파라미터 탭에 자동 표시 |
| Auth 상속 (Inherit from parent) | ✅ | 폴더 설정의 인증을 요청이 이어받음 (새 요청 기본값) |
| Environments / Globals / Collection Variables | ✅ | 우선순위: local > data > environment > collection > globals |
| 동적 변수 `{{$guid}}` `{{$timestamp}}` `{{$randomEmail}}` … | ✅ | 19종 |
| Pre-request Script / Tests (`pm.*`) | ✅ | `pm.test` · `pm.expect`(chai 문법) · `pm.response.to.have.status` · `pm.environment/globals/collectionVariables/variables` · `pm.sendRequest` · `pm.iterationData` · `pm.execution.skipRequest` · `postman.setNextRequest` · 구버전 `tests[]` 문법. Web Worker 샌드박스에서 실행 |
| 폴더 단위 스크립트 | ✅ | 폴더 Pre-request/Tests가 요청 스크립트보다 먼저 실행 |
| Collection Runner | ✅ | 반복 횟수, **CSV/JSON 데이터 파일**, 요청 간 대기, 실패 시 중단, 변수 유지 |
| Newman (CLI) | ✅ | `node cli.js run` — CLI / JUnit / HTML / JSON / Markdown 리포트, 실패 시 종료 코드 1 |
| Cookies 관리 | ✅ | Set-Cookie 자동 저장·첨부(도메인/경로/만료), 직접 추가·삭제 |
| Console | ✅ | 실제 전송 헤더·바디, `console.log`, 경고 |
| Code snippet | ✅ | cURL(bash/cmd) · JavaScript fetch · Python requests |
| Postman 컬렉션 가져오기/내보내기 | ✅ | v2.1 (폴더·스크립트·인증·변수 포함). 내보낼 때 노코드 검증은 `pm.test` 스크립트로 자동 변환 → Newman 에서도 동작 |
| Mock Server · Monitor · WebSocket · OAuth 2.0 흐름 | ❌ | 미지원 (Bearer 토큰으로 대체 가능) |

## QA 를 편하게 하는 기능 (EasyAPI 전용)

| 기능 | 설명 |
|---|---|
| **노코드 검증** | `상태 코드 = 200`, `$.data.id 존재함`, `응답 시간 < 500` 같은 조건을 표처럼 입력. 보낼 때마다 행마다 PASS/FAIL 표시 |
| **응답값 → 변수 저장** | JSON 경로 / 헤더 / 정규식 / 상태 코드를 변수로 저장 → 로그인 토큰 체이닝을 코드 없이 |
| **현재 응답으로 검증 자동 생성** | 지금 받은 응답을 기준으로 상태·응답 시간·주요 필드 검증을 한 번에 생성 (회귀 테스트 기준선) |
| **이슈 리포트 복사** | 재현용 cURL(토큰 자동 가림) + 실패한 검증 + 실제 응답을 Jira·슬랙에 붙여넣기 좋은 마크다운으로 복사 |
| **실행기 결과 → 바로 디버깅** | 실패한 요청을 클릭하면 해당 요청이 응답·테스트 결과와 함께 탭으로 열림 |
| **해석된 주소 미리보기** | `{{host}}/items/:id` → 실제 전송될 주소와 정의되지 않은 변수를 주소창 아래에 표시 |
| **내장 연습 API** | `/qa/*` — 로그인 → 토큰 → 상품 CRUD → 404 확인까지, 외부 서버 없이 바로 연습. "QA 연습" 폴더 기본 제공 |

### 내장 연습 API (`http://localhost:8080/qa`)
| 엔드포인트 | 설명 |
|---|---|
| `POST /qa/login` | `{"username":"qa","password":"1234"}` → `token` |
| `GET /qa/me` | Bearer 토큰 필요 |
| `GET/POST /qa/items`, `GET/PUT/DELETE /qa/items/:id` | 상품 CRUD (쓰기는 토큰 필요, 검증 오류 422) |
| `ANY /qa/echo` | 받은 요청을 그대로 돌려줌 |
| `GET /qa/status/:code`, `GET /qa/delay/:ms` | 원하는 상태 코드 / 지연 응답 |
| `GET /qa/cookies/set?k=v`, `GET /qa/cookies` | 쿠키 저장/확인 |

## 실행 방법

필요한 것: **Node.js 18 이상** (외부 패키지 설치 없음)

```bash
cd easyapi
npm start            # 또는 node server.js
```

```
  PC에서 접속      : http://localhost:8080
  휴대폰(같은 Wi-Fi): http://192.168.0.12:8080
```

### 휴대폰에서 쓰기
1. PC와 휴대폰을 같은 Wi-Fi에 연결
2. 앱의 **설정 → 휴대폰에서 접속**에 표시된 QR을 휴대폰 카메라로 찍기
3. 크롬 메뉴 → **홈 화면에 추가** → 앱처럼 실행
4. 요청은 서버 PC에서 실행되므로 **휴대폰으로 PC의 `localhost` API도 테스트**할 수 있어요

### 단축키
| 키 | 동작 |
|---|---|
| `Ctrl/⌘ + Enter` | 보내기 |
| `Ctrl/⌘ + S` | 저장 |
| `Alt + T` / `Alt + W` | 새 탭 / 탭 닫기 |
| `Ctrl/⌘ + Shift + R` | 실행기 열기 |

## CLI · CI 자동화 (Newman 대체)

```bash
# EasyAPI에서 "폴더 메뉴 → 내보내기" 한 파일, 전체 백업, Postman 컬렉션 모두 사용 가능
node cli.js run shop.easyapi.json -e dev-env.json -r cli,junit,html
node cli.js run postman_collection.json -d users.csv --bail --var host=https://api.dev.example.com
```

| 옵션 | 설명 |
|---|---|
| `-e, --environment <file>` | 환경 파일 (EasyAPI 백업 / Postman 환경 / `{"key":"value"}`) |
| `-g, --globals <file>` · `--var key=value` | 전역 변수 파일 · 변수 직접 지정 |
| `-f, --folder <name>` | 특정 폴더만 실행 |
| `-n, --iterations <n>` · `-d, --data <file>` | 반복 횟수 · CSV/JSON 데이터 파일 |
| `--delay <ms>` · `--timeout <ms>` · `--bail` | 대기 · 타임아웃 · 첫 실패에서 중단 |
| `-k, --insecure` · `--proxy <url>` | SSL 검증 끄기 · 프록시 |
| `-r, --reporters cli,junit,html,json,md` · `-o <dir>` | 리포트 종류 · 저장 폴더 (기본 `./easyapi-reports`) |

실패한 검증이나 요청 오류가 있으면 **종료 코드 1** 을 반환해 CI 파이프라인을 실패 처리합니다.

**GitHub Actions 예시**
```yaml
- uses: actions/setup-node@v4
  with: { node-version: 20 }
- run: node easyapi/cli.js run tests/api.easyapi.json -e tests/staging.json -r cli,junit -o reports
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: api-report, path: reports }
```

## 서버 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 서버 포트 |
| `HOST` | `0.0.0.0` | 바인딩 주소 (`127.0.0.1`이면 PC에서만 접속 가능) |
| `ACCESS_KEY` | (없음) | 설정하면 앱에서 같은 키를 입력해야 사용 가능. **인터넷에 공개하는 서버라면 반드시 설정** |

```bash
ACCESS_KEY=my-secret PORT=3000 node server.js
docker build -t easyapi . && docker run -p 8080:8080 -e ACCESS_KEY=my-secret easyapi
```

## 디자인

| 항목 | 내용 |
|---|---|
| 컬러 | 잉크(#0C0A09) + 라임(#C6F432) 단일 포인트, 무채색 중심. 다크 모드는 주요 버튼이 라임으로 반전 |
| 서체 | Geist / Geist Mono (영문·코드) + Pretendard (한글) |
| 스타일 | 1px 헤어라인 보더, 6~8px 라운드, 그림자는 모달에만. 이모지·그라데이션 없음 |
| 모바일 | Android Material 3 내비게이션 바, 바텀 시트 모달, 44px 이상 터치 영역 |
| 스토어 그래픽 | `store/feature-graphic.png` (Google Play 그래픽 이미지 1024×500) |

## 구조

```
easyapi/
├── server.js              # 중계 서버 (CORS 우회, 프록시, 리다이렉트, 압축 해제, 기기 미러링 SSE, /qa 연습 API)
├── cli.js                 # 컬렉션 CLI 실행기 (Newman 대체)
├── public/
│   ├── index.html · css/style.css
│   ├── js/curl.js         # cURL 파서 / 생성기 (bash · cmd)
│   ├── js/engine.js       # 실행 엔진: 변수 · pm 스크립트 · 검증 · 러너 · 리포트 · Postman 변환 (브라우저/Node 공용)
│   ├── js/sandbox-worker.js  # 스크립트 격리 실행 (Web Worker)
│   ├── js/app.js          # 화면 로직
│   └── sw.js · manifest.webmanifest · icons/   # PWA
├── store/                 # 스토어 그래픽
└── test/                  # npm test (cURL 파서 · 엔진 23개 테스트)
```

## 보안 참고
- 데이터(보관함·기록·토큰·쿠키)는 **각 기기의 브라우저에만** 저장됩니다.
- 서버는 받은 주소로 요청을 대신 보내는 중계기이므로, 외부에 공개할 때는 `ACCESS_KEY`를 꼭 설정하세요.
- 스크립트는 화면과 분리된 Web Worker에서 실행되지만, **다른 사람에게 받은 컬렉션의 스크립트는 내용을 확인한 뒤 실행**하세요. (CLI는 Node 프로세스에서 실행)
- 이슈 리포트 복사 시 `Authorization` · `Cookie` · `X-API-Key` 값은 자동으로 가려집니다.

## 테스트
```bash
npm test
```
