/*
 * Ride Buddy 캐릭터 모델 (레이어 분리형 SVG)
 * ------------------------------------------------------------
 * 레퍼런스: 넓적하고 둥근 얼굴 + 짧은 스포츠머리 + 볼터치(빗금) + ω 입 + 턱수염
 *           + 검정 불꽃 셔츠 + 빨간 네이키드 바이크 (3/4 정면 뷰)
 * 모든 파츠가 id 로 분리돼 있어 CSS(character.css) 로 모션을 줍니다.
 *
 *  #rb-shadow            바닥 그림자
 *  #rb-bike              바이크 뒤쪽(뒷바퀴/엔진/머플러) — 진동
 *    #rb-wheel-rear      뒷바퀴 (.rb-tread 회전)
 *    #rb-exhaust-puffs   배기 연기
 *  #rb-rider             탑승자 — 들썩임
 *    #rb-head            머리 — 기울기/끄덕임
 *      #rb-eyes-normal | -happy | -closed | -wow
 *      #rb-mouth-w | -open | -o
 *  #rb-bike-front        탱크/앞바퀴/전조등/핸들/미러/손
 *    #rb-wheel-front     앞바퀴 (.rb-tread 회전)
 *    #rb-headlight-glow  전조등 빛
 *    #rb-hand-r-grip     오른손(핸들)   ↔  #rb-arm-wave (손 흔들기)
 *  #rb-fx                느낌표 / Zzz / 하트 / 땀
 *
 *  viewBox: 0 0 440 630
 */
