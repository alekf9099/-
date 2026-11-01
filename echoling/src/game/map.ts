// 분기형 노드 맵 생성기
//  - 4개의 경로를 아래→위로 그리며 노드/간선 생성
//  - 행 규칙: 0행=전투, 5행=보물, 9행=휴식, 10행=보스
//  - 상점/휴식/엘리트는 연속 배치 금지
import type { ActMap, MapNode, NodeType } from '../core/types';
import type { Rng } from '../core/rng';
import { MAP_COLS, MAP_ROWS } from '../data/world';

const BOSS_ROW = MAP_ROWS - 1;

export function nodeId(row: number, col: number): string {
  return `r${row}c${col}`;
}

export function generateMap(act: number, rng: Rng, paths = 4): ActMap {
  const nodes: Record<string, MapNode> = {};
  const ensure = (row: number, col: number): MapNode => {
    const id = nodeId(row, col);
    if (!nodes[id]) nodes[id] = { id, row, col, type: 'battle', next: [] };
    return nodes[id];
  };

  // 시작 열: 최대한 분산
  const starts = rng.sample([0, 1, 2, 3, 4], Math.min(paths, MAP_COLS));
  while (starts.length < paths) starts.push(rng.int(0, MAP_COLS - 1));

  for (let p = 0; p < paths; p++) {
    let col = starts[p];
    let prev = ensure(0, col);
    for (let row = 1; row < BOSS_ROW; row++) {
      // 교차 최소화: 이웃 경로와 X자로 엇갈리지 않도록 최대 3회 재시도
      let nextCol = col;
      for (let tries = 0; tries < 3; tries++) {
        nextCol = Math.max(0, Math.min(MAP_COLS - 1, col + rng.int(-1, 1)));
        if (!crosses(nodes, row - 1, col, nextCol)) break;
      }
      const cur = ensure(row, nextCol);
      if (!prev.next.includes(cur.id)) prev.next.push(cur.id);
      prev = cur;
      col = nextCol;
    }
    const boss = ensure(BOSS_ROW, Math.floor(MAP_COLS / 2));
    if (!prev.next.includes(boss.id)) prev.next.push(boss.id);
  }

  assignTypes(nodes, rng, act);
  return { act, nodes, rows: MAP_ROWS, cols: MAP_COLS };
}

/** row→row+1 로 (a→b) 간선이 기존 (c→d) 간선과 교차하는지 */
function crosses(nodes: Record<string, MapNode>, row: number, a: number, b: number): boolean {
  for (const n of Object.values(nodes)) {
    if (n.row !== row || n.col === a) continue;
    for (const nid of n.next) {
      const t = nodes[nid];
      if (!t) continue;
      if ((n.col < a && t.col > b) || (n.col > a && t.col < b)) return true;
    }
  }
  return false;
}

function parentsOf(nodes: Record<string, MapNode>, id: string): MapNode[] {
  return Object.values(nodes).filter((n) => n.next.includes(id));
}

const NO_REPEAT: NodeType[] = ['shop', 'rest', 'elite', 'treasure'];

function assignTypes(nodes: Record<string, MapNode>, rng: Rng, act: number): void {
  const byRow = Object.values(nodes).sort((a, b) => a.row - b.row || a.col - b.col);
  for (const n of byRow) {
    if (n.row === 0) n.type = 'battle';
    else if (n.row === BOSS_ROW) n.type = 'boss';
    else if (n.row === 5) n.type = 'treasure';
    else if (n.row === BOSS_ROW - 1) n.type = 'rest';
    else {
      const parents = parentsOf(nodes, n.id).map((p) => p.type);
      const table: [NodeType, number][] = [
        ['battle', 40],
        ['trainer', n.row >= 2 ? 16 : 6],
        ['event', 18],
        ['shop', n.row >= 2 ? 9 : 0],
        ['elite', n.row >= (act === 0 ? 5 : 4) ? 10 + act * 2 : 0],
        ['rest', n.row >= 3 && n.row !== BOSS_ROW - 2 ? 7 : 0],
      ];
      let t: NodeType = 'battle';
      for (let i = 0; i < 6; i++) {
        t = rng.weighted(table.filter(([, w]) => w > 0));
        if (!(NO_REPEAT.includes(t) && parents.includes(t))) break;
        t = 'battle';
      }
      n.type = t;
    }
  }
  // 보장: 각 맵에 상점 최소 1개
  if (!byRow.some((n) => n.type === 'shop')) {
    const cand = byRow.filter((n) => n.row >= 2 && n.row <= 7 && n.type === 'battle');
    if (cand.length) rng.pick(cand).type = 'shop';
  }
}

export function availableNodes(map: ActMap, currentId: string | null): MapNode[] {
  if (!currentId) return Object.values(map.nodes).filter((n) => n.row === 0);
  const cur = map.nodes[currentId];
  return cur ? cur.next.map((id) => map.nodes[id]).filter(Boolean) : [];
}

export const NODE_META: Record<NodeType, { icon: string; name: string; color: string }> = {
  battle: { icon: '⚔️', name: '야생 조우', color: '#7ad7ff' },
  trainer: { icon: '🧢', name: '테이머 배틀', color: '#ffb36b' },
  elite: { icon: '💀', name: '엘리트', color: '#ff5d7a' },
  event: { icon: '❓', name: '이벤트', color: '#c49bff' },
  shop: { icon: '🛒', name: '상점', color: '#ffd84a' },
  rest: { icon: '⛺', name: '캠프', color: '#6fe39a' },
  treasure: { icon: '💎', name: '보물', color: '#7cf2ff' },
  boss: { icon: '👑', name: '보스', color: '#ff3d6e' },
};
