/*
 * Ride Buddy 렌더러 — 스프라이트 캐릭터(2D/3D) + 이동 AI + 알림 말풍선 + 인터랙션
 *
 * 캐릭터 스타일(skin)은 2가지 — 2d: 원본 일러스트 컷아웃 리그 / 3d: Blender 렌더.
 * 둘 다 같은 이름의 모션 스프라이트(sprites/<skin>/*.webp)를 canvas 로 재생합니다.
 *
 * 상태 흐름
 *   ride_r/l ⇄ idle_r/l   랜덤 주행·정차, 화면 끝에서 3D 유턴(turn)
 *   알림 수신 → face(정면으로 돌아봄) → notify(느낌표·비상등·빵빵·손 흔들기)
 *            → talk(말풍선 타이핑) → front(대기) → 다음 알림 or happy → face 역재생 → 다시 주행
 *   방해 금지 → face → sleep(졸기) + 미확인 배지, 해제 시 쌓인 알림을 차례로 읽어줌
 */
(() => {
  const SKINS = window.RIDE_BUDDY_SKINS;            // { '2d': meta, '3d': meta }
  let META = SKINS['2d'] || SKINS[Object.keys(SKINS)[0]];
  const SIZE_PX = { s: 130, m: 170, l: 230 };       // 캐릭터 가로 폭(px)
  const BASE_SPEED = 46;                            // px/s
  const HEAD_X = 0.5;                               // 머리 중심 (가로 비율)
  const HEAD_TOP = 0.2;                             // 머리 윗부분 (세로 비율, 위에서부터)

  const $ = s => document.querySelector(s);
  const buddyEl = $('#buddy'), badgeEl = $('#badge'), canvas = $('#rb-canvas');
  const bubble = $('#bubble');
  const ctx = canvas.getContext('2d');

  // ---------- 브리지 (Electron / 브라우저 데모) ----------
  const bridge = window.rideBuddyAPI || makeDemoBridge();

  // ---------- 스프라이트 플레이어 ----------
  // - 모션별 시트는 처음 쓸 때 로드 (메모리 절약), 자주 쓰는 모션은 미리 로드
  // - 없는 '_l' 모션은 '_r' 을 좌우 반전해서 재생, 스킨에 없는 모션은 비슷한 모션으로 대체
  // - 모션이 바뀔 때 직전 화면을 짧게 페이드아웃 (크로스페이드) → 끊김 없는 전환
  const FALLBACK = {
    wheelie_r: 'ride_r', rev: 'notify', bow: 'happy', look_r: 'idle_r', yawn_r: 'idle_r',
    groove: 'happy', wink: 'happy', wave_out: 'front',
  };
  const PRELOAD = ['ride_r', 'ride_l', 'idle_r', 'idle_l', 'turn', 'face_r', 'face_l', 'front', 'notify', 'talk', 'rev', 'bow', 'wave_out'];
  const sheetCache = {};
  let sheets = {};
  function sheetFor(name) {
    if (!sheets[name]) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `sprites/${META.skin}/${META.motions[name].file}`;
      sheets[name] = img;
    }
    return sheets[name];
  }
  function loadSkin(skin) {
    META = SKINS[skin] || SKINS['2d'];
    sheets = sheetCache[META.skin] = sheetCache[META.skin] || {};
    PRELOAD.forEach(n => META.motions[n] && sheetFor(n));
  }
  /** 모션 이름 → { name(실제 시트), flip(좌우 반전) } */
  function resolve(name) {
    const M = META.motions;
    if (M[name]) return { name, flip: false };
    if (name.endsWith('_l')) {
      const r = name.slice(0, -2) + '_r';
      if (M[r]) return { name: r, flip: true };
      if (FALLBACK[r]) return { name: FALLBACK[r].replace(/_r$/, '_l') in M ? FALLBACK[r].replace(/_r$/, '_l') : FALLBACK[r], flip: false };
    }
    if (FALLBACK[name] && M[FALLBACK[name]]) return { name: FALLBACK[name], flip: false };
    return { name: 'front' in M ? 'front' : Object.keys(M)[0], flip: false };
  }
  loadSkin('2d');

  const fadeCanvas = document.createElement('canvas');
  const fadeCtx = fadeCanvas.getContext('2d');
  const FADE_MS = 140;
  const player = {
    name: null, sheet: null, flip: false, reverse: false, loop: true, onEnd: null, done: false, elapsed: 0, rate: 1,
    fadeUntil: 0, drewOnce: false,
    play(name, { reverse = false, loop, onEnd } = {}) {
      const r = resolve(name);
      const m = META.motions[r.name];
      // 크로스페이드: 직전 화면 보관
      if (this.drewOnce && (this.name !== name)) {
        fadeCanvas.width = canvas.width; fadeCanvas.height = canvas.height;
        fadeCtx.clearRect(0, 0, fadeCanvas.width, fadeCanvas.height);
        fadeCtx.drawImage(canvas, 0, 0);
        this.fadeUntil = performance.now() + FADE_MS;
      }
      this.name = name;                 // 요청한 이름 (흐름 판단용)
      this.sheet = r.name;              // 실제 그릴 시트
      this.flip = r.flip;
      this.reverse = reverse;
      this.loop = loop ?? m.loop;
      this.onEnd = onEnd || null;
      this.done = false;
      this.elapsed = 0;
      sheetFor(r.name);
    },
    tick(dt) { this.elapsed += dt * this.rate; },
    /** 스킨이 바뀌면 지금 모션을 새 스킨 기준으로 다시 찾기 */
    rebind() {
      if (!this.name) return;
      const r = resolve(this.name);
      this.sheet = r.name; this.flip = r.flip;
      if (!this.loop && this.elapsed * META.fps >= META.motions[r.name].frames) this.elapsed = 0;
    },
    frameIndex() {
      const m = META.motions[this.sheet];
      let i = Math.floor(this.elapsed * META.fps);
      if (this.loop) i %= m.frames;
      else if (i >= m.frames) {
        i = m.frames - 1;
        if (!this.done) { this.done = true; const cb = this.onEnd; this.onEnd = null; cb && setTimeout(cb, 0); }
      }
      return this.reverse ? m.frames - 1 - i : i;
    },
    draw(now) {
      if (!this.sheet) return;
      const m = META.motions[this.sheet];
      const img = sheetFor(this.sheet);
      const i = this.frameIndex();
      if (!img.complete || !img.naturalWidth) return;     // 로딩 중엔 직전 그림 유지
      const cw = m.w || META.frameW, ch = m.h || META.frameH;
      const k = canvas.width / META.frameW;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      if (this.flip) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, (i % m.cols) * cw, Math.floor(i / m.cols) * ch, cw, ch,
        (m.ox || 0) * k, (m.oy || 0) * k, cw * k, ch * k);
      ctx.restore();
      if (now < this.fadeUntil) {
        ctx.globalAlpha = (this.fadeUntil - now) / FADE_MS;
        ctx.drawImage(fadeCanvas, 0, 0);
        ctx.globalAlpha = 1;
      }
      this.drewOnce = true;
    },
  };

  // ---------- 상태 ----------
  let cfg = { skin: '2d', size: 'm', speed: 1, sound: true, dnd: false, paused: false, showBody: true, catchphrase: true };
  let charW = SIZE_PX.m, charH = charW * META.frameH / META.frameW;
  let x = 0, dir = 1;          // x = 캐릭터 중심(가로, px)
  let mode = 'ride';           // ride | brake | stop | anim(전환 중) | busy | sleep
  let facing = 'r';            // r | l | front
  let nextDecision = 0;
  const queue = [];
  const history = [];
  let pending = 0;
  let busy = false;
  let current = null;
  let timers = [];
  let dragging = null;
  let epoch = 0;               // 흐름이 바뀌면 이전 콜백 무효화

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const laneW = () => window.innerWidth;
  const side = () => (dir > 0 ? 'r' : 'l');
  const guard = fn => { const e = epoch; return (...a) => { if (e === epoch) fn(...a); }; };

  // ---------- 주행 물리 (실제 오토바이처럼) ----------
  // 원근: z=0 가까움(크게·아래) ~ z=1 멀리(작게·위)  /  가감속 · 브레이크 · 차체 피치 · 기울기 · 서스펜션
  const PHYS = {
    ACCEL: 70,          // px/s² 가속
    DECEL: 45,          // 자연 감속 (스로틀 오프)
    BRAKE: 170,         // 일반 브레이크
    BRAKE_NOTIFY: 120,  // 알림 왔을 때: 사용자 쪽으로 핸들 꺾으며 제동
    BRAKE_HARD: 520,    // 강제 정지
    FAR_SCALE: 0.6,     // 가장 멀 때 크기
    FAR_LIFT: 0.32,     // 가장 멀 때 위로 올라가는 높이 (캐릭터 높이 비율)
    SPRING: 210, DAMP: 15,
  };
  const bike = {
    v: 0, vTarget: 0, brake: 0, onStop: null,
    z: rand(0.15, 0.7), zv: 0, zTarget: 0.4, nextLane: 0,
    acc: 0, pitch: 0, lean: 0,
    susY: 0, susV: 0, nextBump: 0,
  };
  const cruise = () => BASE_SPEED * cfg.speed * (charW / 246);
  const scaleAt = z => 1 - (1 - PHYS.FAR_SCALE) * z;
  const halfW = () => charW * scaleAt(bike.z) * 0.36;   // 화면 끝 판정용 (효과 여백 제외)

  function physics(dt, now) {
    const b = bike;
    const moving = mode === 'ride' || mode === 'brake';
    // 속도
    const prevV = b.v;
    if (!moving) b.v = Math.max(0, b.v - PHYS.BRAKE_HARD * dt);
    else if (b.brake) b.v = Math.max(0, b.v - b.brake * dt);
    else if (b.v < b.vTarget) b.v = Math.min(b.vTarget, b.v + PHYS.ACCEL * cfg.speed * dt);
    else b.v = Math.max(b.vTarget, b.v - PHYS.DECEL * dt);
    const rawAcc = dt > 0 ? (b.v - prevV) / dt : 0;
    b.acc += (rawAcc - b.acc) * Math.min(1, dt * 14);

    // 앞뒤 이동 (원근에 따라 화면상 속도 감소)
    const s = scaleAt(b.z);
    x += dir * b.v * s * dt;

    // 차선(깊이) 변경: 달리는 중에만, 속도에 비례
    if (moving && b.brake === 0 && now > b.nextLane) {
      b.zTarget = rand(0, 1);
      b.nextLane = now + rand(3500, 9000);
    }
    if (busy || mode === 'anim') b.zTarget = Math.min(b.zTarget, b.z);   // 알림 중엔 멀어지지 않음
    const spd = clamp(b.v / Math.max(1, cruise()), 0, 1.5);
    const want = clamp((b.zTarget - b.z) * 0.9, -0.22, 0.22) * spd;
    b.zv += (want - b.zv) * Math.min(1, dt * 2.5);
    if (busy && b.v > 0.5) b.zv = Math.min(b.zv, -1.0);   // 알림 오면 사용자 쪽으로 핸들을 꺾으며 다가옴
    b.z = clamp(b.z + b.zv * dt, 0, 1);

    // 기울기(차선 변경 방향) + 피치(가속=앞들림, 브레이크=앞쏠림)
    const leanTarget = (clamp(b.zv * 40 * dir, -9, 9) + Math.sin(now / 900) * 0.6) * Math.min(1, spd * 1.4);   // 멈추면 바로 섬
    b.lean += (leanTarget - b.lean) * Math.min(1, dt * 5);
    const pitchTarget = clamp(-b.acc * 0.04, -5, 6.5);   // 가속(+) → 음수(앞 들림), 브레이크 → 앞쏠림
    b.pitch += (pitchTarget - b.pitch) * Math.min(1, dt * 9);

    // 서스펜션: 노면 요철
    if (b.v > 8 && now > b.nextBump) {
      b.susV -= rand(28, 70) * clamp(spd, 0.4, 1.3);
      b.nextBump = now + rand(450, 2200) / Math.max(0.5, spd);
    }
    const susA = -PHYS.SPRING * b.susY - PHYS.DAMP * b.susV;
    b.susV += susA * dt;
    b.susY += b.susV * dt;

    // 스프라이트 재생 속도 = 실제 속도 (바퀴·배기)
    if (player.name && player.name.startsWith('ride_')) player.rate = clamp(b.v / Math.max(1, cruise()), 0.15, 1.7);
    else player.rate = 1;

    // 정지 완료
    if ((mode === 'brake' || mode === 'ride') && b.v <= 0.5 && b.vTarget === 0 && b.onStop) {
      const cb = b.onStop;
      b.onStop = null;
      b.brake = 0;
      cb();
    }
  }

  let revUntil = 0;
  function applyTransform() {
    const b = bike;
    const s = scaleAt(b.z);
    const lift = PHYS.FAR_LIFT * charH * b.z;
    const bump = clamp(b.susY, -14, 10);
    const sq = 1 + clamp(b.susY, -14, 14) * 0.004 + clamp(b.acc, -400, 200) * -0.00004;
    let rot = b.lean + b.pitch * dir;
    let jx = 0, jy = 0;
    if (performance.now() < revUntil) {          // "달달달달" 엔진 공회전 떨림
      const k = META.motions.rev ? 0.35 : 1;    // 2D 는 공회전 모션 자체에 떨림이 있음
      jx = rand(-2.2, 2.2) * k; jy = rand(-2.5, 1) * k; rot += rand(-0.9, 0.9) * k;
    }
    buddyEl.style.transform =
      `translate3d(${(x - charW / 2 + jx).toFixed(1)}px, ${(-lift + bump + jy).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${(s * (2 - sq)).toFixed(4)}, ${(s * sq).toFixed(4)})`;
    buddyEl.style.zIndex = String(10 + Math.round((1 - b.z) * 10));
  }

  // ---------- 동작 단위 ----------
  function ride() {
    mode = 'ride'; facing = side();
    bike.brake = 0; bike.onStop = null;
    bike.vTarget = cruise() * rand(0.8, 1.25);
    player.play(`ride_${side()}`);
  }
  function stop() { mode = 'stop'; facing = side(); bike.vTarget = 0; bike.brake = 0; player.play(`idle_${side()}`); }
  /** 브레이크를 밟아 멈춘 뒤 cb */
  function brakeThen(cb, decel = PHYS.BRAKE) {
    if (bike.v <= 0.5) { bike.v = 0; bike.vTarget = 0; return cb(); }
    if (mode !== 'ride' && mode !== 'brake') { bike.v = 0; return cb(); }
    mode = 'brake';
    bike.vTarget = 0;
    bike.brake = decel;
    bike.onStop = cb;
  }
  function idle() {
    if (cfg.dnd) return toFront(guard(() => {
      mode = 'sleep';
      player.play('yawn_r', { onEnd: guard(() => player.play('sleep')) });   // 하품하고 잠들기
    }));
    toSide(guard(() => {
      if (cfg.paused) stop(); else ride();
      nextDecision = performance.now() + rand(5000, 11000);
    }));
  }
  function turn(cb) {
    brakeThen(guard(() => {
      mode = 'anim';
      const toRight = dir < 0;
      player.play('turn', {
        reverse: !toRight, onEnd: guard(() => { dir = toRight ? 1 : -1; facing = side(); cb ? cb() : ride(); }),
      });
    }));
  }
  function toFront(cb) {
    if (facing === 'front') return cb();
    brakeThen(guard(() => {
      mode = 'anim';
      player.play(`face_${side()}`, { onEnd: guard(() => { facing = 'front'; cb(); }) });
    }), busy ? PHYS.BRAKE_NOTIFY : PHYS.BRAKE);
  }
  function toSide(cb) {
    if (facing !== 'front') return cb();
    mode = 'anim';
    player.play(`face_${side()}`, { reverse: true, onEnd: guard(() => { facing = side(); cb(); }) });
  }

  // ---------- 설정 ----------
  function applyConfig(c) {
    const was = { ...cfg };
    cfg = { ...cfg, ...c };
    if (cfg.skin !== META.skin) { loadSkin(cfg.skin); player.rebind(); }
    charW = Math.round((SIZE_PX[cfg.size] || SIZE_PX.m) * (META.displayScale || 1));
    charH = Math.round(charW * META.frameH / META.frameW);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(charW * dpr);
    canvas.height = Math.round(charH * dpr);
    canvas.style.width = charW + 'px';
    canvas.style.height = charH + 'px';
    document.documentElement.style.setProperty('--char-w', charW + 'px');
    x = clamp(x, halfW(), Math.max(halfW(), laneW() - halfW()));
    if (mode === 'ride') bike.vTarget = cruise() * rand(0.8, 1.25);

    if (!busy && !dragging) {
      if (cfg.dnd !== was.dnd || cfg.paused !== was.paused) { epoch++; clearTimers(); }
      if (!cfg.dnd && was.dnd && queue.length) { updateBadge(); return next(); }
      if (cfg.dnd !== was.dnd || cfg.paused !== was.paused) idle();
    }
    updateBadge();
  }

  // ---------- 메인 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!busy && !dragging && !cfg.dnd && !cfg.paused && (mode === 'ride' || mode === 'stop')) {
      if (now > nextDecision) decide(now);
    } else if (cfg.paused && !busy && !dragging && mode === 'stop' && now > nextDecision) {
      idleVariant();
      nextDecision = now + rand(6000, 12000);
    }
    if (!dragging) physics(dt, now);
    // 화면 끝: 제동 거리를 계산해 미리 브레이크 → 유턴
    if (mode === 'ride' && !busy) {
      const hw = halfW();
      const dist = dir > 0 ? laneW() - hw - x : x - hw;
      const stopDist = (bike.v * scaleAt(bike.z)) ** 2 / (2 * PHYS.BRAKE * scaleAt(bike.z)) + 6;
      if (dist <= stopDist) turn();
    }
    x = clamp(x, halfW(), Math.max(halfW(), laneW() - halfW()));
    player.tick(dt);
    applyTransform();
    player.draw(now);
    if (!bubble.hidden) placeBubble();
    if (!shoutEl.hidden) placeShout();
    requestAnimationFrame(frame);
  }

  function decide(now) {
    if (mode === 'ride') {
      const r = Math.random();
      if (player.name.startsWith('wheelie')) { nextDecision = now + 1500; return; }
      if (r < 0.26) { brakeThen(guard(stop)); nextDecision = now + rand(4000, 8000); }
      else if (r < 0.38) { turn(); nextDecision = now + rand(6000, 12000); }
      else if (r < 0.52 && bike.v > cruise() * 0.6) { wheelie(); nextDecision = now + rand(5000, 10000); }
      else { bike.vTarget = cruise() * rand(0.6, 1.45); nextDecision = now + rand(3000, 8000); }   // 속도 바꾸기
    } else if (mode === 'stop') {
      if (idleVariant()) { nextDecision = now + rand(3500, 6000); return; }
      if (Math.random() < 0.3) turn(); else ride();
      nextDecision = now + rand(6000, 14000);
    }
  }
  /** 달리면서 앞바퀴 들기 — 살짝 가속하면서 */
  function wheelie() {
    bike.vTarget = cruise() * 1.35;
    const s = side();
    player.play(`wheelie_${s}`, { onEnd: guard(() => { if (mode === 'ride') player.play(`ride_${side()}`); }) });
  }
  /** 정차 중 심심할 때: 두리번 / 하품 (아직 안 한 동작 위주) */
  let lastVariant = '';
  function idleVariant() {
    if (mode !== 'stop' || Math.random() > 0.55) return false;
    const pick = ['look', 'look', 'yawn'].filter(v => v !== lastVariant);
    const v = pick[Math.floor(Math.random() * pick.length)];
    lastVariant = v;
    const s = side();
    player.play(`${v}_${s}`, { onEnd: guard(() => { if (mode === 'stop') player.play(`idle_${side()}`); }) });
    return true;
  }

  // ---------- 알림 ----------
  function receive(n) {
    history.unshift(n);
    if (history.length > 30) history.pop();
    queue.push(n);
    if (cfg.dnd) { pending++; updateBadge(); return; }
    updateBadge();
    if (!busy) next();
    else if (!bubble.hidden) { const more = $('.bubble-more'); more.hidden = false; more.textContent = `+${queue.length}`; }
  }

  function next() {
    clearTimers();
    epoch++;
    if (!queue.length || cfg.dnd) {
      busy = false;
      current = null;
      hideBubble();
      if (cfg.dnd) { updateBadge(); return idle(); }
      mode = 'busy';
      busy = true;
      toFront(guard(() => {
        const pick = ['happy', 'groove', 'wink'][Math.floor(Math.random() * 3)];
        player.play(pick);
        later(guard(() => { busy = false; idle(); }), pick === 'wink' ? 1250 : 1600);
      }));
      return;
    }
    busy = true;
    if (mode !== 'ride' && mode !== 'brake') mode = 'busy';   // 달리는 중이면 브레이크부터
    pending = 0;
    current = queue.shift();
    updateBadge();
    const n = current;
    toFront(guard(() => {
      if (cfg.catchphrase) {
        player.play('rev');                              // 달달달달~ (제자리 공회전)
        catchphrase();
        later(guard(() => player.play('bow')), 680);     // 감사하고~ (꾸벅)
        later(guard(() => showBubble(n)), 1550);
      } else {
        player.play('notify');
        if (cfg.sound) horn();
        later(guard(() => showBubble(n)), 900);
      }
    }));
  }

  // ---------- 유행어 리액션: "달달달달~ 감사하고~" ----------
  const shoutEl = $('#shout'), shoutText = $('#shout .shout-text');
  function setShout(kind, html) {
    shoutEl.className = kind;
    shoutText.innerHTML = html;
    shoutEl.hidden = false;
    placeShout();
  }
  let shoutToken = 0;
  function hideShout() { shoutEl.hidden = true; shoutEl.className = ''; }
  function catchphrase(onlyThanks = false) {
    const STEP = 130;
    if (!onlyThanks) {
      setShout('rev', ['달', '달', '달', '달'].map((c, i) => `<span class="syl" style="animation-delay:${i * STEP}ms">${c}</span>`).join('') + '<span class="syl" style="animation-delay:520ms">~</span>');
      revUntil = performance.now() + 650;
      if (cfg.sound) engineRev(4, STEP / 1000);
    }
    const t1 = onlyThanks ? 0 : 680;
    const tok = ++shoutToken;                      // 흐름이 끊겨도 자막이 남지 않도록 별도 타이머
    setTimeout(() => { if (tok === shoutToken) { setShout('thanks', '감사하고~♥'); if (cfg.sound) chime(); } }, t1);
    setTimeout(() => { if (tok === shoutToken) hideShout(); }, t1 + 820);
  }
  function placeShout() {
    if (shoutEl.hidden) return;
    const s = scaleAt(bike.z);
    const lift = PHYS.FAR_LIFT * charH * bike.z;
    const W = laneW();
    const w = shoutEl.offsetWidth;
    shoutEl.style.left = clamp(x, w / 2 + 8, W - w / 2 - 8) + 'px';
    shoutEl.style.bottom = Math.round(lift + s * charH * (1 - (META.headTop ?? HEAD_TOP)) + 8) + 'px';
  }

  function showBubble(n) {
    hideShout();
    bubble.style.setProperty('--chip-bg', n.color || '#FF7A45');
    bubble.style.setProperty('--chip-ink', n.ink || '#fff');
    $('.app-icon').textContent = n.icon || '🔔';
    $('.app-name').textContent = n.app || '알림';
    $('.bubble-time').textContent = timeLabel(n.time);
    const more = $('.bubble-more');
    more.hidden = queue.length === 0;
    more.textContent = `+${queue.length}`;

    const title = n.title || `${n.app}에서 알림이 왔어요!`;
    const body = cfg.showBody ? (n.body || '') : (n.title ? `${n.app}에서 새 알림이 왔어요!` : '');
    const tEl = $('.bubble-title'), bEl = $('.bubble-body');

    bubble.hidden = false;
    bubble.classList.remove('out', 'in');
    void bubble.offsetWidth;
    bubble.classList.add('in');
    tEl.textContent = title; bEl.textContent = body;   // 최종 크기로 위치 계산
    placeBubble();
    tEl.textContent = ''; bEl.textContent = '';

    player.play('talk');
    const full = [...title], fullB = [...body];
    const total = full.length + fullB.length;
    const step = Math.max(14, Math.min(45, 2200 / Math.max(1, total)));
    let i = 0;
    const tick = guard(() => {
      i++;
      tEl.textContent = full.slice(0, i).join('');
      bEl.textContent = i > full.length ? fullB.slice(0, i - full.length).join('') : '';
      tEl.classList.toggle('typing', i <= full.length);
      bEl.classList.toggle('typing', i > full.length);
      if (i < total) return later(tick, step);
      tEl.classList.remove('typing'); bEl.classList.remove('typing');
      player.play('wave_out', { onEnd: guard(() => player.play('front')) });   // 흔들던 손을 핸들로
      const hold = Math.min(9000, 3500 + total * 55);
      const bar = $('.bubble-progress i');
      bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
      void bar.offsetWidth;
      bar.style.transition = `transform ${hold}ms linear`; bar.style.transform = 'scaleX(0)';
      later(guard(dismiss), hold);
    });
    later(tick, 120);
  }

  function dismiss() {
    if (!busy || bubble.hidden) return;
    bubble.classList.remove('in');
    bubble.classList.add('out');
    clearTimers();
    const e = ++epoch;
    setTimeout(() => { if (e === epoch) { bubble.hidden = true; next(); } }, 220);
  }
  function hideBubble() { bubble.hidden = true; bubble.classList.remove('in', 'out'); }

  function placeBubble() {
    const W = laneW();
    const bw = bubble.offsetWidth;
    const s = scaleAt(bike.z);
    const headX = x + charW * s * (HEAD_X - 0.5);
    const left = Math.max(8, Math.min(W - bw - 8, headX - bw / 2));
    bubble.style.left = left + 'px';
    const lift = PHYS.FAR_LIFT * charH * bike.z;
    bubble.style.bottom = Math.round(lift + s * charH * (1 - (META.headTop ?? HEAD_TOP)) + 14) + 'px';
    bubble.style.setProperty('--tail-x', Math.max(22, Math.min(bw - 22, headX - left)) + 'px');
  }

  function updateBadge() {
    const n = cfg.dnd ? pending : 0;
    badgeEl.hidden = n === 0;
    badgeEl.textContent = n > 99 ? '99+' : String(n);
  }

  function timeLabel(t) {
    const d = new Date(t || Date.now());
    return `${d.getHours() < 12 ? '오전' : '오후'} ${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ---------- 효과음: 바이크 경적 "빵빵!" ----------
  let actx = null;
  /** "달달달달" 엔진 공회전: 낮은 톱니파 펄스 n번, 점점 높아짐 */
  function engineRev(n = 4, step = 0.13) {
    try {
      actx = actx || new AudioContext();
      const t0 = actx.currentTime + 0.02;
      for (let i = 0; i < n; i++) {
        const t = t0 + i * step;
        const o = actx.createOscillator(), o2 = actx.createOscillator();
        const g = actx.createGain(), f = actx.createBiquadFilter();
        o.type = 'sawtooth'; o2.type = 'square';
        o.frequency.setValueAtTime(62 + i * 9, t);
        o.frequency.exponentialRampToValueAtTime(48 + i * 9, t + step * 0.9);
        o2.frequency.setValueAtTime(31 + i * 4.5, t);
        f.type = 'lowpass'; f.frequency.value = 520 + i * 60; f.Q.value = 4;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.92);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(actx.destination);
        o.start(t); o2.start(t); o.stop(t + step); o2.stop(t + step);
      }
    } catch { /* 오디오 장치 없음 */ }
  }
  /** "감사하고~" 띵동 */
  function chime() {
    try {
      actx = actx || new AudioContext();
      const t0 = actx.currentTime + 0.01;
      [[784, 0], [1175, 0.12]].forEach(([fr, off]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = fr;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.09, t0 + off + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.5);
        o.connect(g); g.connect(actx.destination);
        o.start(t0 + off); o.stop(t0 + off + 0.55);
      });
    } catch { /* 오디오 장치 없음 */ }
  }

  function horn() {
    try {
      actx = actx || new AudioContext();
      const t0 = actx.currentTime;
      [0, 0.2].forEach((off, k) => {
        const o1 = actx.createOscillator(), o2 = actx.createOscillator();
        const g = actx.createGain(), f = actx.createBiquadFilter();
        o1.type = 'square'; o2.type = 'sawtooth';
        o1.frequency.value = k ? 466 : 415; o2.frequency.value = k ? 587 : 523;
        f.type = 'lowpass'; f.frequency.value = 1800;
        g.gain.setValueAtTime(0, t0 + off);
        g.gain.linearRampToValueAtTime(0.06, t0 + off + 0.015);
        g.gain.setValueAtTime(0.06, t0 + off + 0.11);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.17);
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(actx.destination);
        o1.start(t0 + off); o2.start(t0 + off); o1.stop(t0 + off + 0.2); o2.stop(t0 + off + 0.2);
      });
    } catch { /* 오디오 장치 없음 */ }
  }

  // ---------- 인터랙션 ----------
  let interactive = false;
  document.addEventListener('mousemove', e => {
    if (dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const on = !!(el && el.closest('#buddy, #bubble'));
    if (on !== interactive) { interactive = on; bridge.setInteractive(on); }
  });
  document.addEventListener('mouseleave', () => { if (!dragging && interactive) { interactive = false; bridge.setInteractive(false); } });

  buddyEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    buddyEl.setPointerCapture(e.pointerId);
    dragging = { sx: e.clientX, ox: x, moved: false };
  });
  buddyEl.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragging.sx;
    if (!dragging.moved && Math.abs(dx) > 4) {
      dragging.moved = true;
      buddyEl.classList.add('dragging');
      if (!busy && facing !== 'front') { epoch++; clearTimers(); stop(); }
    }
    if (dragging.moved) { x = clamp(dragging.ox + dx, halfW(), laneW() - halfW()); bike.v = 0; }
  });
  buddyEl.addEventListener('pointerup', () => {
    if (!dragging) return;
    const d = dragging;
    dragging = null;
    buddyEl.classList.remove('dragging');
    if (d.moved) { if (!busy) { nextDecision = performance.now() + rand(2000, 5000); if (mode !== 'sleep') idle(); } return; }
    onClick();
  });

  let lastClick = 0;
  function onClick() {
    const now = performance.now();
    if (now - lastClick < 350) { lastClick = 0; replay(); return; }
    lastClick = now;
    if (busy) { dismiss(); return; }
    epoch++; clearTimers();
    busy = true;
    if (mode !== 'ride' && mode !== 'brake') mode = 'busy';
    const choices = ['happy', 'wink', 'groove'].concat(cfg.catchphrase ? ['bow', 'bow'] : []);
    const pick = choices[Math.floor(Math.random() * choices.length)];
    if (cfg.sound && pick !== 'bow') horn();
    toFront(guard(() => {
      player.play(pick);
      if (pick === 'bow') catchphrase(true);
      later(guard(() => { busy = false; idle(); }), { wink: 1250, bow: 1150 }[pick] || 1600);
    }));
  }

  function replay() {
    if (!history.length) return;
    queue.unshift({ ...history[0], replay: true });
    const keep = cfg.dnd;
    if (busy && !bubble.hidden) { dismiss(); return; }
    cfg.dnd = false; next(); cfg.dnd = keep;   // 방해 금지 중이라도 직접 요청하면 읽어줌
  }

  bubble.addEventListener('click', e => { e.stopPropagation(); dismiss(); });
  buddyEl.addEventListener('contextmenu', e => { e.preventDefault(); bridge.openMenu(); });

  // ---------- 연결 ----------
  bridge.onNotify(receive);
  bridge.onConfig(applyConfig);
  bridge.onCommand(c => { if (c === 'replay') replay(); });
  bridge.getConfig().then(c => {
    applyConfig(c || {});
    x = rand(halfW(), Math.max(halfW(), laneW() - halfW()));
    dir = Math.random() < 0.5 ? 1 : -1;
    facing = side();
    if (cfg.dnd) idle(); else if (cfg.paused) stop(); else ride();
    nextDecision = performance.now() + rand(5000, 10000);
    requestAnimationFrame(frame);
  });
  window.addEventListener('resize', () => applyConfig({}));

  // ---------- 브라우저 데모용 가짜 브리지 ----------
  function makeDemoBridge() {
    document.body.classList.add('demo');
    const handlers = { notify: [], config: [], command: [] };
    const bar = document.createElement('div');
    bar.className = 'demo-bar';
    const samples = [
      { app: '카카오톡', icon: '💬', color: '#FEE500', ink: '#191919', title: '엄마', body: '밥은 먹었니? 오늘 일찍 들어와~' },
      { app: 'Slack', icon: '#', color: '#4A154B', ink: '#fff', title: '#dev-배포', body: 'v1.4.0 프로덕션 배포 완료 🎉' },
      { app: '캘린더', icon: '📅', color: '#E8710A', ink: '#fff', title: '10분 후 일정', body: '팀 스탠드업 미팅 (회의실 B)' },
    ];
    let k = 0, demoCfg = { skin: '2d', size: 'm', speed: 1, sound: false, dnd: false, paused: false, showBody: true, catchphrase: true };
    const fire = () => handlers.config.forEach(h => h(demoCfg));
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b); };
    btn('🔔 알림 보내기', () => handlers.notify.forEach(h => h({ ...samples[k++ % samples.length], time: Date.now() })));
    btn('😴 방해 금지', () => { demoCfg = { ...demoCfg, dnd: !demoCfg.dnd }; fire(); });
    btn('⏸ 멈춤', () => { demoCfg = { ...demoCfg, paused: !demoCfg.paused }; fire(); });
    btn('🔍 크기', () => { demoCfg = { ...demoCfg, size: { s: 'm', m: 'l', l: 's' }[demoCfg.size] }; fire(); });
    btn('🎨 2D/3D', () => { demoCfg = { ...demoCfg, skin: demoCfg.skin === '2d' ? '3d' : '2d' }; fire(); });
    document.body.appendChild(bar);
    window.__demo = {
      send: n => handlers.notify.forEach(h => h({ time: Date.now(), ...n })),
      config: c => { demoCfg = { ...demoCfg, ...c }; fire(); },
      play: (name, opts) => player.play(name, opts || {}),   // 모션 미리보기 (디버그)
      wheelie: () => { if (mode === 'ride') wheelie(); },
      stopNow: () => brakeThen(guard(stop)),
      idleVariant: () => idleVariant(),
      state: () => ({ mode, facing, dir, motion: player.name, busy, x: Math.round(x), v: Math.round(bike.v), z: +bike.z.toFixed(2), lean: +bike.lean.toFixed(1), pitch: +bike.pitch.toFixed(1), rate: +player.rate.toFixed(2) }),
    };
    return {
      onNotify: cb => handlers.notify.push(cb),
      onConfig: cb => handlers.config.push(cb),
      onCommand: cb => handlers.command.push(cb),
      getConfig: async () => demoCfg,
      setInteractive: () => {},
      openMenu: () => {},
    };
  }
})();
