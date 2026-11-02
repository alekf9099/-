// 타이틀 · 스타터 선택 · 도감 · 연구소 · 설정 · 런 종료 · 액트 클리어
import type { RunState, Settings } from '../../core/types';
import { todayKey } from '../../core/rng';
import { SPECIES_LIST, STARTERS, getSpecies } from '../../data/species';
import { getMove } from '../../data/moves';
import { ACTS, ASCENSION_RULES, DAILY_MODIFIERS, META_UPGRADES, STARTER_UNLOCK_COST } from '../../data/world';
import { getCharm } from '../../data/charms';
import { ACHIEVEMENTS } from '../../data/achievements';
import { type DefeatCause, counterElements, defeatAdvice } from '../../game/advice';
import { hashString } from '../../core/rng';
import { defaultMeta } from '../../game/meta';
import { learnableUpTo } from '../../game/monster';
import { app, go, register, saveAll } from '../app';
import { confirmSheet, h, openSheet, toast } from '../dom';
import { bindSettings, haptic, sfx } from '../fx';
import { elChips, rarityName, resonanceChips } from '../components';
import { spriteSvg, monSprite } from '../sprite';
import { proceedAfterActClear, resume, startRun } from '../flow';
import { NODE_ICON, TITLE_BG, charmIconUrl, ico, img } from '../assets';

function todaysModifier() {
  return DAILY_MODIFIERS[hashString(todayKey()) % DAILY_MODIFIERS.length];
}

// ─────────── 타이틀 ───────────
register('title', () => {
  const m = app.meta;
  const r = app.run;
  const mod = todaysModifier();
  const playedToday = m.dailyBest[todayKey()] !== undefined;
  const newRun = async (mode: 'normal' | 'daily') => {
    sfx('tap');
    if (app.run && !(await confirmSheet('진행 중인 런이 있어요', '새로 시작하면 현재 런은 사라집니다. 계속할까요?', '새로 시작', true))) return;
    app.run = null;
    saveAll();
    go('starter', mode);
  };
  return h('div', { class: 'title-screen', style: `--bgimg:url(${TITLE_BG})` },
    h('div', { class: 'title-hero' },
      h('div', { class: 'hero-sprites' },
        h('div', { class: 'hs l', html: spriteSvg('puddlo', { size: 96 }) }),
        h('div', { class: 'hs c', html: spriteSvg('embercat', { size: 128 }) }),
        h('div', { class: 'hs r', html: spriteSvg('sproutle', { size: 96 }) }),
      ),
      h('h1', { class: 'logo' }, 'ECHOLING'),
      h('p', { class: 'tagline' }, '에코링 · 15분 몬스터 테이밍 로그라이크'),
    ),
    h('div', { class: 'title-actions' },
      r ? h('button', { class: 'btn primary xl block', onclick: () => { sfx('tap'); resume(); } },
        h('span', { class: 'btn-label' }, ico('play', 22), '이어하기'), h('small', null, `${ACTS[r.act].name} · ${r.floorsCleared}층 · 파티 ${r.party.length}`)) : null,
      h('button', { class: 'btn xl block ' + (r ? 'ghost' : 'primary'), onclick: () => newRun('normal') }, h('span', { class: 'btn-label' }, img(NODE_ICON.battle, 30), '새 모험'), h('small', null, '스타터를 고르고 3개의 액트를 돌파하라')),
      h('button', { class: 'btn xl block daily', onclick: () => newRun('daily') },
        h('span', { class: 'btn-label' }, img(NODE_ICON.event, 28), `데일리 챌린지 ${playedToday ? '· 재도전' : ''}`),
        h('small', null, `오늘의 규칙: ${mod.name} — ${mod.desc}`)),
      h('div', { class: 'grid2 tiles' },
        h('button', { class: 'btn tile', onclick: () => go('dex') }, ico('dex', 26), h('span', null, '도감'), h('small', null, `${m.caught.length}/${SPECIES_LIST.filter((s) => s.rarity !== 'legend').length}`)),
        h('button', { class: 'btn tile', onclick: () => go('achievements') }, ico('trophy', 26), h('span', null, '업적'), h('small', null, `${Object.keys(m.achievements ?? {}).length}/${ACHIEVEMENTS.length}`)),
        h('button', { class: 'btn tile', onclick: () => go('lab') }, ico('lab', 26), h('span', null, '연구소'), h('small', null, `💎 ${m.shards}`)),
        h('button', { class: 'btn tile', onclick: () => go('settings') }, ico('settings', 26), h('span', null, '설정'), h('small', null, `x${m.settings.speed} 속도`)),
      ),
      h('p', { class: 'muted small center' }, `총 ${m.totalRuns}런 · 클리어 ${m.wins}회 · v0.1`),
    ),
  );
});

