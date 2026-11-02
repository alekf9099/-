// 전투 화면 — 엔진 이벤트를 순차 재생 (연출과 로직 분리)
import type { Element as El, ItemId, StatusId } from '../../core/types';
import { Rng } from '../../core/rng';
import { ELEMENTS, effLabel, effectiveness } from '../../data/elements';
import { AFFIXES } from '../../data/affixes';
import { getMove } from '../../data/moves';
import { getSpecies } from '../../data/species';
import { ITEMS } from '../../data/charms';
import { ACTS } from '../../data/world';
import {
  type BEvent, type BattleState, type Side, type PlayerAction,
  activeOf, captureChance, chooseAiMove, expectedDamage, forceSwitch, intentInfo, previewEff, resolveTurn, STATUS_NAME,
} from '../../game/battle';
import { type BattleMonster, displayName, maxHp } from '../../game/monster';
import { applyBattleOutcome, buildBattle, makeEncounter } from '../../game/run';
import { app, register, saveAll } from '../app';
import { bar, h, openSheet, sleep, toast, type Sheet } from '../dom';
import { haptic, sfx, speedMult, whoosh } from '../fx';
import { elChips } from '../components';
import { monSprite } from '../sprite';
import { endRun, processGrowth, run, seen, setBattleReward } from '../flow';
import { markCaught, saveMeta } from '../../game/meta';
import { bestLevel } from '../../game/advice';
import { coach } from '../coach';
import { playTrack } from '../audio';
import { EL_ICON, ITEM_ICON, ACT_BG, ico, img } from '../assets';
import { Vfx } from '../vfx';

interface View {
  b: BattleState;
  rng: Rng;
  busy: boolean;
  auto: boolean;
  /** 표시용 스냅샷 (이벤트 재생 중 실제 상태와 분리) */
  disp: { idx: Record<Side, number>; hp: Map<string, number>; status: Map<string, StatusId | undefined>; en: Record<Side, number> };
  el: Record<string, HTMLElement>;
  /** ⏩ 이번 턴 연출 빨리 감기 */
  skip: boolean;
  /** 패배 분석용: 마지막으로 공격한 적과 기술 */
  lastFoe?: { speciesId: string; level: number; moveId: string };
  /** ✨ 속성 이펙트 레이어 */
  fx: Vfx;
  /** 현재 재생 중인 기술 (착탄 이펙트 속성 결정) */
  cur?: { side: Side; el: El };
}

let V: View | null = null;

/** 빨리 감기 중이면 대기 생략 */
function wait(ms: number): Promise<void> {
  return V?.skip ? sleep(16) : sleep(ms * speedMult());
}

register('battle', () => {
  const r = run();
  const node = r.map.nodes[r.currentNodeId!];
  const enc = makeEncounter(r, node);
  const b = buildBattle(r, enc);
  const rng = new Rng(r.rngState);
  enc.enemies.forEach((m) => seen(m.speciesId));

  const el: Record<string, HTMLElement> = {};
  el.eCard = h('div', { class: 'b-card enemy' });
  el.pCard = h('div', { class: 'b-card player' });
  el.eSprite = h('div', { class: 'b-sprite enemy' });
  el.pSprite = h('div', { class: 'b-sprite player' });
  el.log = h('div', { class: 'b-log', role: 'log', 'aria-live': 'polite' }, enc.title);
  el.moves = h('div', { class: 'b-moves' });
  el.sub = h('div', { class: 'b-sub' });
  el.teamDots = h('div', { class: 'team-dots' });
  el.intent = h('button', { class: 'intent', hidden: true, 'aria-live': 'polite' });
  el.arena = h('div', { class: 'arena' },
    h('div', { class: 'arena-floor e' }), h('div', { class: 'arena-floor p' }),
    h('div', { class: 'side e' }, h('div', { class: 'e-col' }, el.eCard, el.intent), el.eSprite),
    h('div', { class: 'side p' }, el.pSprite, el.pCard),
  );
  el.autoBtn = h('button', { class: 'chip-btn', 'aria-pressed': 'false', onclick: () => toggleAuto() }, ico('auto', 14), 'AUTO');
  el.speedBtn = h('button', { class: 'chip-btn', onclick: () => cycleSpeed() }, `▶ x${app.meta.settings.speed}`);
  const kindBadge = { wild: '야생', trainer: '테이머', elite: '엘리트', boss: 'BOSS' }[b.kind];
  const act = ACTS[r.act];
  const root = h('div', { class: `battle-screen k-${b.kind}`, style: `--bg1:${act.bg[0]};--bg2:${act.bg[1]};--bgimg:url(${ACT_BG[r.act]})` },
    h('header', { class: 'b-top' }, h('span', { class: 'kind-badge k-' + b.kind }, kindBadge), el.teamDots, h('span', { class: 'spacer' }), el.speedBtn, el.autoBtn),
    el.arena,
    el.log,
    h('div', { class: 'b-panel' }, el.moves, el.sub),
  );

  const skip = () => {
    if (V && V.busy && !V.skip) {
      V.skip = true;
      haptic(6);
    }
  };
  el.arena.addEventListener('pointerdown', skip);
  el.log.addEventListener('pointerdown', skip);
  V?.fx.destroy();
  V = {
    b, rng, busy: false, auto: false, el, skip: false, fx: new Vfx(el.arena, app.meta.settings.reduceMotion),
    disp: { idx: { p: b.p.active, e: b.e.active }, hp: new Map(), status: new Map(), en: { p: b.p.en, e: b.e.en } },
  };
  el.arena.style.setProperty('--spd', String(speedMult()));
  snapshot();
  renderAll();
  playTrack(b.kind === 'boss' ? 'boss' : 'battle');
  if (b.kind === 'boss') {
    root.classList.add('boss-intro');
    // 등장 연출은 1회만 (남겨두면 스프라이트를 다시 그릴 때마다 재생됨)
    setTimeout(() => root.classList.remove('boss-intro'), 1200);
    sfx('roar');
  }
  setTimeout(() => {
    if (!app.meta.tutorialDone) showTutorial();
  }, 500);
  return root;
});

