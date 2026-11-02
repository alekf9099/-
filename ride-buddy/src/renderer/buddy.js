/*
 * Ride Buddy 렌더러 — 3D 스프라이트 캐릭터 + 이동 AI + 알림 말풍선 + 인터랙션
 *
 * 캐릭터는 Blender(Cycles)로 렌더한 3D 모션 스프라이트(sprites/*.webp)를 canvas 로 재생합니다.
 *
 * 상태 흐름
 *   ride_r/l ⇄ idle_r/l   랜덤 주행·정차, 화면 끝에서 3D 유턴(turn)
 *   알림 수신 → face(정면으로 돌아봄) → notify(느낌표·비상등·빵빵·손 흔들기)
 *            → talk(말풍선 타이핑) → front(대기) → 다음 알림 or happy → face 역재생 → 다시 주행
 *   방해 금지 → face → sleep(졸기) + 미확인 배지, 해제 시 쌓인 알림을 차례로 읽어줌
 */
(() => {
  const META = window.RIDE_BUDDY_SPRITES;
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
  const sheets = {};
  for (const [name, m] of Object.entries(META.motions)) {
    const img = new Image();
    img.src = `sprites/${m.file}`;
    sheets[name] = img;
  }
  const player = {
    name: null, reverse: false, loop: true, t0: 0, onEnd: null, done: false,
    play(name, { reverse = false, loop, onEnd } = {}) {
      const m = META.motions[name];
      this.name = name;
      this.reverse = reverse;
      this.loop = loop ?? m.loop;
      this.onEnd = onEnd || null;
      this.done = false;
      this.t0 = performance.now();
    },
    frameIndex(now) {
      const m = META.motions[this.name];
      let i = Math.floor((now - this.t0) / 1000 * META.fps);
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
  let cfg = { size: 'm', speed: 1, sound: true, dnd: false, paused: false, showBody: true };
  let charW = SIZE_PX.m, charH = charW * META.frameH / META.frameW;
  let x = 0, dir = 1;
  let mode = 'ride';           // ride | stop | anim(전환 중) | busy | sleep | drag
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
  const laneW = () => window.innerWidth;
  const side = () => (dir > 0 ? 'r' : 'l');
  const guard = fn => { const e = epoch; return (...a) => { if (e === epoch) fn(...a); }; };

  // ---------- 동작 단위 ----------
  function ride() { mode = 'ride'; facing = side(); player.play(`ride_${side()}`); }
  function stop() { mode = 'stop'; facing = side(); player.play(`idle_${side()}`); }
  function idle() {
    if (cfg.dnd) return toFront(guard(() => { mode = 'sleep'; player.play('sleep'); }));
    toSide(guard(() => {
      if (cfg.paused) stop(); else ride();
      nextDecision = performance.now() + rand(5000, 11000);
    }));
  }
  function turn(cb) {
    mode = 'anim';
    const toRight = dir < 0;
    player.play('turn', {
      reverse: !toRight, onEnd: guard(() => { dir = toRight ? 1 : -1; facing = side(); cb ? cb() : ride(); }),
    });
  }
  function toFront(cb) {
    if (facing === 'front') return cb();
    mode = 'anim';
    player.play(`face_${side()}`, { onEnd: guard(() => { facing = 'front'; cb(); }) });
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
    charW = SIZE_PX[cfg.size] || SIZE_PX.m;
    charH = Math.round(charW * META.frameH / META.frameW);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(charW * dpr);
    canvas.height = Math.round(charH * dpr);
    canvas.style.width = charW + 'px';
    canvas.style.height = charH + 'px';
    document.documentElement.style.setProperty('--char-w', charW + 'px');
    x = Math.min(Math.max(0, x), Math.max(0, laneW() - charW));

    if (!busy && !dragging) {
      if (cfg.dnd !== was.dnd || cfg.paused !== was.paused) { epoch++; clearTimers(); }
      if (!cfg.dnd && was.dnd && queue.length) { updateBadge(); return next(); }
      if (cfg.dnd !== was.dnd || cfg.paused !== was.paused) idle();
    }
    updateBadge();
  }

  // ---------- 이동 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!busy && !dragging && !cfg.dnd && !cfg.paused && (mode === 'ride' || mode === 'stop')) {
      if (now > nextDecision) decide(now);
      if (mode === 'ride') {
        x += dir * BASE_SPEED * cfg.speed * dt;
        const max = Math.max(0, laneW() - charW);
        if (x <= 0 && dir < 0) { x = 0; turn(); }
        else if (x >= max && dir > 0) { x = max; turn(); }
        x = Math.min(Math.max(0, x), max);
      }
    }
    buddyEl.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    player.draw(now);
    if (!bubble.hidden) placeBubble();
    requestAnimationFrame(frame);
  }

  function decide(now) {
    if (mode === 'ride') {
      const r = Math.random();
      if (r < 0.35) { stop(); nextDecision = now + rand(2500, 6000); }
      else if (r < 0.5) { turn(); nextDecision = now + rand(5000, 12000); }
      else nextDecision = now + rand(6000, 14000);
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
    mode = 'busy';
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
    const headX = x + charW * HEAD_X;
    const left = Math.max(8, Math.min(W - bw - 8, headX - bw / 2));
    bubble.style.left = left + 'px';
    bubble.style.bottom = Math.round(charH * (1 - HEAD_TOP) + 14) + 'px';
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
    if (dragging.moved) x = Math.max(0, Math.min(laneW() - charW, dragging.ox + dx));
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
    busy = true; mode = 'busy';
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
    x = rand(0, Math.max(0, laneW() - charW));
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
    let k = 0, demoCfg = { size: 'm', speed: 1, sound: false, dnd: false, paused: false, showBody: true };
    const fire = () => handlers.config.forEach(h => h(demoCfg));
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b); };
    btn('🔔 알림 보내기', () => handlers.notify.forEach(h => h({ ...samples[k++ % samples.length], time: Date.now() })));
    btn('😴 방해 금지', () => { demoCfg = { ...demoCfg, dnd: !demoCfg.dnd }; fire(); });
    btn('⏸ 멈춤', () => { demoCfg = { ...demoCfg, paused: !demoCfg.paused }; fire(); });
    btn('🔍 크기', () => { demoCfg = { ...demoCfg, size: { s: 'm', m: 'l', l: 's' }[demoCfg.size] }; fire(); });
    document.body.appendChild(bar);
    window.__demo = {
      send: n => handlers.notify.forEach(h => h({ time: Date.now(), ...n })),
      config: c => { demoCfg = { ...demoCfg, ...c }; fire(); },
      state: () => ({ mode, facing, dir, motion: player.name, busy, x }),
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
