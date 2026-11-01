import type { Species } from '../core/types';

// 스탯 총합 가이드 (hp+atk+def+spd)
//  1단계 ≈ 220 · 2단계 ≈ 290 · 3단계 ≈ 360 · 엘리트/보스 ≈ 380~460
// 모든 몬스터·이름·외형은 ECHOLING 오리지널 IP.

const list: Species[] = [
  // ═════════ 스타터 라인 ═════════
  {
    id: 'embercat', name: '불씨냥', en: 'Embercat', elements: ['blaze'], rarity: 'rare', acts: [],
    base: { hp: 52, atk: 60, def: 45, spd: 63 }, exp: 62, catchRate: 0.3,
    learnset: [[1, 'tackle'], [1, 'ember'], [4, 'growl'], [8, 'flameClaw'], [13, 'warmUp'], [19, 'heatWave'], [28, 'inferno']],
    evolveTo: 'flarecat', evolveLevel: 12,
    look: { body: 'quad', ears: 'cat', tail: 'flame', eyes: 'cute', color: '#ff8a4c', accent: '#ffd36b', scale: 0.9 },
    dex: '꼬리 끝 불씨로 기분을 표현한다. 신나면 불꽃이 커진다.',
  },
  {
    id: 'flarecat', name: '화염냥', en: 'Flarecat', elements: ['blaze'], rarity: 'rare', acts: [],
    base: { hp: 68, atk: 82, def: 58, spd: 84 }, exp: 142, catchRate: 0.15,
    learnset: [[22, 'quickJab'], [34, 'echoBurst']],
    evolveTo: 'pyrolynx', evolveLevel: 28,
    look: { body: 'quad', ears: 'cat', tail: 'flame', eyes: 'fierce', color: '#ff6b3d', accent: '#ffcf4a', scale: 1.05 },
    dex: '온몸에 불꽃 갈기가 돋는다. 달릴 때 불의 궤적이 남는다.',
  },
  {
    id: 'pyrolynx', name: '파이로링스', en: 'Pyrolynx', elements: ['blaze', 'gale'], rarity: 'epic', acts: [],
    base: { hp: 82, atk: 108, def: 72, spd: 104 }, exp: 240, catchRate: 0.05,
    learnset: [[32, 'aerialSlash'], [38, 'skyfall']],
    look: { body: 'quad', ears: 'horn', tail: 'flame', eyes: 'fierce', color: '#e8452a', accent: '#ffe066', scale: 1.25 },
    dex: '열기류를 타고 하늘을 달린다. 전설 속 태양의 사냥꾼.',
  },
  {
    id: 'puddlo', name: '물몽이', en: 'Puddlo', elements: ['tide'], rarity: 'rare', acts: [],
    base: { hp: 64, atk: 56, def: 58, spd: 52 }, exp: 62, catchRate: 0.3,
    learnset: [[1, 'tackle'], [1, 'splash'], [4, 'guard'], [8, 'bubbleBeam'], [13, 'aquaVeil'], [19, 'tidalCrash'], [28, 'tsunami']],
    evolveTo: 'wavlo', evolveLevel: 12,
    look: { body: 'blob', ears: 'fin', tail: 'fin', eyes: 'cute', color: '#4cb8ff', accent: '#bdf0ff', scale: 0.9 },
    dex: '말랑한 물의 몸. 기분이 좋으면 작은 물방울을 뿜는다.',
  },
  {
    id: 'wavlo', name: '파도몽', en: 'Wavlo', elements: ['tide'], rarity: 'rare', acts: [],
    base: { hp: 86, atk: 78, def: 78, spd: 64 }, exp: 142, catchRate: 0.15,
    learnset: [[22, 'frostBreath'], [34, 'rest']],
    evolveTo: 'tsunadrake', evolveLevel: 28,
    look: { body: 'serpent', ears: 'fin', tail: 'fin', eyes: 'cute', color: '#2f8fea', accent: '#a8ecff', scale: 1.05 },
    dex: '파도를 타고 노는 것을 좋아한다. 지느러미로 해류를 읽는다.',
  },
  {
    id: 'tsunadrake', name: '츠나드레이크', en: 'Tsunadrake', elements: ['tide', 'terra'], rarity: 'epic', acts: [],
    base: { hp: 110, atk: 92, def: 100, spd: 70 }, exp: 240, catchRate: 0.05,
    learnset: [[32, 'quake'], [38, 'tectonic']],
    look: { body: 'serpent', ears: 'horn', tail: 'spike', eyes: 'fierce', color: '#1d6fd1', accent: '#7fe0ff', scale: 1.3 },
    dex: '심해와 해저 대지를 지배하는 용. 포효 한 번에 해일이 인다.',
  },
  {
    id: 'sproutle', name: '새록이', en: 'Sproutle', elements: ['bloom'], rarity: 'rare', acts: [],
    base: { hp: 58, atk: 54, def: 56, spd: 52 }, exp: 62, catchRate: 0.3,
    learnset: [[1, 'tackle'], [1, 'leafCut'], [4, 'growl'], [8, 'vineDrain'], [13, 'toxicThorn'], [19, 'petalStorm'], [28, 'solarBloom']],
    evolveTo: 'leafbear', evolveLevel: 12,
    look: { body: 'round', ears: 'leaf', tail: 'leaf', eyes: 'cute', color: '#5fd98a', accent: '#d9ffb0', scale: 0.9 },
    dex: '머리의 새싹으로 햇빛을 모은다. 낮잠을 아주 좋아한다.',
  },
  {
    id: 'leafbear', name: '잎사곰', en: 'Leafbear', elements: ['bloom'], rarity: 'rare', acts: [],
    base: { hp: 80, atk: 76, def: 74, spd: 62 }, exp: 142, catchRate: 0.15,
    learnset: [[22, 'sporeCloud'], [34, 'ironWall']],
    evolveTo: 'grovelord', evolveLevel: 28,
    look: { body: 'tall', ears: 'leaf', tail: 'leaf', eyes: 'sleepy', color: '#3fbf6a', accent: '#c6f59a', scale: 1.1 },
    dex: '등에 작은 숲을 키운다. 화나면 꽃가루를 폭풍처럼 날린다.',
  },
  {
    id: 'grovelord', name: '그로브로드', en: 'Grovelord', elements: ['bloom', 'terra'], rarity: 'epic', acts: [],
    base: { hp: 104, atk: 100, def: 98, spd: 64 }, exp: 240, catchRate: 0.05,
    learnset: [[32, 'quake'], [38, 'tectonic']],
    look: { body: 'golem', ears: 'crown', tail: 'leaf', eyes: 'fierce', color: '#2c9e55', accent: '#e8ff9a', scale: 1.3 },
    dex: '고대 숲의 수호자. 걸음마다 땅에서 새싹이 돋는다.',
  },
  // 해금 스타터
  {
    id: 'zaprit', name: '찌릿토', en: 'Zaprit', elements: ['volt'], rarity: 'rare', acts: [1],
    base: { hp: 48, atk: 58, def: 42, spd: 76 }, exp: 66, catchRate: 0.25,
    learnset: [[1, 'quickJab'], [1, 'spark'], [5, 'charge'], [9, 'voltDash'], [16, 'thunderFang'], [27, 'gigavolt']],
    evolveTo: 'voltrabbit', evolveLevel: 18,
    look: { body: 'tall', ears: 'bunny', tail: 'bolt', eyes: 'cute', color: '#ffd84a', accent: '#fff6c2', scale: 0.9 },
    dex: '귀 사이로 정전기가 튄다. 쓰다듬으면 머리카락이 선다.',
  },
  {
    id: 'voltrabbit', name: '볼트래빗', en: 'Voltrabbit', elements: ['volt'], rarity: 'epic', acts: [],
    base: { hp: 72, atk: 92, def: 62, spd: 116 }, exp: 200, catchRate: 0.08,
    learnset: [[24, 'aerialSlash'], [33, 'echoBurst']],
    look: { body: 'tall', ears: 'bunny', tail: 'bolt', eyes: 'fierce', color: '#ffc21a', accent: '#fffbe0', scale: 1.15 },
    dex: '번개보다 빠르다는 소문이 있다. 실제로 측정한 사람은 없다.',
  },
  {
    id: 'gloomouse', name: '그늘쥐', en: 'Gloomouse', elements: ['umbra'], rarity: 'rare', acts: [2],
    base: { hp: 50, atk: 66, def: 44, spd: 70 }, exp: 66, catchRate: 0.25,
    learnset: [[1, 'tackle'], [1, 'shadowBite'], [5, 'growl'], [9, 'venomFang'], [15, 'hex'], [21, 'soulDrain'], [30, 'eclipse']],
    evolveTo: 'noctifang', evolveLevel: 20,
    look: { body: 'round', ears: 'cat', tail: 'wisp', eyes: 'mono', color: '#7a55d6', accent: '#d2b8ff', scale: 0.85 },
    dex: '그림자 속에 숨어 산다. 밤이 되면 눈이 별처럼 빛난다.',
  },
  {
    id: 'noctifang', name: '녹티팡', en: 'Noctifang', elements: ['umbra'], rarity: 'epic', acts: [],
    base: { hp: 78, atk: 106, def: 66, spd: 100 }, exp: 210, catchRate: 0.08,
    learnset: [[25, 'nightmare'], [34, 'echoBurst']],
    look: { body: 'quad', ears: 'horn', tail: 'wisp', eyes: 'fierce', color: '#5a37b8', accent: '#c7a5ff', scale: 1.2 },
    dex: '악몽을 먹고 산다. 그를 본 자는 다음날 늦잠을 잔다.',
  },

  // ═════════ 야생 (액트 1 · 이끼숲) ═════════
  {
    id: 'puffeather', name: '솜깃이', en: 'Puffeather', elements: ['gale'], rarity: 'common', acts: [0, 1],
    base: { hp: 48, atk: 50, def: 44, spd: 70 }, exp: 52, catchRate: 0.55,
    learnset: [[1, 'tackle'], [1, 'gust'], [6, 'tailwind'], [11, 'aerialSlash'], [20, 'cyclone'], [30, 'skyfall']],
    evolveTo: 'galehawk', evolveLevel: 18,
    look: { body: 'bird', ears: 'none', tail: 'fluff', eyes: 'cute', color: '#bfeee9', accent: '#ffffff', scale: 0.8 },
    dex: '솜처럼 가벼워 바람만 불면 어디론가 날아간다.',
  },
  {
    id: 'galehawk', name: '게일호크', en: 'Galehawk', elements: ['gale'], rarity: 'rare', acts: [2],
    base: { hp: 70, atk: 84, def: 62, spd: 104 }, exp: 160, catchRate: 0.2,
    learnset: [[22, 'quickJab'], [30, 'skyfall']],
    look: { body: 'bird', ears: 'wing', tail: 'fluff', eyes: 'fierce', color: '#5ccfc6', accent: '#e6fffb', scale: 1.1 },
    dex: '폭풍의 눈 속을 유유히 난다. 시력이 매우 좋다.',
  },
  {
    id: 'pebblo', name: '돌돌이', en: 'Pebblo', elements: ['terra'], rarity: 'common', acts: [0, 1],
    base: { hp: 60, atk: 56, def: 72, spd: 30 }, exp: 54, catchRate: 0.55,
    learnset: [[1, 'tackle'], [1, 'pebbleShot'], [5, 'guard'], [10, 'rockSlam'], [16, 'ironWall'], [22, 'quake'], [32, 'tectonic']],
    evolveTo: 'bouldron', evolveLevel: 22,
    look: { body: 'golem', ears: 'none', tail: 'none', eyes: 'sleepy', color: '#b08d5c', accent: '#e3cfa6', scale: 0.8 },
    dex: '굴러다니는 것이 취미. 멈추면 그냥 돌과 구별이 안 된다.',
  },
  {
    id: 'bouldron', name: '볼드론', en: 'Bouldron', elements: ['terra'], rarity: 'rare', acts: [2],
    base: { hp: 92, atk: 86, def: 112, spd: 30 }, exp: 170, catchRate: 0.18,
    learnset: [[26, 'echoBurst']],
    look: { body: 'golem', ears: 'horn', tail: 'none', eyes: 'fierce', color: '#8c6b3f', accent: '#d9bd8a', scale: 1.2 },
    dex: '산 하나를 등에 업고 다닌다고 전해진다.',
  },
  {
    id: 'sporelet', name: '포자롱', en: 'Sporelet', elements: ['bloom'], rarity: 'common', acts: [0],
    base: { hp: 56, atk: 46, def: 54, spd: 40 }, exp: 50, catchRate: 0.6,
    learnset: [[1, 'leafCut'], [3, 'growl'], [7, 'toxicThorn'], [12, 'sporeCloud'], [18, 'vineDrain'], [26, 'petalStorm']],
    evolveTo: 'toadcap', evolveLevel: 20,
    look: { body: 'blob', ears: 'crown', tail: 'none', eyes: 'sleepy', color: '#e06b8a', accent: '#ffe0ea', scale: 0.8 },
    dex: '머리 위 버섯 갓에서 졸음이 오는 포자를 뿌린다.',
  },
  {
    id: 'toadcap', name: '두꺼버섯', en: 'Toadcap', elements: ['bloom', 'umbra'], rarity: 'rare', acts: [1],
    base: { hp: 86, atk: 70, def: 80, spd: 46 }, exp: 150, catchRate: 0.22,
    learnset: [[22, 'venomFang'], [28, 'soulDrain'], [34, 'solarBloom']],
    look: { body: 'blob', ears: 'crown', tail: 'none', eyes: 'mono', color: '#b23f66', accent: '#ffc6d6', scale: 1.1 },
    dex: '어두운 숲 바닥에서 독 포자를 키운다. 의외로 온순하다.',
  },
  {
    id: 'salamint', name: '살라민트', en: 'Salamint', elements: ['blaze'], rarity: 'common', acts: [0, 1],
    base: { hp: 50, atk: 58, def: 46, spd: 58 }, exp: 54, catchRate: 0.5,
    learnset: [[1, 'tackle'], [1, 'ember'], [6, 'warmUp'], [11, 'flameClaw'], [19, 'heatWave'], [29, 'inferno']],
    evolveTo: 'magmaw', evolveLevel: 21,
    look: { body: 'serpent', ears: 'none', tail: 'flame', eyes: 'cute', color: '#ff7a59', accent: '#ffe08a', scale: 0.85 },
    dex: '따뜻한 바위 위에서 일광욕하는 작은 도마뱀.',
  },
  {
    id: 'magmaw', name: '마그마우', en: 'Magmaw', elements: ['blaze', 'terra'], rarity: 'rare', acts: [2],
    base: { hp: 84, atk: 94, def: 80, spd: 56 }, exp: 170, catchRate: 0.18,
    learnset: [[24, 'quake'], [32, 'inferno']],
    look: { body: 'serpent', ears: 'horn', tail: 'spike', eyes: 'fierce', color: '#d6402b', accent: '#ffb347', scale: 1.15 },
    dex: '입 안에 작은 화산이 있다. 하품하면 불꽃이 튄다.',
  },
  {
    id: 'jellink', name: '젤링크', en: 'Jellink', elements: ['tide', 'volt'], rarity: 'rare', acts: [0, 1],
    base: { hp: 58, atk: 52, def: 50, spd: 60 }, exp: 70, catchRate: 0.35,
    learnset: [[1, 'splash'], [1, 'spark'], [8, 'bubbleBeam'], [14, 'voltDash'], [20, 'thunderFang'], [28, 'tidalCrash']],
    look: { body: 'blob', ears: 'antenna', tail: 'wisp', eyes: 'cute', color: '#7ad7ff', accent: '#fff59a', scale: 0.85 },
    dex: '전기를 띤 해파리. 서로 연결되면 거대한 발전소가 된다.',
  },
  {
    id: 'sparkbee', name: '스파크비', en: 'Sparkbee', elements: ['volt'], rarity: 'common', acts: [0, 1],
    base: { hp: 44, atk: 56, def: 40, spd: 80 }, exp: 52, catchRate: 0.55,
    learnset: [[1, 'quickJab'], [1, 'spark'], [7, 'charge'], [12, 'voltDash'], [20, 'thunderFang'], [30, 'gigavolt']],
    look: { body: 'bird', ears: 'antenna', tail: 'spike', eyes: 'cute', color: '#ffe14d', accent: '#3a3a3a', scale: 0.75 },
    dex: '꽃 대신 전기를 모은다. 벌집은 늘 따끔하다.',
  },
  {
    id: 'dunemole', name: '모래두지', en: 'Dunemole', elements: ['terra'], rarity: 'common', acts: [1],
    base: { hp: 62, atk: 72, def: 60, spd: 52 }, exp: 70, catchRate: 0.45,
    learnset: [[1, 'pebbleShot'], [1, 'growl'], [10, 'rockSlam'], [16, 'quake'], [26, 'tectonic']],
    look: { body: 'round', ears: 'none', tail: 'spike', eyes: 'sleepy', color: '#d9b06a', accent: '#fff0cc', scale: 0.85 },
    dex: '사막 아래 미로를 판다. 길치라서 자주 지상으로 나온다.',
  },
  {
    id: 'cloudlamb', name: '구름양', en: 'Cloudlamb', elements: ['gale', 'lumen'], rarity: 'rare', acts: [1],
    base: { hp: 72, atk: 50, def: 66, spd: 56 }, exp: 80, catchRate: 0.35,
    learnset: [[1, 'gust'], [1, 'glint'], [10, 'blessing'], [15, 'prism'], [22, 'cyclone'], [30, 'radiance']],
    evolveTo: 'stormram', evolveLevel: 26,
    look: { body: 'round', ears: 'horn', tail: 'fluff', eyes: 'sleepy', color: '#f3f6ff', accent: '#ffe9a8', scale: 0.9 },
    dex: '털이 진짜 구름이다. 비 오는 날엔 무거워져서 못 난다.',
  },
  {
    id: 'stormram', name: '스톰램', en: 'Stormram', elements: ['gale', 'volt'], rarity: 'epic', acts: [2],
    base: { hp: 90, atk: 94, def: 82, spd: 80 }, exp: 200, catchRate: 0.1,
    learnset: [[28, 'thunderFang'], [34, 'gigavolt']],
    look: { body: 'quad', ears: 'horn', tail: 'bolt', eyes: 'fierce', color: '#c8d6ff', accent: '#ffd84a', scale: 1.2 },
    dex: '뿔로 번개를 부른다. 폭풍우 치는 날 가장 기분이 좋다.',
  },
  {
    id: 'lampghost', name: '등불령', en: 'Lampghost', elements: ['umbra', 'blaze'], rarity: 'rare', acts: [1, 2],
    base: { hp: 54, atk: 74, def: 50, spd: 68 }, exp: 90, catchRate: 0.3,
    learnset: [[1, 'shadowBite'], [1, 'ember'], [12, 'hex'], [18, 'heatWave'], [24, 'nightmare'], [32, 'eclipse']],
    look: { body: 'blob', ears: 'none', tail: 'wisp', eyes: 'mono', color: '#6b4fc9', accent: '#ffb44a', scale: 0.9 },
    dex: '길 잃은 이를 등불로 이끈다… 어디로 이끄는지는 모른다.',
  },
  {
    id: 'starbun', name: '별토끼', en: 'Starbun', elements: ['lumen'], rarity: 'rare', acts: [1, 2],
    base: { hp: 60, atk: 56, def: 54, spd: 72 }, exp: 85, catchRate: 0.3,
    learnset: [[1, 'glint'], [1, 'quickJab'], [10, 'prism'], [16, 'blessing'], [22, 'radiance'], [32, 'supernova']],
    evolveTo: 'halorion', evolveLevel: 28,
    look: { body: 'tall', ears: 'bunny', tail: 'fluff', eyes: 'cute', color: '#fff3b8', accent: '#ff9ad5', scale: 0.85 },
    dex: '별똥별을 따라 뛰어다닌다. 소원을 들어준다는 말이 있다.',
  },
  {
    id: 'halorion', name: '헤일로리온', en: 'Halorion', elements: ['lumen'], rarity: 'epic', acts: [],
    base: { hp: 86, atk: 92, def: 80, spd: 98 }, exp: 220, catchRate: 0.08,
    learnset: [[30, 'aerialSlash'], [36, 'supernova']],
    look: { body: 'quad', ears: 'crown', tail: 'fluff', eyes: 'fierce', color: '#ffe680', accent: '#ffffff', scale: 1.2 },
    dex: '머리 위 후광이 밤하늘을 밝힌다. 성스러운 짐승.',
  },
  {
    id: 'coralcrab', name: '코랄크랩', en: 'Coralcrab', elements: ['tide', 'terra'], rarity: 'common', acts: [1, 2],
    base: { hp: 64, atk: 70, def: 84, spd: 36 }, exp: 75, catchRate: 0.45,
    learnset: [[1, 'splash'], [1, 'guard'], [10, 'rockSlam'], [16, 'bubbleBeam'], [22, 'tidalCrash'], [30, 'quake']],
    look: { body: 'golem', ears: 'antenna', tail: 'none', eyes: 'cute', color: '#ff8f8f', accent: '#ffd9c2', scale: 0.9 },
    dex: '등의 산호에 작은 물고기들이 산다. 의외로 집주인이다.',
  },
  {
    id: 'frostling', name: '서리링', en: 'Frostling', elements: ['tide', 'gale'], rarity: 'rare', acts: [2],
    base: { hp: 66, atk: 74, def: 62, spd: 76 }, exp: 110, catchRate: 0.25,
    learnset: [[1, 'splash'], [1, 'gust'], [12, 'frostBreath'], [20, 'aerialSlash'], [28, 'tsunami']],
    look: { body: 'round', ears: 'crown', tail: 'wisp', eyes: 'cute', color: '#c9f1ff', accent: '#7fc8ff', scale: 0.9 },
    dex: '숨결이 닿는 곳마다 서리꽃이 핀다.',
  },

  // ═════════ 보스 ═════════
  {
    id: 'mossking', name: '이끼왕 모스킹', en: 'Mossking', elements: ['bloom', 'terra'], rarity: 'legend', acts: [],
    base: { hp: 120, atk: 78, def: 92, spd: 46 }, exp: 300, catchRate: 0,
    learnset: [[1, 'leafCut'], [1, 'vineDrain'], [1, 'rockSlam'], [1, 'sporeCloud']],
    look: { body: 'golem', ears: 'crown', tail: 'leaf', eyes: 'fierce', color: '#4a8f3a', accent: '#c6ff7a', scale: 1.35 },
    dex: '[액트1 보스] 이끼숲의 오래된 지배자. 천 년째 잠에서 덜 깼다.',
  },
  {
    id: 'tempestwyrm', name: '폭풍룡 템페스트', en: 'Tempestwyrm', elements: ['gale', 'volt'], rarity: 'legend', acts: [],
    base: { hp: 128, atk: 104, def: 84, spd: 96 }, exp: 420, catchRate: 0,
    learnset: [[1, 'spark'], [1, 'aerialSlash'], [1, 'thunderFang'], [1, 'gigavolt']],
    look: { body: 'serpent', ears: 'wing', tail: 'bolt', eyes: 'fierce', color: '#6aa8ff', accent: '#fff07a', scale: 1.4 },
    dex: '[액트2 보스] 하늘 협곡의 폭풍을 몸에 두른 용.',
  },
  {
    id: 'eclipsion', name: '에코코어 이클립시온', en: 'Eclipsion', elements: ['umbra', 'lumen'], rarity: 'legend', acts: [],
    base: { hp: 150, atk: 116, def: 96, spd: 92 }, exp: 600, catchRate: 0,
    learnset: [[1, 'shadowBite'], [1, 'soulDrain'], [1, 'radiance'], [1, 'eclipse']],
    look: { body: 'round', ears: 'crown', tail: 'wisp', eyes: 'mono', color: '#2d1a5c', accent: '#ffe680', scale: 1.45 },
    dex: '[최종 보스] 모든 에코의 근원. 빛과 어둠이 하나로 맞물린 존재.',
  },
];

export const SPECIES: Record<string, Species> = Object.fromEntries(list.map((s) => [s.id, s]));
export const SPECIES_LIST = list;

export const STARTERS = ['embercat', 'puddlo', 'sproutle', 'zaprit', 'gloomouse'] as const;
export const DEFAULT_STARTERS = ['embercat', 'puddlo', 'sproutle'];

export const BOSSES = ['mossking', 'tempestwyrm', 'eclipsion'];

export function getSpecies(id: string): Species {
  const s = SPECIES[id];
  if (!s) throw new Error('Unknown species: ' + id);
  return s;
}

export function wildPool(act: number): Species[] {
  return list.filter((s) => s.acts.includes(act));
}