function snapshot(): void {
  const v = V!;
  for (const m of [...v.b.p.team, ...v.b.e.team]) {
    v.disp.hp.set(m.uid, m.hp);
    v.disp.status.set(m.uid, m.status);
  }
  v.disp.idx = { p: v.b.p.active, e: v.b.e.active };
  v.disp.en = { p: v.b.p.en, e: v.b.e.en };
}

function dispMon(side: Side) {
  const v = V!;
  return v.b[side].team[v.disp.idx[side]];
}

// ─────────── 렌더 ───────────
function renderCard(side: Side): void {
  const v = V!;
  const m = dispMon(side);
  const sp = getSpecies(m.speciesId);
  const hp = v.disp.hp.get(m.uid) ?? m.hp;
  const mx = maxHp(m);
  const st = v.disp.status.get(m.uid);
  const card = side === 'p' ? v.el.pCard : v.el.eCard;
  card.innerHTML = '';
  const rows: (HTMLElement | null)[] = [
    h('div', { class: 'row between' }, h('b', { class: 'b-name' }, displayName(m), m.shiny ? ' ✦' : ''), h('span', { class: 'lv' }, 'Lv.' + m.level)),
    h('div', { class: 'row gap-s' }, elChips(sp.elements, true), st ? h('span', { class: 'status-chip st-' + st }, STATUS_NAME[st]) : null, stageChips(side)),
    side === 'e' && (m as BattleMonster).affixes?.length
      ? h('div', { class: 'affix-row' }, (m as BattleMonster).affixes!.map((id) => h('button', { class: 'affix-chip', onclick: () => toast(`${AFFIXES[id].icon} ${AFFIXES[id].name}: ${AFFIXES[id].desc}`) }, `${AFFIXES[id].icon}${AFFIXES[id].name}`)))
      : null,
    side === 'e' && v.b.phase2 ? h('span', { class: 'rage-chip' }, '💢 분노') : null,
    h('div', { class: 'hp-line' }, bar(hp / mx, 'hp'), side === 'p' ? h('span', { class: 'hp-num' }, `${hp}/${mx}`) : h('span', { class: 'hp-num' }, `${Math.ceil((hp / mx) * 100)}%`)),
    side === 'p' ? enPips(v.disp.en.p, v.b.p.maxEn) : enPips(v.disp.en.e, v.b.e.maxEn, true),
  ];
  card.append(...rows.filter((x): x is HTMLElement => !!x));
}

