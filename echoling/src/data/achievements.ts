// 🏆 업적 — 달성하면 결정(💎) 또는 강력한 부적이 해금된다 (부적은 처음엔 잠겨 있음)
import type { MetaSave, RunState } from '../core/types';

/** 업적으로만 열리는 부적 (빌드 정의형 — 처음 플레이에서 선택지를 단순하게 유지) */
export const LOCKED_CHARMS = ['snowball', 'echoChamber', 'phoenix', 'goldenTouch', 'glassHeart', 'lonewolf', 'overcharge'];

export interface AchCtx {
  meta: MetaSave;
  run: RunState | null;
  /** 런 종료 판정 시 */
  ended?: { victory: boolean };
  /** 공명 2단계 보유 여부 (UI에서 계산해 전달) */
  res2?: boolean;
  /** 파티에 3단 진화형 보유 */
  finalEvo?: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** 아이콘: 부적 보상이면 부적 아이콘, 아니면 노드/아이템 아이콘 키 */
  icon: string;
  reward: { shards?: number; charm?: string };
  check: (c: AchCtx) => boolean;
  /** 진행도 [현재, 목표] */
  progress?: (c: AchCtx) => [number, number];
}

const party = (c: AchCtx) => [...(c.run?.party ?? []), ...(c.run?.box ?? [])];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win', name: '첫 승리', desc: '전투에서 처음으로 승리한다', icon: 'node_battle', reward: { shards: 10 }, check: (c) => (c.run?.battlesWon ?? 0) >= 1 },
  { id: 'tamer8', name: '견습 테이머', desc: '도감에 에코링 8종을 등록한다', icon: 'item_capsule', reward: { shards: 20 }, check: (c) => c.meta.caught.length >= 8, progress: (c) => [c.meta.caught.length, 8] },
  { id: 'act1', name: '이끼숲 정복', desc: '액트 1 보스를 쓰러뜨린다', icon: 'charm_snowball', reward: { charm: 'snowball' }, check: (c) => (c.run?.bossesWon ?? 0) >= 1 },
  { id: 'act2', name: '폭풍을 넘어', desc: '액트 2 보스를 쓰러뜨린다', icon: 'charm_echoChamber', reward: { charm: 'echoChamber' }, check: (c) => (c.run?.bossesWon ?? 0) >= 2 },
  { id: 'victory', name: '전설의 테이머', desc: '런을 클리어한다', icon: 'charm_phoenix', reward: { charm: 'phoenix', shards: 50 }, check: (c) => !!c.ended?.victory },
  { id: 'ascended', name: '각성자', desc: '각성 3 이상에서 런을 클리어한다', icon: 'charm_goldenTouch', reward: { charm: 'goldenTouch' }, check: (c) => !!c.ended?.victory && (c.run?.ascension ?? 0) >= 3 },
  { id: 'lone', name: '외로운 늑대', desc: '에코링 1마리만으로 액트 1 보스를 쓰러뜨린다', icon: 'charm_lonewolf', reward: { charm: 'lonewolf' }, check: (c) => (c.run?.bossesWon ?? 0) >= 1 && party(c).length === 1 },
  { id: 'resonance', name: '완벽한 공명', desc: '공명 2단계(같은 속성 3마리)를 완성한다', icon: 'charm_overcharge', reward: { charm: 'overcharge' }, check: (c) => !!c.res2 },
  { id: 'charms6', name: '부적 수집광', desc: '한 런에서 부적 6개를 모은다', icon: 'charm_glassHeart', reward: { charm: 'glassHeart' }, check: (c) => (c.run?.charms.length ?? 0) >= 6, progress: (c) => [c.run?.charms.length ?? 0, 6] },
  { id: 'dex15', name: '도감 연구가', desc: '도감에 에코링 15종을 등록한다', icon: 'charm_collector', reward: { shards: 60 }, check: (c) => c.meta.caught.length >= 15, progress: (c) => [c.meta.caught.length, 15] },
  { id: 'shiny', name: '반짝이는 만남', desc: '빛나는 개체(이로치)를 동료로 만든다', icon: 'item_revive', reward: { shards: 40 }, check: (c) => party(c).some((m) => m.shiny) },
  { id: 'final_evo', name: '최종 진화', desc: '에코링을 3단계까지 진화시킨다', icon: 'item_candy', reward: { shards: 40 }, check: (c) => !!c.finalEvo },
  { id: 'elite5', name: '엘리트 사냥꾼', desc: '엘리트를 누적 5회 쓰러뜨린다', icon: 'node_elite', reward: { shards: 30 }, check: (c) => c.meta.stats.elites + (c.run?.elitesWon ?? 0) >= 5, progress: (c) => [c.meta.stats.elites + (c.run?.elitesWon ?? 0), 5] },
  { id: 'daily', name: '오늘의 도전자', desc: '데일리 챌린지를 끝까지 플레이한다', icon: 'node_event', reward: { shards: 20 }, check: (c) => !!c.ended && c.run?.mode === 'daily' },
  { id: 'fusion', name: '에코 퓨전', desc: '캠프에서 에코 퓨전을 사용한다', icon: 'node_rest', reward: { shards: 20 }, check: (c) => (c.run?.fusions ?? 0) + c.meta.stats.fusions >= 1 },
  { id: 'rich', name: '골드 러시', desc: '골드 500을 한 번에 보유한다', icon: 'node_shop', reward: { shards: 20 }, check: (c) => (c.run?.gold ?? 0) >= 500, progress: (c) => [Math.min(500, c.run?.gold ?? 0), 500] },
];

/** 새로 달성한 업적 반영 (보상 지급·부적 해금). 반환: 새로 달성한 업적 */
export function evaluateAchievements(c: AchCtx): Achievement[] {
  const got: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (c.meta.achievements[a.id]) continue;
    if (!a.check(c)) continue;
    c.meta.achievements[a.id] = Date.now();
    if (a.reward.shards) c.meta.shards += a.reward.shards;
    if (a.reward.charm && !c.meta.unlockedCharms.includes(a.reward.charm)) {
      c.meta.unlockedCharms.push(a.reward.charm);
      // 진행 중인 런에서도 바로 등장 가능
      if (c.run?.lockedCharms) c.run.lockedCharms = c.run.lockedCharms.filter((x) => x !== a.reward.charm);
    }
    got.push(a);
  }
  return got;
}

export function lockedCharmsFor(meta: MetaSave): string[] {
  return LOCKED_CHARMS.filter((id) => !meta.unlockedCharms.includes(id));
}
