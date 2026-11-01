// 헤드리스 런 시뮬레이터 — 봇이 런 전체를 플레이 (밸런스 튜닝용)
import type { MetaSave, Monster, RunState } from '../src/core/types';
import { Rng } from '../src/core/rng';
import { getMove } from '../src/data/moves';
import { activeOf, captureChance, chooseAiMove, forceSwitch, resolveTurn, type PlayerAction } from '../src/game/battle';
import { availableNodes } from '../src/game/map';
import { canEvolve, evolve, maxHp } from '../src/game/monster';
import { defaultMeta } from '../src/game/meta';
import { addItem, addMonster, advanceAct, applyBattleOutcome, battleRewards, buildBattle, makeEncounter, makeShop, newRun, restHeal, treasureRewards } from '../src/game/run';
import { getEvent, pickEvent } from '../src/game/events';
import { createMonster } from '../src/game/monster';
import { nextUid } from '../src/game/run';

const TRACE = !!process.env.SIM_TRACE;
export interface SimResult { victory: boolean; act: number; floors: number; deathAt?: string; levels: number[]; partySize: number; turns: number }

function learn(m: Monster, moveId: string) {
  if (m.moves.includes(moveId)) return;
  const nm = getMove(moveId);
  // 가장 약한 비-기본기 교체
  let worst = -1, worstP = Infinity;
  m.moves.forEach((id, i) => { const mv = getMove(id); if (mv.cost === 0 && mv.power > 0 && m.moves.filter((x) => getMove(x).cost === 0 && getMove(x).power > 0).length === 1) return; const p = mv.power || 30; if (p < worstP) { worstP = p; worst = i; } });
  if (worst >= 0 && (nm.power || 30) > worstP) m.moves[worst] = moveId;
}