/** ⚔️ 적 행동 예고 배너 */
function renderIntent(): void {
  const v = V!;
  const el = v.el.intent;
  const info = v.busy || v.b.needSwitch ? null : intentInfo(v.b);
  el.hidden = !info;
  if (!info) return;
  const e = ELEMENTS[info.move.element];
  const me = activeOf(v.b, 'p');
  const icon = { attack: '⚔️', buff: '⬆️', debuff: '⬇️', heal: '💚', status: '💤' }[info.kind];
  const eff = info.move.power > 0 ? effectiveness(info.move.element, getSpecies(me.speciesId).elements) : 1;
  el.className = 'intent' + (info.lethal ? ' lethal' : '') + (eff > 1 ? ' hot' : eff < 1 ? ' cool' : '');
  el.style.setProperty('--c', e.color);
  el.innerHTML = '';
  el.append(
    h('span', { class: 'intent-label' }, '다음 행동'),
    h('b', null, `${icon} ${info.move.name}`),
    info.kind === 'attack'
      ? h('span', { class: 'intent-dmg' }, `~${info.expected}${info.lethal ? ' 위험!' : eff > 1 ? ' 약점' : eff < 1 ? ' 저항' : ''}`)
      : h('span', { class: 'intent-dmg' }, { buff: '자기 강화', debuff: '약화', heal: '회복', status: '상태이상', attack: '' }[info.kind]),
  );
  el.onclick = () => toast(`${info.move.name}: ${info.move.desc}${info.kind === 'attack' ? ` · 현재 ${displayName(me)}에게 약 ${info.expected} 피해 예상` : ''}`);
}

function stageChips(side: Side): HTMLElement | null {
  const st = V!.b[side].stages;
  const lab = { atk: '공', def: '방', spd: '속' } as const;
  const parts = (Object.keys(st) as (keyof typeof st)[]).filter((k) => st[k] !== 0).map((k) =>
    h('span', { class: 'stage ' + (st[k] > 0 ? 'up' : 'down') }, `${lab[k]}${st[k] > 0 ? '▲' : '▼'}${Math.abs(st[k])}`));
  return parts.length ? h('span', { class: 'stages' }, parts) : null;
}

function enPips(en: number, max: number, small = false): HTMLElement {
  return h('div', { class: 'en-row' + (small ? ' sm' : ''), 'aria-label': `EN ${en}/${max}` },
    h('small', null, 'EN'),
    Array.from({ length: max }, (_, i) => h('i', { class: 'en-pip' + (i < en ? ' on' : '') })),
  );
}

function renderSprite(side: Side): void {
  const m = dispMon(side);
  const box = side === 'p' ? V!.el.pSprite : V!.el.eSprite;
  const big = getSpecies(m.speciesId).rarity === 'legend';
  // 같은 개체면 다시 그리지 않음 → 대기 모션이 매 턴 처음부터 튀지 않음
  const key = `${m.uid}:${m.speciesId}`;
  if (box.dataset.key !== key || !box.firstElementChild) {
    box.dataset.key = key;
    box.innerHTML = monSprite(m, { size: big ? 190 : 150, flip: side === 'p' });
    // 대기 모션 위상을 엇갈리게 (두 마리가 똑같이 움직이면 기계적으로 보임)
    box.style.setProperty('--idle-d', `-${(Math.random() * 2).toFixed(2)}s`);
  }
  const hp = V!.disp.hp.get(m.uid) ?? m.hp;
  box.classList.toggle('fainted', hp <= 0);
  box.classList.toggle('low', hp > 0 && hp / maxHp(m) <= 0.25);
}

function renderTeamDots(): void {
  const v = V!;
  v.el.teamDots.innerHTML = '';
  if (v.b.e.team.length > 1) {
    v.el.teamDots.append(...v.b.e.team.map((m) => h('i', { class: (v.disp.hp.get(m.uid) ?? m.hp) > 0 ? 'on' : '' })));
  }
}

