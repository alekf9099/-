// 맵 화면 + 파티/가방 시트
import type { ItemId, Monster } from '../../core/types';
import { ACTS } from '../../data/world';
import { ITEMS } from '../../data/charms';
import { getSpecies } from '../../data/species';
import { hashString } from '../../core/rng';
import { availableNodes, NODE_META } from '../../game/map';
import { displayName, gainExp, maxHp } from '../../game/monster';
import { MAX_PARTY, useItemOutOfBattle } from '../../game/run';
import { go, register, saveAll } from '../app';
import { confirmSheet, h, openSheet, toast, type Sheet } from '../dom';
import { sfx } from '../fx';
import { charmIcon, elChips, expBar, monRow, moveCard, resonanceChips, statBars, statusChip } from '../components';
import { monSprite } from '../sprite';
import { enterNode, processGrowth, run } from '../flow';
import type { MapNode, NodeType, RunState } from '../../core/types';
import { DANGER_LABEL, type Danger, bossReadiness, dangerOf, expectedEnemyLevel, nodeKind } from '../../game/advice';
import { computeResonance } from '../../game/battle';
import { coach } from '../coach';
import { ACT_BG, ITEM_ICON, NODE_ICON, ico, img } from '../assets';

const ROW_H = 86;

register('map', () => {
  const r = run();
  const act = ACTS[r.act];
  const nodes = Object.values(r.map.nodes);
  const avail = new Set(availableNodes(r.map, r.currentNodeId).map((n) => n.id));
  const height = r.map.rows * ROW_H + 40;
  const pos = (id: string) => {
    const n = r.map.nodes[id];
    const jitter = ((hashString(id + r.seed) % 100) / 100 - 0.5) * 7;
    return { x: ((n.col + 0.5) / r.map.cols) * 100 + (n.type === 'boss' ? 0 : jitter), y: height - 50 - n.row * ROW_H };
  };

  const lines = nodes.flatMap((n) => n.next.map((nid) => {
    const a = pos(n.id);
    const b = pos(nid);
    const traveled = r.visited.includes(n.id) && r.visited.includes(nid);
    const next = n.id === r.currentNodeId && avail.has(nid);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${traveled ? 'trav' : next ? 'next' : ''}" vector-effect="non-scaling-stroke"/>`;
  })).join('');

  const map = h('div', { class: 'map-canvas', style: `height:${height}px` },
    h('svg', { class: 'map-lines', viewBox: `0 0 100 ${height}`, preserveAspectRatio: 'none', html: lines }),
    nodes.map((n) => {
      const p = pos(n.id);
      const meta = NODE_META[n.type];
      const visited = r.visited.includes(n.id);
      const isAvail = avail.has(n.id);
      const isCur = n.id === r.currentNodeId;
      return h('button', {
        class: `map-node t-${n.type}` + (visited ? ' visited' : '') + (isAvail ? ' avail' : '') + (isCur ? ' cur' : ''),
        style: `left:${p.x}%;top:${p.y}px;--c:${meta.color}`,
        'aria-label': `${meta.name}${isAvail ? ' (이동 가능)' : ''}`,
        disabled: !isAvail ? true : undefined,
        onclick: () => {
          sfx('tap');
          openNodeCard(n);
        },
      }, n.type === 'boss' ? h('span', { class: 'boss-face', html: monSpriteBoss(r.act) }) : img(NODE_ICON[n.type], 40, 'node-ico'));
    }),
  );

  const hud = h('header', { class: 'map-hud', style: `--bg1:${act.bg[0]};--bg2:${act.bg[1]}` },
    h('div', { class: 'row between' },
      h('div', null, h('small', { class: 'muted' }, act.sub), h('h2', null, act.name)),
      h('div', { class: 'hud-stats' }, (r.ascension ?? 0) > 0 ? h('span', { class: 'pill asc' }, `🔥${r.ascension}`) : null, h('span', { class: 'pill gold' }, `🪙 ${r.gold}`), h('span', { class: 'pill' }, `🏁 ${r.floorsCleared}`)),
    ),
    bossPreview(r),
    h('div', { class: 'row between hud-sub' },
      h('div', { class: 'charm-strip' }, r.charms.length ? r.charms.map(charmIcon) : h('span', { class: 'muted small' }, '부적 없음')),
      resonanceChips(r.party, r.charms),
    ),
    r.mode === 'daily' ? h('div', { class: 'banner daily sm' }, '📅 데일리 런') : null,
  );

  const scroller = h('div', { class: 'map-scroll' }, map);
  setTimeout(() => {
    if (!document.querySelector('.map-screen')) return;
    coach('map-first');
    const lead = r.party[0];
    if (lead.hp > 0 && lead.hp / maxHp(lead) < 0.35 && r.party.length > 1) coach('low-hp-lead');
    if (Object.values(computeResonance(r.party, r.charms)).some((t) => (t ?? 0) > 0)) coach('resonance-first');
    if (r.charms.length > 0) coach('charm-first');
    if (r.floorsCleared >= 5) coach('boss-ready');
  }, 450);
  // 현재 위치로 스크롤
  requestAnimationFrame(() => {
    const target = r.currentNodeId ? pos(r.currentNodeId).y : height;
    scroller.scrollTop = Math.max(0, target - scroller.clientHeight * 0.65);
  });

  const legend = h('div', { class: 'legend' }, (['battle', 'trainer', 'elite', 'event', 'shop', 'rest', 'treasure', 'boss'] as const).map((t) => h('span', { class: 'row gap-s' }, img(NODE_ICON[t], 32), NODE_META[t].name)));

  return h('div', { class: 'map-screen', style: `--bg1:${act.bg[0]};--bg2:${act.bg[1]};--bgimg:url(${ACT_BG[r.act]})` },
    hud,
    scroller,
    h('nav', { class: 'bottom-nav' },
      h('button', { onclick: () => openParty(() => go('map')) }, ico('party', 22), h('div', { class: 'party-mini' }, r.party.map((m) => h('i', { class: m.hp <= 0 ? 'dead' : m.hp / maxHp(m) < 0.35 ? 'low' : '' }))), h('span', null, `파티 ${r.party.length}/${MAX_PARTY}`)),
      h('button', { onclick: () => openBag() }, ico('bag', 22), h('span', null, '가방')),
      h('button', { onclick: () => openSheet('범례 · 도움말', [legend, h('p', { class: 'muted small pad' }, '아래에서 위로 경로를 선택하세요. 빛나는 노드만 이동할 수 있어요. 9층 캠프 후 보스가 기다립니다.')]) }, ico('help', 22), h('span', null, '도움말')),
      h('button', { onclick: () => go('title') }, ico('home', 22), h('span', null, '메뉴')),
    ),
  );
});

