// 보상 · 보물 · 상점 · 캠프 · 이벤트
import type { Monster, RewardOption, ShopEntry } from '../../core/types';
import { Rng } from '../../core/rng';
import { CHARMS, ITEMS, getCharm } from '../../data/charms';
import { getMove } from '../../data/moves';
import { getSpecies } from '../../data/species';
import { createMonster, displayName, gainExp, expToNext } from '../../game/monster';
import { addItem, addMonster, applyBlessing, makeShop, nextUid, rerollCost, rerollRewards, restHeal, MAX_PARTY } from '../../game/run';
import { BLESSINGS } from '../../data/world';
import { markCaught } from '../../game/meta';
import { app, go, register, saveAll } from '../app';
import { confirmSheet, h, openSheet, toast } from '../dom';
import { sfx } from '../fx';
import { elChips, monRow, moveCard, rarityName } from '../components';
import { spriteSvg, monSprite } from '../sprite';
import { completeNode, eventFor, learnMoveModal, processGrowth, run } from '../flow';
import { openParty } from './map';
import { ITEM_ICON, NODE_ICON, charmIconUrl, ico, img } from '../assets';

function topbar(title: string, right?: HTMLElement): HTMLElement {
  const r = run();
  return h('header', { class: 'topbar' },
    h('h2', null, title),
    h('span', { class: 'spacer' }),
    right ?? null,
    h('span', { class: 'pill gold' }, `🪙 ${r.gold}`),
    h('button', { class: 'icon-btn', 'aria-label': '파티', onclick: () => openParty() }, ico('party', 20)),
  );
}

function optionCard(o: RewardOption, onPick: () => void): HTMLElement {
  let icon: string | Node = '';
  let name = '';
  let desc = '';
  let tag = '';
  switch (o.kind) {
    case 'charm': {
      const c = getCharm(o.charmId);
      icon = img(charmIconUrl(o.charmId), 48); name = c.name; desc = c.desc; tag = '부적 · ' + rarityName(c.rarity) + (c.tag ? ` · #${c.tag}` : '');
      break;
    }
    case 'item': {
      const it = ITEMS[o.itemId];
      icon = img(ITEM_ICON[o.itemId], 46); name = `${it.name} ×${o.qty}`; desc = it.desc; tag = '아이템';
      break;
    }
    case 'gold':
      icon = '🪙'; name = `${o.amount} 골드`; desc = '상점에서 쓸 수 있어요.'; tag = '골드';
      break;
    case 'move': {
      const mv = getMove(o.moveId);
      icon = '💿'; name = `기술 디스크: ${mv.name}`; desc = `${mv.desc} (위력 ${mv.power || '-'}, EN ${mv.cost})`; tag = '기술';
      break;
    }
    case 'monster':
      icon = '🥚'; name = getSpecies(o.speciesId).name; desc = `Lv.${o.level} 에코링이 동료가 된다`; tag = '동료';
      break;
  }
  const rarity = o.kind === 'charm' ? getCharm(o.charmId).rarity : 'common';
  return h('button', { class: `reward-card r-${rarity}`, onclick: onPick },
    h('div', { class: 'reward-icon' }, icon),
    h('div', { class: 'grow' }, h('small', { class: 'muted' }, tag), h('b', null, name), h('p', { class: 'small' }, desc)),
  );
}

async function applyOption(o: RewardOption): Promise<boolean> {
  const r = run();
  switch (o.kind) {
    case 'charm':
      r.charms.push(o.charmId);
      toast(`${CHARMS[o.charmId].icon} ${CHARMS[o.charmId].name} 획득!`, 'good');
      return true;
    case 'item':
      addItem(r, o.itemId, o.qty);
      return true;
    case 'gold':
      r.gold += o.amount;
      sfx('coin');
      return true;
    case 'monster': {
      const m = createMonster(o.speciesId, o.level, new Rng(r.rngState ^ r.uidCounter), nextUid(r), { evolve: true });
      addMonster(r, m);
      markCaught(app.meta, m.speciesId);
      return true;
    }
    case 'move': {
      const target = await pickMon(`💿 ${getMove(o.moveId).name} — 누구에게?`, (m) => !m.moves.includes(o.moveId));
      if (!target) return false;
      await learnMoveModal(target, o.moveId);
      return true;
    }
  }
}

function pickMon(title: string, filter: (m: Monster) => boolean = () => true, includeBox = false): Promise<Monster | null> {
  const r = run();
  return new Promise((resolve) => {
    let done = false;
    const list = includeBox ? [...r.party, ...r.box] : r.party;
    const s = openSheet(title, h('div', { class: 'list' }, list.map((m) => {
      const ok = filter(m);
      return monRow(m, { dim: !ok, onclick: ok ? () => { done = true; s.close(); resolve(m); } : undefined });
    })), { onClose: () => { if (!done) resolve(null); } });
  });
}

