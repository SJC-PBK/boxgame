// Boxworld v3 — Unified Catalog of Blocks, Ores, Farming, Furnaces, Items, Tools & Recipes

export const WORLD_BOUNDS = {
  minX: -512,
  maxX: 511,
  minY: 0,
  maxY: 95,
  minZ: -512,
  maxZ: 511
};

export const WORLD_SIZE_X = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + 1; // 1024
export const WORLD_SIZE_Y = WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY + 1; // 96
export const WORLD_SIZE_Z = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ + 1; // 1024
export const WORLD_VOLUME = WORLD_SIZE_X * WORLD_SIZE_Y * WORLD_SIZE_Z;

export const BAG_SIZE = 36;   // 9 hotbar + 27 bag slots (3 rows!)
export const CHEST_SIZE = 27;

// Placeable blocks (numId 1..30; 0 = air)
export const BLOCKS = {
  bedrock:     { numId: 1,  id: 'bedrock',     name: '기반암',       transparent: false, solid: true,  hardness: Infinity, preferredTool: 'pickaxe', minTier: 99, drop: null,          sound: 'stone', stackable: 64, category: '자연' },
  grass:       { numId: 2,  id: 'grass',       name: '잔디 블록',    transparent: false, solid: true,  hardness: 0.65,     preferredTool: 'shovel',  minTier: 0,  drop: 'dirt',        sound: 'dirt',  stackable: 64, category: '자연' },
  dirt:        { numId: 3,  id: 'dirt',        name: '흙',           transparent: false, solid: true,  hardness: 0.6,      preferredTool: 'shovel',  minTier: 0,  drop: 'dirt',        sound: 'dirt',  stackable: 64, category: '자연' },
  stone:       { numId: 4,  id: 'stone',       name: '돌',           transparent: false, solid: true,  hardness: 2.2,      preferredTool: 'pickaxe', minTier: 1,  drop: 'cobble',      sound: 'stone', stackable: 64, category: '자연' },
  cobble:      { numId: 5,  id: 'cobble',      name: '조약돌',       transparent: false, solid: true,  hardness: 2.0,      preferredTool: 'pickaxe', minTier: 1,  drop: 'cobble',      sound: 'stone', stackable: 64, category: '건축' },
  wood:        { numId: 6,  id: 'wood',        name: '원목',         transparent: false, solid: true,  hardness: 1.6,      preferredTool: 'axe',     minTier: 0,  drop: 'wood',        sound: 'wood',  stackable: 64, category: '자연' },
  planks:      { numId: 7,  id: 'planks',      name: '목재 판자',    transparent: false, solid: true,  hardness: 1.3,      preferredTool: 'axe',     minTier: 0,  drop: 'planks',      sound: 'wood',  stackable: 64, category: '건축' },
  leaves:      { numId: 8,  id: 'leaves',      name: '나뭇잎',       transparent: true,  solid: true,  hardness: 0.25,     preferredTool: 'axe',     minTier: 0,  drop: 'leaves',      sound: 'dirt',  stackable: 64, category: '자연' },
  brick:       { numId: 9,  id: 'brick',       name: '벽돌',         transparent: false, solid: true,  hardness: 2.0,      preferredTool: 'pickaxe', minTier: 1,  drop: 'brick',       sound: 'stone', stackable: 64, category: '건축' },
  glass:       { numId: 10, id: 'glass',       name: '유리',         transparent: true,  solid: true,  hardness: 0.35,     preferredTool: null,      minTier: 0,  drop: 'glass',       sound: 'glass', stackable: 64, category: '건축' },
  sand:        { numId: 11, id: 'sand',        name: '모래',         transparent: false, solid: true,  hardness: 0.55,     preferredTool: 'shovel',  minTier: 0,  drop: 'sand',        sound: 'dirt',  stackable: 64, category: '자연' },
  water:       { numId: 12, id: 'water',       name: '물',           transparent: true,  solid: false, hardness: Infinity, preferredTool: null,      minTier: 99, drop: null,          sound: 'dirt',  stackable: 64, category: '자연' },
  coal_ore:    { numId: 13, id: 'coal_ore',    name: '석탄 광석',    transparent: false, solid: true,  hardness: 2.8,      preferredTool: 'pickaxe', minTier: 1,  drop: 'coal',        sound: 'stone', stackable: 64, category: '광물' },
  iron_ore:    { numId: 14, id: 'iron_ore',    name: '철 광석',      transparent: false, solid: true,  hardness: 3.6,      preferredTool: 'pickaxe', minTier: 2,  drop: 'raw_iron',    sound: 'stone', stackable: 64, category: '광물' },
  gold_ore:    { numId: 15, id: 'gold_ore',    name: '금 광석',      transparent: false, solid: true,  hardness: 4.2,      preferredTool: 'pickaxe', minTier: 3,  drop: 'raw_gold',    sound: 'stone', stackable: 64, category: '광물' },
  diamond_ore: { numId: 16, id: 'diamond_ore', name: '다이아 광석',  transparent: false, solid: true,  hardness: 5.0,      preferredTool: 'pickaxe', minTier: 3,  drop: 'diamond_gem', sound: 'stone', stackable: 64, category: '광물' },
  gold:        { numId: 17, id: 'gold',        name: '금 블록',      transparent: false, solid: true,  hardness: 2.5,      preferredTool: 'pickaxe', minTier: 2,  drop: 'gold',        sound: 'stone', stackable: 64, category: '장식' },
  diamond:     { numId: 18, id: 'diamond',     name: '다이아 블록',  transparent: false, solid: true,  hardness: 3.2,      preferredTool: 'pickaxe', minTier: 3,  drop: 'diamond',     sound: 'stone', stackable: 64, category: '장식' },
  lamp:        { numId: 19, id: 'lamp',        name: '조명 블록',    transparent: false, solid: true,  hardness: 0.4,      preferredTool: null,      minTier: 0,  drop: 'lamp',        sound: 'glass', stackable: 64, category: '장식' },
  wool_white:  { numId: 20, id: 'wool_white',  name: '하양 양털',    transparent: false, solid: true,  hardness: 0.6,      preferredTool: null,      minTier: 0,  drop: 'wool_white',  sound: 'dirt',  stackable: 64, category: '양털' },
  wool_red:    { numId: 21, id: 'wool_red',    name: '빨강 양털',    transparent: false, solid: true,  hardness: 0.6,      preferredTool: null,      minTier: 0,  drop: 'wool_red',    sound: 'dirt',  stackable: 64, category: '양털' },
  wool_blue:   { numId: 22, id: 'wool_blue',   name: '파랑 양털',    transparent: false, solid: true,  hardness: 0.6,      preferredTool: null,      minTier: 0,  drop: 'wool_blue',   sound: 'dirt',  stackable: 64, category: '양털' },
  wool_yellow: { numId: 23, id: 'wool_yellow', name: '노랑 양털',    transparent: false, solid: true,  hardness: 0.6,      preferredTool: null,      minTier: 0,  drop: 'wool_yellow', sound: 'dirt',  stackable: 64, category: '양털' },
  chest:       { numId: 24, id: 'chest',       name: '보관 상자',    transparent: false, solid: true,  hardness: 1.5,      preferredTool: 'axe',     minTier: 0,  drop: 'chest',       sound: 'wood',  stackable: 16, category: '기능' },
  sapling:     { numId: 25, id: 'sapling',     name: '나무 묘목',    transparent: true,  solid: false, hardness: 0.15,     preferredTool: null,      minTier: 0,  drop: 'sapling',     sound: 'dirt',  stackable: 64, category: '자연' },
  furnace:     { numId: 26, id: 'furnace',     name: '화로',         transparent: false, solid: true,  hardness: 2.2,      preferredTool: 'pickaxe', minTier: 1,  drop: 'furnace',     sound: 'stone', stackable: 16, category: '기능' },
  farmland:    { numId: 27, id: 'farmland',    name: '경작지',       transparent: false, solid: true,  hardness: 0.6,      preferredTool: 'shovel',  minTier: 0,  drop: 'dirt',        sound: 'dirt',  stackable: 64, category: '농사' },
  wheat_1:     { numId: 28, id: 'wheat_1',     name: '밀 새싹',      transparent: true,  solid: false, hardness: 0.1,      preferredTool: null,      minTier: 0,  drop: 'wheat_seeds', sound: 'dirt',  stackable: 64, category: '농사' },
  wheat_2:     { numId: 29, id: 'wheat_2',     name: '자라는 밀',    transparent: true,  solid: false, hardness: 0.1,      preferredTool: null,      minTier: 0,  drop: 'wheat_seeds', sound: 'dirt',  stackable: 64, category: '농사' },
  wheat_3:     { numId: 30, id: 'wheat_3',     name: '익은 밀',      transparent: true,  solid: false, hardness: 0.12,     preferredTool: null,      minTier: 0,  drop: 'wheat',       sound: 'dirt',  stackable: 64, category: '농사' },
  bed:         { numId: 31, id: 'bed',         name: '침대',         transparent: false, solid: true,  hardness: 0.5,      preferredTool: 'axe',     minTier: 0,  drop: 'bed',         sound: 'wood',  stackable: 4,  category: '기능' },
  door_closed: { numId: 32, id: 'door_closed', name: '나무 문',      transparent: true,  solid: true,  hardness: 1.2,      preferredTool: 'axe',     minTier: 0,  drop: 'door_closed', sound: 'wood',  stackable: 16, category: '기능' },
  door_open:   { numId: 33, id: 'door_open',   name: '열린 문',      transparent: true,  solid: false, hardness: 1.2,      preferredTool: 'axe',     minTier: 0,  drop: 'door_closed', sound: 'wood',  stackable: 16, category: '기능' },
  ladder:      { numId: 34, id: 'ladder',      name: '사다리',       transparent: true,  solid: false, hardness: 0.4,      preferredTool: 'axe',     minTier: 0,  drop: 'ladder',      sound: 'wood',  stackable: 64, category: '기능' },
  sign:        { numId: 35, id: 'sign',        name: '표지판',       transparent: true,  solid: false, hardness: 0.5,      preferredTool: 'axe',     minTier: 0,  drop: 'sign',        sound: 'wood',  stackable: 16, category: '기능' },
  tnt:         { numId: 36, id: 'tnt',         name: 'TNT 폭탄',     transparent: false, solid: true,  hardness: 0.25,     preferredTool: null,      minTier: 0,  drop: 'tnt',         sound: 'dirt',  stackable: 16, category: '특수' },
  portal:      { numId: 37, id: 'portal',      name: '순간이동 포털', transparent: true,  solid: false, hardness: 1.8,      preferredTool: 'pickaxe', minTier: 1,  drop: 'portal',      sound: 'glass', stackable: 8,  category: '특수' },
  jumppad:     { numId: 38, id: 'jumppad',     name: '점프 패드',    transparent: false, solid: true,  hardness: 0.8,      preferredTool: 'pickaxe', minTier: 0,  drop: 'jumppad',     sound: 'stone', stackable: 16, category: '특수' },
  // Job Village: Barista Cafe interactive stations
  job_counter:  { numId: 39, id: 'job_counter',  name: '🧾 주문 카운터', transparent: false, solid: true, hardness: Infinity, preferredTool: null, minTier: 99, drop: null, sound: 'wood',  stackable: 1, category: '직업체험' },
  job_espresso: { numId: 40, id: 'job_espresso', name: '☕ 커피머신',    transparent: false, solid: true, hardness: Infinity, preferredTool: null, minTier: 99, drop: null, sound: 'stone', stackable: 1, category: '직업체험' },
  job_fridge:   { numId: 41, id: 'job_fridge',   name: '🧊 재료 냉장고', transparent: false, solid: true, hardness: Infinity, preferredTool: null, minTier: 99, drop: null, sound: 'stone', stackable: 1, category: '직업체험' },
  job_mixer:    { numId: 42, id: 'job_mixer',    name: '🥤 음료 조합대', transparent: false, solid: true, hardness: Infinity, preferredTool: null, minTier: 99, drop: null, sound: 'wood',  stackable: 1, category: '직업체험' },
  job_pickup:   { numId: 43, id: 'job_pickup',   name: '🛎️ 픽업 서빙대', transparent: false, solid: true, hardness: Infinity, preferredTool: null, minTier: 99, drop: null, sound: 'wood',  stackable: 1, category: '직업체험' },
  fuse:         { numId: 44, id: 'fuse',         name: '도화선 (심지)', transparent: true,  solid: false, hardness: 0.1,      preferredTool: null, minTier: 0,  drop: 'fuse', sound: 'dirt',  stackable: 64, category: '특수' },
  fill_bomb:    { numId: 45, id: 'fill_bomb',    name: '흙 채움 폭탄', transparent: false, solid: true,  hardness: 0.25,     preferredTool: null, minTier: 0,  drop: 'fill_bomb', sound: 'dirt', stackable: 16, category: '특수' },
  water_bomb:   { numId: 46, id: 'water_bomb',   name: '물 채움 폭탄', transparent: false, solid: true,  hardness: 0.25,     preferredTool: null, minTier: 0,  drop: 'water_bomb', sound: 'glass', stackable: 16, category: '특수' }
};