function renderMoves(): void {
  const v = V!;
  const b = v.b;
  v.el.moves.innerHTML = '';
  v.el.sub.innerHTML = '';
  if (b.over) return;
  const me = activeOf(b, 'p');
  const foe = activeOf(b, 'e');
  me.moves.forEach((id, idx) => {
    const mv = getMove(id);
    const e = ELEMENTS[mv.element];
    const afford = mv.cost <= b.p.en;
    const eff = previewEff(b, 'p', mv);
    const label = mv.power > 0 ? effLabel(eff) : '';
    const ko = mv.power > 0 && afford && expectedDamage(b, 'p', mv) >= foe.hp;
    v.el.moves.appendChild(h('button', {
      class: 'move-btn' + (afford ? '' : ' no-en') + (eff > 1 ? ' good' : eff < 1 ? ' bad' : ''),
      style: `--c:${e.color}`,
      disabled: !afford || v.busy ? true : undefined,
      'aria-label': `${mv.name}, ${e.name} 속성, EN ${mv.cost}${label ? ', ' + label : ''}`,
      onclick: () => act({ type: 'move', idx }),
      oncontextmenu: (ev: MouseEvent) => { ev.preventDefault(); toast(`${mv.name}: ${mv.desc}`); },
    },
      h('span', { class: 'mv-top' }, h('b', null, mv.name), h('span', { class: 'mv-cost' }, mv.cost ? '◆'.repeat(mv.cost) : 'FREE')),
      h('span', { class: 'mv-bot' }, h('small', { class: 'row gap-s' }, EL_ICON[mv.element] ? img(EL_ICON[mv.element]!, 14, 'el-ico') : e.icon, mv.power > 0 ? '위력 ' + mv.power : '변화'),
        ko ? h('span', { class: 'eff-badge ko' }, 'KO!') : label ? h('span', { class: 'eff-badge ' + (eff > 1 ? 'up' : 'down') }, label.replace(/[!…]/g, '')) : null),
    ));
  });
  const r = run();
  const capsules = (r.items.capsule ?? 0) + (r.items.hyperCapsule ?? 0);
  const canSwitch = b.p.team.some((m, i) => i !== b.p.active && m.hp > 0);
  v.el.sub.append(
    h('button', { class: 'sub-btn', disabled: !canSwitch || v.busy ? true : undefined, onclick: () => switchSheet(false) }, ico('swap', 18), h('span', null, '교체')),
    h('button', { class: 'sub-btn', disabled: v.busy ? true : undefined, onclick: () => itemSheet() }, img(ITEM_ICON.potion, 26), h('span', null, '아이템')),
    b.kind === 'wild'
      ? h('button', { class: 'sub-btn capture', disabled: !capsules || v.busy ? true : undefined, onclick: () => captureSheet() }, img(ITEM_ICON.capsule, 26), h('span', null, `포획 ${Math.round(captureChance(b, 'capsule') * 100)}%`), h('small', null, `×${capsules}`))
      : h('button', { class: 'sub-btn', disabled: true }, '🚫', h('span', null, '포획 불가')),
  );
}

function renderAll(): void {
  renderCard('p');
  renderCard('e');
  renderSprite('p');
  renderSprite('e');
  renderTeamDots();
  renderMoves();
  renderIntent();
}

// ─────────── 입력 ───────────
async function act(a: PlayerAction): Promise<void> {
  const v = V!;
  if (v.busy || v.b.over) return;
  sfx('tap');
  v.busy = true;
  v.skip = false;
  v.el.log.classList.add('playing');
  renderMoves();
  renderIntent();
  snapshot();
  const ev = resolveTurn(v.b, a, v.rng);
  await play(ev);
  await afterTurn();
}

async function afterTurn(): Promise<void> {
  const v = V!;
  snapshot();
  v.busy = false;
  v.skip = false;
  v.el.log.classList.remove('playing');
  renderAll();
  // 💡 상황별 첫 경험 팁
  const info = intentInfo(v.b);
  if (info?.lethal && v.b.p.team.some((m, i) => i !== v.b.p.active && m.hp > 0)) coach('intent-lethal');
  const foe = activeOf(v.b, 'e');
  const r0 = run();
  if (v.b.kind === 'wild' && foe.hp > 0 && foe.hp / maxHp(foe) <= 0.5 && (r0.items.capsule ?? 0) + (r0.items.hyperCapsule ?? 0) > 0) coach('capture-chance');
  if (v.b.turn >= 3) coach('fast-forward');
  if (v.b.over) return finish();
  if (v.b.needSwitch) {
    if (v.auto) {
      const best = bestAlive();
      await doForceSwitch(best);
    } else switchSheet(true);
    return;
  }
  if (v.auto) {
    await sleep(250 * speedMult());
    if (V === v && v.auto && !v.busy) void act({ type: 'move', idx: chooseAiMove(v.b, 'p', null) });
  }
}

function bestAlive(): number {
  const t = V!.b.p.team;
  let best = -1;
  t.forEach((m, i) => { if (m.hp > 0 && (best < 0 || m.hp / maxHp(m) > t[best].hp / maxHp(t[best]))) best = i; });
  return best;
}

async function doForceSwitch(idx: number): Promise<void> {
  const v = V!;
  v.busy = true;
  snapshot();
  const ev = forceSwitch(v.b, idx);
  await play(ev);
  await afterTurn();
}

function toggleAuto(): void {
  const v = V!;
  v.auto = !v.auto;
  v.el.autoBtn.classList.toggle('on', v.auto);
  v.el.autoBtn.setAttribute('aria-pressed', String(v.auto));
  toast(v.auto ? '⚡ 자동 전투 ON — 최적 기술을 자동 선택' : '자동 전투 OFF');
  if (v.auto && !v.busy && !v.b.over) {
    if (v.b.needSwitch) void doForceSwitch(bestAlive());
    else void act({ type: 'move', idx: chooseAiMove(v.b, 'p', null) });
  }
}