// ─────────── 전투 보상 ───────────
register('reward', () => {
  const r = run();
  const p = r.pending;
  if (p?.kind !== 'reward') return h('div');
  let claimed = false;
  const claimGold = () => {
    if (claimed) return;
    claimed = true;
    r.gold += p.gold;
    sfx('coin');
  };
  const finish = async (o?: RewardOption) => {
    if (o && !(await applyOption(o))) return;
    claimGold();
    completeNode();
  };
  const list = h('div', { class: 'list' });
  const reroll = h('button', { class: 'btn ghost grow' });
  const renderOpts = () => {
    list.innerHTML = '';
    list.append(...p.options.map((o, i) => {
      const card = optionCard(o, () => { sfx('tap'); void finish(o); });
      card.style.animationDelay = `${i * 70}ms`;
      card.classList.add('deal');
      return card;
    }));
    const cost = rerollCost(p.rerolls ?? 0);
    reroll.textContent = `🎲 다시 뽑기 · ${cost}G (보유 ${r.gold}G)`;
    (reroll as HTMLButtonElement).disabled = !p.battleKind || r.gold < cost;
  };
  reroll.onclick = () => {
    if (!rerollRewards(r)) return toast('골드가 부족해요', 'bad');
    sfx('shake');
    saveAll();
    renderOpts();
  };
  renderOpts();
  return h('div', { class: 'page' },
    topbar(p.title),
    h('div', { class: 'gold-burst' }, `+${p.gold} 🪙`),
    h('p', { class: 'center muted' }, '보상을 하나 선택하세요'),
    list,
    h('div', { class: 'row gap' }, reroll, h('button', { class: 'btn ghost grow', onclick: () => finish() }, '건너뛰기')),
  );
});

// ─────────── 🌅 출발 축복 ───────────
register('blessing', () => {
  const r = run();
  const p = r.pending;
  if (p?.kind !== 'blessing') return h('div');
  const starter = r.party[0];
  return h('div', { class: 'page blessing-page' },
    h('div', { class: 'dawn' }),
    h('header', { class: 'center col', style: 'gap:6px;padding:18px 16px 4px' },
      h('small', { class: 'eyebrow' }, (r.ascension ?? 0) > 0 ? `🔥 각성 ${r.ascension} · 새로운 여정` : '새로운 여정'),
      h('h2', null, '출발의 축복'),
      h('p', { class: 'muted small', style: 'margin:0' }, '여정을 떠나기 전, 에코의 정령이 하나의 선물을 건넨다.'),
    ),
    h('div', { class: 'center', html: monSprite(starter, { size: 130 }) }),
    h('div', { class: 'list' }, p.options.map((id, i) => {
      const b = BLESSINGS.find((x) => x.id === id)!;
      const card = h('button', { class: 'reward-card deal' + (b.cursed ? ' cursed' : ' r-rare'), style: `animation-delay:${i * 90}ms`, onclick: () => {
        sfx(b.cursed ? 'debuff' : 'level');
        const msg = applyBlessing(r, id);
        if (msg) toast(`${b.icon} ${msg}`, b.cursed ? 'bad' : 'good');
        saveAll();
        go('map');
      } },
        h('div', { class: 'reward-icon' }, b.icon),
        h('div', { class: 'grow' }, h('small', { class: 'muted' }, b.cursed ? '대가형 계약' : '축복'), h('b', null, b.name), h('p', { class: 'small' }, b.desc)),
      );
      return card;
    })),
  );
});

// ─────────── 보물 ───────────
register('treasure', () => {
  const r = run();
  const p = r.pending;
  if (p?.kind !== 'treasure') return h('div');
  return h('div', { class: 'page' },
    topbar('보물 상자'),
    h('div', { class: 'hero-art' }, img(NODE_ICON.treasure, 132)),
    h('p', { class: 'center' }, '반짝이는 부적 3개가 들어 있다. 하나만 가져갈 수 있다!'),
    h('div', { class: 'list' }, p.options.map((o) => optionCard(o, async () => { sfx('level'); await applyOption(o); completeNode(); }))),
  );
});