export const NUM_TO_BLOCK = {};
for (const b of Object.values(BLOCKS)) {
  NUM_TO_BLOCK[b.numId] = b.id;
}

export const ITEMS = {
  // Materials & Farming & Food
  stick:       { id: 'stick',       name: '막대기',       kind: 'item', stackable: 64, category: '재료' },
  coal:        { id: 'coal',        name: '석탄',         kind: 'item', stackable: 64, category: '재료', fuelPower: 4 },
  raw_iron:    { id: 'raw_iron',    name: '철 원석',      kind: 'item', stackable: 64, category: '재료' },
  iron_ingot:  { id: 'iron_ingot',  name: '철 주괴',      kind: 'item', stackable: 64, category: '재료' },
  raw_gold:    { id: 'raw_gold',    name: '금 원석',      kind: 'item', stackable: 64, category: '재료' },
  gold_ingot:  { id: 'gold_ingot',  name: '금 주괴',      kind: 'item', stackable: 64, category: '재료' },
  diamond_gem: { id: 'diamond_gem', name: '다이아몬드',   kind: 'item', stackable: 64, category: '재료' },
  wheat_seeds: { id: 'wheat_seeds', name: '밀 씨앗',      kind: 'seed', stackable: 64, category: '농사' },
  wheat:       { id: 'wheat',       name: '밀',           kind: 'item', stackable: 64, category: '농사' },
  apple:       { id: 'apple',       name: '사과 (과일)',  kind: 'food', stackable: 32, category: '음식', heal: 4,  hunger: 6 },
  bread:       { id: 'bread',       name: '빵',           kind: 'food', stackable: 32, category: '음식', heal: 6,  hunger: 8 },
  raw_meat:    { id: 'raw_meat',    name: '생고기',       kind: 'food', stackable: 32, category: '음식', heal: 2,  hunger: 3 },
  cooked_meat: { id: 'cooked_meat', name: '구운 고기',    kind: 'food', stackable: 32, category: '음식', heal: 10, hunger: 12 },
  detonator:   { id: 'detonator',   name: 'TNT 폭파 리모컨', kind: 'item', stackable: 1, category: '특수' },

  // Pickaxes
  wood_pickaxe:    { id: 'wood_pickaxe',    name: '나무 곡괭이',   kind: 'tool', toolType: 'pickaxe', tier: 1, speed: 2.4, color: '#a16207', stackable: 1, category: '도구' },
  stone_pickaxe:   { id: 'stone_pickaxe',   name: '돌 곡괭이',     kind: 'tool', toolType: 'pickaxe', tier: 2, speed: 4.0, color: '#94a3b8', stackable: 1, category: '도구' },
  iron_pickaxe:    { id: 'iron_pickaxe',    name: '철 곡괭이',     kind: 'tool', toolType: 'pickaxe', tier: 3, speed: 6.2, color: '#e2e8f0', stackable: 1, category: '도구' },
  diamond_pickaxe: { id: 'diamond_pickaxe', name: '다이아 곡괭이', kind: 'tool', toolType: 'pickaxe', tier: 4, speed: 9.5, color: '#22d3ee', stackable: 1, category: '도구' },

  // Axes
  wood_axe:    { id: 'wood_axe',    name: '나무 도끼',   kind: 'tool', toolType: 'axe', tier: 1, speed: 2.5, color: '#a16207', stackable: 1, category: '도구' },
  stone_axe:   { id: 'stone_axe',   name: '돌 도끼',     kind: 'tool', toolType: 'axe', tier: 2, speed: 4.2, color: '#94a3b8', stackable: 1, category: '도구' },
  iron_axe:    { id: 'iron_axe',    name: '철 도끼',     kind: 'tool', toolType: 'axe', tier: 3, speed: 6.5, color: '#e2e8f0', stackable: 1, category: '도구' },
  diamond_axe: { id: 'diamond_axe', name: '다이아 도끼', kind: 'tool', toolType: 'axe', tier: 4, speed: 9.5, color: '#22d3ee', stackable: 1, category: '도구' },

  // Shovels
  wood_shovel:    { id: 'wood_shovel',    name: '나무 삽',   kind: 'tool', toolType: 'shovel', tier: 1, speed: 2.5, color: '#a16207', stackable: 1, category: '도구' },
  stone_shovel:   { id: 'stone_shovel',   name: '돌 삽',     kind: 'tool', toolType: 'shovel', tier: 2, speed: 4.2, color: '#94a3b8', stackable: 1, category: '도구' },
  iron_shovel:    { id: 'iron_shovel',    name: '철 삽',     kind: 'tool', toolType: 'shovel', tier: 3, speed: 6.5, color: '#e2e8f0', stackable: 1, category: '도구' },
  diamond_shovel: { id: 'diamond_shovel', name: '다이아 삽', kind: 'tool', toolType: 'shovel', tier: 4, speed: 9.5, color: '#22d3ee', stackable: 1, category: '도구' },

  // Hoes (괭이 — for farming!)
  wood_hoe:  { id: 'wood_hoe',  name: '나무 괭이', kind: 'tool', toolType: 'hoe', tier: 1, speed: 2.0, color: '#a16207', stackable: 1, category: '도구' },
  stone_hoe: { id: 'stone_hoe', name: '돌 괭이',   kind: 'tool', toolType: 'hoe', tier: 2, speed: 3.5, color: '#94a3b8', stackable: 1, category: '도구' },
  iron_hoe:  { id: 'iron_hoe',  name: '철 괭이',   kind: 'tool', toolType: 'hoe', tier: 3, speed: 5.5, color: '#e2e8f0', stackable: 1, category: '도구' },

  // Job Village: Barista Ingredients
  cup:           { id: 'cup',           name: '빈 컵',        kind: 'item', stackable: 16, category: '카페재료' },
  espresso:      { id: 'espresso',      name: '에스프레소 샷', kind: 'item', stackable: 16, category: '카페재료' },
  water_cup:     { id: 'water_cup',     name: '정수 (물)',    kind: 'item', stackable: 16, category: '카페재료' },
  ice:           { id: 'ice',           name: '얼음',         kind: 'item', stackable: 16, category: '카페재료' },
  milk:          { id: 'milk',          name: '우유',         kind: 'item', stackable: 16, category: '카페재료' },
  syrup_vanilla: { id: 'syrup_vanilla', name: '바닐라 시럽',  kind: 'item', stackable: 16, category: '카페재료' },
  syrup_choco:   { id: 'syrup_choco',   name: '초코 시럽',    kind: 'item', stackable: 16, category: '카페재료' },
  syrup_berry:   { id: 'syrup_berry',   name: '딸기 시럽',    kind: 'item', stackable: 16, category: '카페재료' },

  // Job Village: Finished Drinks
  drink_americano:     { id: 'drink_americano',     name: '따뜻한 아메리카노',  kind: 'item', stackable: 8, category: '완성음료' },
  drink_ice_americano: { id: 'drink_ice_americano', name: '아이스 아메리카노',  kind: 'item', stackable: 8, category: '완성음료' },
  drink_latte:         { id: 'drink_latte',         name: '따뜻한 카페라떼',    kind: 'item', stackable: 8, category: '완성음료' },
  drink_ice_latte:     { id: 'drink_ice_latte',     name: '아이스 카페라떼',    kind: 'item', stackable: 8, category: '완성음료' },
  drink_vanilla_latte: { id: 'drink_vanilla_latte', name: '아이스 바닐라 라떼', kind: 'item', stackable: 8, category: '완성음료' },
  drink_choco_latte:   { id: 'drink_choco_latte',   name: '아이스 초코 라떼',   kind: 'item', stackable: 8, category: '완성음료' },
  drink_berry_latte:   { id: 'drink_berry_latte',   name: '딸기 라떼',          kind: 'item', stackable: 8, category: '완성음료' }
};