function cycleSpeed(): void {
  const s = app.meta.settings;
  s.speed = (s.speed === 3 ? 1 : s.speed + 1) as 1 | 2 | 3;
  V!.el.speedBtn.textContent = `▶ x${s.speed}`;
  V!.el.arena.style.setProperty('--spd', String(speedMult()));
  saveMeta(app.meta);
}

let openBattleSheet: Sheet | null = null;

function switchSheet(forced: boolean): void {
  const v = V!;
  const b = v.b;
  openBattleSheet?.close();
  openBattleSheet = openSheet(forced ? '다음 에코링을 선택하세요' : '교체 (턴 소모)', h('div', { class: 'list' },
    b.p.team.map((m, i) => {
      const ok = m.hp > 0 && i !== b.p.active;
      const sp = getSpecies(m.speciesId);
      return h('button', { class: 'mon-row' + (ok ? '' : ' fainted'), disabled: ok ? undefined : true, onclick: async () => {
        openBattleSheet?.close();
        openBattleSheet = null;
        if (forced) await doForceSwitch(i);
        else await act({ type: 'switch', idx: i });
      } },
        h('div', { class: 'mon-row-sprite', html: monSprite(m, { size: 52 }) }),
        h('div', { class: 'mon-row-main' }, h('div', { class: 'mon-row-top' }, h('b', null, displayName(m)), h('span', { class: 'lv' }, 'Lv.' + m.level)), elChips(sp.elements, true),
          h('div', { class: 'hp-line' }, bar(m.hp / maxHp(m), 'hp'), h('span', { class: 'hp-num' }, `${m.hp}/${maxHp(m)}`))),
        i === b.p.active ? h('span', { class: 'tag' }, '출전 중') : null,
      );
    }),
  ), { dismissible: !forced });
}

function itemSheet(): void {
  const r = run();
  const usable = (Object.entries(r.items) as [ItemId, number][]).filter(([id, n]) => n > 0 && ITEMS[id].battle && id !== 'capsule' && id !== 'hyperCapsule');
  openBattleSheet = openSheet('🎒 아이템 (턴 소모)', h('div', { class: 'list' },
    usable.length ? usable.map(([id, n]) => {
      const it = ITEMS[id];
      return h('button', { class: 'card row between', onclick: () => {
        openBattleSheet?.close();
        if (it.target === 'none') return useItem(id);
        pickTarget(id);
      } }, img(ITEM_ICON[id], 44, 'item-ico'), h('div', { class: 'grow' }, h('b', null, it.name), h('div', { class: 'muted small' }, it.desc)), h('span', { class: 'pill' }, `×${n}`));
    }) : h('p', { class: 'muted pad' }, '전투에서 쓸 수 있는 아이템이 없어요.'),
  ));
}

function pickTarget(id: ItemId): void {
  const b = V!.b;
  const it = ITEMS[id];
  openBattleSheet = openSheet(`${it.icon} 누구에게?`, h('div', { class: 'list' }, b.p.team.map((m, i) => {
    const ok = it.target === 'fainted' ? m.hp <= 0 : m.hp > 0 && (id !== 'cleanser' || !!m.status) && (id === 'cleanser' || m.hp < maxHp(m));
    return h('button', { class: 'mon-row' + (ok ? '' : ' fainted'), disabled: ok ? undefined : true, onclick: () => { openBattleSheet?.close(); useItem(id, i); } },
      h('div', { class: 'mon-row-sprite', html: monSprite(m, { size: 48 }) }),
      h('div', { class: 'mon-row-main' }, h('b', null, displayName(m)), h('div', { class: 'hp-line' }, bar(m.hp / maxHp(m), 'hp'), h('span', { class: 'hp-num' }, `${m.hp}/${maxHp(m)}`))));
  })));
}

function useItem(id: ItemId, target?: number): void {
  const r = run();
  if ((r.items[id] ?? 0) <= 0) return;
  r.items[id] = (r.items[id] ?? 1) - 1;
  void act({ type: 'item', item: id, target });
}

function captureSheet(): void {
  const b = V!.b;
  const r = run();
  const opts = (['capsule', 'hyperCapsule'] as const).filter((id) => (r.items[id] ?? 0) > 0);
  if (opts.length === 1) return throwCapsule(opts[0]);
  openBattleSheet = openSheet('🔵 캡슐 선택', h('div', { class: 'list' }, opts.map((id) =>
    h('button', { class: 'card row between', onclick: () => { openBattleSheet?.close(); throwCapsule(id); } },
      img(ITEM_ICON[id], 44, 'item-ico'), h('div', { class: 'grow' }, h('b', null, ITEMS[id].name), h('div', { class: 'muted small' }, `성공 확률 약 ${Math.round(captureChance(b, id) * 100)}%`)),
      h('span', { class: 'pill' }, `×${r.items[id]}`)),
  )));
}

