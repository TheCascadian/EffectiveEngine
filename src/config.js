// config.js
// ============================================
// EffectiveEngine Configuration
// ============================================

import { BLOCK_TYPES } from "./blockRegistry.js";

// ---------- Helpers ----------
export function hash3(x, y, z) {
  let n =
    (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) |
    0;
  n = ((n << 13) ^ n) | 0;
  let n2 = Math.imul(n, n) | 0;
  let term1 = Math.imul(n2, 15731) | 0;
  let term2 = (term1 + 789221) | 0;
  let term3 = Math.imul(n, term2) | 0;
  let term4 = (term3 + 1376312589) | 0;
  return term4 & 0x7fffffff;
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

export function getEffectiveChunkHeight() {
  return CONFIG.HOI4_MODE.ENABLED
    ? Math.floor(CONFIG.CHUNK_HEIGHT / 8)
    : CONFIG.CHUNK_HEIGHT;
}

// ============================================
// MAIN CONFIGURATION
// ============================================
export const CONFIG = {
  HOI4_MODE: {
    ENABLED: false, // New flag to enable/disable HOI4 mode
    MAP_WIDTH: 0,
    MAP_HEIGHT: 0,
    LAND_MASK: null,
    CHUNKS_X: 0,
    CHUNKS_Z: 0,
    MIN_CX: 0,
    MIN_CZ: 0,
  },
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
  RENDERER: "webgpu", // 'webgpu' or 'webgl'
  ANTIALIASING: true,
  SHADOW_QUALITY: "high", // 'low', 'medium', 'high', 'ultra'
  MAX_FPS: 144,

  // Lighting
  LIGHTING: {
    sun: {
      intensity: 1.0,
      color: 0xffffff,
      castShadow: true,
      shadowResolution: 4096,
      shadowDistance: 1000,
    },
    ambient: {
      intensity: 0.4,
      color: 0xffffff,
    },
    hemisphere: {
      intensity: 0.3,
      skyColor: 0x87ceeb,
      groundColor: 0x444444,
    },
    fog: {
      enabled: true,
      color: 0xaaccff,
      near: 60,
      far: 2000,
    },
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
    performanceHistory: 100,
  },
};

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
    lacunarity: 2.0,
  },

  // Cave generation
  caves: {
    frequency: 0.05,
    threshold: 0.5,
    size: 20,
  },

  // Biome parameters
  biomes: {
    temperatureScale: 0.1,
    humidityScale: 0.1,
    forestThreshold: 0.6,
    desertThreshold: 0.3,
  },

  // Ore generation
  ores: [
    { type: BLOCK_TYPES.COAL, minY: 0, Math: 128, frequency: 0.1, size: 16 },
    { type: BLOCK_TYPES.IRON, minY: 0, maxY: 64, frequency: 0.05, size: 8 },
    { type: BLOCK_TYPES.GOLD, minY: 0, maxY: 32, frequency: 0.02, size: 4 },
    { type: BLOCK_TYPES.EMERALD, minY: 0, maxY: 16, frequency: 0.01, size: 2 },
    { type: BLOCK_TYPES.RUBY, minY: 0, maxY: 8, frequency: 0.005, size: 1 },
  ],
};

// ============================================
// KEYBINDINGS
// ============================================
export const KEYBINDINGS = {
  // Movement
  FORWARD: ["KeyW", "ArrowUp"],
  BACKWARD: ["KeyS", "ArrowDown"],
  LEFT: ["KeyA", "ArrowLeft"],
  RIGHT: ["KeyD", "ArrowRight"],
  JUMP: ["Space"],
  FLY: ["KeyF"],
  SPRINT: ["ShiftLeft", "ShiftRight"],
  CROUCH: ["ControlLeft", "ControlRight"],

  // Building
  BREAK: ["Mouse0"],
  PLACE: ["Mouse2"],

  // Hotbar
  HOTBAR_1: ["Digit1"],
  HOTBAR_2: ["Digit2"],
  HOTBAR_3: ["Digit3"],
  HOTBAR_4: ["Digit4"],
  HOTBAR_5: ["Digit5"],
  HOTBAR_6: ["Digit6"],
  HOTBAR_7: ["Digit7"],
  HOTBAR_8: ["Digit8"],
  HOTBAR_9: ["Digit9"],

  // UI
  PAUSE: ["Escape"],
  DEBUG: ["F1"],
  DEBUG_PANEL: ["F2"],
  FULLSCREEN: ["F11"],
};