// ─────────── 스타터 선택 ───────────
let ascSel = 0;

/** 🔥 각성 선택기 — 클리어할수록 다음 단계가 열리는 누적 난이도 */
function ascensionPicker(): HTMLElement {
  const max = app.meta.maxAscension ?? 0;
  ascSel = Math.min(ascSel, max);
  const wrap = h('div', { class: 'asc-picker' });
  const render = () => {
    wrap.innerHTML = '';
    if (max === 0) {
      wrap.append(h('div', { class: 'asc-locked' }, '🔒 각성 모드 — 첫 클리어 시 해금 (클리어할 때마다 더 높은 난이도 · 결정 보너스 +10%/단계)'));
      return;
    }
    wrap.append(
      h('div', { class: 'row between' },
        h('div', null, h('small', { class: 'eyebrow' }, '각성 난이도'), h('div', { class: 'asc-level' }, ascSel === 0 ? '기본' : `🔥 ${ascSel}`, h('small', { class: 'muted' }, `  / 최대 ${max}`))),
        h('div', { class: 'seg' },
          h('button', { 'aria-label': '각성 낮추기', disabled: ascSel <= 0 ? true : undefined, onclick: () => { ascSel--; sfx('tap'); render(); } }, '−'),
          h('button', { 'aria-label': '각성 높이기', disabled: ascSel >= max ? true : undefined, onclick: () => { ascSel++; sfx('tap'); render(); } }, '+'),
        ),
      ),
      ascSel > 0
        ? h('ul', { class: 'asc-rules' }, ASCENSION_RULES.slice(1, ascSel + 1).map((t, i) => h('li', { class: i === ascSel - 1 ? 'new' : '' }, `${i + 1}. ${t}`)))
        : h('p', { class: 'muted small', style: 'margin:6px 0 0' }, '추가 규칙 없음'),
      ...(ascSel > 0 ? [h('small', { class: 'gold' }, `💎 결정 보상 +${ascSel * 10}%`)] : []),
    );
  };
  render();
  return wrap;
}

