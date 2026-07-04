// worker.js
export const WORKER_SRC = `
// ----------------------------------------------------------------------
// SECTION 1: NOISE ENGINE & MATHEMATICAL UTILITIES
// ----------------------------------------------------------------------
let perm;
let blockColors = []; // Configured from the main thread

function initPerm(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let rng = seed;
  function rnd() { 
    rng = (rng * 16807) % 2147483647; 
    return rng / 2147483647; 
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

function hash3(x, y, z) {
  let n = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0;
  n = ((n << 13) ^ n) | 0;
  let n2 = Math.imul(n, n) | 0;
  let term1 = Math.imul(n2, 15731) | 0;
  let term2 = (term1 + 789221) | 0;
  let term3 = Math.imul(n, term2) | 0;
  let term4 = (term3 + 1376312589) | 0;
  return term4 & 0x7fffffff;
}

function fade(t) { 
  return t * t * t * (t * (t * 6 - 15) + 10); 
}

function lerp(t, a, b) { 
  return a + t * (b - a); 
}

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

// Soft-clamping curves to prevent hyper-jagged vertical spires
function softenPeaks(h, maxH) {
  const CAP = maxH * 0.45;
  const SOFTNESS = maxH * 0.25;
  if (h <= CAP) return Math.max(4, h);
  const excess = h - CAP;
  return CAP + SOFTNESS * Math.tanh(excess / SOFTNESS);
}


// ----------------------------------------------------------------------
// SECTION 2: BIOME & STRATIFICATION CLASSIFICATION
// ----------------------------------------------------------------------
function getClimate(wx, wz) {
  return {
    temperature: fbm2D(wx * 0.0005, wz * 0.0005, 4, 2.0, 0.5),
    moisture: fbm2D((wx + 4000) * 0.0006, (wz - 4000) * 0.0006, 4, 2.0, 0.5)
  };
}

function classifyBiome(temp, moist, elevation, maxH) {
  const eFactor = Math.max(0, (elevation - maxH * 0.25) / (maxH * 0.3));
  temp -= eFactor * 0.45;
  if (elevation > maxH * 0.55) return 6; // Alpine / peaks
  if (temp < -0.15) return moist > 0.0 ? 5 : 4; // Tundra vs Desert-cold
  if (temp > 0.15) {
    if (moist < -0.05) return 1; // Desert-hot
    if (moist < 0.15) return 2;  // Savannah
    return 3;                    // Plains/Rainforest
  }
  return moist >= -0.05 ? 3 : 0;
}

function getSurfaceStrata(wx, wz, topY, seaLevel, biome, heightLimit) {
  let surfaceBlock = 1, underBlock = 2, rockBlock = 3;
  const snowThreshold = heightLimit * 0.55;
  
  if (topY >= snowThreshold + noise3(wx * 0.015, 0, wz * 0.015) * 30) {
    surfaceBlock = 8; underBlock = 3; rockBlock = 3; // Alpine snow
  } else if (topY <= seaLevel && biome !== 2) {
    const beachNoise = fbm2D(wx * 0.04, wz * 0.04, 2);
    if (beachNoise > 0.15) { 
      surfaceBlock = 4; underBlock = 4; rockBlock = 9; 
    } else { 
      surfaceBlock = 15; underBlock = 15; rockBlock = 9; 
    }
  } else {
    switch (biome) {
      case 1: // Desert
        surfaceBlock = (fbm2D(wx * 0.03, wz * 0.03, 2) > 0.3) ? 18 : 4;
        underBlock = 18; rockBlock = 9; break;
      case 2: // Savannah
        surfaceBlock = (fbm2D(wx * 0.04, wz * 0.04, 2) > 0.5) ? 21 : 19;
        underBlock = 19; rockBlock = 3; break;
      case 3: // Forest
        surfaceBlock = 1; underBlock = 2; rockBlock = 3; break;
      case 4: // Snowy forest
        surfaceBlock = (fbm2D(wx * 0.02, wz * 0.02, 2) > 0.2) ? 23 : 8;
        underBlock = 8; rockBlock = 3; break;
      case 5: // Tundra
        surfaceBlock = 1; underBlock = 2; rockBlock = 3; break;
      case 6: // Rock peaks
        surfaceBlock = 3; underBlock = 3; rockBlock = 3; break;
      default:
        surfaceBlock = (fbm2D(wx * 0.02, wz * 0.02, 2) > 0.1 && topY > heightLimit * 0.2) ? 3 : 1;
        underBlock = 2; rockBlock = 3;
    }
  }
  return { surfaceBlock, underBlock, rockBlock };
}


// ----------------------------------------------------------------------
// SECTION 3: REVISED RIVER & VALLEY SDF CARVER
// ----------------------------------------------------------------------
function getRiverSDF(wx, wz) {
  // Low frequency winding river curves to define continental paths
  const path1 = fbm2D(wx * 0.0003, wz * 0.0003, 4, 1.9, 0.55);
  const path2 = fbm2D((wx + 2000) * 0.0003, (wz - 2000) * 0.0003, 4, 1.9, 0.55);
  
  // Continental river lines exist along zero crossings
  const riverVal = Math.abs(path1 - path2);
  return riverVal;
}

function applyRiverAndValleyCarving(height, wx, wz, seaLevel) {
  const riverSDF = getRiverSDF(wx, wz);

  // 1. Broad Valley Carver (carves a massive smooth basin so rivers sit in natural valleys)
  const valleyWidth = 0.08; // Normalised coordinate scale
  if (riverSDF < valleyWidth) {
    const normValley = riverSDF / valleyWidth;
    const valleyProfile = normValley * normValley * (3.0 - 2.0 * normValley); // Smoothstep curve
    
    // Slopes the entire landscape down into a gentle river basin
    const targetValleyHeight = seaLevel + 12.0;
    if (height > targetValleyHeight) {
      height = lerp(valleyProfile, targetValleyHeight, height);
    }
  }

  // 2. Local River Bed Carver (carves the flat flat water channel within the valley)
  const streamWidth = 0.012; 
  if (riverSDF < streamWidth) {
    const normBed = riverSDF / streamWidth;
    const bedProfile = normBed * normBed * (3.0 - 2.0 * normBed);
    
    // Flat riverbed profile sits naturally below sea level
    const targetBedHeight = seaLevel - 5.0;
    height = lerp(bedProfile, targetBedHeight, height);
  }

  return height;
}


// ----------------------------------------------------------------------
// SECTION 4: HEIGHTMAP & CONTINENTAL MOUNTAIN GENERATOR
// ----------------------------------------------------------------------
function getContinentalness(wx, wz) {
  let [wwx, wwz] = domainWarp(wx, wz, 200, 0.0005);
  let cont = fbm2D(wwx * 0.0002, wwz * 0.0002, 2, 2.0, 0.5);
  [wwx, wwz] = domainWarp(wx + 800, wz - 1600, 100, 0.001);
  cont += fbm2D(wwx * 0.0003, wwz * 0.0003, 2, 2.0, 0.5) * 0.3;
  return cont;
}

function continentShape(cont) {
  const t = Math.max(-1, Math.min(1, cont * 1.55));
  if (t < -0.4) return 0.03 + (t + 1) * (0.09 / 0.6);
  if (t < -0.1) return 0.12 + (t + 0.4) * (0.18 / 0.3);
  if (t < 0.05) return 0.30 + (t + 0.1) * (0.18 / 0.15);
  if (t < 0.4) return 0.48 + (t - 0.05) * (0.28 / 0.35);
  return 0.76 + (t - 0.4) * (0.24 / 0.6);
}

function calculateBaseHeight(wx, wz, maxH, seaLevel, terrainParams = {}) {
  const domainWarpStrength = terrainParams.domainWarpStrength || 120;
  const domainWarpFreq = terrainParams.domainWarpFreq || 0.0015;
  
  let [wwx, wwz] = domainWarp(wx, wz, domainWarpStrength, domainWarpFreq);
  
  const cont = getContinentalness(wwx, wwz);
  const landFactor = continentShape(cont);
  
  let height;
  const coastThreshold = 0.18;
  if (landFactor < coastThreshold) {
    height = 15 + (landFactor / coastThreshold) * (seaLevel - 15);
  } else {
    const landBase = landFactor - coastThreshold;
    const mountainScale = terrainParams.mountainScale || 0.22; // Gently scaled to reduce columns
    const baseMtnScale = maxH * mountainScale;
    height = seaLevel + landBase * baseMtnScale;
  }
  
  // Low frequency terrace plateau pass
  const plateauNoise = fbm2D(wwx * 0.001, wwz * 0.001, 3);
  let plateauMask = Math.max(0, Math.min(1, (plateauNoise - 0.4) * 3.5));
  if (plateauMask > 0 && landFactor > 0.3) {
    const stepH = 45;
    const terraced = Math.floor(height / stepH) * stepH;
    const lerpFact = Math.pow(Math.sin((height / stepH) * Math.PI - Math.PI/2) * 0.5 + 0.5, 4.0);
    const smoothTerrace = terraced + lerpFact * stepH;
    height = height * (1 - plateauMask) + smoothTerrace * plateauMask;
  }

  // Softened peaks with reduced peak multiplier to eliminate jagged needle structures
  const noiseFreq = terrainParams.noiseFreq || 0.0015; // Smooth out high-frequency peaks
  const ridge = ridgedFbm2D(wwx * noiseFreq, wwz * noiseFreq, 5, 2.0, 0.45);
  const mtnMask = Math.max(0, (landFactor - 0.35) / 0.65); 
  const peakScale = maxH * (terrainParams.peakScale || 0.28); 
  height += Math.pow(ridge, 1.5) * peakScale * Math.pow(mtnMask, 1.4);
  
  // Rolling hillside noise passes
  height += fbm2D(wwx * (noiseFreq * 4.0), wwz * (noiseFreq * 4.0), 4, 2.0, 0.45) * 25 * (0.3 + landFactor * 0.7);

  // Apply Revised Valley and River bed carving directly to heightmap pass
  height = applyRiverAndValleyCarving(height, wx, wz, seaLevel);

  return height;
}


// ----------------------------------------------------------------------
// SECTION 5: FAST HYDRAULIC EROSION
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
      for (let step = 0; step < 12; step++) {
        const h = getH(px, pz);
        const grad = getGrad(px, pz);
        dirX = dirX * 0.15 - grad.x * 0.85;
        dirZ = dirZ * 0.15 - grad.z * 0.85;
        const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (len > 1) { dirX /= len; dirZ /= len; }
        px += dirX; pz += dirZ;
        if (px < 0 || px >= width || pz < 0 || pz >= width) break;
        
        const newH = getH(px, pz);
        const diff = h - newH;
        const speed = Math.sqrt(dirX * dirX + dirZ * dirZ);
        const capacity = Math.max(0.01, diff * speed * 3 + 0.01);
        if (diff > 0) {
          const toErode = Math.min(diff, 0.25 * water);
          if (sediment < capacity) {
            const erodeAmt = Math.min(toErode, (capacity - sediment) * 0.5);
            setH(px, pz, newH - erodeAmt);
            sediment += erodeAmt;
          }
        } else {
          const depositAmt = Math.min(sediment, 0.25 * water);
          setH(px, pz, newH + depositAmt);
          sediment -= depositAmt;
        }
        water *= 0.98;
        if (water < 0.001) break;
      }
    }
  }
  return hm;
}


// ----------------------------------------------------------------------
// SECTION 6: ORGANIC DENSITY FIELD & 3D OVERHANGS (NO COLUMNS)
// ----------------------------------------------------------------------
let outBlockType = 255;
function getTerrainDensity(wx, wy, wz, seaLevel, baseHeight) {
  outBlockType = 255;
  
  // Continuous 3D interpolation to break vertical voxel blocks
  const depth = baseHeight - wy;
  
  // Vertical density gradient
  let density = depth;

  // Multi-scale 3D FBM perturbation (replaces columns with organic shelves and overhangs)
  const perturb = fbm3D(wx * 0.015, wy * 0.018, wz * 0.015, 3, 2.0, 0.55);
  
  // Modulates noise scale slightly around the surface to keep soil terrain smooth
  const noiseAmt = 12.0 * (1.0 - Math.min(1.0, Math.max(0, -depth) / 20.0));
  density += perturb * noiseAmt;

  // Underground cave/cavern carvers
  if (depth > 6) {
    const caveLarge = fbm3D(wx * 0.015, wy * 0.015, wz * 0.015, 3, 2.2, 0.5);
    const caveSmall = fbm3D(wx * 0.038, wy * 0.038, wz * 0.038, 3, 2.0, 0.5);
    const cavern = fbm3D(wx * 0.02, wy * 0.025, wz * 0.02, 4, 2.1, 0.5);
    const tunnel = fbm3D(wx * 0.035, wy * 0.02, wz * 0.035, 3, 2.0, 0.5);
    
    const caveMultiplier = Math.min(1.0, (depth - 6) / 12.0);
    
    density -= Math.max(0, caveLarge * 0.4 + caveSmall * 0.2 - 0.1) * 0.45 * caveMultiplier;
    density -= Math.max(0, cavern - 0.36) * 1.35 * caveMultiplier;
    if (Math.abs(tunnel) < 0.035 && depth > 10) density -= 1.15 * caveMultiplier;
    
    // Obsidian deposits near deep magma zones
    if (wy < 80 && wy > 15) {
      if (fbm3D(wx * 0.08, wy * 0.08, wz * 0.08, 2, 2.0, 0.5) > 0.42 && caveLarge < -0.15) {
        density = 1.6; outBlockType = 11;
      }
    }
  }

  // Under-layer mineral ore patches
  if (wy < baseHeight - 8 && wy > 0) {
    const oreNoise = fbm3D(wx * 0.045, wy * 0.045, wz * 0.045, 2, 2.0, 0.5);
    if (density > 0 && oreNoise > 0.58) {
      if (wy < 18) outBlockType = 10;      // Glowstone deep
      else if (wy < 45) outBlockType = 11; // Obsidian core
      else if (wy < 90) outBlockType = 20; // Brick seams
      else if (wy < 150) outBlockType = 17;// Coal seams
      else outBlockType = 9;               // Cobble pockets
    }
  }

  return density;
}


// ----------------------------------------------------------------------
// SECTION 7: CHUNK DATA BLOCK GENERATORS
// ----------------------------------------------------------------------
function getErodedHeightmap(cx, cz, size, stride, padding, heightLimit, seaLevel) {
  const width = size + padding * 2;
  const hm = new Float32Array(width * width);
  const bx = cx * size * stride, bz = cz * size * stride;
  for (let z = 0; z < width; z++) {
    for (let x = 0; x < width; x++) {
      const wx = bx + (x - padding) * stride, wz = bz + (z - padding) * stride;
      let height = calculateBaseHeight(wx, wz, heightLimit, seaLevel);
      hm[z * width + x] = softenPeaks(height, heightLimit);
    }
  }
  const eroded = erodeHeightmap(hm, width, bx, bz, stride);
  return eroded;
}

function generateFullChunk(cx, cz, size, heightLimit, seaLevel) {
  const padding = 16;
  const blocks = new Uint8Array(size * heightLimit * size);
  const bx = cx * size, bz = cz * size;
  const hmWidth = size + padding * 2;
  const hm = getErodedHeightmap(cx, cz, size, 1, padding, heightLimit, seaLevel);
  
  for (let lz = 0; lz < size; lz++) {
    for (let lx = 0; lx < size; lx++) {
      const baseHeight = hm[(lz + padding) * hmWidth + (lx + padding)];
      const minY = Math.max(0, Math.floor(baseHeight - 140));
      const maxY = Math.min(heightLimit - 1, Math.ceil(baseHeight + 80));
      
      for (let ly = minY; ly <= maxY; ly++) {
        const wx = bx + lx, wy = ly, wz = bz + lz;
        const density = getTerrainDensity(wx, wy, wz, seaLevel, baseHeight);
        const idx = (ly * size + lz) * size + lx;
        blocks[idx] = density > 0 ? ((outBlockType !== 255) ? outBlockType : 3) : 0;
      }
    }
  }
  
  // Seal water boundaries for valleys
  for (let ly = 0; ly <= seaLevel; ly++) {
    for (let i = 0; i < size * size; i++) {
      const idx = ly * size * size + i;
      if (blocks[idx] === 0) blocks[idx] = 7;
    }
  }

  // Seal flat riverbeds directly to fluid blocks
  for (let lz = 0; lz < size; lz++) {
    for (let lx = 0; lx < size; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const rSDF = getRiverSDF(wx, wz);
      if (rSDF < 0.012) {
        const topWaterY = seaLevel;
        const bedY = Math.floor(hm[(lz + padding) * hmWidth + (lx + padding)]);
        for (let wy = bedY + 1; wy <= topWaterY; wy++) {
          const idx = (wy * size + lz) * size + lx;
          if (blocks[idx] === 0) blocks[idx] = 7;
        }
      }
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
  const padding = 16;
  const blocks = new Uint8Array(size * heightLimit * size);
  const bx = cx * size * stride, bz = cz * size * stride;
  const span = size * stride;
  const hmWidth = size + padding * 2;
  
  const hm = getErodedHeightmap(cx, cz, size, stride, padding, heightLimit, seaLevel);
  
  for (let lz = 0; lz < span; lz += stride) {
    const lodZ = lz / stride;
    for (let lx = 0; lx < span; lx += stride) {
      const lodX = lx / stride;
      const wx = bx + lx, wz = bz + lz;
      const baseHeight = hm[(lodZ + padding) * hmWidth + (lodX + padding)];

      const minY = Math.max(0, Math.floor(baseHeight - 140));
      const maxY = Math.min(heightLimit - 1, Math.ceil(baseHeight + 80));

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

  for (let wy = 0; wy <= seaLevel; wy++) {
    for (let lz = 0; lz < span; lz += stride) {
      const lodZ = lz / stride;
      for (let lx = 0; lx < span; lx += stride) {
        const lodX = lx / stride;
        const idx = (wy * size + lodZ) * size + lodX;
        if (blocks[idx] === 0) blocks[idx] = 7;
      }
    }
  }

  for (let lz = 0; lz < span; lz += stride) {
    const lodZ = lz / stride;
    for (let lx = 0; lx < span; lx += stride) {
      const lodX = lx / stride;
      const wx = bx + lx, wz = bz + lz;
      const rSDF = getRiverSDF(wx, wz);
      if (rSDF < 0.012) {
        const topWaterY = seaLevel;
        const bedY = Math.floor(hm[(lodZ + padding) * hmWidth + (lodX + padding)]);
        for (let wy = bedY + 1; wy <= topWaterY; wy++) {
          const idx = (wy * size + lodZ) * size + lodX;
          if (blocks[idx] === 0) blocks[idx] = 7;
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

      const rockNoise = fbm2D(wx * 0.008, wz * 0.008, 2);
      if (rockNoise > 0.62 && strata.surfaceBlock !== 7 && strata.surfaceBlock !== 0) {
        blocks[(top * size + lz) * size + lx] = 9;
        if (top - 1 >= 0) blocks[((top - 1) * size + lz) * size + lx] = 9;
        continue;
      }

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

const TREE_TEMPLATES = [
  [[0,1,0,5],[0,2,0,5],[0,3,0,5],[0,4,0,5],
   [-1,4,0,6],[1,4,0,6],[0,4,-1,6],[0,4,1,6],
   [0,5,0,6],[-1,5,0,6],[1,5,0,6],[0,5,-1,6],[0,5,1,6]],
  [[0,1,0,5],[0,2,0,5],[0,3,0,5],[0,4,0,5],[0,5,0,5],
   [-1,5,0,6],[1,5,0,6],[0,5,-1,6],[0,5,1,6],
   [-1,6,0,6],[1,6,0,6],[0,6,-1,6],[0,6,1,6],[0,7,0,6]],
  [[0,1,0,5],[0,2,0,5],[0,3,0,5],[0,4,0,5],
   [-1,3,0,5],[1,3,0,5],[0,3,-1,5],[0,3,1,5],
   [-2,4,0,6],[2,4,0,6],[0,4,-2,6],[0,4,2,6],
   [-1,4,0,6],[1,4,0,6],[0,4,-1,6],[0,4,1,6],
   [0,5,0,6],[-1,5,0,6],[1,5,0,6],[0,5,-1,6],[0,5,1,6],
   [-1,5,-1,6],[1,5,1,6],[-1,5,1,6],[1,5,-1,6]]
];

function placeTemplate(blocks, size, heightLimit, lx, lz, topY, template) {
  for (const [dx, dy, dz, type] of template) {
    const x = lx + dx, z = lz + dz, y = topY + dy;
    if (x >= 0 && x < size && z >= 0 && z < size && y < heightLimit) {
      const idx = (y * size + z) * size + x;
      if (blocks[idx] === 0 || blocks[idx] === 1) blocks[idx] = type;
    }
  }
}

function paintFlora(blocks, biomeMap, bx, bz, size, heightLimit, seaLevel) {
  for (let lz = 0; lz < size; lz++) {
    for (let lx = 0; lx < size; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const biome = biomeMap[lz * size + lx];
      let top = -1;
      for (let ly = heightLimit - 1; ly >= 0; ly--) {
        const t = blocks[(ly * size + lz) * size + lx];
        if (t === 1 || t === 2) { top = ly; break; }
      }
      
      if (top < seaLevel + 4) continue;

      const rand = hash3(wx, 0, wz) % 1000;
      
      const topBlockIdx = (top * size + lz) * size + lx;
      if (blocks[topBlockIdx] === 1) {
        const grassRand = randFromCoords(wx, 0, wz);
        if (grassRand > 0.8) {
          blocks[((top + 1) * size + lz) * size + lx] = 23;
        } else if (grassRand > 0.9) {
          blocks[((top + 1) * size + lz) * size + lx] = 24;
        }
      }

      if (biome === 3 || biome === 5 || biome === 0) {
        const chance = (biome === 3) ? 970 : (biome === 5 ? 985 : 995);
        if (rand > chance) {
          const templateIdx = hash3(wx, 0, wz) % TREE_TEMPLATES.length;
          placeTemplate(blocks, size, heightLimit, lx, lz, top, TREE_TEMPLATES[templateIdx]);
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
// SECTION 8: GREEDY MESHER
// ----------------------------------------------------------------------
function blockColor(type) {
  if (type >= 0 && type < blockColors.length) {
    return blockColors[type];
  }
  return [1.0, 0.0, 1.0];
}

function buildMeshFromBlocks(blocks, originX, originZ, scaleXZ, size, heightLimit, seaLevel) {
  let isEmpty = true;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] !== 0) {
      isEmpty = false;
      break;
    }
  }
  if (isEmpty) return null;

  function blockAt(x, y, z) {
    if (x >= 0 && x < size && y >= 0 && y < heightLimit && z >= 0 && z < size) {
      return blocks[(y * size + z) * size + x];
    }
    return y <= seaLevel ? 7 : 0;
  }

  const positions = [], colors = [], indices = [];
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
            const vary = 1.0;

            let slopeShade = 0.85; 
            if (d === 1) slopeShade = c > 0 ? 1.0 : 0.6;
            else if (d === 0) slopeShade = 0.75;
            else slopeShade = 0.8;

            const fColR = col[0] * vary * slopeShade;
            const fColG = col[1] * vary * slopeShade;
            const fColB = col[2] * vary * slopeShade;

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

            [p0, p1, p2, p3].forEach(p => {
              positions.push(p[0], p[1], p[2]);
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
    positions: new Float32Array(positions),
    colors: new Float32Array(colors), indices: new Uint16Array(indices), indexCount: indices.length
  };
}

// ----------------------------------------------------------------------
// SECTION 9: THREAD MESSAGE HANDLER
// ----------------------------------------------------------------------
self.onmessage = function(e) {
  const m = e.data;
  if (m.type === 'init') {
    initPerm(m.seed);
    blockColors = m.blockColors || [];
    return;
  }
  
  if (m.type === 'full') {
    const b = generateFullChunk(m.cx, m.cz, m.size, m.height, m.seaLevel);
    const geo = buildMeshFromBlocks(b, m.cx * m.size, m.cz * m.size, 1, m.size, m.height, m.seaLevel);
    const transferList = [b.buffer];
    if (geo) transferList.push(geo.positions.buffer, geo.colors.buffer, geo.indices.buffer);
    self.postMessage({ type: 'full', id: m.id, generation: m.generation, cx: m.cx, cz: m.cz, blocks: b.buffer, geometry: geo }, transferList);
  } else if (m.type === 'lod') {
    const b = generateLODBlockArray(m.cx, m.cz, m.stride, m.size, m.height, m.seaLevel);
    const geo = buildMeshFromBlocks(b, m.cx * m.size * m.stride, m.cz * m.size * m.stride, m.stride, m.size, m.height, m.seaLevel);
    const transferList = [b.buffer];
    if (geo) transferList.push(geo.positions.buffer, geo.colors.buffer, geo.indices.buffer);
    self.postMessage({ type: 'lod', id: m.id, generation: m.generation, cx: m.cx, cz: m.cz, lod: m.lod, blocks: b.buffer, geometry: geo }, transferList);
  } else if (m.type === 'remesh') {
    const b = m.blocks;
    const geo = buildMeshFromBlocks(b, m.cx * m.size, m.cz * m.size, 1, m.size, m.height, m.seaLevel);
    const transferList = [b.buffer];
    if (geo) transferList.push(geo.positions.buffer, geo.colors.buffer, geo.indices.buffer);
    self.postMessage({ type: 'remesh', id: m.id, generation: m.generation, cx: m.cx, cz: m.cz, blocks: b.buffer, geometry: geo }, transferList);
  }
};
`;