(function (global) {
  const C = {
    line: '#3B2B25',
    skin: '#F8E3CB',
    skinShade: '#EDCDAE',
    hair: '#A89C90',
    hairDark: '#8E8277',
    cheek: '#F6A9AE',
    cheekLine: '#D9646F',
    shirt: '#2A2321',
    flameR: '#D9341C',
    flameO: '#F2801C',
    flameY: '#FFC93C',
    red: '#E2412D',
    redDark: '#B12B1E',
    redLight: '#F27560',
    chrome: '#D5D9DC',
    chromeDark: '#8C9298',
    chromeLight: '#F4F6F7',
    tire: '#2B2523',
    tireLight: '#4A403C',
    rim: '#9EA2A6',
    engine: '#4F4D4E',
    engineDark: '#2F2C2C',
    orange: '#F7921E',
    orangeLight: '#FFC46B',
    glass: '#FFF4DC',
    glassLine: '#EBD6AE',
  };
  const S = `stroke="${C.line}" stroke-linejoin="round" stroke-linecap="round"`;
  const VIEW = { w: 440, h: 630 };

  /** 불꽃 한 갈래 (바깥 빨강 → 주황 → 노랑) */
  function flame(x, y, w, h, lean = 0) {
    const tongue = (s, color) => {
      const ww = w * s, hh = h * s;
      const tx = x + lean * hh;
      return `<path fill="${color}" d="M${x - ww / 2},${y} C${x - ww / 2},${y - hh * 0.45} ${tx - ww * 0.25},${y - hh * 0.55} ${tx - ww * 0.05},${y - hh} C${tx + ww * 0.05},${y - hh * 0.72} ${x + ww * 0.55},${y - hh * 0.5} ${x + ww / 2},${y} Z"/>`;
    };
    return tongue(1, C.flameR) + tongue(0.72, C.flameO) + tongue(0.42, C.flameY);
  }
  /** 작은 불꽃 다발 (셔츠 프린트) */
  function cluster(x, y, s = 1) {
    return flame(x - 9 * s, y, 13 * s, 22 * s, -0.2) + flame(x + 9 * s, y, 13 * s, 20 * s, 0.2) + flame(x, y, 16 * s, 32 * s, 0.05);
  }

  /** 아래에서 위로 타오르는 불꽃 줄 */
  function row(x0, x1, y, step, w, hs) {
    let out = '', i = 0;
    for (let x = x0; x <= x1; x += step, i++) out += flame(x, y, w, hs[i % hs.length], (i % 2 ? 0.18 : -0.14));
    return out;
  }

  const TORSO = 'M58,278 Q118,250 219,252 Q322,250 374,272 Q398,302 392,342 L344,374 L108,378 L50,344 Q38,302 58,278 Z';
  const SLEEVE_L = 'M38,292 Q48,258 90,256 Q130,260 138,298 Q126,326 88,328 Q48,326 38,292 Z';
  const SLEEVE_R = 'M304,268 Q350,252 380,276 Q400,306 386,330 Q352,340 320,326 Q298,302 304,268 Z';

  function svg() {
    return `
<svg class="rb-svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" xmlns="http://www.w3.org/2000/svg" aria-label="Ride Buddy 캐릭터">
  <defs>
    <clipPath id="rb-clip-head"><ellipse cx="219" cy="128" rx="150" ry="120"/></clipPath>
    <clipPath id="rb-clip-shirt"><path d="${TORSO}"/></clipPath>
    <clipPath id="rb-clip-sl"><path d="${SLEEVE_L}"/></clipPath>
    <clipPath id="rb-clip-sr"><path d="${SLEEVE_R}"/></clipPath>
    <radialGradient id="rb-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#FFF6C8" stop-opacity=".95"/>
      <stop offset=".55" stop-color="#FFE48A" stop-opacity=".35"/>
      <stop offset="1" stop-color="#FFE48A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rb-chrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.chromeLight}"/>
      <stop offset=".55" stop-color="${C.chrome}"/>
      <stop offset="1" stop-color="${C.chromeDark}"/>
    </linearGradient>
    <linearGradient id="rb-tank" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.redLight}"/>
      <stop offset=".35" stop-color="${C.red}"/>
      <stop offset="1" stop-color="${C.redDark}"/>
    </linearGradient>
  </defs>

  <!-- ===== FX (뒤) : 스피드라인 ===== -->
  <g id="rb-speedlines" stroke="#9AA7B4" stroke-width="5" stroke-linecap="round" opacity="0">
    <line x1="-70" y1="430" x2="-20" y2="430"/>
    <line x1="-100" y1="490" x2="-30" y2="490"/>
    <line x1="-60" y1="560" x2="-10" y2="560"/>
  </g>

  <ellipse id="rb-shadow" cx="205" cy="612" rx="196" ry="14" fill="#2B2523" opacity=".22"/>

  <g id="rb-bike">
    <!-- 뒷바퀴 -->
    <g id="rb-wheel-rear">
      <ellipse cx="66" cy="548" rx="48" ry="62" fill="${C.tire}" ${S} stroke-width="4"/>
      <ellipse class="rb-tread" cx="66" cy="548" rx="42" ry="55" fill="none" stroke="${C.tireLight}" stroke-width="6" stroke-dasharray="7 10"/>
      <ellipse cx="74" cy="548" rx="25" ry="36" fill="${C.rim}" ${S} stroke-width="3"/>
      <ellipse cx="76" cy="548" rx="10" ry="14" fill="url(#rb-chrome)" ${S} stroke-width="2.5"/>
    </g>
    <!-- 프레임 -->
    <path d="M60,430 L120,440 L150,520" fill="none" stroke="${C.engineDark}" stroke-width="10" stroke-linecap="round"/>
    <!-- 리어 쇼크 -->
    <g id="rb-shock">
      <rect x="40" y="424" width="18" height="66" rx="6" fill="${C.engineDark}" ${S} stroke-width="3"/>
      <path d="M36,434 h26 M36,446 h26 M36,458 h26 M36,470 h26" stroke="${C.chromeLight}" stroke-width="5" stroke-linecap="round"/>
      <path d="M36,437 h26 M36,449 h26 M36,461 h26 M36,473 h26" stroke="${C.line}" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    <circle cx="24" cy="420" r="11" fill="${C.orange}" ${S} stroke-width="3"/>
    <circle cx="21" cy="416" r="3.5" fill="${C.orangeLight}"/>

    <!-- 엔진 -->
    <g id="rb-engine">
      <path d="M100,428 L244,432 L248,528 Q206,558 144,552 L104,526 Z" fill="${C.engine}" ${S} stroke-width="3.5"/>
      <path d="M110,446 H238 M110,462 H240 M110,478 H242 M110,494 H242" stroke="${C.engineDark}" stroke-width="5"/>
      <path d="M110,442 H238 M110,458 H240 M110,474 H242 M110,490 H242" stroke="#8A8889" stroke-width="1.8"/>
      <ellipse cx="200" cy="516" rx="28" ry="22" fill="url(#rb-chrome)" ${S} stroke-width="3"/>
      <ellipse cx="200" cy="516" rx="13" ry="10" fill="none" stroke="${C.chromeDark}" stroke-width="2"/>
    </g>

    <!-- 머플러 -->
    <g id="rb-exhaust">
      <path d="M132,512 Q156,520 170,540" fill="none" stroke="${C.line}" stroke-width="16" stroke-linecap="round"/>
      <path d="M132,512 Q156,520 170,540" fill="none" stroke="url(#rb-chrome)" stroke-width="10" stroke-linecap="round"/>
      <path d="M8,478 Q70,484 136,502 L140,532 Q70,536 8,520 Z" fill="url(#rb-chrome)" ${S} stroke-width="3.5"/>
      <path d="M20,488 Q74,492 130,506" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>
      <ellipse cx="8" cy="499" rx="11" ry="21" fill="${C.chromeDark}" ${S} stroke-width="3.5"/>
      <ellipse cx="8" cy="499" rx="5.5" ry="12" fill="#3a3a3a"/>
      <circle cx="48" cy="507" r="4" fill="${C.line}"/>
      <circle cx="62" cy="510" r="4" fill="${C.line}"/>
      <circle cx="76" cy="513" r="4" fill="${C.line}"/>
    </g>
    <g id="rb-exhaust-puffs" fill="#C9CDD2" stroke="#AEB4BA" stroke-width="2" opacity="0">
      <circle class="rb-puff p1" cx="-8" cy="497" r="10"/>
      <circle class="rb-puff p2" cx="-8" cy="497" r="8"/>
      <circle class="rb-puff p3" cx="-8" cy="497" r="12"/>
    </g>
  </g>

  <!-- ===== 탑승자 ===== -->
  <g id="rb-rider">
    <!-- 셔츠 (불꽃 프린트) -->
    <g id="rb-torso">
      <path d="${TORSO}" fill="${C.shirt}"/>
      <g clip-path="url(#rb-clip-shirt)">
        ${row(56, 396, 386, 30, 42, [84, 108, 74, 100, 82, 112, 78, 104, 90, 72, 98, 86])}
        ${cluster(230, 300, 0.75)}${cluster(150, 296, 0.6)}${cluster(318, 300, 0.65)}
      </g>
      <path d="${TORSO}" fill="none" ${S} stroke-width="3.5"/>
      <!-- 카라 -->
      <path d="M176,256 L208,294 L200,258 Z" fill="#3A302C" ${S} stroke-width="2.5"/>
      <path d="M266,258 L236,296 L246,260 Z" fill="#3A302C" ${S} stroke-width="2.5"/>
    </g>

    <!-- 다리 (반바지 + 허벅지) -->
    <g id="rb-leg">
      <path d="M40,332 Q50,314 92,314 L124,346 Q114,376 76,382 Q48,372 40,332 Z" fill="${C.shirt}" ${S} stroke-width="3.5"/>
      <path d="M62,372 Q96,348 132,356 Q152,380 146,414 Q134,440 102,438 Q70,434 62,404 Z" fill="${C.skin}" ${S} stroke-width="3.5"/>
      <path d="M90,418 q14,6 26,-2" fill="none" stroke="${C.skinShade}" stroke-width="3" stroke-linecap="round"/>
    </g>

    <!-- 왼쪽 소매 -->
    <g id="rb-arm-l">
      <path d="${SLEEVE_L}" fill="${C.shirt}"/>
      <g clip-path="url(#rb-clip-sl)">${row(36, 140, 336, 18, 30, [58, 72, 52, 68, 62, 54, 70])}</g>
      <path d="${SLEEVE_L}" fill="none" ${S} stroke-width="3.5"/>
    </g>
    <!-- 오른쪽 소매 -->
    <g id="rb-arm-r">
      <path d="${SLEEVE_R}" fill="${C.shirt}"/>
      <g clip-path="url(#rb-clip-sr)">${row(300, 398, 340, 18, 30, [66, 54, 74, 58, 70, 60])}</g>
      <path d="${SLEEVE_R}" fill="none" ${S} stroke-width="3.5"/>
    </g>

    <!-- ===== 머리 ===== -->
    <g id="rb-head">
      <ellipse cx="219" cy="128" rx="150" ry="120" fill="${C.skin}"/>
      <g clip-path="url(#rb-clip-head)">
        <path id="rb-hair" d="M40,114 Q70,106 92,98 Q118,72 142,52 Q210,42 280,58 Q318,78 342,94 Q368,98 400,112 L400,-10 L40,-10 Z" fill="${C.hair}"/>
        <path d="M80,56 l5,4 M116,30 l4,5 M156,20 l3,5 M204,14 l2,5 M252,16 l2,5 M298,28 l3,5 M334,48 l4,4 M96,80 l5,4 M312,70 l4,4 M180,36 l2,4 M232,34 l2,4 M272,42 l2,4"
          stroke="${C.hairDark}" stroke-width="3" stroke-linecap="round"/>
        <path d="M92,98 Q118,72 142,52 Q210,42 280,58 Q318,78 342,94" fill="none" stroke="${C.line}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
        <path d="M92,98 Q100,112 104,128 M342,94 Q336,110 334,124" fill="none" stroke="${C.line}" stroke-width="2" stroke-linecap="round" opacity=".45"/>
        <ellipse cx="219" cy="250" rx="150" ry="22" fill="${C.skinShade}" opacity=".7"/>
      </g>
      <ellipse cx="219" cy="128" rx="150" ry="120" fill="none" ${S} stroke-width="4.5"/>

      <!-- 눈썹 -->
      <g id="rb-brows" fill="none" stroke="${C.line}" stroke-width="3.2" stroke-linecap="round">
        <path d="M166,104 Q178,96 192,100"/>
        <path d="M260,110 Q273,104 286,111"/>
      </g>
      <!-- 볼터치 -->
      <g id="rb-cheeks">
        <ellipse cx="134" cy="164" rx="25" ry="15" fill="${C.cheek}" opacity=".9"/>
        <ellipse cx="310" cy="178" rx="25" ry="15" fill="${C.cheek}" opacity=".9"/>
        <path d="M122,170 l7,-11 M132,172 l7,-11 M142,172 l7,-11 M298,184 l7,-11 M308,186 l7,-11 M318,186 l7,-11"
          stroke="${C.cheekLine}" stroke-width="2.4" stroke-linecap="round"/>
      </g>

      <!-- 눈 -->
      <g id="rb-eyes-normal" class="rb-eyes">
        <g class="rb-eye"><ellipse cx="179" cy="141" rx="16" ry="17.5" fill="#1E1715"/>
          <circle cx="179" cy="135" r="8" fill="#fff"/><circle cx="185" cy="149" r="2.5" fill="#fff"/></g>
        <g class="rb-eye"><ellipse cx="272" cy="148" rx="16" ry="17.5" fill="#1E1715"/>
          <circle cx="272" cy="142" r="8" fill="#fff"/><circle cx="278" cy="156" r="2.5" fill="#fff"/></g>
      </g>
      <g id="rb-eyes-happy" class="rb-eyes" fill="none" stroke="#1E1715" stroke-width="5" stroke-linecap="round" style="display:none">
        <path d="M164,146 Q179,124 194,146"/><path d="M257,153 Q272,131 287,153"/>
      </g>
      <g id="rb-eyes-closed" class="rb-eyes" fill="none" stroke="#1E1715" stroke-width="5" stroke-linecap="round" style="display:none">
        <path d="M164,141 Q179,152 194,141"/><path d="M257,148 Q272,159 287,148"/>
      </g>
      <g id="rb-eyes-wow" class="rb-eyes" style="display:none">
        <ellipse cx="179" cy="141" rx="19" ry="21" fill="#1E1715"/>
        <circle cx="176" cy="133" r="9.5" fill="#fff"/><circle cx="187" cy="151" r="3.6" fill="#fff"/>
        <path d="M171,152 l3,-6 l3,6 l-3,6 z" fill="#fff"/>
        <ellipse cx="272" cy="148" rx="19" ry="21" fill="#1E1715"/>
        <circle cx="269" cy="140" r="9.5" fill="#fff"/><circle cx="280" cy="158" r="3.6" fill="#fff"/>
        <path d="M264,159 l3,-6 l3,6 l-3,6 z" fill="#fff"/>
      </g>

      <!-- 입 -->
      <g id="rb-mouth-w" fill="none" stroke="${C.line}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M207,172 Q208,185 216,183 Q223,181 224,174 Q225,182 232,184 Q241,185 242,172"/>
        <path d="M220,194 Q224,197 228,194" stroke-width="2.4"/>
      </g>
      <g id="rb-mouth-open" style="display:none">
        <path d="M208,174 Q225,171 242,174 Q241,198 225,199 Q209,198 208,174 Z" fill="#8C3B33" stroke="${C.line}" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M214,192 Q225,185 236,192 Q231,198 225,198 Q219,198 214,192 Z" fill="#F07C80"/>
      </g>
      <g id="rb-mouth-o" style="display:none">
        <ellipse cx="225" cy="184" rx="9" ry="11" fill="#8C3B33" stroke="${C.line}" stroke-width="3.2"/>
      </g>

      <!-- 턱수염 -->
      <g id="rb-stubble" stroke="${C.line}" stroke-width="2.4" stroke-linecap="round" fill="none">
        <path d="M192,220 l1,10 M199,222 l0.5,10 M206,223 l0,10 M213,224 l0,10 M220,224 l0,10 M227,224 l0,10 M234,223 l-0.5,10 M241,222 l-1,10 M248,220 l-1,9"/>
        <path d="M188,218 Q220,230 252,218" stroke-width="2"/>
      </g>
    </g>
  </g>

  <!-- ===== 바이크 앞쪽 ===== -->
  <g id="rb-bike-front">
    <!-- 연료탱크 -->
    <path id="rb-tank" d="M128,392 Q136,360 196,358 Q260,356 282,380 L286,424 Q246,450 186,444 Q136,438 126,412 Z" fill="url(#rb-tank)" ${S} stroke-width="3.8"/>
    <path d="M150,382 Q202,364 266,380" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".85"/>
    <path d="M154,430 Q204,438 262,428" fill="none" stroke="${C.redDark}" stroke-width="3" stroke-linecap="round" opacity=".6"/>

    <!-- 앞바퀴 -->
    <g id="rb-wheel-front">
      <ellipse cx="306" cy="536" rx="66" ry="74" fill="${C.tire}" ${S} stroke-width="4"/>
      <ellipse class="rb-tread" cx="306" cy="536" rx="58" ry="66" fill="none" stroke="${C.tireLight}" stroke-width="8" stroke-dasharray="9 12"/>
      <ellipse cx="296" cy="536" rx="38" ry="47" fill="${C.rim}" ${S} stroke-width="3"/>
      <ellipse cx="296" cy="536" rx="28" ry="36" fill="none" stroke="${C.chromeDark}" stroke-width="2.5"/>
      <ellipse cx="294" cy="536" rx="12" ry="15" fill="url(#rb-chrome)" ${S} stroke-width="2.5"/>
    </g>
    <!-- 포크 -->
    <path d="M278,428 L284,520 M334,428 L326,520" stroke="${C.line}" stroke-width="14" stroke-linecap="round"/>
    <path d="M278,428 L284,520 M334,428 L326,520" stroke="url(#rb-chrome)" stroke-width="8" stroke-linecap="round"/>
    <!-- 앞 펜더 -->
    <path d="M238,490 Q244,446 305,442 Q368,446 374,490 L356,492 Q350,462 305,460 Q262,462 256,492 Z" fill="url(#rb-tank)" ${S} stroke-width="3.5"/>

    <!-- 전조등 -->
    <circle cx="316" cy="392" r="40" fill="#1E1715" ${S} stroke-width="3"/>
    <circle cx="306" cy="392" r="46" fill="url(#rb-chrome)" ${S} stroke-width="4"/>
    <circle cx="306" cy="392" r="36" fill="${C.glass}" ${S} stroke-width="3"/>
    <path d="M288,366 v52 M298,360 v64 M308,358 v68 M318,360 v64 M326,368 v48" stroke="${C.glassLine}" stroke-width="2.4"/>
    <ellipse cx="296" cy="378" rx="10" ry="7" fill="#fff" opacity=".9"/>
    <circle id="rb-headlight-glow" cx="306" cy="392" r="84" fill="url(#rb-glow)" opacity="0"/>

    <!-- 앞 깜빡이 -->
    <path d="M228,388 L262,390 M352,400 L366,402" stroke="${C.line}" stroke-width="5"/>
    <g class="rb-blinker"><circle cx="218" cy="388" r="14" fill="${C.orange}" ${S} stroke-width="3"/><circle cx="214" cy="383" r="4.5" fill="${C.orangeLight}"/></g>
    <g class="rb-blinker"><circle cx="376" cy="402" r="14" fill="${C.orange}" ${S} stroke-width="3"/><circle cx="372" cy="397" r="4.5" fill="${C.orangeLight}"/></g>

    <!-- 핸들바 -->
    <path d="M60,312 Q140,302 200,318 Q260,332 330,334 Q380,338 414,356" fill="none" stroke="${C.line}" stroke-width="13" stroke-linecap="round"/>
    <path d="M60,312 Q140,302 200,318 Q260,332 330,334 Q380,338 414,356" fill="none" stroke="url(#rb-chrome)" stroke-width="7.5" stroke-linecap="round"/>
    <rect x="200" y="314" width="22" height="16" rx="4" fill="url(#rb-chrome)" ${S} stroke-width="2.5"/>
    <rect x="240" y="320" width="22" height="16" rx="4" fill="url(#rb-chrome)" ${S} stroke-width="2.5"/>
    <path d="M52,312 L80,309" stroke="${C.tire}" stroke-width="15" stroke-linecap="round"/>
    <path d="M394,346 L420,360" stroke="${C.tire}" stroke-width="15" stroke-linecap="round"/>

    <!-- 사이드 미러 -->
    <path d="M142,310 Q124,272 98,242" fill="none" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/>
    <path d="M352,334 Q378,312 396,292" fill="none" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/>
    <g id="rb-mirror-l"><circle cx="84" cy="222" r="26" fill="#211A18" ${S} stroke-width="3"/>
      <ellipse cx="75" cy="212" rx="8.5" ry="5.5" fill="#6E6866" transform="rotate(-30 75 212)"/></g>
    <g id="rb-mirror-r"><circle cx="408" cy="274" r="25" fill="#211A18" ${S} stroke-width="3"/>
      <ellipse cx="399" cy="264" rx="8" ry="5.5" fill="#6E6866" transform="rotate(-30 399 264)"/></g>

    <!-- 손 -->
    <g id="rb-hand-l"><ellipse cx="116" cy="308" rx="22" ry="20" fill="${C.skin}" ${S} stroke-width="3.5"/>
      <path d="M104,316 q6,4 12,2 M110,306 q6,3 12,1" fill="none" stroke="${C.skinShade}" stroke-width="2.6" stroke-linecap="round"/></g>
    <g id="rb-hand-r-grip"><ellipse cx="380" cy="342" rx="21" ry="19" fill="${C.skin}" ${S} stroke-width="3.5"/>
      <path d="M368,348 q6,4 12,2" fill="none" stroke="${C.skinShade}" stroke-width="2.6" stroke-linecap="round"/></g>
  </g>

  <!-- 손 흔들기 팔 (알림 모션) -->
  <g id="rb-arm-wave" style="display:none">
    <g class="rb-wave-pivot">
      <path d="M352,292 Q372,262 386,226 L408,234 Q396,280 368,312 Z" fill="${C.skin}" ${S} stroke-width="3.5"/>
      <ellipse cx="400" cy="214" rx="22" ry="21" fill="${C.skin}" ${S} stroke-width="3.5"/>
      <path d="M388,198 q-4,-10 4,-12 M400,194 q-1,-11 7,-11 M412,200 q3,-10 10,-7" fill="none" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>
    </g>
  </g>

  <!-- ===== FX (앞) ===== -->
  <g id="rb-fx">
    <g id="rb-notice" opacity="0">
      <circle cx="384" cy="26" r="32" fill="#FFD84A" ${S} stroke-width="4"/>
      <path d="M384,8 v22" stroke="${C.line}" stroke-width="8" stroke-linecap="round"/>
      <circle cx="384" cy="43" r="5" fill="${C.line}"/>
    </g>
    <g id="rb-zzz" opacity="0" fill="#7D8DA6" stroke="${C.line}" stroke-width="1.5" font-family="'Jua','Arial Rounded MT Bold',sans-serif" font-weight="700">
      <text class="z1" x="352" y="44" font-size="36">Z</text>
      <text class="z2" x="386" y="14" font-size="28">z</text>
      <text class="z3" x="410" y="-10" font-size="22">z</text>
    </g>
    <g id="rb-hearts" opacity="0" fill="#FF6B81" stroke="${C.line}" stroke-width="3">
      <path class="h1" d="M54,40 c-10,-16 -34,-4 -22,14 l22,22 l22,-22 c12,-18 -12,-30 -22,-14 z"/>
      <path class="h2" d="M386,34 c-7,-11 -24,-3 -16,10 l16,15 l16,-15 c8,-13 -9,-21 -16,-10 z"/>
    </g>
    <g id="rb-sweat" opacity="0">
      <path d="M356,64 q12,18 0,26 q-12,-8 0,-26 z" fill="#8FD3FF" stroke="${C.line}" stroke-width="2.5"/>
    </g>
  </g>
</svg>`;
  }

  global.RideBuddyCharacter = { svg, colors: C, view: VIEW };
  if (typeof module !== 'undefined') module.exports = global.RideBuddyCharacter;
})(typeof window !== 'undefined' ? window : globalThis);
