/*
 * Ride Buddy 렌더러 — 이동 AI + 알림 말풍선 + 인터랙션
 *
 * 상태 흐름
 *   ride ⇄ stop  (랜덤 주행/정차, 화면 끝에서 유턴)
 *   알림 수신 → notify(느낌표·비상등·빵빵) → talk(말풍선 타이핑) → 다음 알림 or happy → ride
 *   방해 금지 → sleep(졸기) + 미확인 배지, 해제 시 쌓인 알림 순서대로 읽어줌
 */
(() => {
  const VIEW_W = 440, VIEW_H = 630;
  const HEAD_X = 219 / VIEW_W;                      // 머리 중심 (가로 비율)
  const SIZE_PX = { s: 110, m: 150, l: 200 };
  const BASE_SPEED = 46;                            // px/s

  const $ = s => document.querySelector(s);
  const buddyEl = $('#buddy'), rbEl = $('#rb'), badgeEl = $('#badge');
  const bubble = $('#bubble');
  $('#rb-flip').innerHTML = window.RideBuddyCharacter.svg();

  // ---------- 브리지 (Electron / 브라우저 데모) ----------
  const isDemo = !window.rideBuddyAPI;
  const bridge = window.rideBuddyAPI || makeDemoBridge();

  // ---------- 상태 ----------
  let cfg = { size: 'm', speed: 1, sound: true, dnd: false, paused: false, showBody: true };
  let charW = SIZE_PX.m, charH = charW * VIEW_H / VIEW_W;
  let x = 0, dir = 1, mode = 'ride';
  let nextDecision = 0;
  const queue = [];
  const history = [];
  let pending = 0;           // 방해 금지 중 쌓인 알림 수
  let busy = false;
  let current = null;
  let timers = [];
  let dragging = null;

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const laneW = () => window.innerWidth;

  // ---------- 모드 ----------
  function setMode(m) {
    mode = m;
    const map = { ride: 'rb--ride', stop: 'rb--stop', notify: 'rb--notify', talk: 'rb--talk', happy: 'rb--happy', sleep: 'rb--sleep', drag: 'rb--happy' };
    rbEl.className = `rb ${map[m] || ''} ${dir < 0 ? 'rb--left' : ''}`;
  }
  function idleMode() {
    if (cfg.dnd) return 'sleep';
    return cfg.paused ? 'stop' : 'ride';
  }
  function turn() {
    dir = -dir;
    rbEl.classList.toggle('rb--left', dir < 0);
    rbEl.classList.add('rb--turn');
    setTimeout(() => rbEl.classList.remove('rb--turn'), 520);
  }

  // ---------- 크기/설정 ----------
  function applyConfig(c) {
    const wasDnd = cfg.dnd;
    cfg = { ...cfg, ...c };
    charW = SIZE_PX[cfg.size] || 150;
    charH = charW * VIEW_H / VIEW_W;
    document.documentElement.style.setProperty('--char-w', charW + 'px');
    x = Math.min(Math.max(0, x), Math.max(0, laneW() - charW));

    if (cfg.dnd && !wasDnd && !busy) setMode('sleep');
    if (!cfg.dnd && wasDnd) {
      updateBadge();
      if (!busy && queue.length) next(); else if (!busy) setMode(idleMode());
    }
    if (!busy && !dragging && (mode === 'ride' || mode === 'stop' || mode === 'sleep')) setMode(idleMode());
    updateBadge();
  }

  // ---------- 이동 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!busy && !dragging && !cfg.dnd && !cfg.paused) {
      if (now > nextDecision) decide(now);
      if (mode === 'ride') {
        x += dir * BASE_SPEED * cfg.speed * dt;
        const max = Math.max(0, laneW() - charW);
        if (x <= 0) { x = 0; if (dir < 0) turn(); }
        if (x >= max) { x = max; if (dir > 0) turn(); }
      }
    }
    buddyEl.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    if (!bubble.hidden) placeBubble();
    requestAnimationFrame(frame);
  }

  function decide(now) {
    if (mode === 'ride') {
      const r = Math.random();
      if (r < 0.35) { setMode('stop'); nextDecision = now + rand(2500, 6000); }
      else if (r < 0.5) { turn(); nextDecision = now + rand(5000, 12000); }
      else nextDecision = now + rand(6000, 14000);
    } else {
      setMode('ride');
      if (Math.random() < 0.3) turn();
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
    if (!queue.length || cfg.dnd) {
      busy = false;
      current = null;
      hideBubble();
      if (cfg.dnd) { setMode('sleep'); updateBadge(); return; }
      setMode('happy');
      later(() => { if (!busy && !dragging) { setMode(idleMode()); nextDecision = performance.now() + rand(4000, 9000); } }, 1100);
      return;
    }
    busy = true;
    pending = 0;
    current = queue.shift();
    updateBadge();
    setMode('notify');
    if (cfg.sound) horn();
    later(() => showBubble(current), 850);
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
    tEl.textContent = ''; bEl.textContent = '';

    bubble.hidden = false;
    bubble.classList.remove('out'); bubble.classList.remove('in');
    void bubble.offsetWidth;
    bubble.classList.add('in');
    // 최종 크기 기준으로 위치를 먼저 잡기 위해 전체 텍스트로 측정 후 타이핑
    tEl.textContent = title; bEl.textContent = body;
    placeBubble();
    tEl.textContent = ''; bEl.textContent = '';

    setMode('talk');
    const full = [...title], fullB = [...body];
    const total = full.length + fullB.length;
    const step = Math.max(14, Math.min(45, 2200 / Math.max(1, total)));
    let i = 0;
    const tick = () => {
      if (current !== n) return;
      i++;
      tEl.textContent = full.slice(0, i).join('');
      bEl.textContent = i > full.length ? fullB.slice(0, i - full.length).join('') : '';
      const target = i <= full.length ? tEl : bEl;
      tEl.classList.toggle('typing', target === tEl); bEl.classList.toggle('typing', target === bEl);
      if (i < total) later(tick, step);
      else {
        tEl.classList.remove('typing'); bEl.classList.remove('typing');
        setMode('stop');
        const hold = Math.min(9000, 3500 + total * 55);
        const bar = $('.bubble-progress i');
        bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
        void bar.offsetWidth;
        bar.style.transition = `transform ${hold}ms linear`; bar.style.transform = 'scaleX(0)';
        later(dismiss, hold);
      }
    };
    later(tick, 120);
  }

  function dismiss() {
    if (!busy) return;
    bubble.classList.remove('in');
    bubble.classList.add('out');
    clearTimers();
    later(() => { bubble.hidden = true; next(); }, 220);
  }
  function hideBubble() { bubble.hidden = true; bubble.classList.remove('in', 'out'); }

  function placeBubble() {
    const W = laneW();
    const bw = bubble.offsetWidth;
    const headX = x + charW * (dir < 0 ? 1 - HEAD_X : HEAD_X);
    const left = Math.max(8, Math.min(W - bw - 8, headX - bw / 2));
    bubble.style.left = left + 'px';
    bubble.style.bottom = Math.round(charH + 16) + 'px';
    const tail = Math.max(22, Math.min(bw - 22, headX - left));
    bubble.style.setProperty('--tail-x', tail + 'px');
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
  // 클릭 통과: 캐릭터/말풍선 위에서만 마우스를 받음
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
    dragging = { sx: e.clientX, ox: x, moved: false, prevMode: mode };
  });
  buddyEl.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragging.sx;
    if (!dragging.moved && Math.abs(dx) > 4) { dragging.moved = true; buddyEl.classList.add('dragging'); if (!busy) setMode('drag'); }
    if (dragging.moved) {
      x = Math.max(0, Math.min(laneW() - charW, dragging.ox + dx));
      const want = dx > 0 ? 1 : -1;
      if (Math.abs(dx) > 30 && want !== dir) turn();
    }
  });
  buddyEl.addEventListener('pointerup', e => {
    if (!dragging) return;
    const d = dragging;
    dragging = null;
    buddyEl.classList.remove('dragging');
    if (d.moved) { if (!busy) setMode(idleMode()); return; }
    onClick(e);
  });

  let lastClick = 0;
  function onClick() {
    const now = performance.now();
    if (now - lastClick < 350) { lastClick = 0; replay(); return; }
    lastClick = now;
    if (busy) { dismiss(); return; }
    setMode('happy');
    if (cfg.sound) horn();
    clearTimers();
    later(() => { if (!busy) { setMode(idleMode()); nextDecision = performance.now() + rand(3000, 8000); } }, 1400);
  }

  function replay() {
    if (!history.length) return;
    const n = { ...history[0], replay: true };
    queue.unshift(n);
    if (cfg.dnd) { /* 방해 금지 중에도 직접 요청하면 읽어줌 */ const keep = cfg.dnd; cfg.dnd = false; next(); cfg.dnd = keep; return; }
    if (busy) dismiss(); else next();
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
    setMode(idleMode());
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
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b); };
    btn('🔔 알림 보내기', () => handlers.notify.forEach(h => h({ ...samples[k++ % samples.length], time: Date.now() })));
    btn('😴 방해 금지', () => { demoCfg = { ...demoCfg, dnd: !demoCfg.dnd }; handlers.config.forEach(h => h(demoCfg)); });
    btn('⏸ 멈춤', () => { demoCfg = { ...demoCfg, paused: !demoCfg.paused }; handlers.config.forEach(h => h(demoCfg)); });
    btn('🔍 크기', () => { demoCfg = { ...demoCfg, size: { s: 'm', m: 'l', l: 's' }[demoCfg.size] }; handlers.config.forEach(h => h(demoCfg)); });
    document.body.appendChild(bar);
    window.__demo = { send: n => handlers.notify.forEach(h => h({ time: Date.now(), ...n })), config: c => { demoCfg = { ...demoCfg, ...c }; handlers.config.forEach(h => h(demoCfg)); } };
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