const NODE_DESC: Record<NodeType, string> = {
  battle: '야생 에코링 1마리. 체력을 깎아 캡슐을 던지면 포획할 수 있어요.',
  trainer: '테이머의 에코링 2~3마리와 연전. 포획은 불가, 골드와 부적 보상이 커요.',
  elite: '접두사가 붙은 강화 개체. 위험하지만 부적 3택1 보상!',
  event: '무슨 일이 일어날지 몰라요. 선택에 따라 보상 또는 대가.',
  shop: '골드로 아이템·부적·희귀 에코링을 살 수 있어요.',
  rest: '체력 회복 · 특훈 · 에코 퓨전 중 하나를 선택.',
  treasure: '부적 3개 중 하나를 골라 가져가요.',
  boss: '이번 액트의 보스. HP 50%에서 분노 각성해요.',
};

const DANGER_CLS: Record<Danger, string> = { easy: 'd-easy', fair: 'd-fair', risky: 'd-risky', deadly: 'd-deadly' };

/** 🗺️ 노드 확인 카드: 오탭 방지 + 들어가기 전 판단 정보 */
function openNodeCard(n: MapNode): void {
  const r = run();
  const meta = NODE_META[n.type];
  const lead = r.party[0];
  const enemyLv = expectedEnemyLevel(r, n);
  const kind = nodeKind(n);
  const danger = enemyLv !== null && kind ? dangerOf(enemyLv, lead.level, kind) : null;
  const leadLow = !!kind && lead.hp / maxHp(lead) < 0.35;
  const healthiest = r.party.reduce((b, m, i) => (m.hp / maxHp(m) > r.party[b].hp / maxHp(r.party[b]) ? i : b), 0);
  let sheet: Sheet;
  const body = h('div', { class: 'node-card' },
    h('div', { class: 'nc-head' },
      n.type === 'boss' ? h('div', { html: monSpriteBoss(r.act, 96) }) : img(NODE_ICON[n.type], 96, 'nc-art'),
      h('div', { class: 'grow' },
        h('small', { class: 'eyebrow' }, `${n.row + 1}층`),
        h('h2', null, n.type === 'boss' ? getSpecies(ACTS[r.act].boss).name : meta.name),
        h('p', { class: 'muted small', style: 'margin:4px 0 0' }, NODE_DESC[n.type]),
      ),
    ),
    enemyLv !== null && danger
      ? h('div', { class: 'nc-stats' },
          h('div', null, h('small', null, '예상 적 레벨'), h('b', null, `Lv.${enemyLv}${kind === 'wild' ? '±1' : ''}`)),
          h('div', null, h('small', null, '내 선두'), h('b', null, `Lv.${lead.level}`)),
          h('div', null, h('small', null, '위험도'), h('span', { class: 'danger ' + DANGER_CLS[danger] }, DANGER_LABEL[danger])),
        )
      : null,
    leadLow
      ? h('div', { class: 'nc-warn' },
          h('span', null, `⚠️ 선두 ${displayName(lead)}의 체력이 ${Math.round((lead.hp / maxHp(lead)) * 100)}%예요.`),
          healthiest !== 0
            ? h('button', { class: 'chip-btn', onclick: () => {
                const [m] = r.party.splice(healthiest, 1);
                r.party.unshift(m);
                saveAll();
                sfx('tap');
                toast(`${displayName(m)}을(를) 선두로!`, 'good');
                sheet.close();
                go('map');
              } }, `${displayName(r.party[healthiest])} 선두로`)
            : null,
        )
      : null,
    h('div', { class: 'row gap' },
      h('button', { class: 'btn ghost grow', onclick: () => sheet.close() }, '취소'),
      h('button', { class: 'btn primary grow', onclick: () => { sheet.close(); enterNode(n.id); } }, n.type === 'boss' ? '보스에 도전' : '입장하기'),
    ),
  );
  sheet = openSheet(meta.name, body);
}

