// blockRegistry.js
export const BLOCK_TYPES = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,
  LEAF: 6,
  WATER: 7,
  SNOW: 8,
  COBBLESTONE: 9,
  GLOWSTONE: 10,
  OBSIDIAN: 11,
  GLASS: 12,
  EMERALD: 13,
  RUBY: 14,
  GOLD: 15,
  IRON: 16,
  COAL: 17,
  GRAVEL: 18,
  CLAY: 19,
  BRICK: 20,
  WOOL: 21,
  TORCH: 22,
  TALL_GRASS: 23,
  FLOWER: 24,
};

// Updated vibrant colors (sRGB 0-255, converted to 0-1 for Three.js)
export const BLOCK_DEFINITIONS = [
  { id: 0, name: "Air", color: [1, 0, 1], solid: false, transparent: true },
  { id: 1, name: "Grass", color: [0.42, 0.78, 0.22], solid: true }, // Vibrant Green
  { id: 2, name: "Dirt", color: [0.61, 0.41, 0.22], solid: true }, // Rich Brown
  { id: 3, name: "Stone", color: [0.65, 0.65, 0.68], solid: true }, // Light Grey
  { id: 4, name: "Sand", color: [0.94, 0.87, 0.68], solid: true }, // Bright Beige
  { id: 5, name: "Wood", color: [0.49, 0.35, 0.25], solid: true }, // Dark Oak
  { id: 6, name: "Leaf", color: [0.29, 0.59, 0.2], solid: true }, // Forest Green
  {
    id: 7,
    name: "Water",
    color: [0.2, 0.5, 0.95],
    solid: false,
    transparent: true,
  }, // Deep Blue
  { id: 8, name: "Snow", color: [1.0, 1.0, 1.0], solid: true },
  { id: 9, name: "Cobblestone", color: [0.45, 0.48, 0.5], solid: true },
  {
    id: 10,
    name: "Glowstone",
    color: [1.0, 0.95, 0.6],
    solid: true,
    lightValue: 15,
  },
  { id: 11, name: "Obsidian", color: [0.1, 0.1, 0.12], solid: true },
  {
    id: 12,
    name: "Glass",
    color: [0.85, 0.95, 1.0],
    solid: false,
    transparent: true,
  },
  { id: 13, name: "Emerald", color: [0.2, 0.85, 0.6], solid: true },
  { id: 14, name: "Ruby", color: [1.0, 0.2, 0.4], solid: true },
  { id: 15, name: "Gold", color: [0.95, 0.8, 0.4], solid: true },
  { id: 16, name: "Iron", color: [0.85, 0.85, 0.9], solid: true },
  { id: 17, name: "Coal", color: [0.15, 0.15, 0.15], solid: true },
  { id: 18, name: "Gravel", color: [0.55, 0.52, 0.5], solid: true },
  { id: 19, name: "Clay", color: [0.65, 0.75, 0.85], solid: true },
  { id: 20, name: "Brick", color: [0.75, 0.3, 0.25], solid: true },
  { id: 21, name: "Wool", color: [1.0, 1.0, 1.0], solid: true },
  {
    id: 22,
    name: "Torch",
    color: [1.0, 0.6, 0.0],
    solid: false,
    transparent: true,
    lightValue: 14,
  },
  {
    id: 23,
    name: "Tall Grass",
    color: [0.3, 0.7, 0.1],
    solid: false,
    transparent: true,
  },
  {
    id: 24,
    name: "Flower",
    color: [1.0, 0.4, 0.6],
    solid: false,
    transparent: true,
  },
];

export function getBlockColor(id) {
  const def = BLOCK_DEFINITIONS.find((b) => b.id === id);
  return def ? def.color : [1, 0, 1];
}

export function getBlockName(id) {
  const def = BLOCK_DEFINITIONS.find((b) => b.id === id);
  return def ? def.name : "Unknown";
}

export function isSolid(id) {
  const def = BLOCK_DEFINITIONS.find((b) => b.id === id);
  return def ? def.solid : false;
}

// Precomputed arrays for fast direct lookup
export const BLOCK_COLORS = BLOCK_DEFINITIONS.map((d) => d.color);
export const BLOCK_NAMES = BLOCK_DEFINITIONS.map((d) => d.name);