function throwCapsule(id: 'capsule' | 'hyperCapsule'): void {
  const r = run();
  if (r.party.length + r.box.length >= 30) return toast('보관함이 가득 찼어요', 'bad');
  r.items[id] = (r.items[id] ?? 1) - 1;
  void act({ type: 'capture', item: id });
}

// ─────────── 이벤트 재생 ───────────
function log(text: string): void {
  V!.el.log.textContent = text;
}

function pop(side: Side, text: string, cls: string): void {
  const box = side === 'p' ? V!.el.pSprite : V!.el.eSprite;
  const p = h('div', { class: 'pop ' + cls }, text);
  box.appendChild(p);
  setTimeout(() => p.remove(), 1100);
}

function anim(elm: HTMLElement, cls: string, ms: number): Promise<void> {
  elm.classList.remove(cls);
  void elm.offsetWidth;
  elm.classList.add(cls);
  return wait(ms).then(() => elm.classList.remove(cls));
}

const sprOf = (side: Side): HTMLElement => (side === 'p' ? V!.el.pSprite : V!.el.eSprite);
const other = (side: Side): Side => (side === 'p' ? 'e' : 'p');
/** 이펙트 기준점: 스프라이트 몸통 중심 */
const bodyAt = (side: Side) => V!.fx.centerOf(sprOf(side), 0.55);
/** 연출 시간 (배속·빨리 감기 반영) */
const T = (ms: number): number => (V?.skip ? 0 : ms * speedMult());
const PROJ_MS: Record<El, number> = { neutral: 170, blaze: 360, tide: 340, bloom: 400, volt: 230, terra: 430, gale: 300, umbra: 420, lumen: 300 };

/** use 직후 이 기술이 빗나가는지 (빗나가면 발사체가 상대를 스쳐 지나감) */
function willMiss(events: BEvent[], i: number): boolean {
  for (let j = i + 1; j < events.length; j++) {
    const e = events[j];
    if (e.t === 'miss') return true;
    if (e.t === 'hit' || e.t === 'use' || e.t === 'end') return false;
  }
  return false;
}

/** ⚔️ 공격 연출: (대기술이면 기 모으기) → 체형별 공격 모션 → 속성 발사체 */
async function attackFx(side: Side, element: El, cost: number, miss: boolean): Promise<void> {
  const v = V!;
  const spr = sprOf(side);
  const body = getSpecies(dispMon(side).speciesId).look.body;
  if (cost >= 2 && !v.skip) {
    v.fx.charge(element, bodyAt(side), T(300));
    void anim(spr, 'charging', 300);
    await wait(300);
  }
  void anim(spr, 'atk', 560);
  // 공격 모션의 「내지르는」 순간에 발사
  await wait(body === 'golem' ? 300 : body === 'bird' ? 260 : 220);
  if (body === 'golem' && !app.meta.settings.reduceMotion) void anim(v.el.arena, 'shake', 300);
  const from = bodyAt(side);
  let to = bodyAt(other(side));
  if (miss) to = { x: to.x + (to.x - from.x) * 0.45, y: to.y + (to.y - from.y) * 0.45 - 30 };
  if (!v.skip) whoosh(element);
  await v.fx.projectile(element, from, to, T(PROJ_MS[element]));
}