// ─────────── 상점 ───────────
register('shop', () => {
  const r = run();
  const p = r.pending;
  if (p?.kind !== 'shop') return h('div');
  let rerolls = 0;
  const goldPill = h('span', { class: 'pill gold' });
  const grid = h('div', { class: 'shop-grid' });
  const rerollBtn = h('button', { class: 'btn ghost' });
  const render = () => {
    goldPill.textContent = `🪙 ${r.gold}`;
    grid.innerHTML = '';
    for (const e of p.stock) grid.appendChild(shopCard(e));
    const cost = 25 + rerolls * 15;
    rerollBtn.textContent = `🔄 다시 진열 (${cost}G)`;
    (rerollBtn as HTMLButtonElement).disabled = r.gold < cost;
    rerollBtn.onclick = () => {
      if (r.gold < cost) return;
      r.gold -= cost;
      rerolls++;
      p.stock = makeShop(r, app.meta);
      saveAll();
      sfx('coin');
      render();
    };
  };
  const shopCard = (e: ShopEntry): HTMLElement => {
    let icon: string | Node = '';
    let name = '';
    let desc = '';
    if (e.kind === 'item') { const it = ITEMS[e.ref as keyof typeof ITEMS]; icon = img(ITEM_ICON[e.ref as keyof typeof ITEMS], 64); name = `${it.name}${e.qty > 1 ? ' ×' + e.qty : ''}`; desc = it.desc; }
    if (e.kind === 'charm') { const c = getCharm(e.ref); icon = img(charmIconUrl(e.ref), 64); name = c.name; desc = c.desc; }
    const isMon = e.kind === 'monster';
    const afford = r.gold >= e.price;
    return h('button', { class: 'shop-card' + (e.sold ? ' sold' : '') + (afford ? '' : ' poor') + (e.kind === 'charm' ? ' r-' + getCharm(e.ref).rarity : ''), disabled: e.sold ? true : undefined, onclick: async () => {
      if (e.sold) return;
      if (!afford) return toast('골드가 부족해요', 'bad');
      if (isMon && !(await confirmSheet('에코링 분양', `${getSpecies(e.ref).name} (Lv.${e.level})을(를) ${e.price}G에 데려갈까요?`, '분양받기'))) return;
      r.gold -= e.price;
      e.sold = true;
      if (e.kind === 'item') addItem(r, e.ref as keyof typeof ITEMS, e.qty);
      else if (e.kind === 'charm') r.charms.push(e.ref);
      else {
        const m = createMonster(e.ref, e.level ?? 5, new Rng(r.rngState ^ (r.uidCounter * 7919)), nextUid(r), { evolve: true });
        const where = addMonster(r, m);
        markCaught(app.meta, m.speciesId);
        toast(`${getSpecies(m.speciesId).name} ${where === 'party' ? '파티 합류!' : '보관함으로'}`, 'good');
      }
      sfx('coin');
      saveAll();
      render();
    } },
      isMon ? h('div', { html: spriteSvg(e.ref, { size: 64 }) }) : h('div', { class: 'shop-icon' }, icon),
      h('b', null, isMon ? `${getSpecies(e.ref).name} Lv.${e.level}` : name),
      isMon ? elChips(getSpecies(e.ref).elements, true) : h('small', { class: 'muted' }, desc),
      h('span', { class: 'price' }, e.sold ? 'SOLD' : `🪙 ${e.price}`),
    );
  };
  render();
  return h('div', { class: 'page' },
    h('header', { class: 'topbar' }, h('h2', { class: 'row gap-s' }, img(NODE_ICON.shop, 34), '떠돌이 상점'), h('span', { class: 'spacer' }), goldPill, h('button', { class: 'icon-btn', 'aria-label': '파티', onclick: () => openParty(render) }, ico('party', 20))),
    h('p', { class: 'muted pad-x small' }, '"어서 오세요~ 테이머 할인은 없습니다만!"'),
    grid,
    h('div', { class: 'row gap' }, rerollBtn, h('button', { class: 'btn primary grow', onclick: () => completeNode() }, '상점 떠나기 →')),
  );
});