/** 👑 이번 액트 보스 미리보기 + 준비도 */
function bossPreview(r: RunState): HTMLElement {
  const act = r.act;
  const sp = getSpecies(ACTS[act].boss);
  const ready = bossReadiness(r);
  return h('button', { class: 'boss-preview', onclick: () => openSheet(`👑 ${sp.name}`, h('div', { class: 'pad center col gap' },
    h('div', { html: monSpriteBoss(act, 160) }),
    elChips(sp.elements),
    h('p', { class: 'muted small' }, sp.dex),
    h('div', { class: 'list', style: 'padding:0' }, sp.learnset.map(([, mv]) => moveCard(mv))),
    h('div', { class: 'card', style: 'text-align:left' }, h('b', null, '💢 분노 각성'), h('p', { class: 'small muted' }, act === 0 ? 'HP 50% 이하: 스피드 +1단계, 상태이상 해제' : 'HP 50% 이하: 공격·스피드 +1단계, EN 최대 충전, 상태이상 해제')),
  ), { tall: true }) },
    h('span', { class: 'bp-face', html: monSpriteBoss(act, 34) }),
    h('span', null, h('small', null, `ACT ${act + 1} 보스`), h('b', null, sp.name)),
    h('span', { class: 'bp-ready' }, h('small', null, `권장 Lv.${ready.bossLevel} · 내 최고 Lv.${ready.myBest}`), h('span', { class: 'danger ' + DANGER_CLS[ready.danger] }, DANGER_LABEL[ready.danger])),
  );
}

function monSpriteBoss(act: number, size = 54): string {
  const id = ACTS[act].boss;
  return monSprite({ uid: 'boss', speciesId: id, level: 1, exp: 0, hp: 1, moves: [], iv: { hp: 0, atk: 0, def: 0, spd: 0 } }, { size });
}

// ─────────── 파티 시트 ───────────
export function openParty(onChange?: () => void): void {
  const r = run();
  let sheet: Sheet | null = null;
  const render = () => {
    const content = h('div', null,
      h('p', { class: 'muted small pad-x' }, '맨 위 에코링이 전투에 먼저 나섭니다. 탭해서 상세 정보 · 선두 지정 · 아이템 사용.'),
      h('div', { class: 'list' }, r.party.map((m, i) => monRow(m, { onclick: () => openMon(m, refresh), right: i === 0 ? h('span', { class: 'tag lead' }, '선두') : null }))),
      r.box.length ? h('div', { class: 'divider' }, `보관함 (${r.box.length})`) : null,
      r.box.length ? h('div', { class: 'list' }, r.box.map((m) => monRow(m, { dim: true, onclick: () => openMon(m, refresh) }))) : null,
    );
    return content;
  };
  const refresh = () => {
    if (sheet) {
      sheet.body.innerHTML = '';
      sheet.body.appendChild(render());
    }
    saveAll();
    onChange?.();
  };
  sheet = openSheet(`👥 파티 ${r.party.length}/${MAX_PARTY}`, render(), { tall: true });
}