register('starter', (mode: 'normal' | 'daily' = 'normal') => {
  const m = app.meta;
  let selected = m.unlockedStarters[0];
  const detail = h('div', { class: 'starter-detail' });
  const cards = h('div', { class: 'starter-cards', role: 'listbox', 'aria-label': '스타터 선택' });

  const renderDetail = () => {
    const sp = getSpecies(selected);
    const moves = learnableUpTo(sp.id, 5 + (m.upgrades['starterLevel'] ?? 0)).slice(-4);
    const total = sp.base.hp + sp.base.atk + sp.base.def + sp.base.spd;
    const line: string[] = [];
    let cur: string | undefined = sp.id;
    while (cur) {
      line.push(getSpecies(cur).name);
      cur = getSpecies(cur).evolveTo;
    }
    detail.innerHTML = '';
    detail.append(
      h('div', { class: 'row between' }, h('h2', null, sp.name, h('small', { class: 'muted' }, ' ' + sp.en)), elChips(sp.elements)),
      h('p', { class: 'muted' }, sp.dex),
      h('div', { class: 'evo-line' }, line.join('  →  ')),
      h('div', { class: 'mini-stats' }, (['hp', 'atk', 'def', 'spd'] as const).map((k) =>
        h('div', null, h('small', null, { hp: 'HP', atk: '공격', def: '방어', spd: '스피드' }[k]), h('div', { class: 'bar stat' }, h('div', { class: 'fill hi', style: `width:${(sp.base[k] / 80) * 100}%` })), h('b', null, String(sp.base[k]))),
      ), h('div', null, h('small', null, '총합'), h('b', null, String(total)))),
      h('div', { class: 'chip-row' }, moves.map((id) => h('span', { class: 'move-chip' }, getMove(id).name))),
    );
  };

  const renderCards = () => {
    cards.innerHTML = '';
    for (const id of STARTERS) {
      const unlocked = m.unlockedStarters.includes(id);
      const cost = STARTER_UNLOCK_COST[id];
      cards.appendChild(h('button', {
        class: 'starter-card' + (id === selected ? ' sel' : '') + (unlocked ? '' : ' locked'),
        role: 'option', 'aria-selected': String(id === selected),
        onclick: async () => {
          sfx('tap');
          if (!unlocked) {
            if (m.shards < cost) return toast(`💎 결정 ${cost}개가 필요해요 (보유 ${m.shards})`, 'bad');
            if (!(await confirmSheet('스타터 해금', `💎 ${cost}개로 ${getSpecies(id).name}을(를) 해금할까요?`, '해금'))) return;
            m.shards -= cost;
            m.unlockedStarters.push(id);
            saveAll();
            sfx('level');
          }
          selected = id;
          renderCards();
          renderDetail();
        },
      },
        h('div', { html: spriteSvg(id, { size: 92, silhouette: !unlocked }) }),
        h('b', null, unlocked ? getSpecies(id).name : '???'),
        unlocked ? elChips(getSpecies(id).elements, true) : h('small', { class: 'cost' }, `🔒 💎${cost}`),
      ));
    }
  };
  renderCards();
  renderDetail();

  return h('div', { class: 'page' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => go('title') }, ico('back', 22)), h('h2', null, mode === 'daily' ? '📅 데일리 · 스타터' : '파트너 선택'), h('span', { class: 'spacer' })),
    mode === 'daily' ? h('div', { class: 'banner daily' }, `오늘의 규칙: ${todaysModifier().name} — ${todaysModifier().desc}`) : null,
    cards,
    detail,
    mode === 'normal' ? ascensionPicker() : null,
    h('div', { class: 'bottom-cta' }, h('button', { class: 'btn primary xl block', onclick: () => { sfx('win'); haptic([10, 30, 10]); startRun(selected, mode, ascSel); } }, '이 에코링과 출발! →')),
  );
});

// ─────────── 도감 ───────────
register('dex', () => {
  const m = app.meta;
  const list = SPECIES_LIST;
  return h('div', { class: 'page' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => go('title') }, ico('back', 22)), h('h2', null, '📖 에코 도감'), h('span', { class: 'pill' }, `${m.caught.length}/${list.length}`)),
    h('div', { class: 'dex-grid' }, list.map((sp, i) => {
      const caught = m.caught.includes(sp.id);
      const seenIt = m.seen.includes(sp.id);
      return h('button', { class: 'dex-cell' + (caught ? ' caught' : ''), onclick: () => {
        if (!seenIt && !caught) return toast('아직 만나지 못한 에코링이에요');
        openSheet(`#${String(i + 1).padStart(3, '0')} ${sp.name}`, h('div', { class: 'pad center' },
          h('div', { html: spriteSvg(sp.id, { size: 160, silhouette: !caught }) }),
          elChips(sp.elements),
          h('p', null, caught ? sp.dex : '목격만 한 에코링. 포획하면 정보가 기록됩니다.'),
          h('small', { class: 'muted' }, `${sp.en} · ${rarityName(sp.rarity)}`),
        ));
      } },
        h('div', { html: spriteSvg(sp.id, { size: 64, silhouette: !caught }) }),
        h('small', null, caught || seenIt ? sp.name : '???'),
      );
    })),
  );
});

