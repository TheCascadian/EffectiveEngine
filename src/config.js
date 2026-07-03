// ============================================
// EffectiveEngine Configuration
// ============================================

// ---------- Helpers ----------
export function hash3(x, y, z) {
  let n = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  n = (n << 13) ^ n;
  return (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
}

export function randFromCoords(x, y, z) {
  return hash3(x, y, z) / 0x7fffffff;
}

export function lodForDistance(distSq) {
  const fullRadSq = CONFIG.FULL_DETAIL_RADIUS * CONFIG.FULL_DETAIL_RADIUS;
  if (distSq <= fullRadSq) return 0;
  for (let i = 0; i < CONFIG.LOD_RINGS.length; i++) {
    const r = CONFIG.LOD_RINGS[i].radius;
    if (distSq <= r * r) return i + 1;
  }
  return -1;
}

export function strideForLOD(lod) {
  return lod === 0 ? 1 : CONFIG.LOD_RINGS[lod - 1].stride;
}

// ============================================
// MAIN CONFIGURATION
// ============================================
export const CONFIG = {
  // World Generation
  CHUNK_SIZE: 32,
  CHUNK_HEIGHT: 1536, // Massive height for floating islands and overhangs
  FULL_DETAIL_RADIUS: 6,
  LOD_RINGS: [
    { stride: 2, radius: 16 },
    { stride: 4, radius: 32 },
    { stride: 8, radius: 64 },
    { stride: 16, radius: 128 },
    { stride: 32, radius: 256 },
    { stride: 64, radius: 512 },
    { stride: 128, radius: 1024 },
  ],
  SEA_LEVEL: 60,
  
  // Player Physics
  PLAYER_SPEED: 10,
  PLAYER_JUMP_SPEED: 8.5,
  GRAVITY: 25,
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.5,
  
  // Time System
  DAY_LENGTH_MINUTES: 60, // 60 IRL minutes = 1 game day
  TIME_SCALE: 1.0, // Multiplier for time speed
  
  // Rendering
  RENDERER: 'webgpu', // 'webgpu' or 'webgl'
  ANTIALIASING: true,
  SHADOW_QUALITY: 'high', // 'low', 'medium', 'high', 'ultra'
  MAX_FPS: 144,
  
  // Lighting
  LIGHTING: {
    sun: {
      intensity: 1.0,
      color: 0xffffff,
      castShadow: true,
      shadowResolution: 4096,
      shadowDistance: 1000
    },
    ambient: {
      intensity: 0.4,
      color: 0xffffff
    },
    hemisphere: {
      intensity: 0.3,
      skyColor: 0x87ceeb,
      groundColor: 0x444444
    },
    fog: {
      enabled: true,
      color: 0xaaccff,
      near: 60,
      far: 2000
    }
  },
  
  // Debug Settings
  DEBUG: {
    enabled: false,
    showStats: true,
    showGrid: false,
    showAxis: false,
    showChunkBorders: false,
    showLODBorders: false,
    showLightHelpers: false,
    showShadowCascades: false,
    showWireframe: false,
    showBoundingBoxes: false,
    showPerformanceGraph: false,
    showSceneGraph: false,
    performanceHistory: 100
  }
};

// ============================================
// BLOCK DEFINITIONS
// ============================================
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
  TORCH: 22
};