export const CAFE_FRIDGE_ITEMS = ['cup', 'water_cup', 'ice', 'milk', 'syrup_vanilla', 'syrup_choco', 'syrup_berry'];

export const CAFE_RECIPES = [
  { id: 'drink_americano',     name: '따뜻한 아메리카노',  ingredients: ['cup', 'water_cup', 'espresso'],                       tip: '컵 + 정수 + 에스프레소' },
  { id: 'drink_ice_americano', name: '아이스 아메리카노',  ingredients: ['cup', 'ice', 'water_cup', 'espresso'],                tip: '컵 + 얼음 + 정수 + 에스프레소' },
  { id: 'drink_latte',         name: '따뜻한 카페라떼',    ingredients: ['cup', 'milk', 'espresso'],                            tip: '컵 + 우유 + 에스프레소' },
  { id: 'drink_ice_latte',     name: '아이스 카페라떼',    ingredients: ['cup', 'ice', 'milk', 'espresso'],                     tip: '컵 + 얼음 + 우유 + 에스프레소' },
  { id: 'drink_vanilla_latte', name: '아이스 바닐라 라떼', ingredients: ['cup', 'ice', 'milk', 'espresso', 'syrup_vanilla'],    tip: '컵 + 얼음 + 우유 + 에스프레소 + 바닐라 시럽' },
  { id: 'drink_choco_latte',   name: '아이스 초코 라떼',   ingredients: ['cup', 'ice', 'milk', 'syrup_choco'],                  tip: '컵 + 얼음 + 우유 + 초코 시럽' },
  { id: 'drink_berry_latte',   name: '딸기 라떼',          ingredients: ['cup', 'ice', 'milk', 'syrup_berry'],                  tip: '컵 + 얼음 + 우유 + 딸기 시럽' }
];