// New function to update HOI4 map dimensions
export function setHoi4MapDimensions(width, height) {
  CONFIG.HOI4_MODE.MAP_WIDTH = width;
  CONFIG.HOI4_MODE.MAP_HEIGHT = height;
  CONFIG.HOI4_MODE.ENABLED = true; // Automatically enable HOI4 mode when dimensions are set
}

// Stores which chunk coordinates are land, computed once from the heightmap.
// mask is a Uint8Array of length chunksX * chunksZ, 1 = land, 0 = water.
// minCx/minCz are the chunk coordinates the mask origin (index 0,0) corresponds to.
export function setHoi4LandMask(mask, chunksX, chunksZ, minCx, minCz) {
  CONFIG.HOI4_MODE.LAND_MASK = mask;
  CONFIG.HOI4_MODE.CHUNKS_X = chunksX;
  CONFIG.HOI4_MODE.CHUNKS_Z = chunksZ;
  CONFIG.HOI4_MODE.MIN_CX = minCx;
  CONFIG.HOI4_MODE.MIN_CZ = minCz;
}

export function isHoi4LandChunk(cx, cz) {
  const mode = CONFIG.HOI4_MODE;
  if (!mode.ENABLED || !mode.LAND_MASK) return false;
  const ix = cx - mode.MIN_CX;
  const iz = cz - mode.MIN_CZ;
  if (ix < 0 || ix >= mode.CHUNKS_X || iz < 0 || iz >= mode.CHUNKS_Z)
    return false;
  return mode.LAND_MASK[iz * mode.CHUNKS_X + ix] === 1;
}

export function forEachHoi4LandChunk(callback) {
  const mode = CONFIG.HOI4_MODE;
  if (!mode.ENABLED || !mode.LAND_MASK) return;
  for (let iz = 0; iz < mode.CHUNKS_Z; iz++) {
    for (let ix = 0; ix < mode.CHUNKS_X; ix++) {
      if (mode.LAND_MASK[iz * mode.CHUNKS_X + ix] === 1) {
        callback(ix + mode.MIN_CX, iz + mode.MIN_CZ);
      }
    }
  }
}

export function forEachHoi4MapChunk(callback) {
  const mode = CONFIG.HOI4_MODE;
  if (!mode.ENABLED || !mode.LAND_MASK) return;
  for (let iz = 0; iz < mode.CHUNKS_Z; iz++) {
    for (let ix = 0; ix < mode.CHUNKS_X; ix++) {
      callback(ix + mode.MIN_CX, iz + mode.MIN_CZ);
    }
  }
}

// New function to disable HOI4 mode
export function disableHoi4Mode() {
  CONFIG.HOI4_MODE.ENABLED = false;
  CONFIG.HOI4_MODE.MAP_WIDTH = 0;
  CONFIG.HOI4_MODE.MAP_HEIGHT = 0;
  CONFIG.HOI4_MODE.LAND_MASK = null;
  CONFIG.HOI4_MODE.CHUNKS_X = 0;
  CONFIG.HOI4_MODE.CHUNKS_Z = 0;
}

// ============================================
// PERFORMANCE MONITORING
// ============================================
export const PERFORMANCE = {
  targetFPS: 60,
  warningThreshold: 45,
  criticalThreshold: 30,
  memoryWarning: 512, // MB
  memoryCritical: 1024, // MB
};
