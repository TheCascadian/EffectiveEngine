export const WORKER_SRC = `
// ----------------------------------------------------------------------
// 1. IMPROVED NOISE ENGINE
// ----------------------------------------------------------------------
let perm;
function getSurfaceStrata(wx, wz, topY, seaLevel, biome, heightLimit) {
  let surfaceBlock = 1, underBlock = 2, rockBlock = 3;
  const snowThreshold = heightLimit * 0.65; // Snow scales dynamically with world height
  
  if (topY >= snowThreshold + noise3(wx * 0.01, 0, wz * 0.01) * 40) {
    surfaceBlock = 8; underBlock = 3; rockBlock = 3;
  } else if (topY <= seaLevel && biome !== 2) {
    const beachNoise = fbm2D(wx * 0.04, wz * 0.04, 2);
    if (beachNoise > 0.2) { surfaceBlock = 4; underBlock = 4; rockBlock = 9; }
    else { surfaceBlock = 15; underBlock = 15; rockBlock = 9; }
  } else {
    switch (biome) {
      case 1:
        surfaceBlock = (fbm2D(wx * 0.03, wz * 0.03, 2) > 0.3) ? 16 : 4;
        underBlock = 16; rockBlock = 9; break;
      case 2:
        surfaceBlock = (fbm2D(wx * 0.04, wz * 0.04, 2) > 0.5) ? 21 : 19;
        underBlock = 19; rockBlock = 3; break;
      case 3:
        surfaceBlock = 1; underBlock = 2; rockBlock = 3; break;
      case 4:
        surfaceBlock = (fbm2D(wx * 0.02, wz * 0.02, 2) > 0.2) ? 23 : 8;
        underBlock = 8; rockBlock = 3; break;
      case 5:
        surfaceBlock = 1; underBlock = 2; rockBlock = 3; break;
      case 6:
        surfaceBlock = 3; underBlock = 3; rockBlock = 3; break;
      default:
        surfaceBlock = (fbm2D(wx * 0.02, wz * 0.02, 2) > 0.1 && topY > heightLimit * 0.2) ? 3 : 1;
        underBlock = 2; rockBlock = 3;
    }
  }
  return { surfaceBlock, underBlock, rockBlock };
}

function softCapHeight(h, maxH) {
  const CAP = maxH * 0.85;
  const SOFTNESS = maxH * 0.15;
  if (h <= CAP) return Math.max(4, h);
  const excess = h - CAP;
  return CAP + SOFTNESS * Math.tanh(excess / SOFTNESS);
}

function initPerm(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let rng = seed;
  function rnd() { rng = (rng * 16807) % 2147483647; return rng / 2147483647; }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
function hash3(x, y, z) {
  let n = (x * 374761393 + y * 668265263 + z * 1274126177) & 0x7fffffff;
  n = ((n ^ (n >> 13)) * 1274126177) & 0x7fffffff;
  return (n ^ (n >> 16)) & 0x7fffffff;
}
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t, a, b) { return a + t * (b - a); }
function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  return lerp(w,
    lerp(v, lerp(u, grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z)),
            lerp(u, grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z))),
    lerp(v, lerp(u, grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1)),
            lerp(u, grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1))));
}
function fbm2D(x, z, octaves = 6, lacunarity = 2.0, gain = 0.5) {
  let value = 0, amplitude = 1, frequency = 1, maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3(x * frequency, 0, z * frequency);
    maxVal += amplitude;
    amplitude *= gain; frequency *= lacunarity;
  }
  return value / maxVal;
}
function fbm3D(x, y, z, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let value = 0, amplitude = 1, frequency = 1, maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3(x * frequency, y * frequency, z * frequency);
    maxVal += amplitude;
    amplitude *= gain; frequency *= lacunarity;
  }
  return value / maxVal;
}
function ridgedFbm2D(x, z, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let value = 0, amplitude = 1, frequency = 1, maxVal = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise3(x * frequency, 0, z * frequency));
    value += amplitude * (n * n);
    maxVal += amplitude;
    amplitude *= gain; frequency *= lacunarity;
  }
  return value / maxVal;
}
function domainWarp(x, z, strength = 80, frequency = 0.001) {
  const wx = fbm2D(x * frequency, z * frequency, 3, 2.0, 0.5) * strength;
  const wz = fbm2D((x + 913.7) * frequency, (z - 271.3) * frequency, 3, 2.0, 0.5) * strength;
  return [x + wx, z + wz];
}

// ----------------------------------------------------------------------
// 2. CONTINENTAL SHAPING + DYNAMIC TALL TERRAIN
// ----------------------------------------------------------------------
function getContinentalness(wx, wz) {
  let [wwx, wwz] = domainWarp(wx, wz, 250, 0.0008);
  let cont = fbm2D(wwx * 0.0003, wwz * 0.0003, 2, 2.0, 0.5);
  [wwx, wwz] = domainWarp(wx + 1000, wz - 2000, 120, 0.002);
  cont += fbm2D(wwx * 0.0004, wwz * 0.0004, 2, 2.0, 0.5) * 0.3;
  return cont;
}

function continentShape(cont) {
  const t = Math.max(-1, Math.min(1, cont * 1.75));
  if (t < -0.45) return 0.02 + (t + 1) * (0.10 / 0.55);
  if (t < -0.1) return 0.12 + (t + 0.45) * (0.20 / 0.35);
  if (t < 0.05) return 0.32 + (t + 0.1) * (0.16 / 0.15);
  if (t < 0.4) return 0.48 + (t - 0.05) * (0.28 / 0.35);
  return 0.76 + (t - 0.4) * (0.24 / 0.6);
}

// --- Dynamic World Calculations ---
function calculateBaseHeight(wx, wz, maxH, seaLevel, terrainParams = {}) {
  const domainWarpStrength1 = terrainParams.domainWarpStrength1 || 150;
  const domainWarpFreq1 = terrainParams.domainWarpFreq1 || 0.002;
  const domainWarpStrength2 = terrainParams.domainWarpStrength2 || 50;
  const domainWarpFreq2 = terrainParams.domainWarpFreq2 || 0.008;
  
  let [wwx, wwz] = domainWarp(wx, wz, domainWarpStrength1, domainWarpFreq1);
  [wwx, wwz] = domainWarp(wwx, wwz, domainWarpStrength2, domainWarpFreq2);
  
  const cont = getContinentalness(wwx, wwz);
  const landFactor = continentShape(cont);
  
  // Base structural height scales directly with the set world height
  const mountainScale = terrainParams.mountainScale || 0.45;
  const baseMtnScale = maxH * mountainScale;
  let height = landFactor * baseMtnScale + 16;
  
  // Plateaus (Terracing effect for cliffs)
  const plateauNoise = fbm2D(wwx * 0.0015, wwz * 0.0015, 3);
  let plateauMask = Math.max(0, Math.min(1, (plateauNoise - 0.3) * 4.0));
  if (plateauMask > 0 && landFactor > 0.3) {
       const stepH = 30; // 30 block tall cliff terraces
       const terraced = Math.floor(height / stepH) * stepH;
       const lerpFact = Math.pow(Math.sin((height / stepH) * Math.PI - Math.PI/2) * 0.5 + 0.5, 6.0);
       const smoothTerrace = terraced + lerpFact * stepH;
       height = height * (1 - plateauMask) + smoothTerrace * plateauMask;
  }

  // Extreme Peaks (Ridged)
  const noiseFreq = terrainParams.noiseFreq || 0.003;
  const ridge = ridgedFbm2D(wwx * noiseFreq, wwz * noiseFreq, 6, 2.2, 0.5);
  const mtnMask = Math.max(0, (landFactor - 0.4) / 0.6); 
  const peakScale = maxH * (terrainParams.peakScale || 0.5); // VERY tall peaks
  height += Math.pow(ridge, 1.4) * peakScale * Math.pow(mtnMask, 1.2);
  
  // High frequency geological detail
  height += fbm2D(wwx * (noiseFreq * 5), wwz * (noiseFreq * 5), 5, 2.0, 0.5) * 60 * (0.2 + landFactor * 0.8);
  
  // Ravines (Deep narrow jagged cuts)
  const ravineWarpX = fbm2D(wx * 0.005, wz * 0.005, 2) * 200;
  const ravineWarpZ = fbm2D(wx * 0.005 + 100, wz * 0.005 + 100, 2) * 200;
  const crack = Math.abs(noise3((wx + ravineWarpX) * noiseFreq, 0, (wz + ravineWarpZ) * noiseFreq));
  if (crack < 0.03 && landFactor > 0.2) {
       const carve = (0.03 - crack) / 0.03; // steep gradient
       const ravineDepth = (maxH * 0.25) * Math.pow(carve, 0.5); // Steep canyon walls
       height -= ravineDepth;
  }

  // Rivers (Smooth U-shaped carved valleys)
  const river = getRiverMap(wx, wz);
  if (river < 0.04 && landFactor > 0.1) {
       const carve = (0.04 - river) / 0.04;
       const carveShape = Math.pow(carve, 1.5);
       const hAbove = Math.max(0, height - (seaLevel - 5));
       const carveDepth = Math.min(maxH * 0.15, hAbove + 15);
       height -= carveShape * carveDepth;
  }

  return height;
}

// ----------------------------------------------------------------------
// 3. FAST HYDRAULIC EROSION
// ----------------------------------------------------------------------
function randFromCoords(x, y, z) {
  return hash3(x, y, z) / 0x7fffffff;
}
function erodeHeightmap(hm, width, originX, originZ, stride) {
  const getH = (x, z) => (x < 0 || x >= width || z < 0 || z >= width) ? 0 : hm[z * width + x];
  const setH = (x, z, v) => { if (x >= 0 && x < width && z >= 0 && z < width) hm[z * width + x] = v; };
  const getGrad = (x, z) => {
    const hL = getH(x - 1, z), hR = getH(x + 1, z);
    const hD = getH(x, z - 1), hU = getH(x, z + 1);
    return { x: (hR - hL) * 0.5, z: (hU - hD) * 0.5 };
  };
  const cellSize = 3;
  const originCellX = Math.round(originX / stride / cellSize);
  const originCellZ = Math.round(originZ / stride / cellSize);
  const cellSpan = Math.ceil(width / cellSize) + 1;
  for (let gz = -1; gz <= cellSpan; gz++) {
    for (let gx = -1; gx <= cellSpan; gx++) {
      const worldCellX = originCellX + gx, worldCellZ = originCellZ + gz;
      const jitterX = randFromCoords(worldCellX, 5000, worldCellZ);
      const jitterZ = randFromCoords(worldCellX, 9000, worldCellZ);
      let px = (gx + jitterX) * cellSize, pz = (gz + jitterZ) * cellSize;
      if (getH(px, pz) <= 0) continue;
      let dirX = 0, dirZ = 0, sediment = 0, water = 1.0;
      for (let step = 0; step < 25; step++) {
        const h = getH(px, pz);
        const grad = getGrad(px, pz);
        dirX = dirX * 0.1 - grad.x * 0.9;
        dirZ = dirZ * 0.1 - grad.z * 0.9;
        const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (len > 1) { dirX /= len; dirZ /= len; }
        px += dirX; pz += dirZ;
        if (px < 0 || px >= width || pz < 0 || pz >= width) break;
        const newH = getH(px, pz);
        const diff = h - newH;
        const speed = Math.sqrt(dirX * dirX + dirZ * dirZ);
        const capacity = Math.max(0.01, diff * speed * 4 + 0.01);
        if (diff > 0) {
          const toErode = Math.min(diff, 0.3 * water);
          if (sediment < capacity) {
            const erodeAmt = Math.min(toErode, (capacity - sediment) * 0.5);
            setH(px, pz, newH - erodeAmt);
            sediment += erodeAmt;
          }
        } else {
          const depositAmt = Math.min(sediment, 0.3 * water);
          setH(px, pz, newH + depositAmt);
          sediment -= depositAmt;
        }
        water *= 0.99;
        if (water < 0.001) break;
      }
    }
  }
  return hm;
}

// ----------------------------------------------------------------------
// 4. RIVER NETWORK & BIOME
// ----------------------------------------------------------------------
function getRiverMap(wx, wz) {
  let river = fbm2D(wx * 0.0015, wz * 0.0015, 3, 2.5, 0.4);
  let [rwx, rwz] = domainWarp(wx, wz, 80, 0.003);
  river += fbm2D(rwx * 0.005, rwz * 0.005, 2, 2.0, 0.5) * 0.3;
  return Math.abs(river);
}

function getClimate(wx, wz) {
  return {
    temperature: fbm2D(wx * 0.0008, wz * 0.0008, 4, 2.0, 0.5),
    moisture: fbm2D((wx + 4000) * 0.001, (wz - 4000) * 0.001, 4, 2.0, 0.5)
  };
}

function classifyBiome(temp, moist, elevation, maxH) {
  const eFactor = Math.max(0, (elevation - maxH * 0.3) / (maxH * 0.3));
  temp -= eFactor * 0.55;
  if (elevation > maxH * 0.6) return 6; // Dynamically calculated Snow Biome
  if (temp < -0.15) return moist > 0.0 ? 5 : 4;
  if (temp > 0.15) {
    if (moist < -0.05) return 1;
    if (moist < 0.15) return 2;
    return 3;
  }
  return moist >= -0.05 ? 3 : 0;
}

// ----------------------------------------------------------------------
// 5. HEIGHTMAP ARRAYS & DENSITY
// ----------------------------------------------------------------------
function getRawHeightmap(cx, cz, size, stride, padding, heightLimit, seaLevel) {
  const width = size + padding * 2;
  const hm = new Float32Array(width * width);
  const bx = cx * size * stride, bz = cz * size * stride;
  for (let z = 0; z < width; z++) {
    for (let x = 0; x < width; x++) {
      const wx = bx + (x - padding) * stride, wz = bz + (z - padding) * stride;
      let height = calculateBaseHeight(wx, wz, heightLimit, seaLevel);
      hm[z * width + x] = softCapHeight(height, heightLimit);
    }
  }
  return hm;
}

function getErodedHeightmap(cx, cz, size, stride, padding, heightLimit, seaLevel) {
  const width = size + padding * 2;
  const hm = new Float32Array(width * width);
  const bx = cx * size * stride, bz = cz * size * stride;
  const originX = bx - padding * stride, originZ = bz - padding * stride;
  for (let z = 0; z < width; z++) {
    for (let x = 0; x < width; x++) {
      const wx = bx + (x - padding) * stride, wz = bz + (z - padding) * stride;
      let height = calculateBaseHeight(wx, wz, heightLimit, seaLevel);
      hm[z * width + x] = softCapHeight(height, heightLimit);
    }
  }
  return erodeHeightmap(hm, width, originX, originZ, stride);
}

let outBlockType = 255;
function getTerrainDensity(wx, wy, wz, seaLevel, baseHeight) {
  outBlockType = 255;
  let density = (baseHeight - wy) / 8;
  
  // --- FIX: STOP FLOATING ISLANDS COMPLETELY ---
  let noiseMod = fbm3D(wx * 0.01, wy * 0.01, wz * 0.01, 2, 2.0, 0.5) * 0.3;
  if (wy > baseHeight) {
     const over = wy - baseHeight;
     // Density addition from 3D noise fades out extremely quickly once above surface
     noiseMod *= Math.max(0, 1.0 - over / 4.0); 
  }
  density += noiseMod;
  
  // Caves & Tunnels
  const depth = baseHeight - wy;
  if (depth > 0) {
    const caveLarge = fbm3D(wx * 0.015, wy * 0.015, wz * 0.015, 3, 2.2, 0.5);
    const caveSmall = fbm3D(wx * 0.04, wy * 0.04, wz * 0.04, 3, 2.0, 0.5);
    const cavern = fbm3D(wx * 0.02, wy * 0.025, wz * 0.02, 4, 2.1, 0.5);
    const tunnel = fbm3D(wx * 0.035, wy * 0.02, wz * 0.035, 3, 2.0, 0.5);
    
    // --- FIX: PREVENT CAVES FROM DECAPITATING MOUNTAINS ---
    const caveMultiplier = Math.min(1.0, depth / 15.0); // 0 at surface, smoothly rising underground
    
    density -= Math.max(0, caveLarge * 0.4 + caveSmall * 0.2 - 0.1) * 0.4 * caveMultiplier;
    density -= Math.max(0, cavern - 0.35) * 1.2 * caveMultiplier;
    if (Math.abs(tunnel) < 0.03 && depth > 10) density -= 1.0 * caveMultiplier;
    
    if (wy < 100 && wy > 20) {
      if (fbm3D(wx * 0.08, wy * 0.08, wz * 0.08, 2, 2.0, 0.5) > 0.4 && caveLarge < -0.1) {
        density = 1.5; outBlockType = 11;
      }
    }
  }

  // Ores
  if (wy < baseHeight - 10 && wy > 0) {
    const oreNoise = fbm3D(wx * 0.04, wy * 0.04, wz * 0.04, 2, 2.0, 0.5);
    if (density > 0 && oreNoise > 0.6) {
      if (wy < 20) outBlockType = 10;
      else if (wy < 50) outBlockType = 11; 
      else if (wy < 100) outBlockType = 20;
      else if (wy < 160) outBlockType = 17;
      else outBlockType = 9;
    }
  }

  return density;
}

// ----------------------------------------------------------------------
// 6. CHUNK GENERATION
// ----------------------------------------------------------------------
function generateFullChunk(cx, cz, size, heightLimit, seaLevel) {
  const blocks = new Uint8Array(size * heightLimit * size);
  const bx = cx * size, bz = cz * size;
  const padding = 1;
  const hmWidth = size + padding * 2;
  const hm = getErodedHeightmap(cx, cz, size, 1, padding, heightLimit, seaLevel);
  
  for (let lz = 0; lz < size; lz++) {
    for (let lx = 0; lx < size; lx++) {
      const baseHeight = hm[(lz + padding) * hmWidth + (lx + padding)];
      const minY = Math.max(0, Math.floor(baseHeight - 120));
      const maxY = Math.min(heightLimit - 1, Math.ceil(baseHeight + 60));
      
      for (let ly = minY; ly <= maxY; ly++) {
        const wx = bx + lx, wy = ly, wz = bz + lz;
        const density = getTerrainDensity(wx, wy, wz, seaLevel, baseHeight);
        const idx = (ly * size + lz) * size + lx;
        blocks[idx] = density > 0 ? ((outBlockType !== 255) ? outBlockType : 3) : 0;
      }
    }
  }
  
  for (let ly = 0; ly <= seaLevel; ly++) {
    for (let i = 0; i < size * size; i++) {
      const idx = ly * size * size + i;
      if (blocks[idx] === 0) blocks[idx] = 7;
    }
  }
  
  const biomeMap = new Uint8Array(size * size);
  for (let lz = 0; lz < size; lz++) {
    for (let lx = 0; lx < size; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const { temperature, moisture } = getClimate(wx, wz);
      biomeMap[lz * size + lx] = classifyBiome(temperature, moisture, hm[(lz + padding) * hmWidth + (lx + padding)], heightLimit);
    }
  }
  paintSurface(blocks, biomeMap, cx, cz, size, heightLimit, seaLevel);
  paintFlora(blocks, biomeMap, bx, bz, size, heightLimit, seaLevel);
  return blocks;
}

function generateLODBlockArray(cx, cz, stride, size, heightLimit, seaLevel) {
  const blocks = new Uint8Array(size * heightLimit * size);
  const bx = cx * size * stride, bz = cz * size * stride;
  const span = size * stride;
  const padding = 1;
  const hmWidth = size + padding * 2;
  const hm = getRawHeightmap(cx, cz, size, stride, padding, heightLimit, seaLevel);
  
  for (let lz = 0; lz < span; lz += stride) {
    const lodZ = lz / stride;
    for (let lx = 0; lx < span; lx += stride) {
      const lodX = lx / stride;
      const wx = bx + lx, wz = bz + lz;
      const baseHeight = hm[(lodZ + padding) * hmWidth + (lodX + padding)];

      const minY = Math.max(0, Math.floor(baseHeight - 120));
      const maxY = Math.min(heightLimit - 1, Math.ceil(baseHeight + 60));

      let hitSurface = false;
      let topWy = -1;
      let strata = null;

      for (let wy = maxY; wy >= minY; wy--) {
        const density = getTerrainDensity(wx, wy, wz, seaLevel, baseHeight);
        const idx = (wy * size + lodZ) * size + lodX;
        if (density > 0) {
          if (!hitSurface) {
            const { temperature, moisture } = getClimate(wx, wz);
            const biome = classifyBiome(temperature, moisture, baseHeight, heightLimit);
            strata = getSurfaceStrata(wx, wz, wy, seaLevel, biome, heightLimit);

            blocks[idx] = strata.surfaceBlock;
            if (wy - 1 >= minY) blocks[((wy - 1) * size + lodZ) * size + lodX] = strata.surfaceBlock;

            if (wy - 2 >= minY) blocks[((wy - 2) * size + lodZ) * size + lodX] = strata.underBlock;
            if (wy - 3 >= minY) blocks[((wy - 3) * size + lodZ) * size + lodX] = strata.underBlock;

            hitSurface = true;
            topWy = wy;
          } else {
            if (wy <= topWy - 4) {
              if (wy < 50 + noise3(wx, wy, wz) * 16) blocks[idx] = 9;
              else blocks[idx] = strata.rockBlock;
            }
          }
        } else {
          blocks[idx] = wy <= seaLevel ? 7 : 0;
        }
      }
    }
  }
  return blocks;
}

function paintSurface(blocks, biomeMap, cx, cz, size, heightLimit, seaLevel) {
  const bx = cx * size, bz = cz * size;
  for (let lz = 0; lz < size; lz++) {
    for (let lx = 0; lx < size; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const biome = biomeMap[lz * size + lx];
      let top = -1;
      for (let ly = heightLimit - 1; ly >= 0; ly--) {
        const idx = (ly * size + lz) * size + lx;
        if (blocks[idx] !== 0 && blocks[idx] !== 7) { top = ly; break; }
      }
      if (top < 0) continue;

      const strata = getSurfaceStrata(wx, wz, top, seaLevel, biome, heightLimit);

      blocks[(top * size + lz) * size + lx] = strata.surfaceBlock;
      if (top - 1 >= 0) blocks[((top - 1) * size + lz) * size + lx] = strata.surfaceBlock;

      if (top - 2 >= 0) blocks[((top - 2) * size + lz) * size + lx] = strata.underBlock;
      if (top - 3 >= 0) blocks[((top - 3) * size + lz) * size + lx] = strata.underBlock;

      for (let ly = top - 4; ly >= 0; ly--) {
        const idxBelow = (ly * size + lz) * size + lx;
        if (blocks[idxBelow] === 0 || blocks[idxBelow] === 7) break;
        if (ly < 50 + noise3(wx, ly, wz) * 16) blocks[idxBelow] = 9;
        else blocks[idxBelow] = strata.rockBlock;
      }
    }
  }
}

function paintFlora(blocks, biomeMap, bx, bz, size, heightLimit, seaLevel) {
  for (let lz = 2; lz < size - 2; lz++) {
    for (let lx = 2; lx < size - 2; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const biome = biomeMap[lz * size + lx];
      let top = -1;
      for (let ly = heightLimit - 1; ly >= 0; ly--) {
        const t = blocks[(ly * size + lz) * size + lx];
        if (t === 1 || t === 2) { top = ly; break; }
      }
      
      if (top < seaLevel + 2) continue;
      const rand = hash3(wx, 0, wz) % 1000;
      
      if (biome === 1 && rand > 990) {
        const cactusH = 2 + (hash3(wx, 1, wz) % 3);
        for (let i = 1; i <= cactusH; i++) {
          const idx = ((top + i) * size + lz) * size + lx;
          if (top + i < heightLimit) blocks[idx] = 18;
        }
      } else if (biome === 3 || biome === 5 || biome === 0) {
        const chance = (biome === 3) ? 970 : (biome === 5 ? 985 : 995);
        if (rand > chance) {
          const trunk = (biome === 3) ? 7 + (hash3(wx, 2, wz) % 3) : 5;
          const leaf = (biome === 3) ? 22 : 6;
          for (let i = 1; i <= trunk; i++) {
            const idx = ((top + i) * size + lz) * size + lx;
            if (top + i < heightLimit) blocks[idx] = 5;
          }
          for (let dy = trunk - 2; dy <= trunk + 1; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              for (let dz = -2; dz <= 2; dz++) {
                if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
                const lY = top + dy, lX = lx + dx, lZ = lz + dz;
                if (lY < heightLimit && lX >= 0 && lX < size && lZ >= 0 && lZ < size) {
                  const idx = (lY * size + lZ) * size + lX;
                  if (blocks[idx] === 0 || blocks[idx] === 1) blocks[idx] = leaf;
                }
              }
            }
          }
        }
      }
      
      if (fbm2D(wx * 0.005, wz * 0.005, 2) > 0.6 && rand === 0) {
        const trunkH = 6 + (hash3(wx, 3, wz) % 4);
        for (let i = 1; i <= trunkH; i++) {
          const idx = ((top + i) * size + lz) * size + lx;
          if (top + i < heightLimit) blocks[idx] = 12;
        }
        for (let dy = trunkH - 1; dy <= trunkH + 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
              if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - trunkH) > 3) continue;
              const lX = lx + dx, lY = top + dy, lZ = lz + dz;
              if (lX >= 0 && lX < size && lZ >= 0 && lZ < size && lY < heightLimit) {
                const idx = (lY * size + lZ) * size + lX;
                if (blocks[idx] === 0) blocks[idx] = 13;
              }
            }
          }
        }
      }
    }
  }
}

// ----------------------------------------------------------------------
// 7. GREEDY MESHER
// ----------------------------------------------------------------------
function blockColor(type) {
  switch (type) {
    case 1: return [0.361, 0.663, 0.141];
    case 2: return [0.475, 0.333, 0.227];
    case 3: return [0.533, 0.549, 0.553];
    case 4: return [0.890, 0.788, 0.525];
    case 5: return [0.361, 0.251, 0.200];
    case 6: return [0.227, 0.478, 0.157];
    case 7: return [0.259, 0.647, 0.961];
    case 8: return [1.0, 1.0, 1.0];
    case 9: return [0.227, 0.247, 0.267];
    case 10: return [0.541, 0.169, 0.886];
    case 11: return [0.294, 0.000, 0.510];
    case 12: return [0.867, 0.627, 0.867];
    case 13: return [0.200, 1.000, 0.706];
    case 14: return [1.000, 0.200, 1.000];
    case 15: return [0.824, 0.706, 0.549];
    case 16: return [0.804, 0.361, 0.361];
    case 17: return [0.871, 0.722, 0.529];
    case 18: return [0.133, 0.545, 0.133];
    case 19: return [0.102, 0.102, 0.102];
    case 20: return [1.000, 0.600, 0.000];
    case 21: return [0.545, 0.000, 0.000];
    case 22: return [0.000, 0.392, 0.000];
    case 23: return [0.678, 0.847, 0.902];
    default: return [1.0, 0.0, 1.0];
  }
}

function buildMeshFromBlocks(blocks, originX, originZ, scaleXZ, size, heightLimit) {
  function blockAt(x, y, z) {
    if (x < 0 || x >= size || y < 0 || y >= heightLimit || z < 0 || z >= size) {
      return y <= 60 ? 7 : 0;
    }
    return blocks[(y * size + z) * size + x];
  }
  const positions = [], normals = [], colors = [], indices = [];
  const dims = [size, heightLimit, size];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const x = [0, 0, 0], q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int32Array(dims[u] * dims[v]);
    for (x[d] = -1; x[d] < dims[d];) {
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++) {
          const a = blockAt(x[0], x[1], x[2]);
          const b = blockAt(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
          const aSolid = a !== 0, bSolid = b !== 0;
          if (aSolid === bSolid) mask[n++] = 0;
          else if (aSolid) mask[n++] = a;
          else mask[n++] = -b;
        }
      }
      x[d]++; n = 0;
      for (let j = 0; j < dims[v]; j++) {
        for (let i = 0; i < dims[u];) {
          const c = mask[n];
          if (c !== 0) {
            let w = 1;
            while (i + w < dims[u] && mask[n + w] === c) w++;
            let h = 1, done = false;
            while (j + h < dims[v]) {
              for (let k = 0; k < w; k++) {
                if (mask[n + k + h * dims[u]] !== c) { done = true; break; }
              }
              if (done) break;
              h++;
            }
            x[u] = i; x[v] = j;
            const du = [0, 0, 0]; du[u] = w;
            const dv = [0, 0, 0]; dv[v] = h;
            const blockType = Math.abs(c);
            const col = blockColor(blockType);
            const wx = originX + x[0] * scaleXZ, wy = x[1], wz = originZ + x[2] * scaleXZ;
            const isWater = (blockType === 7);
            const vary = isWater ? 1.0 : (0.92 + (hash3(wx, wy, wz) & 0xff) / 255 * 0.16);

            let slopeShade = 0.85; 
            if (d === 1) slopeShade = c > 0 ? 1.0 : 0.6;
            else if (d === 0) slopeShade = 0.75;
            else slopeShade = 0.8;

            const fColR = col[0] * vary * slopeShade;
            const fColG = col[1] * vary * slopeShade;
            const fColB = col[2] * vary * slopeShade;

            const normal = [0, 0, 0];
            normal[d] = c > 0 ? 1 : -1;

            const baseIdx = positions.length / 3;
            let p0, p1, p2, p3;
            if (c > 0) {
              p0 = [x[0] * scaleXZ, x[1], x[2] * scaleXZ];
              p1 = [(x[0] + du[0]) * scaleXZ, x[1] + du[1], (x[2] + du[2]) * scaleXZ];
              p2 = [(x[0] + du[0] + dv[0]) * scaleXZ, x[1] + du[1] + dv[1], (x[2] + du[2] + dv[2]) * scaleXZ];
              p3 = [(x[0] + dv[0]) * scaleXZ, x[1] + dv[1], (x[2] + dv[2]) * scaleXZ];
            } else {
              p0 = [x[0] * scaleXZ, x[1], x[2] * scaleXZ];
              p1 = [(x[0] + dv[0]) * scaleXZ, x[1] + dv[1], (x[2] + dv[2]) * scaleXZ];
              p2 = [(x[0] + du[0] + dv[0]) * scaleXZ, x[1] + du[1] + dv[1], (x[2] + du[2] + dv[2]) * scaleXZ];
              p3 = [(x[0] + du[0]) * scaleXZ, x[1] + du[1], (x[2] + du[2]) * scaleXZ];
            }
            const nx = d === 0 ? (c > 0 ? 1 : -1) : 0;
            const ny = d === 1 ? (c > 0 ? 1 : -1) : 0;
            const nz = d === 2 ? (c > 0 ? 1 : -1) : 0;

            [p0, p1, p2, p3].forEach(p => {
              positions.push(p[0], p[1], p[2]);
              normals.push(nx, ny, nz);
              colors.push(fColR, fColG, fColB);
            });
            indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
            for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
            i += w; n += w;
          } else { i++; n++; }
        }
      }
    }
  }
  if (positions.length === 0) return null;
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals),
    colors: new Float32Array(colors), indices: new Uint16Array(indices), indexCount: indices.length
  };
}

// ----------------------------------------------------------------------
// 8. WORKER HANDLER
// ----------------------------------------------------------------------
self.onmessage = function(e) {
  const m = e.data;
  if (m.type === 'init') { initPerm(m.seed); return; }
  
  if (m.type === 'full') {
    const b = generateFullChunk(m.cx, m.cz, m.size, m.height, m.seaLevel);
    const geo = buildMeshFromBlocks(b, m.cx * m.size, m.cz * m.size, 1, m.size, m.height);
    const transferList = [b.buffer];
    if (geo) transferList.push(geo.positions.buffer, geo.normals.buffer, geo.colors.buffer, geo.indices.buffer);
    self.postMessage({ type: 'full', id: m.id, generation: m.generation, cx: m.cx, cz: m.cz, blocks: b.buffer, geometry: geo }, transferList);
  } else if (m.type === 'lod') {
    const b = generateLODBlockArray(m.cx, m.cz, m.stride, m.size, m.height, m.seaLevel);
    const geo = buildMeshFromBlocks(b, m.cx * m.size * m.stride, m.cz * m.size * m.stride, m.stride, m.size, m.height);
    const transferList = [b.buffer];
    if (geo) transferList.push(geo.positions.buffer, geo.normals.buffer, geo.colors.buffer, geo.indices.buffer);
    self.postMessage({ type: 'lod', id: m.id, generation: m.generation, cx: m.cx, cz: m.cz, lod: m.lod, blocks: b.buffer, geometry: geo }, transferList);
  }
};
`;
