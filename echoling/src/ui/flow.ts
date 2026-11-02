// 게임 흐름 컨트롤러: 노드 진입 → 화면 → 완료 → 맵 / 액트 / 런 종료
import type { Monster, RunState } from '../core/types';
import { getMove } from '../data/moves';
import { getSpecies } from '../data/species';
import { getEvent, pickEvent } from '../game/events';
import { markCaught, markSeen, shardsForRun } from '../game/meta';
import { canEvolve, displayName, evolve } from '../game/monster';
import { advanceAct, battleRewards, makeShop, newRun, treasureRewards } from '../game/run';
import type { BattleKind } from '../game/battle';
import { todayKey } from '../core/rng';
import { MAX_ASCENSION } from '../data/world';
import { checkAchievements } from './achv';
import type { DefeatCause } from '../game/advice';
import { app, go, saveAll } from './app';
import { h, openSheet, sleep } from './dom';
import { sfx } from './fx';
import { moveCard } from './components';
import { monSprite, spriteSvg } from './sprite';

export function run(): RunState {
  if (!app.run) throw new Error('no active run');
  return app.run;
}

export function startRun(starterId: string, mode: 'normal' | 'daily', ascension = 0): void {
  app.run = newRun(starterId, app.meta, mode, undefined, mode === 'daily' ? 0 : ascension);
  app.meta.totalRuns += 1;
  markCaught(app.meta, starterId);
  saveAll();
  resume();
}

/** 저장된 pending 상태로 복귀 */
export function resume(): void {
  const r = run();
  switch (r.pending?.kind) {
    case 'reward': return go('reward');
    case 'shop': return go('shop');
    case 'event': return go('event');
    case 'rest': return go('rest');
    case 'treasure': return go('treasure');
    case 'battle': return go('battle');
    case 'actClear': return go('actClear');
    case 'blessing': return go('blessing');
    default: return go('map');
  }
}

export function enterNode(nodeId: string): void {
  const r = run();
  const node = r.map.nodes[nodeId];
  r.currentNodeId = nodeId;
  r.visited.push(nodeId);
  switch (node.type) {
    case 'battle':
    case 'trainer':
    case 'elite':
    case 'boss':
      r.pending = { kind: 'battle' };
      break;
    case 'shop':
      r.pending = { kind: 'shop', stock: makeShop(r, app.meta) };
      break;
    case 'rest':
      r.pending = { kind: 'rest' };
      break;
    case 'event':
      r.pending = { kind: 'event', eventId: pickEvent(r) };
      break;
    case 'treasure':
      r.pending = { kind: 'treasure', options: treasureRewards(r) };
      break;
  }
  saveAll();
  resume();
}

/** 노드 완료 → 맵 복귀 (보스면 액트 클리어) */
export function completeNode(): void {
  const r = run();
  const node = r.currentNodeId ? r.map.nodes[r.currentNodeId] : null;
  r.floorsCleared += 1;
  checkAchievements();
  if (node?.type === 'boss') {
    r.pending = { kind: 'actClear' };
    saveAll();
    go('actClear');
    return;
  }
  r.pending = undefined;
  saveAll();
  go('map');
}

export function proceedAfterActClear(): void {
  const r = run();
  const victory = advanceAct(r);
  if (victory) {
    endRun(true);
    return;
  }
  r.pending = undefined;
  saveAll();
  go('map');
}

export function setBattleReward(kind: BattleKind, title: string): void {
  const r = run();
  const rw = battleRewards(r, kind);
  r.pending = { kind: 'reward', options: rw.options, gold: rw.gold, title, battleKind: kind, rerolls: 0 };
  saveAll();
  go('reward');
}

export function endRun(victory: boolean, cause?: DefeatCause): void {
  const r = run();
  checkAchievements({ victory });
  const shards = shardsForRun(r, victory);
  const m = app.meta;
  m.stats.elites += r.elitesWon ?? 0;
  m.stats.bosses += r.bossesWon ?? 0;
  m.stats.fusions += r.fusions ?? 0;
  m.shards += shards;
  m.bestFloor = Math.max(m.bestFloor, r.floorsCleared + r.act * 100);
  if (victory) m.wins += 1;
  // 🔥 각성 해금: 현재 최고 단계를 클리어하면 다음 단계 열림
  let ascUnlocked: number | null = null;
  if (victory && r.mode === 'normal' && (r.ascension ?? 0) >= (m.maxAscension ?? 0) && (m.maxAscension ?? 0) < MAX_ASCENSION) {
    m.maxAscension = (r.ascension ?? 0) + 1;
    ascUnlocked = m.maxAscension;
  }
  if (r.mode === 'daily') {
    const k = todayKey();
    const score = r.floorsCleared + (victory ? 100 : 0);
    m.dailyBest[k] = Math.max(m.dailyBest[k] ?? 0, score);
  }
  for (const mon of [...r.party, ...r.box]) markCaught(m, mon.speciesId);
  const summary = { victory, shards, ascUnlocked, cause, run: JSON.parse(JSON.stringify(r)) as RunState };
  app.run = null;
  saveAll();
  go('runEnd', summary);
}