// ─────────── 캠프 ───────────
register('rest', () => {
  const r = run();
  const heal = r.dailyModifier === 'ironman' ? 30 : 60;
  const choose = async (fn: () => Promise<boolean>) => {
    if (await fn()) {
      saveAll();
      completeNode();
    }
  };
  return h('div', { class: 'page' },
    topbar('캠프'),
    h('div', { class: 'hero-art' }, img(NODE_ICON.rest, 132)),
    h('p', { class: 'center muted' }, '모닥불이 타닥거린다. 무엇을 할까? (하나만 선택)'),
    h('div', { class: 'list' },
      h('button', { class: 'reward-card', onclick: () => choose(async () => { restHeal(r); sfx('heal'); toast(`파티 전원 HP ${heal}% 회복 · 부활 · 상태이상 치료`, 'good'); return true; }) },
        h('div', { class: 'reward-icon' }, '😴'), h('div', { class: 'grow' }, h('b', null, '푹 쉬기'), h('p', { class: 'small' }, `파티 전원 HP ${heal}% 회복, 기절 부활, 상태이상 치료`))),
      h('button', { class: 'reward-card', onclick: () => choose(async () => {
        const m = await pickMon('🏋️ 누구를 특훈할까?', (x) => x.level < 60);
        if (!m) return false;
        const res = gainExp(m, expToNext(m.level) + expToNext(m.level + 1) - m.exp);
        sfx('level');
        toast(`${displayName(m)} Lv.${m.level}!`, 'good');
        await processGrowth(res.pendingMoves.map((mv) => ({ uid: m.uid, moveId: mv })));
        return true;
      }) }, h('div', { class: 'reward-icon' }, '🏋️'), h('div', { class: 'grow' }, h('b', null, '특훈'), h('p', { class: 'small' }, '에코링 한 마리 레벨 +2'))),
      h('button', { class: 'reward-card r-epic', disabled: r.party.length + r.box.length < 2 ? true : undefined, onclick: () => choose(() => fusion()) },
        h('div', { class: 'reward-icon' }, '🧬'), h('div', { class: 'grow' }, h('b', null, '에코 퓨전'), h('p', { class: 'small' }, '한 마리를 떠나보내고, 그 기술 하나와 경험치 50%를 다른 에코링에게 계승'))),
    ),
  );
});

async function fusion(): Promise<boolean> {
  const r = run();
  const donor = await pickMon('🧬 퓨전 재료 (떠나보낼 에코링)', () => r.party.length + r.box.length > 1, true);
  if (!donor) return false;
  const target = await pickMon(`🧬 ${displayName(donor)}의 힘을 이어받을 에코링`, (m) => m !== donor, false);
  if (!target) return false;
  const moveId = await new Promise<string | null>((resolve) => {
    let done = false;
    const s = openSheet('계승할 기술', h('div', { class: 'list' }, donor.moves.map((id) =>
      h('button', { class: 'plain-btn', disabled: target.moves.includes(id) ? true : undefined, onclick: () => { done = true; s.close(); resolve(id); } }, moveCard(id, target.moves.includes(id) ? h('small', { class: 'muted' }, '이미 보유') : null)))), { onClose: () => { if (!done) resolve(null); } });
  });
  if (!moveId) return false;
  if (!(await confirmSheet('퓨전 확인', `${displayName(donor)}은(는) 떠나고, ${displayName(target)}이(가) 「${getMove(moveId).name}」과 경험치를 이어받습니다.`, '퓨전!', true))) return false;
  // 경험치 이전: 기증자 누적 경험치의 50%
  let total = donor.exp;
  for (let l = 1; l < donor.level; l++) total += expToNext(l);
  const idxP = r.party.indexOf(donor);
  if (idxP >= 0) r.party.splice(idxP, 1);
  else r.box.splice(r.box.indexOf(donor), 1);
  if (!r.party.length && r.box.length) r.party.push(r.box.shift()!);
  const res = gainExp(target, Math.floor(total * 0.5));
  r.fusions = (r.fusions ?? 0) + 1;
  sfx('evolve');
  await learnMoveModal(target, moveId);
  toast(`🧬 퓨전 완료! ${displayName(target)} Lv.${target.level}`, 'good');
  await processGrowth(res.pendingMoves.map((mv) => ({ uid: target.uid, moveId: mv })));
  return true;
}

// ─────────── 이벤트 ───────────
register('event', () => {
  const r = run();
  const ev = eventFor();
  const body = h('div', { class: 'list' });
  const render = () => {
    body.innerHTML = '';
    for (const c of ev.choices) {
      const ok = !c.can || c.can(r);
      body.appendChild(h('button', { class: 'reward-card' + (ok ? '' : ' disabled'), disabled: ok ? undefined : true, onclick: async () => {
        sfx('tap');
        const res = c.apply(r);
        saveAll();
        body.innerHTML = '';
        body.append(
          h('div', { class: 'card result' }, h('p', null, res.text)),
          h('button', { class: 'btn primary block', onclick: async () => {
            await processGrowth(res.learn ?? []);
            completeNode();
          } }, '계속 →'),
        );
      } }, h('div', { class: 'grow' }, h('b', null, c.label), h('p', { class: 'small muted' }, c.sub + (ok ? '' : ' (조건 미충족)')))));
    }
  };
  render();
  return h('div', { class: 'page' },
    topbar('이벤트'),
    h('div', { class: 'hero-art' }, img(NODE_ICON.event, 104), h('span', { class: 'event-emoji' }, ev.icon)),
    h('h2', { class: 'center' }, ev.title),
    h('p', { class: 'event-text' }, ev.text),
    body,
    h('div', { class: 'party-strip sm' }, r.party.map((m) => h('div', { html: monSprite(m, { size: 44 }) }))),
  );
});

export { MAX_PARTY };