// ─────────── 연구소 (메타 업그레이드) ───────────
register('lab', () => {
  const m = app.meta;
  const wrap = h('div', { class: 'list' });
  const head = h('span', { class: 'pill gold' });
  const render = () => {
    head.textContent = `💎 ${m.shards}`;
    wrap.innerHTML = '';
    for (const up of META_UPGRADES) {
      const lv = m.upgrades[up.id] ?? 0;
      const maxed = lv >= up.max;
      const cost = up.cost(lv);
      wrap.appendChild(h('div', { class: 'card row between' },
        h('div', null, h('b', null, up.name), h('div', { class: 'muted small' }, up.desc), h('div', { class: 'lv-pips' }, Array.from({ length: up.max }, (_, i) => h('i', { class: i < lv ? 'on' : '' })))),
        h('button', { class: 'btn ' + (maxed ? 'ghost' : 'primary'), disabled: maxed || m.shards < cost ? true : undefined, onclick: () => {
          m.shards -= cost;
          m.upgrades[up.id] = lv + 1;
          saveAll();
          sfx('level');
          render();
        } }, maxed ? 'MAX' : `💎 ${cost}`),
      ));
    }
  };
  render();
  return h('div', { class: 'page' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => go('title') }, ico('back', 22)), h('h2', null, '🔬 연구소'), head),
    h('p', { class: 'muted pad-x' }, '런에서 얻은 에코 결정으로 영구 강화를 연구하세요. 실패한 런도 결정을 남깁니다.'),
    wrap,
  );
});

// ─────────── 설정 ───────────
register('settings', () => {
  const s = app.meta.settings;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    s[k] = v;
    bindSettings(s);
    saveAll();
  };
  const toggle = (k: 'haptics' | 'sound' | 'music' | 'reduceMotion', label: string, sub: string) =>
    h('label', { class: 'card row between toggle' }, h('div', null, h('b', null, label), h('div', { class: 'muted small' }, sub)),
      (() => { const i = h('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement; i.checked = s[k] !== false; i.onchange = () => { set(k, i.checked); sfx('tap'); }; return i; })());
  const speedSeg = h('div', { class: 'seg' }, ([1, 2, 3] as const).map((v) => h('button', { class: s.speed === v ? 'on' : '', onclick: (e: MouseEvent) => {
    set('speed', v);
    (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i + 1 === v));
  } }, `x${v}`)));
  return h('div', { class: 'page' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => go('title') }, ico('back', 22)), h('h2', null, '⚙️ 설정'), h('span', { class: 'spacer' })),
    h('div', { class: 'list' },
      h('div', { class: 'card row between' }, h('div', null, h('b', null, '전투 속도'), h('div', { class: 'muted small' }, '연출 재생 속도')), speedSeg),
      toggle('haptics', '진동 (햅틱)', '타격·포획 시 진동 피드백'),
      toggle('music', '배경음악', '타이틀 · 맵 · 전투 · 보스 테마'),
      toggle('sound', '효과음', '타격 · 포획 · UI 사운드'),
      toggle('reduceMotion', '모션 줄이기', '흔들림·플래시 최소화 (멀미 방지)'),
      h('button', { class: 'btn danger block', onclick: async () => {
        if (!(await confirmSheet('데이터 초기화', '도감, 결정, 업그레이드, 진행 중인 런이 모두 삭제됩니다.', '초기화', true))) return;
        app.meta = defaultMeta();
        app.run = null;
        bindSettings(app.meta.settings);
        saveAll();
        toast('초기화 완료');
        go('title');
      } }, '데이터 초기화'),
    ),
    h('details', { class: 'card credits' },
      h('summary', null, '크레딧 · 라이선스'),
      h('p', { class: 'small muted' }, '캐릭터·배경·아이콘: Canva AI로 제작한 ECHOLING 오리지널 아트'),
      h('p', { class: 'small muted' }, '아이콘: Lucide (ISC) · 서체: Pretendard, Jua, Lilita One (SIL OFL)'),
      h('p', { class: 'small muted' }, '음악 (CC0, OpenGameArt): Blue Meadow In Green Sky · Flowerbed Fields · Fast Fight · Determined Pursuit'),
      h('p', { class: 'small muted' }, '효과음 (CC0): Kenney Interface Sounds · 80 CC0 RPG SFX · Level up/Power up/Coin get'),
    ),
    h('p', { class: 'muted small center' }, 'ECHOLING은 오리지널 IP입니다. 모든 몬스터·이름·세계관은 자체 제작.'),
  );
});

