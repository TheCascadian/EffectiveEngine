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

// ---------- CONFIG ----------
export const CONFIG = {
  CHUNK_SIZE: 32,
  CHUNK_HEIGHT: 1536, // --- MASSIVELY INCREASED HEIGHT --- (Dynamically used by worker)
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
  PLAYER_SPEED: 10,
  PLAYER_JUMP_SPEED: 8.5,
  GRAVITY: 25,
};

// ---------- Precomputed Block Colors ----------
export const BLOCK_COLORS = [
  [1.0, 0.0, 1.0],
  [0.361, 0.663, 0.141],
  [0.475, 0.333, 0.227],
  [0.533, 0.549, 0.553],
  [0.89, 0.788, 0.525],
  [0.361, 0.251, 0.2],
  [0.227, 0.478, 0.157],
  [0.259, 0.647, 0.961],
  [1.0, 1.0, 1.0],
  [0.227, 0.247, 0.267],
  [0.541, 0.169, 0.886],
  [0.294, 0.0, 0.51],
  [0.867, 0.627, 0.867],
  [0.2, 1.0, 0.706],
  [1.0, 0.2, 1.0],
  [0.824, 0.706, 0.549],
  [0.804, 0.361, 0.361],
  [0.871, 0.722, 0.529],
  [0.133, 0.545, 0.133],
  [0.102, 0.102, 0.102],
  [1.0, 0.6, 0.0],
  [0.545, 0.0, 0.0],
  [0.0, 0.392, 0.0],
  [0.678, 0.847, 0.902],
];
