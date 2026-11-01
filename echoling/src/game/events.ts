// ❓ 랜덤 이벤트 (텍스트 선택지)
import type { Monster, RunState } from '../core/types';
import { getCharm } from '../data/charms';
import { MOVE_LIST } from '../data/moves';
import { wildPool, getSpecies } from '../data/species';
import { addItem, addMonster, commitRng, enemyLevel, nextUid, runRng } from './run';
import { createMonster, gainExp, healPct, maxHp, displayName, type LevelUpResult } from './monster';
import { CHARM_LIST } from '../data/charms';

export interface EventChoice {
  label: string;
  sub: string;
  /** 선택 가능 여부 */
  can?: (run: RunState) => boolean;
  /** 결과 텍스트 반환. pendingLearn 등 후속 처리는 반환 객체로 */
  apply: (run: RunState) => EventResult;
}

export interface EventResult {
  text: string;
  learn?: { uid: string; moveId: string }[];
}

export interface GameEvent {
  id: string;
  icon: string;
  title: string;
  text: string;
  choices: EventChoice[];
}

const leave: EventChoice = { label: '그냥 지나간다', sub: '아무 일도 일어나지 않는다', apply: () => ({ text: '조용히 발걸음을 옮겼다.' }) };

export const EVENTS: GameEvent[] = [
  {
    id: 'merchant',
    icon: '🧳',
    title: '수상한 행상인',
    text: '후드를 깊게 눌러쓴 행상인이 반짝이는 주머니를 흔든다. "60골드면 뭐가 들었는지 알려주지~"',
    choices: [
      {
        label: '60골드를 낸다',
        sub: '랜덤 부적 획득',
        can: (r) => r.gold >= 60,
        apply: (r) => {
          const rng = runRng(r);
          const pool = CHARM_LIST.filter((c) => !r.charms.includes(c.id));
          r.gold -= 60;
          if (!pool.length) {
            commitRng(r, rng);
            return { text: '주머니는 비어있었다… 사기당했다!' };
          }
          const c = rng.pick(pool);
          r.charms.push(c.id);
          commitRng(r, rng);
          return { text: `${c.icon} ${c.name}을(를) 얻었다! (${c.desc})` };
        },
      },
      leave,
    ],
  },
  {
    id: 'spring',
    icon: '⛲',
    title: '에코의 샘',
    text: '맑은 빛이 일렁이는 샘. 에코링들이 목을 축이고 싶어 한다.',
    choices: [
      {
        label: '조금 마신다',
        sub: '파티 전원 HP 60% 회복',
        apply: (r) => {
          r.party.forEach((m) => healPct(m, 0.6, true));
          return { text: '상쾌한 기운이 퍼진다. 파티가 회복됐다!' };
        },
      },
      {
        label: '깊이 들이켠다',
        sub: '전원 레벨 +1, 30% 확률로 전원 중독',
        apply: (r) => {
          const rng = runRng(r);
          const learn = collect(r, (m) => gainExp(m, needFor(m.level, m.exp)));
          const bad = rng.chance(0.3);
          if (bad) r.party.forEach((m) => m.hp > 0 && (m.status = 'poison'));
          commitRng(r, rng);
          return { text: bad ? '힘이 솟는다… 그런데 배가 아프다! (전원 레벨업 + 중독)' : '힘이 넘쳐흐른다! 전원 레벨업!', learn };
        },
      },
    ],
  },
  {
    id: 'lost',
    icon: '🥺',
    title: '길 잃은 에코링',
    text: '수풀 속에서 작은 에코링이 떨고 있다. 당신을 빤히 바라본다.',
    choices: [
      {
        label: '데려간다',
        sub: '랜덤 에코링이 동료가 된다',
        apply: (r) => {
          const rng = runRng(r);
          const sp = rng.pick(wildPool(r.act));
          const m = createMonster(sp.id, enemyLevel(r.act, 3, 'wild'), rng, nextUid(r), { evolve: true });
          const where = addMonster(r, m);
          commitRng(r, rng);
          r.caught += 1;
          return { text: `${getSpecies(m.speciesId).name}이(가) 동료가 됐다!${where === 'box' ? ' (보관함으로 이동)' : ''}` };
        },
      },
      {
        label: '간식만 주고 보낸다',
        sub: '골드 +35 (보답으로 동전을 물어왔다)',
        apply: (r) => {
          r.gold += 35;
          return { text: '에코링이 반짝이는 동전을 물어다 주고 사라졌다. +35G' };
        },
      },
    ],
  },
  {
    id: 'gamble',
    icon: '🎲',
    title: '거리의 도박사',
    text: '"동전 던지기 한 판 어때? 앞면이면 두 배!"',
    choices: [
      {
        label: '50골드 건다',
        sub: '50% 확률로 +50G / -50G',
        can: (r) => r.gold >= 50,
        apply: (r) => {
          const rng = runRng(r);
          const win = rng.chance(0.5);
          r.gold += win ? 50 : -50;
          commitRng(r, rng);
          return { text: win ? '앞면! +50G 🎉' : '뒷면… -50G 💸' };
        },
      },
      leave,
    ],
  },
  {
    id: 'tablet',
    icon: '🗿',
    title: '고대 석판',
    text: '석판에 새겨진 문양이 선두 에코링과 공명한다. 강력한 기술의 기억이 흘러든다.',
    choices: [
      {
        label: '석판에 손을 댄다',
        sub: '선두 에코링이 궁극기(3EN)를 배울 기회',
        apply: (r) => {
          const rng = runRng(r);
          const lead = r.party.find((m) => m.hp > 0) ?? r.party[0];
          const els = getSpecies(lead.speciesId).elements;
          const ult = MOVE_LIST.filter((m) => m.cost === 3 && (els.includes(m.element) || m.element === 'neutral') && !lead.moves.includes(m.id));
          commitRng(r, rng);
          if (!ult.length) return { text: '석판은 침묵했다…' };
          const mv = rng.pick(ult);
          commitRng(r, rng);
          return { text: `${displayName(lead)}의 머릿속에 「${mv.name}」이(가) 떠오른다!`, learn: [{ uid: lead.uid, moveId: mv.id }] };
        },
      },
      leave,
    ],
  },
  {
    id: 'trap',
    icon: '🕸️',
    title: '거미줄 함정',
    text: '끈적한 거미줄에 발이 묶였다! 무언가 다가오는 소리가 들린다.',
    choices: [
      {
        label: '힘으로 뜯어낸다',
        sub: '파티 전원 최대 HP 15% 피해',
        apply: (r) => {
          r.party.forEach((m) => m.hp > 0 && (m.hp = Math.max(1, m.hp - Math.ceil(maxHp(m) * 0.15))));
          return { text: '간신히 빠져나왔다. 모두 조금 다쳤다.' };
        },
      },
      {
        label: '포션을 미끼로 던진다',
        sub: '포션 1개 소모',
        can: (r) => (r.items.potion ?? 0) > 0,
        apply: (r) => {
          r.items.potion = (r.items.potion ?? 1) - 1;
          return { text: '거미가 포션에 정신 팔린 사이 도망쳤다!' };
        },
      },
    ],
  },
  {
    id: 'supply',
    icon: '📦',
    title: '테이머 보급 상자',
    text: '협회 로고가 찍힌 상자가 놓여 있다. "자유롭게 가져가세요 :)"',
    choices: [
      {
        label: '캡슐을 챙긴다',
        sub: '싱크 캡슐 +3',
        apply: (r) => {
          addItem(r, 'capsule', 3);
          return { text: '싱크 캡슐 3개를 얻었다!' };
        },
      },
      {
        label: '구급품을 챙긴다',
        sub: '에코 포션 +2, 리바이브 칩 +1',
        apply: (r) => {
          addItem(r, 'potion', 2);
          addItem(r, 'revive', 1);
          return { text: '포션 2개와 리바이브 칩을 얻었다!' };
        },
      },
    ],
  },
  {
    id: 'dojo',
    icon: '🥋',
    title: '떠돌이 도장',
    text: '"수련하고 가게나!" 도복을 입은 할아버지가 손짓한다.',
    choices: [
      {
        label: '단체 수련 (30골드)',
        sub: '파티 전원 경험치 대량 획득',
        can: (r) => r.gold >= 30,
        apply: (r) => {
          r.gold -= 30;
          const learn = collect(r, (m) => (m.hp > 0 ? gainExp(m, Math.round(m.level * m.level * 0.9)) : null));
          return { text: '혹독한 수련 끝에 모두 성장했다!', learn };
        },
      },
      {
        label: '비전 전수',
        sub: '선두 에코링이 랜덤 부적 효과를 이해한다 (부적 획득, HP 30% 소모)',
        apply: (r) => {
          const rng = runRng(r);
          const pool = CHARM_LIST.filter((c) => !r.charms.includes(c.id) && c.rarity === 'common');
          const lead = r.party.find((m) => m.hp > 0) ?? r.party[0];
          lead.hp = Math.max(1, lead.hp - Math.ceil(maxHp(lead) * 0.3));
          if (!pool.length) {
            commitRng(r, rng);
            return { text: '가르칠 것이 없다며 웃으셨다.' };
          }
          const c = rng.pick(pool);
          r.charms.push(c.id);
          commitRng(r, rng);
          return { text: `${getCharm(c.id).icon} ${getCharm(c.id).name} 획득!` };
        },
      },
    ],
  },
];

function collect(r: RunState, fn: (m: Monster) => LevelUpResult | null): { uid: string; moveId: string }[] {
  const out: { uid: string; moveId: string }[] = [];
  for (const m of r.party) {
    const res = fn(m);
    if (res) for (const mv of res.pendingMoves) out.push({ uid: m.uid, moveId: mv });
  }
  return out;
}

/** 다음 레벨까지 남은 경험치 */
function needFor(level: number, exp: number): number {
  return Math.max(1, Math.round(level * level * 0.9 + 20) - exp);
}

export function pickEvent(run: RunState): string {
  const rng = runRng(run);
  const id = rng.pick(EVENTS).id;
  commitRng(run, rng);
  return id;
}

export function getEvent(id: string): GameEvent {
  return EVENTS.find((e) => e.id === id) ?? EVENTS[0];
}