// Precomputed Block Colors
// Format: [R, G, B] values (0-1)
export const BLOCK_COLORS = [
  [1.0, 0.0, 1.0],        // 0: Air (magenta - invisible)
  [0.361, 0.663, 0.141],  // 1: Grass
  [0.475, 0.333, 0.227],  // 2: Dirt
  [0.533, 0.549, 0.553],  // 3: Stone
  [0.89, 0.788, 0.525],   // 4: Sand
  [0.361, 0.251, 0.2],    // 5: Wood
  [0.227, 0.478, 0.157],  // 6: Leaf
  [0.259, 0.647, 0.961],  // 7: Water
  [1.0, 1.0, 1.0],        // 8: Snow
  [0.227, 0.247, 0.267],  // 9: Cobblestone
  [0.867, 0.847, 0.267],  // 10: Glowstone
  [0.102, 0.102, 0.102],  // 11: Obsidian
  [0.678, 0.847, 0.902],  // 12: Glass
  [0.2, 1.0, 0.706],      // 13: Emerald
  [1.0, 0.2, 1.0],        // 14: Ruby
  [0.824, 0.706, 0.549],  // 15: Gold
  [0.804, 0.361, 0.361],  // 16: Iron
  [0.294, 0.0, 0.51],     // 17: Coal
  [0.541, 0.169, 0.886],  // 18: Gravel
  [0.133, 0.545, 0.133],  // 19: Clay
  [0.804, 0.361, 0.361],  // 20: Brick
  [0.871, 0.722, 0.529],  // 21: Wool
  [1.0, 0.6, 0.0]         // 22: Torch
];

// Block names for debugging
export const BLOCK_NAMES = [
  "Air", "Grass", "Dirt", "Stone", "Sand", "Wood", "Leaf", "Water", 
  "Snow", "Cobblestone", "Glowstone", "Obsidian", "Glass", "Emerald", 
  "Ruby", "Gold", "Iron", "Coal", "Gravel", "Clay", "Brick", "Wool", "Torch"
];

// ============================================
// WORLD GENERATION PARAMETERS
// ============================================
export const WORLD_GEN = {
  // Terrain noise parameters
  terrain: {
    scale: 100,
    height: 128,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0
  },
  
  // Cave generation
  caves: {
    frequency: 0.05,
    threshold: 0.5,
    size: 20
  },
  
  // Biome parameters
  biomes: {
    temperatureScale: 0.1,
    humidityScale: 0.1,
    forestThreshold: 0.6,
    desertThreshold: 0.3
  },
  
  // Ore generation
  ores: [
    { type: BLOCK_TYPES.COAL, minY: 0, maxY: 128, frequency: 0.1, size: 16 },
    { type: BLOCK_TYPES.IRON, minY: 0, maxY: 64, frequency: 0.05, size: 8 },
    { type: BLOCK_TYPES.GOLD, minY: 0, maxY: 32, frequency: 0.02, size: 4 },
    { type: BLOCK_TYPES.EMERALD, minY: 0, maxY: 16, frequency: 0.01, size: 2 },
    { type: BLOCK_TYPES.RUBY, minY: 0, maxY: 8, frequency: 0.005, size: 1 }
  ]
};

// ============================================
// KEYBINDINGS
// ============================================
export const KEYBINDINGS = {
  // Movement
  FORWARD: ['KeyW', 'ArrowUp'],
  BACKWARD: ['KeyS', 'ArrowDown'],
  LEFT: ['KeyA', 'ArrowLeft'],
  RIGHT: ['KeyD', 'ArrowRight'],
  JUMP: ['Space'],
  FLY: ['KeyF'],
  SPRINT: ['ShiftLeft', 'ShiftRight'],
  CROUCH: ['ControlLeft', 'ControlRight'],
  
  // Building
  BREAK: ['Mouse0'],
  PLACE: ['Mouse2'],
  
  // Hotbar
  HOTBAR_1: ['Digit1'],
  HOTBAR_2: ['Digit2'],
  HOTBAR_3: ['Digit3'],
  HOTBAR_4: ['Digit4'],
  HOTBAR_5: ['Digit5'],
  HOTBAR_6: ['Digit6'],
  HOTBAR_7: ['Digit7'],
  HOTBAR_8: ['Digit8'],
  HOTBAR_9: ['Digit9'],
  
  // UI
  PAUSE: ['Escape'],
  DEBUG: ['F1'],
  DEBUG_PANEL: ['F2'],
  FULLSCREEN: ['F11']
};

// ============================================
// PERFORMANCE MONITORING
// ============================================
export const PERFORMANCE = {
  targetFPS: 60,
  warningThreshold: 45,
  criticalThreshold: 30,
  memoryWarning: 512, // MB
  memoryCritical: 1024 // MB
};