async function play(events: BEvent[]): Promise<void> {
  const v = V!;
  const d = (ms: number) => wait(ms);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (V !== v) return; // 화면 이탈
    switch (e.t) {
      case 'msg':
        log(e.text);
        await d(560);
        break;
      case 'use': {
        const mv = getMove(e.move);
        if (e.side === 'e') {
          const foe = dispMon('e');
          v.lastFoe = { speciesId: foe.speciesId, level: foe.level, moveId: e.move };
        }
        log(`${e.name}의 ${mv.name}!`);
        const spr = sprOf(e.side);
        spr.style.setProperty('--fx', ELEMENTS[mv.element].color);
        v.cur = { side: e.side, el: mv.element };
        if (mv.power > 0) await attackFx(e.side, mv.element, mv.cost, willMiss(events, i));
        else {
          if (!v.skip) v.fx.charge(mv.element, bodyAt(e.side), T(380));
          await anim(spr, 'cast', 420);
        }
        break;
      }
      case 'hit': {
        const m = dispMon(e.side);
        const spr = sprOf(e.side);
        const at = bodyAt(e.side);
        if (e.src === 'burn' || e.src === 'poison') v.fx.dot(e.src, at);
        else if (e.src) v.fx.impact(e.src === 'thorns' ? 'bloom' : 'neutral', at, { small: true });
        else {
          const el = v.cur?.el ?? 'neutral';
          // 연타기: 두 번째 타격부터는 짧은 발사체를 한 번 더
          if (e.hitNo && e.hitNo > 1 && v.cur && !v.skip) await v.fx.projectile(el, bodyAt(v.cur.side), at, T(Math.min(180, PROJ_MS[el] * 0.5)));
          v.fx.impact(el, at, { crit: e.crit, super: e.eff > 1 });
          // 히트스톱: 강타 순간 한 박자 멈춤 → 타격감
          if ((e.crit || e.eff > 1) && !v.skip) await sleep(70);
        }
        v.disp.hp.set(m.uid, e.hp);
        renderCard(e.side);
        renderTeamDots();
        pop(e.side, `-${e.dmg}`, e.crit ? 'crit' : e.eff > 1 ? 'super' : e.eff < 1 ? 'weak' : '');
        if (e.crit) {
          sfx('crit');
          if (!app.meta.settings.reduceMotion) void anim(v.el.arena, 'shake', 350);
          pop(e.side, '치명타!', 'tag-pop');
        } else if (e.eff > 1) {
          sfx('super');
          pop(e.side, effLabel(e.eff), 'tag-pop up');
        } else if (e.eff < 1) {
          sfx('weak');
          pop(e.side, effLabel(e.eff), 'tag-pop down');
        } else sfx('hit');
        await anim(spr, e.crit || e.eff > 1 ? 'hurt-big' : 'hurt', e.crit ? 480 : 420);
        spr.classList.toggle('low', e.hp > 0 && e.hp / maxHp(m) <= 0.25);
        break;
      }
      case 'miss':
        pop(e.side, 'MISS', 'miss');
        v.fx.whiff(bodyAt(e.side));
        await anim(sprOf(e.side), 'dodge', 380);
        break;
      case 'heal': {
        const m = dispMon(e.side);
        v.disp.hp.set(m.uid, e.hp);
        renderCard(e.side);
        sfx('heal');
        v.fx.aura('bloom', bodyAt(e.side), 'heal');
        pop(e.side, `+${e.amount}`, 'heal');
        await d(380);
        break;
      }
      case 'status': {
        const m = dispMon(e.side);
        v.disp.status.set(m.uid, e.status ?? undefined);
        renderCard(e.side);
        if (e.status) {
          sfx('debuff');
          v.fx.aura(v.cur?.el ?? 'neutral', bodyAt(e.side), 'debuff');
          pop(e.side, STATUS_NAME[e.status], 'status st-' + e.status);
        }
        await d(200);
        break;
      }
      case 'stat':
        renderCard(e.side);
        sfx(e.delta > 0 ? 'buff' : 'debuff');
        v.fx.aura(v.cur?.el ?? 'neutral', bodyAt(e.side), e.delta > 0 ? 'buff' : 'debuff');
        pop(e.side, `${{ atk: '공격', def: '방어', spd: '스피드' }[e.stat]} ${e.delta > 0 ? '▲' : '▼'}`, e.delta > 0 ? 'buff' : 'debuff');
        await d(380);
        break;
      case 'faint': {
        const spr = e.side === 'p' ? v.el.pSprite : v.el.eSprite;
        sfx('faint');
        v.fx.poof(bodyAt(e.side));
        spr.classList.remove('low');
        spr.classList.add('fainted');
        renderTeamDots();
        await d(650);
        break;
      }
      case 'switch':
        v.disp.idx[e.side] = e.idx;
        if (e.side === 'e') seen(v.b.e.team[e.idx].speciesId);
        renderSprite(e.side);
        renderCard(e.side);
        void anim(sprOf(e.side), 'enter', 560);
        await wait(300);
        v.fx.land(bodyAt(e.side), getSpecies(dispMon(e.side).speciesId).elements[0]);
        await wait(260);
        break;
      case 'en':
        v.disp.en[e.side] = e.en;
        renderCard(e.side);
        break;
      case 'capture':
        await captureAnim(e.shakes, e.success);
        break;
      case 'exp': {
        const m = v.b.p.team.find((x) => x.uid === e.uid);
        if (!m || e.amount <= 0) break;
        if (m === dispMon('p')) {
          log(`${displayName(m)}은(는) 경험치 ${e.amount}을(를) 얻었다!`);
          await d(420);
        }
        if (e.levels.length) {
          sfx('level');
          toast(`⬆ ${displayName(m)} Lv.${m.level}!${e.learned.length ? ' 새 기술: ' + e.learned.map((x) => getMove(x).name).join(', ') : ''}`, 'good');
          if (m === dispMon('p')) renderCard('p');
          await d(380);
        }
        break;
      }
      case 'phase': {
        sfx('roar');
        haptic([40, 40, 80]);
        if (!app.meta.settings.reduceMotion) void anim(v.el.arena, 'shake', 350);
        void anim(v.el.arena, 'rage', 900);
        toast('💢 보스 분노 각성! 공격 패턴이 강해집니다', 'bad');
        renderCard('e');
        await d(700);
        break;
      }
      case 'revive':
        sfx('evolve');
        for (const m of v.b.p.team) v.disp.hp.set(m.uid, m.hp);
        renderSprite('p');
        renderCard('p');
        v.fx.aura('blaze', bodyAt('p'), 'heal');
        void anim(v.el.arena, 'revive-fx', 900);
        await d(900);
        break;
      case 'end':
        break;
    }
  }
}