// ─────────── 액트 클리어 ───────────
register('actClear', () => {
  const r = app.run!;
  const last = r.act >= ACTS.length - 1;
  sfx('win');
  return h('div', { class: 'page center-page act-clear' },
    h('div', { class: 'confetti' }),
    h('h1', { class: 'logo sm' }, `ACT ${r.act + 1} CLEAR!`),
    h('div', { html: spriteSvg(ACTS[r.act].boss, { size: 150 }) }),
    h('p', null, `${getSpecies(ACTS[r.act].boss).name}을(를) 쓰러뜨렸다!`),
    h('div', { class: 'party-strip' }, r.party.map((mm) => h('div', { html: monSprite(mm, { size: 56 }) }))),
    last ? h('p', { class: 'gold' }, '모든 에코의 근원을 정화했다!') : h('p', { class: 'muted' }, `파티가 완전히 회복됩니다. 다음: ${ACTS[r.act + 1].name}`),
    h('button', { class: 'btn primary xl block', onclick: () => proceedAfterActClear() }, last ? '엔딩 보기 →' : `${ACTS[r.act + 1].name}(으)로 →`),
  );
});

// ─────────── 💀 패배 원인 리포트 ───────────
function defeatCard(c: DefeatCause): HTMLElement {
  const sp = getSpecies(c.enemySpecies);
  const mv = c.moveId ? getMove(c.moveId) : null;
  const counters = counterElements(sp.elements);
  return h('div', { class: 'defeat-card' },
    h('div', { class: 'row gap' },
      h('div', { html: spriteSvg(c.enemySpecies, { size: 64 }) }),
      h('div', { class: 'grow', style: 'text-align:left' },
        h('small', { class: 'eyebrow' }, '패배 원인'),
        h('b', null, `${sp.name} Lv.${c.enemyLevel}${mv ? `의 「${mv.name}」` : ''}`),
        h('div', { class: 'row gap-s', style: 'margin-top:4px' }, elChips(sp.elements, true), h('small', { class: 'muted' }, `내 최고 Lv.${c.myBestLevel}`)),
      ),
    ),
    counters.length ? h('div', { class: 'row gap-s', style: 'flex-wrap:wrap' }, h('small', { class: 'muted' }, '추천 속성'), elChips(counters, true)) : null,
    h('ul', { class: 'defeat-tips' }, defeatAdvice(c).map((t) => h('li', null, t))),
  );
}