export function seen(speciesId: string): void {
  markSeen(app.meta, speciesId);
}

// ─────────── 성장 모달 (기술 습득 · 진화) ───────────

export function learnMoveModal(m: Monster, moveId: string): Promise<void> {
  return new Promise((resolve) => {
    if (m.moves.includes(moveId)) return resolve();
    if (m.moves.length < 4) {
      m.moves.push(moveId);
      return resolve();
    }
    const mv = getMove(moveId);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sheet.close();
      resolve();
    };
    const basicCount = m.moves.filter((id) => getMove(id).cost === 0 && getMove(id).power > 0).length;
    const sheet = openSheet(`${displayName(m)} — 새 기술!`, [
      h('p', { class: 'pad-x' }, `「${mv.name}」을(를) 배우려 한다. 잊을 기술을 고르세요.`),
      moveCard(moveId, h('span', { class: 'tag new' }, 'NEW')),
      h('div', { class: 'divider' }, '현재 기술'),
      ...m.moves.map((id, i) => {
        const cur = getMove(id);
        const lastBasic = cur.cost === 0 && cur.power > 0 && basicCount <= 1 && !(mv.cost === 0 && mv.power > 0);
        return h('button', {
          class: 'plain-btn' + (lastBasic ? ' locked' : ''),
          disabled: lastBasic ? true : undefined,
          onclick: () => {
            m.moves[i] = moveId;
            sfx('level');
            finish();
          },
        }, moveCard(id, lastBasic ? h('small', { class: 'warn' }, '🔒 유일한 0EN 기본기는 잊을 수 없어요') : h('small', { class: 'muted' }, '탭하면 이 기술을 잊습니다')));
      }),
      h('button', { class: 'btn ghost block', onclick: finish }, `「${mv.name}」 배우지 않기`),
    ], { dismissible: false, tall: true });
  });
}

export function evolveModal(m: Monster): Promise<void> {
  return new Promise((resolve) => {
    const from = getSpecies(m.speciesId);
    const to = getSpecies(from.evolveTo!);
    const stage = h('div', { class: 'evo-stage', html: monSprite(m, { size: 180 }) });
    const text = h('p', { class: 'center' }, `어라…? ${displayName(m)}의 모습이…!`);
    const btns = h('div', { class: 'row gap' });
    const sheet = openSheet('✨ 진화', [stage, text, btns], { dismissible: false });
    const later = h('button', { class: 'btn ghost grow', onclick: () => { sheet.close(); resolve(); } }, '나중에');
    const go2 = h('button', { class: 'btn primary grow', onclick: async () => {
      btns.innerHTML = '';
      stage.classList.add('evolving');
      sfx('evolve');
      await sleep(1600);
      const res = evolve(m);
      stage.innerHTML = monSprite(m, { size: 180 });
      stage.classList.remove('evolving');
      stage.classList.add('evolved');
      text.textContent = `축하합니다! ${from.name}은(는) ${to.name}(으)로 진화했다!`;
      seen(to.id);
      markCaught(app.meta, to.id);
      await sleep(900);
      for (const mv of res.pendingMoves) await learnMoveModal(m, mv);
      btns.appendChild(h('button', { class: 'btn primary block', onclick: () => { sheet.close(); resolve(); } }, '좋아!'));
    } }, '진화시키기');
    btns.append(later, go2);
  });
}

/** 전투/이벤트 후 대기중인 성장 처리 */
export async function processGrowth(learn: { uid: string; moveId: string }[]): Promise<void> {
  const r = run();
  const all = [...r.party, ...r.box];
  for (const l of learn) {
    const m = all.find((x) => x.uid === l.uid);
    if (m) await learnMoveModal(m, l.moveId);
  }
  for (const m of r.party) {
    if (canEvolve(m)) await evolveModal(m);
  }
  saveAll();
}

export function eventFor(): ReturnType<typeof getEvent> {
  const r = run();
  return getEvent(r.pending?.kind === 'event' ? r.pending.eventId : 'merchant');
}

export { spriteSvg };
