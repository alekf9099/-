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
  const sheetCache = {};
  let sheets = {};
  function loadSkin(skin) {
    const meta = SKINS[skin] || SKINS['2d'];
    if (!sheetCache[meta.skin]) {
      sheetCache[meta.skin] = {};
      for (const [name, m] of Object.entries(meta.motions)) {
        const img = new Image();
        img.src = `sprites/${meta.skin}/${m.file}`;
        sheetCache[meta.skin][name] = img;
      }
    }
    META = meta;
    sheets = sheetCache[meta.skin];
  }
  loadSkin('2d');
  const player = {
    name: null, reverse: false, loop: true, t0: 0, onEnd: null, done: false, elapsed: 0, rate: 1,
    play(name, { reverse = false, loop, onEnd } = {}) {
      const m = META.motions[name];
      this.name = name;
      this.reverse = reverse;
      this.loop = loop ?? m.loop;
      this.onEnd = onEnd || null;
      this.done = false;
      this.t0 = performance.now();
      this.elapsed = 0;
    },
    tick(dt) { this.elapsed += dt * this.rate; },
    frameIndex(now) {
      const m = META.motions[this.name];
      let i = Math.floor(this.elapsed * META.fps);
      if (this.loop) i %= m.frames;
      else if (i >= m.frames) {
        i = m.frames - 1;
        if (!this.done) { this.done = true; const cb = this.onEnd; this.onEnd = null; cb && setTimeout(cb, 0); }
      }
      return this.reverse ? m.frames - 1 - i : i;
    },
    draw(now) {
      if (!this.name) return;
      const m = META.motions[this.name];
      const img = sheets[this.name];
      const i = this.frameIndex(now);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!img.complete || !img.naturalWidth) return;
      const sx = (i % m.cols) * META.frameW, sy = Math.floor(i / m.cols) * META.frameH;
      ctx.drawImage(img, sx, sy, META.frameW, META.frameH, 0, 0, canvas.width, canvas.height);
    },
  };

  // ---------- 상태 ----------
  let cfg = { skin: '2d', size: 'm', speed: 1, sound: true, dnd: false, paused: false, showBody: true };
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

  function applyTransform() {
    const b = bike;
    const s = scaleAt(b.z);
    const lift = PHYS.FAR_LIFT * charH * b.z;
    const bump = clamp(b.susY, -14, 10);
    const sq = 1 + clamp(b.susY, -14, 14) * 0.004 + clamp(b.acc, -400, 200) * -0.00004;
    const rot = b.lean + b.pitch * dir;
    buddyEl.style.transform =
      `translate3d(${(x - charW / 2).toFixed(1)}px, ${(-lift + bump).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${(s * (2 - sq)).toFixed(4)}, ${(s * sq).toFixed(4)})`;
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
    if (cfg.dnd) return toFront(guard(() => { mode = 'sleep'; player.play('sleep'); }));
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
    if (cfg.skin !== META.skin) loadSkin(cfg.skin);
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
    requestAnimationFrame(frame);
  }

  function decide(now) {
    if (mode === 'ride') {
      const r = Math.random();
      if (r < 0.3) { brakeThen(guard(stop)); nextDecision = now + rand(4000, 8000); }
      else if (r < 0.42) { turn(); nextDecision = now + rand(6000, 12000); }
      else { bike.vTarget = cruise() * rand(0.6, 1.45); nextDecision = now + rand(3000, 8000); }   // 속도 바꾸기
    } else {
      if (Math.random() < 0.3) turn(); else ride();
      nextDecision = now + rand(6000, 14000);
    }
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
        player.play('happy');
        later(guard(() => { busy = false; idle(); }), 1100);
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
      player.play('notify');
      if (cfg.sound) horn();
      later(guard(() => showBubble(n)), 900);
    }));
  }

  function showBubble(n) {
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
      player.play('front');
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
    if (cfg.sound) horn();
    toFront(guard(() => {
      player.play('happy');
      later(guard(() => { busy = false; idle(); }), 1500);
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
    let k = 0, demoCfg = { skin: '2d', size: 'm', speed: 1, sound: false, dnd: false, paused: false, showBody: true };
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