export function simulateRun(seed: number, starter = 'embercat', meta: MetaSave = defaultMeta()): SimResult {
  const run: RunState = newRun(starter, meta, 'normal', seed);
  const bot = new Rng(seed ^ 0x9e3779b9);
  let turns = 0;
  for (let step = 0; step < 200; step++) {
    const opts = availableNodes(run.map, run.currentNodeId);
    if (!opts.length) break;
    const hpPct = run.party.reduce((s, m) => s + m.hp / maxHp(m), 0) / run.party.length;
    const pref = (t: string) => opts.find((n) => n.type === t);
    const node = (hpPct < 0.5 && (pref('rest') || pref('shop'))) || pref('treasure') || (hpPct > 0.8 && pref('elite')) || bot.pick(opts);
    run.currentNodeId = node.id; run.visited.push(node.id);

    if (['battle', 'trainer', 'elite', 'boss'].includes(node.type)) {
      // 봇: 가장 건강한 에코링을 선두로
      run.party.sort((a, b) => b.hp / maxHp(b) - a.hp / maxHp(a));
      const enc = makeEncounter(run, node);
      const b = buildBattle(run, enc);
      const rng = new Rng(run.rngState);
      let guard = 0;
      while (!b.over && guard++ < 300) {
        if (b.needSwitch) {
          let best = -1;
          b.p.team.forEach((m, i) => { if (m.hp > 0 && (best < 0 || m.hp > b.p.team[best].hp)) best = i; });
          forceSwitch(b, best); continue;
        }
        const me = activeOf(b, 'p'); const foe = activeOf(b, 'e');
        let act: PlayerAction = { type: 'move', idx: chooseAiMove(b, 'p', null) };
        if (b.kind === 'wild' && run.party.length + run.box.length < 6 && (run.items.capsule ?? 0) > 0 && foe.hp / maxHp(foe) < 0.5 && captureChance(b, 'capsule') > 0.3) {
          run.items.capsule!--; act = { type: 'capture', item: 'capsule' };
        } else if (me.hp / maxHp(me) < 0.3 && ((run.items.potion ?? 0) > 0 || (run.items.superPotion ?? 0) > 0)) {
          const it = (run.items.superPotion ?? 0) > 0 ? 'superPotion' : 'potion';
          run.items[it]!--; act = { type: 'item', item: it };
        } else if (b.p.team.some((m) => m.hp <= 0) && (run.items.revive ?? 0) > 0 && me.hp / maxHp(me) > 0.6) {
          run.items.revive!--; act = { type: 'item', item: 'revive', target: b.p.team.findIndex((m) => m.hp <= 0) };
        }
        resolveTurn(b, act, rng); turns++;
      }
      run.rngState = rng.state;
      if (TRACE) console.log(`[${node.type} A${run.act+1}R${node.row}] ${b.over} turns=${guard} party=${run.party.map((m)=>m.speciesId+':L'+m.level+':'+m.hp+'/'+maxHp(m)).join(' ')} vs ${enc.enemies.map((m)=>m.speciesId+':L'+m.level).join(',')} items=${JSON.stringify(run.items)}`);
      applyBattleOutcome(run, b);
      if (b.over === 'lose' || !b.over) return { victory: false, act: run.act, floors: run.floorsCleared, deathAt: `${node.type}@A${run.act + 1}R${node.row}`, levels: run.party.map((m) => m.level), partySize: run.party.length, turns };
      for (const pl of b.pendingLearn) { const m = run.party.find((x) => x.uid === pl.uid); if (m) learn(m, pl.moveId); }
      for (const m of run.party) while (canEvolve(m)) { const r = evolve(m); r.pendingMoves.forEach((mv) => learn(m, mv)); }
      const rw = battleRewards(run, b.kind);
      run.gold += rw.gold;
      const pick = rw.options.find((o) => o.kind === 'charm') ?? rw.options[0];
      if (pick.kind === 'charm') run.charms.push(pick.charmId);
      if (pick.kind === 'item') addItem(run, pick.itemId, pick.qty);
      if (pick.kind === 'gold') run.gold += pick.amount;
      if (node.type === 'boss') {
        if (advanceAct(run)) return { victory: true, act: 3, floors: run.floorsCleared, levels: run.party.map((m) => m.level), partySize: run.party.length, turns };
        continue;
      }
    } else if (node.type === 'rest') restHeal(run);
    else if (node.type === 'treasure') { const t = treasureRewards(run)[0]; if (t?.kind === 'charm') run.charms.push(t.charmId); }
    else if (node.type === 'shop') {
      for (const e of makeShop(run, meta)) {
        const want = e.kind === 'item' && ['potion', 'revive', 'superPotion', 'capsule'].includes(e.ref) || e.kind === 'charm' || (e.kind === 'monster' && run.party.length < 6);
        if (want && run.gold >= e.price) { run.gold -= e.price; if (e.kind === 'item') addItem(run, e.ref as never, e.qty); else if (e.kind === 'charm') run.charms.push(e.ref); else addMonster(run, createMonster(e.ref, e.level ?? 5, new Rng(run.rngState), nextUid(run), { evolve: true })); }
      }
      // 포션으로 회복
      for (const m of run.party) while (m.hp > 0 && m.hp < maxHp(m) * 0.6 && (run.items.potion ?? 0) > 0) { run.items.potion!--; m.hp = Math.min(maxHp(m), m.hp + Math.ceil(maxHp(m) * 0.4)); }
    } else if (node.type === 'event') {
      const ev = getEvent(pickEvent(run));
      const c = ev.choices.find((x) => !x.can || x.can(run)) ?? ev.choices[ev.choices.length - 1];
      const r = c.apply(run);
      r.learn?.forEach((l) => { const m = run.party.find((x) => x.uid === l.uid); if (m) learn(m, l.moveId); });
    }
    // 노드 사이 포션 사용 & 부활
    for (const m of run.party) {
      if (m.hp <= 0 && (run.items.revive ?? 0) > 0) { run.items.revive!--; m.hp = Math.ceil(maxHp(m) / 2); }
    }
    run.floorsCleared++;
  }
  return { victory: false, act: run.act, floors: run.floorsCleared, deathAt: 'timeout', levels: run.party.map((m) => m.level), partySize: run.party.length, turns };
}