export function openMon(m: Monster, refresh: () => void, inBattle = false): void {
  const r = run();
  const sp = getSpecies(m.speciesId);
  const inParty = r.party.includes(m);
  const idx = r.party.indexOf(m);
  const actions = h('div', { class: 'grid2' });
  let sheet: Sheet;
  if (!inBattle) {
    if (inParty && idx > 0) actions.appendChild(h('button', { class: 'btn primary', onclick: () => { r.party.splice(idx, 1); r.party.unshift(m); sfx('tap'); sheet.close(); refresh(); } }, '⬆ 선두로'));
    if (inParty && r.party.length > 1) actions.appendChild(h('button', { class: 'btn ghost', onclick: () => { r.party.splice(idx, 1); r.box.push(m); sheet.close(); refresh(); } }, '📦 보관함으로'));
    if (!inParty) actions.appendChild(h('button', { class: 'btn primary', disabled: r.party.length >= MAX_PARTY ? true : undefined, onclick: () => { r.box.splice(r.box.indexOf(m), 1); r.party.push(m); sheet.close(); refresh(); } }, r.party.length >= MAX_PARTY ? '파티 가득 참' : '➕ 파티로'));
    for (const id of ['potion', 'superPotion', 'revive', 'cleanser', 'candy'] as ItemId[]) {
      const n = r.items[id] ?? 0;
      if (n <= 0) continue;
      actions.appendChild(h('button', { class: 'btn ghost', onclick: async () => {
        if (id === 'candy') {
          r.items.candy = n - 1;
          const res = gainExp(m, Math.max(1, Math.round(m.level * m.level * 0.9 + 20) - m.exp));
          sfx('level');
          toast(`${displayName(m)} Lv.${m.level}!`, 'good');
          sheet.close();
          await processGrowth(res.pendingMoves.map((mv) => ({ uid: m.uid, moveId: mv })));
          refresh();
          return;
        }
        const msg = useItemOutOfBattle(r, id, m);
        if (!msg) return toast('지금은 사용할 수 없어요', 'bad');
        sfx('heal');
        toast(msg, 'good');
        sheet.close();
        refresh();
      } }, img(ITEM_ICON[id], 22), ` ${ITEMS[id].name} ×${n}`));
    }
    if (r.party.length + r.box.length > 1) actions.appendChild(h('button', { class: 'btn ghost danger-text', onclick: async () => {
      if (!(await confirmSheet('놓아주기', `${displayName(m)}을(를) 자연으로 돌려보낼까요? 되돌릴 수 없어요.`, '놓아주기', true))) return;
      if (inParty) r.party.splice(r.party.indexOf(m), 1);
      else r.box.splice(r.box.indexOf(m), 1);
      r.gold += 10;
      toast('고마웠어! (+10G)');
      sheet.close();
      refresh();
    } }, '🍃 놓아주기'));
  }
  sheet = openSheet(`${displayName(m)} Lv.${m.level}`, h('div', { class: 'mon-detail' },
    h('div', { class: 'row gap' },
      h('div', { class: 'detail-sprite', html: monSprite(m, { size: 120 }) }),
      h('div', { class: 'grow' }, elChips(sp.elements), statusChip(m), h('p', { class: 'muted small' }, sp.dex), m.shiny ? h('span', { class: 'tag shiny' }, '✦ 빛나는 개체') : null),
    ),
    statBars(m),
    expBar(m),
    h('div', { class: 'divider' }, '기술'),
    h('div', { class: 'list' }, m.moves.map((id) => moveCard(id))),
    actions.childElementCount ? h('div', { class: 'divider' }, '행동') : null,
    actions,
  ), { tall: true });
}

// ─────────── 가방 ───────────
export function openBag(): void {
  const r = run();
  const entries = (Object.entries(r.items) as [ItemId, number][]).filter(([, n]) => n > 0);
  openSheet('🎒 가방', h('div', { class: 'list' },
    entries.length ? entries.map(([id, n]) => {
      const it = ITEMS[id];
      return h('div', { class: 'card row gap' }, img(ITEM_ICON[id], 48, 'item-ico'), h('div', { class: 'grow' }, h('b', null, it.name), h('div', { class: 'muted small' }, it.desc)), h('span', { class: 'pill' }, `×${n}`));
    }) : h('p', { class: 'muted pad' }, '가방이 비어 있어요.'),
    h('p', { class: 'muted small pad-x' }, '회복 아이템은 파티 화면에서 에코링을 탭해 사용하세요.'),
  ));
}