// ─────────── 런 종료 ───────────
register('runEnd', (sum: { victory: boolean; shards: number; ascUnlocked?: number | null; cause?: DefeatCause; run: RunState }) => {
  const r = sum.run;
  sfx(sum.victory ? 'win' : 'lose');
  const mins = Math.max(1, Math.round((Date.now() - r.startedAt) / 60000));
  const seedText = `ECHO-${r.seed.toString(36).toUpperCase()}`;
  const shareText = `ECHOLING ${sum.victory ? '클리어' : `ACT${r.act + 1} 도달`}${r.ascension ? ` · 각성${r.ascension}` : ''} · ${r.floorsCleared}층 · ${mins}분\n파티: ${r.party.map((m) => `${getSpecies(m.speciesId).name} Lv.${m.level}`).join(', ')}\n부적: ${r.charms.map((c) => getCharm(c).icon).join('') || '없음'}\n시드: ${seedText}`;
  const buildCard = h('div', { class: 'build-card' },
    h('div', { class: 'row between' }, h('b', null, '📸 이번 런 빌드'), h('span', { class: 'pill' }, r.ascension ? `🔥 각성 ${r.ascension}` : '기본')),
    h('div', { class: 'bc-party' }, r.party.map((m) => h('div', { class: 'bc-mon' + (m.hp <= 0 ? ' fainted' : '') }, h('div', { html: monSprite(m, { size: 54 }) }), h('small', null, `Lv.${m.level}`)))),
    h('div', { class: 'bc-charms' }, r.charms.length ? r.charms.map((c) => h('span', { class: 'bc-charm r-' + getCharm(c).rarity, title: getCharm(c).name }, img(charmIconUrl(c), 26))) : h('small', { class: 'muted' }, '부적 없음')),
    resonanceChips(r.party, r.charms),
    h('div', { class: 'row between bc-seed' },
      h('code', null, seedText),
      h('button', { class: 'chip-btn', onclick: async (e: MouseEvent) => {
        const btn = e.currentTarget as HTMLElement;
        try {
          await navigator.clipboard.writeText(shareText);
          btn.textContent = '✓ 복사됨';
          toast('런 결과를 복사했어요. 친구에게 붙여넣어 자랑하세요!', 'good');
        } catch {
          toast(seedText);
        }
      } }, '📋 결과 복사'),
    ),
  );
  return h('div', { class: 'page center-page' },
    sum.ascUnlocked ? h('div', { class: 'asc-unlock' }, `🔥 각성 ${sum.ascUnlocked} 해금!`, h('small', null, ASCENSION_RULES[sum.ascUnlocked])) : null,
    h('h1', { class: 'logo sm ' + (sum.victory ? '' : 'dim') }, sum.victory ? 'VICTORY' : 'RUN OVER'),
    h('p', { class: 'muted' }, sum.victory ? '전설의 테이머로 기록되었습니다!' : `${ACTS[r.act].name}에서 여정이 끝났습니다…`),
    h('div', { class: 'party-strip' }, [...r.party].map((m) => h('div', { class: m.hp <= 0 ? 'fainted' : '', html: monSprite(m, { size: 64 }) }))),
    h('div', { class: 'stat-grid' },
      h('div', null, h('small', null, '도달'), h('b', null, `ACT ${r.act + 1}`)),
      h('div', null, h('small', null, '층'), h('b', null, String(r.floorsCleared))),
      h('div', null, h('small', null, '승리'), h('b', null, String(r.battlesWon))),
      h('div', null, h('small', null, '포획'), h('b', null, String(r.caught))),
      h('div', null, h('small', null, '부적'), h('b', null, String(r.charms.length))),
      h('div', null, h('small', null, '시간'), h('b', null, `${mins}분`)),
    ),
    h('div', { class: 'reward-shards' }, `💎 +${sum.shards} 에코 결정`),
    sum.cause ? defeatCard(sum.cause) : null,
    buildCard,
    h('div', { class: 'col gap' },
      h('button', { class: 'btn primary xl block', onclick: () => go('starter', 'normal') }, '다시 도전'),
      h('button', { class: 'btn ghost block', onclick: () => go('lab') }, '🔬 연구소에서 강화하기'),
      h('button', { class: 'btn ghost block', onclick: () => go('title') }, '타이틀로'),
    ),
  );
});