// Furnace smelting recipes (input -> output)
export const SMELT_MAP = {
  raw_iron: { out: 'iron_ingot', count: 1 },
  raw_gold: { out: 'gold_ingot', count: 1 },
  sand:     { out: 'glass',      count: 1 },
  cobble:   { out: 'stone',      count: 1 },
  raw_meat: { out: 'cooked_meat', count: 1 }
};

export const FUEL_POWER = {
  coal: 6,
  wood: 3,
  planks: 2,
  stick: 1
};

export const CATALOG = {};
for (const b of Object.values(BLOCKS)) CATALOG[b.id] = { ...b, kind: 'block' };
for (const it of Object.values(ITEMS)) CATALOG[it.id] = { ...it };

export const TIER_NAMES = {
  0: '맨손',
  1: '나무 곡괭이',
  2: '돌 곡괭이',
  3: '철 곡괭이',
  4: '다이아 곡괭이'
};

export const RECIPES = [
  // Basic materials & food
  { id: 'r-planks',   category: '재료', out: { item: 'planks', count: 4 },   in: [{ item: 'wood', count: 1 }] },
  { id: 'r-stick',    category: '재료', out: { item: 'stick', count: 4 },    in: [{ item: 'planks', count: 2 }] },
  { id: 'r-bread',    category: '재료', out: { item: 'bread', count: 1 },    in: [{ item: 'wheat', count: 3 }] },

  // Functional & Building
  { id: 'r-chest',    category: '건축', out: { item: 'chest', count: 1 },       in: [{ item: 'planks', count: 8 }] },
  { id: 'r-furnace',  category: '건축', out: { item: 'furnace', count: 1 },     in: [{ item: 'cobble', count: 8 }] },
  { id: 'r-bed',      category: '건축', out: { item: 'bed', count: 1 },         in: [{ item: 'planks', count: 3 }, { item: 'wool_white', count: 3 }] },
  { id: 'r-door',     category: '건축', out: { item: 'door_closed', count: 2 }, in: [{ item: 'planks', count: 6 }] },
  { id: 'r-ladder',   category: '건축', out: { item: 'ladder', count: 4 },      in: [{ item: 'stick', count: 6 }] },
  { id: 'r-sign',     category: '건축', out: { item: 'sign', count: 2 },        in: [{ item: 'planks', count: 4 }, { item: 'stick', count: 1 }] },
  { id: 'r-tnt',       category: '특수', out: { item: 'tnt', count: 1 },         in: [{ item: 'sand', count: 4 }, { item: 'coal', count: 4 }] },
  { id: 'r-fill-bomb',  category: '특수', out: { item: 'fill_bomb', count: 1 },   in: [{ item: 'dirt', count: 8 }, { item: 'coal', count: 2 }] },
  { id: 'r-water-bomb', category: '특수', out: { item: 'water_bomb', count: 1 },  in: [{ item: 'glass', count: 4 }, { item: 'sand', count: 4 }, { item: 'coal', count: 2 }] },
  { id: 'r-fuse',      category: '특수', out: { item: 'fuse', count: 8 },        in: [{ item: 'coal', count: 1 }, { item: 'stick', count: 1 }] },
  { id: 'r-detonator', category: '특수', out: { item: 'detonator', count: 1 },   in: [{ item: 'iron_ingot', count: 2 }, { item: 'coal', count: 1 }] },
  { id: 'r-portal',   category: '특수', out: { item: 'portal', count: 2 },      in: [{ item: 'diamond_gem', count: 1 }, { item: 'glass', count: 4 }] },
  { id: 'r-jumppad',  category: '특수', out: { item: 'jumppad', count: 2 },     in: [{ item: 'iron_ingot', count: 2 }, { item: 'wool_yellow', count: 2 }] },
  { id: 'r-lamp',     category: '건축', out: { item: 'lamp', count: 4 },     in: [{ item: 'coal', count: 1 }, { item: 'stick', count: 1 }] },
  { id: 'r-glass',    category: '건축', out: { item: 'glass', count: 4 },    in: [{ item: 'sand', count: 4 }, { item: 'coal', count: 1 }] },
  { id: 'r-brick',    category: '건축', out: { item: 'brick', count: 4 },    in: [{ item: 'cobble', count: 4 }, { item: 'coal', count: 1 }] },
  { id: 'r-gold-blk', category: '건축', out: { item: 'gold', count: 1 },     in: [{ item: 'gold_ingot', count: 4 }] },
  { id: 'r-dia-blk',  category: '건축', out: { item: 'diamond', count: 1 },  in: [{ item: 'diamond_gem', count: 4 }] },

  // Quick smelting (also available in Furnace block!)
  { id: 'r-iron',     category: '제련', out: { item: 'iron_ingot', count: 2 }, in: [{ item: 'raw_iron', count: 1 }, { item: 'coal', count: 1 }] },
  { id: 'r-gold',     category: '제련', out: { item: 'gold_ingot', count: 2 }, in: [{ item: 'raw_gold', count: 1 }, { item: 'coal', count: 1 }] },
  { id: 'r-meat',     category: '제련', out: { item: 'cooked_meat', count: 1 }, in: [{ item: 'raw_meat', count: 1 }, { item: 'coal', count: 1 }] },

  // Wood tools
  { id: 'r-wpick',   category: '도구', out: { item: 'wood_pickaxe', count: 1 }, in: [{ item: 'planks', count: 3 }, { item: 'stick', count: 2 }] },
  { id: 'r-waxe',    category: '도구', out: { item: 'wood_axe', count: 1 },     in: [{ item: 'planks', count: 3 }, { item: 'stick', count: 2 }] },
  { id: 'r-wshovel', category: '도구', out: { item: 'wood_shovel', count: 1 },  in: [{ item: 'planks', count: 1 }, { item: 'stick', count: 2 }] },
  { id: 'r-whoe',    category: '도구', out: { item: 'wood_hoe', count: 1 },     in: [{ item: 'planks', count: 2 }, { item: 'stick', count: 2 }] },

  // Stone tools
  { id: 'r-spick',   category: '도구', out: { item: 'stone_pickaxe', count: 1 }, in: [{ item: 'cobble', count: 3 }, { item: 'stick', count: 2 }] },
  { id: 'r-saxe',    category: '도구', out: { item: 'stone_axe', count: 1 },     in: [{ item: 'cobble', count: 3 }, { item: 'stick', count: 2 }] },
  { id: 'r-sshovel', category: '도구', out: { item: 'stone_shovel', count: 1 },  in: [{ item: 'cobble', count: 1 }, { item: 'stick', count: 2 }] },
  { id: 'r-shoe',    category: '도구', out: { item: 'stone_hoe', count: 1 },     in: [{ item: 'cobble', count: 2 }, { item: 'stick', count: 2 }] },

  // Iron tools
  { id: 'r-ipick',   category: '도구', out: { item: 'iron_pickaxe', count: 1 }, in: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }] },
  { id: 'r-iaxe',    category: '도구', out: { item: 'iron_axe', count: 1 },     in: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }] },
  { id: 'r-ishovel', category: '도구', out: { item: 'iron_shovel', count: 1 },  in: [{ item: 'iron_ingot', count: 1 }, { item: 'stick', count: 2 }] },
  { id: 'r-ihoe',    category: '도구', out: { item: 'iron_hoe', count: 1 },     in: [{ item: 'iron_ingot', count: 2 }, { item: 'stick', count: 2 }] },

  // Diamond tools
  { id: 'r-dpick',   category: '도구', out: { item: 'diamond_pickaxe', count: 1 }, in: [{ item: 'diamond_gem', count: 3 }, { item: 'stick', count: 2 }] },
  { id: 'r-daxe',    category: '도구', out: { item: 'diamond_axe', count: 1 },     in: [{ item: 'diamond_gem', count: 3 }, { item: 'stick', count: 2 }] },
  { id: 'r-dshovel', category: '도구', out: { item: 'diamond_shovel', count: 1 },  in: [{ item: 'diamond_gem', count: 1 }, { item: 'stick', count: 2 }] }
];

export function createStarterTools() {
  return {
    pickaxe: 'wood_pickaxe',
    axe:     'wood_axe',
    shovel:  'wood_shovel',
    hoe:     'wood_hoe'
  };
}

export function createStarterBag() {
  const slots = Array(BAG_SIZE).fill(null);
  // Hotbar slots 1..4 (indices 0..3) intentionally left EMPTY so newly mined items pop right into slots 1..4!
  // Tools are stored in dedicated player.tools (0 bag slots occupied)!
  slots[4] = { block: 'planks', count: 24 };
  slots[5] = { block: 'wheat_seeds', count: 8 };
  slots[6] = { block: 'sapling', count: 3 };
  slots[7] = { block: 'apple', count: 4 };
  slots[8] = { block: 'chest', count: 2 };
  return slots;
}
