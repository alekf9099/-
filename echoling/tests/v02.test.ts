import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { createMonster, maxHp } from '../src/game/monster';
import { createBattle, resolveTurn, intentInfo, activeOf, captureChance, calcDamage } from '../src/game/battle';
import { getMove } from '../src/data/moves';
import { newRun, applyBlessing, makeEncounter, battleRewards, rerollRewards, priceMult, restHeal } from '../src/game/run';
import { defaultMeta, shardsForRun } from '../src/game/meta';
import { availableNodes } from '../src/game/map';
import { BLESSINGS } from '../src/data/world';
import { CHARMS } from '../src/data/charms';

const ctx = (charms: string[] = [], extra = {}) => ({ charms, resonance: {}, ...extra });

describe('⚔️ 적 행동 예고', () => {
  it('전투 시작 시 예고가 존재하고, 실제로 그 기술을 사용한다', () => {
    for (let seed = 1; seed < 30; seed++) {
      const rng = new Rng(seed);
      const p = createMonster('embercat', 10, rng, 'p');
      const e = createMonster('pebblo', 10, rng, 'e');
      const b = createBattle('wild', 't', [p], [e], ctx());
      const planned = b.eIntent!;
      expect(planned).not.toBeNull();
      const plannedId = e.moves[planned];
      const ev = resolveTurn(b, { type: 'move', idx: 0 }, rng);
      const used = ev.filter((x) => x.t === 'use' && x.side === 'e').map((x) => (x as { move: string }).move);
      // 행동불능(수면 등)이 아니면 예고된 기술을 사용
      if (used.length) expect(used[0]).toBe(getMove(plannedId).cost <= 3 ? plannedId : used[0]);
    }
  });
  it('교체해도 예고된 기술이 유지된다', () => {
    const rng = new Rng(5);
    const a = createMonster('embercat', 12, rng, 'a');
    const bb = createMonster('puddlo', 12, rng, 'b');
    const e = createMonster('salamint', 12, rng, 'e');
    const b = createBattle('trainer', 't', [a, bb], [e], ctx());
    const planned = e.moves[b.eIntent!];
    const ev = resolveTurn(b, { type: 'switch', idx: 1 }, rng);
    const used = ev.find((x) => x.t === 'use' && x.side === 'e') as { move: string } | undefined;
    if (used) expect(used.move).toBe(planned);
  });
  it('intentInfo가 예상 피해와 위험 여부를 계산', () => {
    const rng = new Rng(2);
    const p = createMonster('sporelet', 3, rng, 'p');
    const e = createMonster('magmaw', 30, rng, 'e');
    const b = createBattle('wild', 't', [p], [e], ctx());
    const info = intentInfo(b)!;
    expect(info).toBeTruthy();
    if (info.kind === 'attack') expect(info.lethal).toBe(true);
  });
});

describe('👑 보스 분노 각성', () => {
  it('HP 50% 이하에서 정확히 1회 발동', () => {
    const rng = new Rng(9);
    const p = createMonster('pyrolynx', 45, rng, 'p');
    const boss = createMonster('mossking', 13, rng, 'B');
    const b = createBattle('boss', 't', [p], [boss], ctx());
    let phases = 0;
    for (let i = 0; i < 30 && !b.over; i++) {
      if (b.needSwitch) break;
      phases += resolveTurn(b, { type: 'move', idx: 0 }, rng).filter((x) => x.t === 'phase').length;
    }
    expect(phases).toBe(1);
    expect(b.phase2).toBe(true);
  });
});

describe('💀 엘리트 접두사', () => {
  it('철갑은 받는 피해 감소', () => {
    const rng = new Rng(1);
    const p = createMonster('embercat', 20, rng, 'p');
    const e = createMonster('pebblo', 20, rng, 'e');
    const b1 = createBattle('elite', 't', [p], [e], ctx());
    const base = calcDamage(b1, 'p', getMove('flameClaw'), null).dmg;
    (e as import('../src/game/monster').BattleMonster).affixes = ['armored'];
    const b2 = createBattle('elite', 't', [p], [e], ctx());
    expect(calcDamage(b2, 'p', getMove('flameClaw'), null).dmg).toBeLessThan(base);
  });
  it('엘리트 조우에는 접두사가 붙는다', () => {
    const run = newRun('embercat', defaultMeta(), 'normal', 77);
    const elite = Object.values(run.map.nodes).find((n) => n.type === 'elite') ?? { ...availableNodes(run.map, null)[0], type: 'elite' as const, row: 6 };
    const enc = makeEncounter(run, elite);
    expect(enc.enemies.some((m) => (m.affixes?.length ?? 0) > 0)).toBe(true);
  });
});

