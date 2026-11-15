# EasyAPI — 입문자도 쉽게 쓰는 API 테스트 도구

포스트맨처럼 API를 테스트하되, **처음 써보는 사람도 헤매지 않도록** 만든 웹앱입니다.
PC·모바일(안드로이드/아이폰) 모두 지원하고, 앱처럼 홈 화면에 설치할 수 있어요(PWA).

## 주요 기능

| 기능 | 설명 |
|---|---|
| **cURL 자동 가져오기** | 크롬 개발자도구 → Network → 요청 우클릭 → *Copy as cURL* → **주소창에 붙여넣기**만 하면 메서드·파라미터·헤더·바디·인증이 자동 입력. **bash(맥/리눅스)와 cmd(윈도우) 형식 모두 지원** |
| **입문자 모드** | 메서드별 설명, 탭별 도움말, 상태 코드(401, 404 등) 한국어 해설, 오류 원인 안내, 예제 요청, 첫 실행 가이드 |
| **프록시** | HTTP/HTTPS 프록시(아이디/비밀번호 인증, 제외 주소 목록), 연결 테스트 버튼, SSL 인증서 검증 끄기 |
| **요청 관리** | GET·POST·PUT·PATCH·DELETE·HEAD·OPTIONS 색상 구분, 폴더(보관함), 최근 기록 자동 저장, 메서드 필터·검색, 환경 변수 `{{baseUrl}}` |
| **바디 형식** | JSON(실시간 검증·자동 정렬), 폼(urlencoded), 파일 첨부(multipart, 휴대폰 파일 선택 가능), 텍스트/XML |
| **모바일 검증** | 하단 탭 내비게이션, 큰 터치 영역, 같은 Wi-Fi에서 QR로 접속, 홈 화면 설치, 공유 메뉴로 cURL 받기 |
| **요청 미러링** | 같은 요청을 **두 서버(예: 운영 ↔ 개발)에 동시에** 보내고 상태·본문·헤더 차이를 비교 |
| **기기 미러링** | PC ↔ 휴대폰 화면 실시간 동기화. 한쪽에서 편집/전송하면 다른 기기에도 그대로 표시 |
| **코드 내보내기** | cURL(bash / cmd), JavaScript fetch, Python requests |
| **가져오기/내보내기** | EasyAPI 백업 JSON, **Postman 컬렉션 v2.1 / 환경 파일** 가져오기 |

## 디자인

| 항목 | 내용 |
|---|---|
| 컬러 | 잉크(#0C0A09) + 라임(#C6F432) 단일 포인트, 무채색 중심. 다크 모드는 주요 버튼이 라임으로 반전 |
| 서체 | Geist / Geist Mono (영문·코드) + Pretendard (한글) |
| 스타일 | 1px 헤어라인 보더, 6~8px 라운드, 그림자는 모달에만. 이모지·그라데이션 없음 |
| 모바일 | Android Material 3 내비게이션 바(활성 인디케이터 필), 바텀 시트 모달, 44px 이상 터치 영역 |
| 스토어 그래픽 | `store/feature-graphic.png` (Google Play 그래픽 이미지 1024×500, 원본은 `feature-graphic.html`) |

## 실행 방법

필요한 것: **Node.js 18 이상** (외부 패키지 설치 없음)

```bash
cd easyapi
npm start            # 또는 node server.js
```

실행하면 접속 주소가 표시됩니다.

```
  PC에서 접속      : http://localhost:8080
  휴대폰(같은 Wi-Fi): http://192.168.0.12:8080
```

### 휴대폰에서 쓰기
1. PC와 휴대폰을 같은 Wi-Fi에 연결
2. 앱의 **설정 → 휴대폰에서 접속**에 표시된 QR을 휴대폰 카메라로 찍기
3. 크롬 메뉴 → **홈 화면에 추가** → 앱처럼 실행
4. 요청은 서버 PC에서 실행되므로 **휴대폰으로 PC의 `localhost` API도 테스트**할 수 있어요

### 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 서버 포트 |
| `HOST` | `0.0.0.0` | 바인딩 주소 (`127.0.0.1`이면 PC에서만 접속 가능) |
| `ACCESS_KEY` | (없음) | 설정하면 앱에서 같은 키를 입력해야 사용 가능. **인터넷에 공개하는 서버라면 반드시 설정** |

```bash
ACCESS_KEY=my-secret PORT=3000 node server.js
```

### Docker
```bash
docker build -t easyapi .
docker run -p 8080:8080 -e ACCESS_KEY=my-secret easyapi
```

## 구조

```
easyapi/
├── server.js            # 중계 서버 (CORS 우회, 프록시, 리다이렉트, gzip/br 해제, 기기 미러링 SSE)
├── public/
│   ├── index.html       # 화면 구조
│   ├── css/style.css    # 디자인 시스템 (라이트/다크, 반응형)
│   ├── js/curl.js       # cURL 파서 / 생성기 (bash · cmd)
│   ├── js/app.js        # 앱 로직
│   ├── sw.js, manifest.webmanifest, icons/   # PWA
└── test/curl.test.js    # cURL 파서 테스트 (npm test)
```

## 왜 서버가 필요한가요?
브라우저는 보안 정책(CORS) 때문에 다른 사이트의 API를 마음대로 호출할 수 없어요.
EasyAPI 서버가 대신 요청을 보내 주기 때문에 **모든 API를 제한 없이** 테스트할 수 있고, 프록시도 쓸 수 있습니다.
서버 없이 정적 호스팅(GitHub Pages 등)에 올리면 자동으로 *브라우저 직접 전송* 모드로 동작합니다 (CORS가 허용된 API만 가능).

## 보안 참고
- 데이터(보관함·기록·토큰)는 **각 기기의 브라우저에만** 저장됩니다.
- 서버는 받은 주소로 요청을 대신 보내는 중계기이므로, 외부에 공개할 때는 `ACCESS_KEY`를 꼭 설정하세요.

## 테스트
```bash
npm test
```