async function captureAnim(shakes: number, success: boolean): Promise<void> {
  const v = V!;
  const spr = v.el.eSprite;
  const ball = h('div', { class: 'capsule-fx' });
  spr.appendChild(ball);
  await sleep(450 * speedMult());
  spr.classList.add('absorbed');
  await sleep(350 * speedMult());
  for (let i = 0; i < shakes; i++) {
    sfx('shake');
    await anim(ball, 'wobble', 520);
  }
  if (success) {
    sfx('capture');
    ball.classList.add('locked');
    await sleep(700 * speedMult());
  } else {
    spr.classList.remove('absorbed');
    ball.remove();
    haptic(30);
    await sleep(200 * speedMult());
  }
}

// ─────────── 종료 ───────────
async function finish(): Promise<void> {
  const v = V!;
  const b = v.b;
  const r = run();
  r.rngState = v.rng.state;
  if (b.over === 'lose') {
    log('눈앞이 캄캄해졌다…');
    sfx('lose');
    await sleep(1200);
    const lf = v.lastFoe ?? { speciesId: activeOf(b, 'e').speciesId, level: activeOf(b, 'e').level, moveId: '' };
    v.fx.destroy();
    V = null;
    endRun(false, { enemySpecies: lf.speciesId, enemyLevel: lf.level, moveId: lf.moveId || undefined, myBestLevel: bestLevel(r.party), kind: b.kind });
    return;
  }
  const out = applyBattleOutcome(r, b);
  if (b.over === 'caught' && b.caughtMon) {
    markCaught(app.meta, b.caughtMon.speciesId);
    toast(`🎉 ${displayName(b.caughtMon)} ${out.caughtWhere === 'party' ? '파티 합류!' : '보관함으로 이동'}`, 'good');
  } else {
    sfx('win');
    log(b.kind === 'boss' ? '보스를 쓰러뜨렸다!' : '승리!');
  }
  saveAll();
  await sleep(700);
  await processGrowth(b.pendingLearn);
  v.fx.destroy();
  V = null;
  const node = r.map.nodes[r.currentNodeId!];
  setBattleReward(b.kind, b.kind === 'boss' ? '👑 보스 격파 보상' : node.type === 'elite' ? '💀 엘리트 격파!' : b.over === 'caught' ? '포획 성공!' : '전투 승리!');
}

function showTutorial(): void {
  const steps = [
    ['🎯 행동 예고', '적 카드 아래에 적이 이번 턴에 쓸 기술과 예상 피해가 보여요. 「위험!」이면 교체하거나 회복하세요. 예고는 교체해도 바뀌지 않아요!'],
    ['◆ EN (에코 에너지)', '매 턴 EN이 1씩 차요 (최대 3). 강한 기술일수록 EN을 더 써요. FREE 기술은 언제나 사용 가능!'],
    ['🎯 상성 배지', '기술 버튼의 「효과 굉장」·「KO!」 배지를 확인하세요. 상대 속성에 유리한 기술은 1.6배 피해를 줘요.'],
    ['🔵 포획', '야생 에코링은 체력을 깎을수록, 상태이상일수록 잡기 쉬워요. 확률은 버튼에 표시돼요.'],
    ['🔗 공명', '같은 속성 에코링이 파티에 2마리·3마리 모이면 세트 보너스가 발동해요!'],
  ];
  const s = openSheet('처음이신가요? 30초 가이드', h('div', { class: 'list' },
    steps.map(([t, d]) => h('div', { class: 'card' }, h('b', null, t), h('p', { class: 'muted small' }, d))),
    h('button', { class: 'btn primary block', onclick: () => s.close() }, '알겠어요!'),
  ), { onClose: () => { app.meta.tutorialDone = true; saveMeta(app.meta); } });
}