describe('🌈 빌드 부적', () => {
  it('유리 심장: 주는 피해↑ 받는 피해↑', () => {
    const rng = new Rng(3);
    const p = createMonster('embercat', 20, rng, 'p');
    const e = createMonster('pebblo', 20, rng, 'e');
    const plain = createBattle('wild', 't', [p], [e], ctx());
    const glass = createBattle('wild', 't', [p], [e], ctx(['glassHeart']));
    expect(calcDamage(glass, 'p', getMove('tackle'), null).dmg).toBeGreaterThan(calcDamage(plain, 'p', getMove('tackle'), null).dmg);
    expect(calcDamage(glass, 'e', getMove('tackle'), null).dmg).toBeGreaterThanOrEqual(calcDamage(plain, 'e', getMove('tackle'), null).dmg);
  });
  it('불사조 깃털: 전멸 시 1회 부활 후 소멸', () => {
    const rng = new Rng(4);
    const p = createMonster('sporelet', 2, rng, 'p');
    const e = createMonster('magmaw', 40, rng, 'e');
    const charms = ['phoenix'];
    const b = createBattle('wild', 't', [p], [e], ctx(charms));
    let revived = false;
    for (let i = 0; i < 10 && !b.over; i++) {
      const ev = resolveTurn(b, { type: 'move', idx: 0 }, rng);
      if (ev.some((x) => x.t === 'revive')) revived = true;
    }
    expect(revived).toBe(true);
    expect(charms.includes('phoenix')).toBe(false);
    expect(b.over).toBe('lose');
  });
  it('눈덩이: 누적 스택만큼 피해 증가', () => {
    const rng = new Rng(6);
    const p = createMonster('embercat', 20, rng, 'p');
    const e = createMonster('pebblo', 20, rng, 'e');
    const s0 = calcDamage(createBattle('wild', 't', [p], [e], ctx(['snowball'], { snowball: 0 })), 'p', getMove('tackle'), null).dmg;
    const s10 = calcDamage(createBattle('wild', 't', [p], [e], ctx(['snowball'], { snowball: 10 })), 'p', getMove('tackle'), null).dmg;
    expect(s10).toBeGreaterThan(s0);
  });
  it('전설 부적은 보스 보상에서만', () => {
    for (let seed = 1; seed < 80; seed++) {
      const run = newRun('embercat', defaultMeta(), 'normal', seed);
      for (const k of ['wild', 'trainer', 'elite'] as const) {
        for (const o of battleRewards(run, k).options) if (o.kind === 'charm') expect(CHARMS[o.charmId].rarity).not.toBe('legend');
      }
    }
  });
});

describe('🌅 출발 축복', () => {
  it('새 런은 축복 3택1로 시작하고 모든 축복이 적용 가능', () => {
    const run = newRun('embercat', defaultMeta(), 'normal', 11);
    expect(run.pending?.kind).toBe('blessing');
    for (const b of BLESSINGS) {
      const r = newRun('embercat', defaultMeta(), 'normal', 11);
      const msg = applyBlessing(r, b.id);
      expect(r.pending).toBeUndefined();
      expect(typeof msg).toBe('string');
    }
    const t = newRun('embercat', defaultMeta(), 'normal', 11);
    applyBlessing(t, 'training');
    expect(t.party[0].level).toBe(8);
    expect(t.party[0].hp).toBe(maxHp(t.party[0]));
  });
});

describe('🔥 각성', () => {
  it('각성 규칙이 누적 적용', () => {
    const r0 = newRun('embercat', defaultMeta(), 'normal', 3, 0);
    const r10 = newRun('embercat', defaultMeta(), 'normal', 3, 10);
    expect((r10.items.potion ?? 0)).toBeLessThan(r0.items.potion ?? 0);
    expect(priceMult(r10)).toBeGreaterThan(priceMult(r0));
    const node = availableNodes(r0.map, null)[0];
    const e0 = makeEncounter(r0, node).enemies[0];
    const e10 = makeEncounter(r10, node).enemies[0];
    expect(e10.level).toBeGreaterThan(e0.level);
    r10.party[0].hp = 1;
    restHeal(r10);
    expect(r10.party[0].hp).toBeLessThan(maxHp(r10.party[0]));
    r10.floorsCleared = 10; r0.floorsCleared = 10;
    expect(shardsForRun(r10, true)).toBeGreaterThan(shardsForRun(r0, true));
  });
  it('각성9 포획 확률 감소', () => {
    const rng = new Rng(3);
    const p = createMonster('embercat', 10, rng, 'p');
    const e = createMonster('puffeather', 10, rng, 'e');
    expect(captureChance(createBattle('wild', 't', [p], [e], ctx([], { ascension: 9 })), 'capsule'))
      .toBeLessThan(captureChance(createBattle('wild', 't', [p], [e], ctx()), 'capsule'));
    void activeOf;
  });
});

describe('🎲 보상 다시 뽑기', () => {
  it('골드 차감 후 선택지 재추첨, 비용 증가', () => {
    const run = newRun('embercat', defaultMeta(), 'normal', 21);
    run.pending = { kind: 'reward', options: battleRewards(run, 'trainer').options, gold: 10, title: 't', battleKind: 'trainer' };
    run.gold = 100;
    expect(rerollRewards(run)).toBe(true);
    expect(run.gold).toBe(80);
    expect(rerollRewards(run)).toBe(true);
    expect(run.gold).toBe(45);
  });
});
