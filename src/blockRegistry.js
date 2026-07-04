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

// Each entry: { id, name, color: [r,g,b], solid, transparent?, lightValue? }
export const BLOCK_DEFINITIONS = [
  { id: 0, name: "Air", color: [1, 0, 1], solid: false, transparent: true },
  { id: 1, name: "Grass", color: [0.361, 0.663, 0.141], solid: true },
  { id: 2, name: "Dirt", color: [0.475, 0.333, 0.227], solid: true },
  { id: 3, name: "Stone", color: [0.533, 0.549, 0.553], solid: true },
  { id: 4, name: "Sand", color: [0.89, 0.788, 0.525], solid: true },
  { id: 5, name: "Wood", color: [0.361, 0.251, 0.2], solid: true },
  { id: 6, name: "Leaf", color: [0.227, 0.478, 0.157], solid: true },
  {
    id: 7,
    name: "Water",
    color: [0.259, 0.647, 0.961],
    solid: false,
    transparent: true,
  },
  { id: 8, name: "Snow", color: [1, 1, 1], solid: true },
  { id: 9, name: "Cobblestone", color: [0.227, 0.247, 0.267], solid: true },
  {
    id: 10,
    name: "Glowstone",
    color: [0.867, 0.847, 0.267],
    solid: true,
    lightValue: 15,
  },
  { id: 11, name: "Obsidian", color: [0.102, 0.102, 0.102], solid: true },
  {
    id: 12,
    name: "Glass",
    color: [0.678, 0.847, 0.902],
    solid: false,
    transparent: true,
  },
  { id: 13, name: "Emerald", color: [0.2, 1.0, 0.706], solid: true },
  { id: 14, name: "Ruby", color: [1.0, 0.2, 1.0], solid: true },
  { id: 15, name: "Gold", color: [0.824, 0.706, 0.549], solid: true },
  { id: 16, name: "Iron", color: [0.804, 0.361, 0.361], solid: true },
  { id: 17, name: "Coal", color: [0.294, 0.0, 0.51], solid: true },
  { id: 18, name: "Gravel", color: [0.541, 0.169, 0.886], solid: true },
  { id: 19, name: "Clay", color: [0.133, 0.545, 0.133], solid: true },
  { id: 20, name: "Brick", color: [0.804, 0.361, 0.361], solid: true },
  { id: 21, name: "Wool", color: [0.871, 0.722, 0.529], solid: true },
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
    color: [0.2, 0.8, 0.1],
    solid: false,
    transparent: true,
  },
  {
    id: 24,
    name: "Flower",
    color: [1.0, 0.2, 0.5],
    solid: false,
    transparent: true,
  },
];

// Helper functions
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
