import {
  CONFIG,
  BLOCK_COLORS,
  randFromCoords,
  strideForLOD,
  lodForDistance,
} from "./config.js";
import { WORKER_SRC } from "./worker.js";
import * as THREE from "three";

// ---------- WorkerPool ----------
export class WorkerPool {
  constructor(workerSrc, poolSize, onJobDone, onJobDispatch, seed) {
    this.onJobDone = onJobDone;
    this.onJobDispatch = onJobDispatch;
    this.freeWorkers = [];
    this.pendingJobs = [];
    this.generation = 0;

    const blob = new Blob([workerSrc], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    for (let i = 0; i < poolSize; i++) {
      const w = new Worker(url);
      w.onmessage = (e) => {
        const data = e.data;
        if (data.generation !== this.generation) {
          this.freeWorkers.push(w);
          return;
        }
        if (this.onJobDone) {
          this.onJobDone(
            data.type,
            data.id,
            data.cx,
            data.cz,
            data.lod,
            new Uint8Array(data.blocks),
            data.geometry,
          );
        }
        this.freeWorkers.push(w);
      };
      w.postMessage({ type: "init", seed });
      this.freeWorkers.push(w);
    }
  }
  submitGeneration(cx, cz, chunkRef) {
    const id = this.generation + "_" + this.pendingJobs.length;
    this.pendingJobs.push({ id, type: "full", cx, cz, chunkRef });
  }
  submitLOD(cx, cz, lod, stride, chunkRef) {
    const id = this.generation + "_" + this.pendingJobs.length;
    this.pendingJobs.push({ id, type: "lod", cx, cz, lod, stride, chunkRef });
  }
  cancel() {
    this.generation++;
    this.pendingJobs = [];
  }
  update(maxDispatch = 2) {
    let dispatched = 0;
    while (
      dispatched < maxDispatch &&
      this.freeWorkers.length > 0 &&
      this.pendingJobs.length > 0
    ) {
      const w = this.freeWorkers.pop();
      const job = this.pendingJobs.shift();
      if (this.onJobDispatch) this.onJobDispatch(job);
      w.postMessage({
        id: job.id,
        generation: this.generation,
        type: job.type,
        cx: job.cx,
        cz: job.cz,
        lod: job.lod || 0,
        stride: job.stride || 1,
        size: CONFIG.CHUNK_SIZE,
        height: CONFIG.CHUNK_HEIGHT,
        seaLevel: CONFIG.SEA_LEVEL,
      });
      dispatched++;
    }
  }
}

// ---------- Mesher ----------
export class Mesher {
  buildGeometry({
    blocks,
    lod,
    originX,
    originZ,
    scaleXZ,
    size,
    height,
    getBlock,
  }) {
    if (!blocks) return null;
    const positions = [],
      normals = [],
      colors = [],
      indices = [];
    const dims = [size, height, size];
    function blockLocal(x, y, z) {
      const wx = originX + x * scaleXZ,
        wz = originZ + z * scaleXZ;
      if (x < 0 || x >= size || y < 0 || y >= height || z < 0 || z >= size) {
        return getBlock ? getBlock(wx, y, wz) : 255;
      }
      return blocks[(y * size + z) * size + x];
    }
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3,
        v = (d + 2) % 3;
      const x = [0, 0, 0],
        q = [0, 0, 0];
      q[d] = 1;
      const mask = new Int32Array(dims[u] * dims[v]);
      for (x[d] = -1; x[d] < dims[d]; ) {
        let n = 0;
        for (x[v] = 0; x[v] < dims[v]; x[v]++) {
          for (x[u] = 0; x[u] < dims[u]; x[u]++) {
            const a_raw = blockLocal(x[0], x[1], x[2]);
            const b_raw = blockLocal(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
            const a = a_raw === 255 ? 0 : a_raw,
              b = b_raw === 255 ? 0 : b_raw;
            const aSolid = a !== 0,
              bSolid = b !== 0;
            if (aSolid === bSolid) mask[n++] = 0;
            else if (aSolid) mask[n++] = a;
            else mask[n++] = -b;
          }
        }
        x[d]++;
        n = 0;
        for (let j = 0; j < dims[v]; j++) {
          for (let i = 0; i < dims[u]; ) {
            const c = mask[n];
            if (c !== 0) {
              let w = 1;
              while (i + w < dims[u] && mask[n + w] === c) w++;
              let h = 1,
                done = false;
              while (j + h < dims[v]) {
                for (let k = 0; k < w; k++) {
                  if (mask[n + k + h * dims[u]] !== c) {
                    done = true;
                    break;
                  }
                }
                if (done) break;
                h++;
              }
              x[u] = i;
              x[v] = j;
              const du = [0, 0, 0];
              du[u] = w;
              const dv = [0, 0, 0];
              dv[v] = h;
              const blockType = Math.abs(c);
              const col = BLOCK_COLORS[blockType] || BLOCK_COLORS[0];
              const wx = originX + x[0] * scaleXZ,
                wy = x[1],
                wz = originZ + x[2] * scaleXZ;
              const isWater = blockType === 7;
              const vary = isWater
                ? 1.0
                : 0.92 + randFromCoords(wx, wy, wz) * 0.16;
              const slopeShade = d === 1 ? (c > 0 ? 1.08 : 0.55) : 0.78;

              const fColR = col[0] * vary * slopeShade;
              const fColG = col[1] * vary * slopeShade;
              const fColB = col[2] * vary * slopeShade;

              const baseIdx = positions.length / 3;
              let p0, p1, p2, p3;
              if (c > 0) {
                p0 = [x[0] * scaleXZ, x[1], x[2] * scaleXZ];
                p1 = [
                  (x[0] + du[0]) * scaleXZ,
                  x[1] + du[1],
                  (x[2] + du[2]) * scaleXZ,
                ];
                p2 = [
                  (x[0] + du[0] + dv[0]) * scaleXZ,
                  x[1] + du[1] + dv[1],
                  (x[2] + du[2] + dv[2]) * scaleXZ,
                ];
                p3 = [
                  (x[0] + dv[0]) * scaleXZ,
                  x[1] + dv[1],
                  (x[2] + dv[2]) * scaleXZ,
                ];
              } else {
                p0 = [x[0] * scaleXZ, x[1], x[2] * scaleXZ];
                p1 = [
                  (x[0] + dv[0]) * scaleXZ,
                  x[1] + dv[1],
                  (x[2] + dv[2]) * scaleXZ,
                ];
                p2 = [
                  (x[0] + du[0] + dv[0]) * scaleXZ,
                  x[1] + du[1] + dv[1],
                  (x[2] + du[2] + dv[2]) * scaleXZ,
                ];
                p3 = [
                  (x[0] + du[0]) * scaleXZ,
                  x[1] + du[1],
                  (x[2] + du[2]) * scaleXZ,
                ];
              }
              const normal = [0, 0, 0];
              normal[d] = c > 0 ? 1 : -1;
              [p0, p1, p2, p3].forEach((p) => {
                positions.push(p[0], p[1], p[2]);
                normals.push(normal[0], normal[1], normal[2]);
                colors.push(fColR, fColG, fColB);
              });
              indices.push(
                baseIdx,
                baseIdx + 1,
                baseIdx + 2,
                baseIdx,
                baseIdx + 2,
                baseIdx + 3,
              );
              for (let l = 0; l < h; l++)
                for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
              i += w;
              n += w;
            } else {
              i++;
              n++;
            }
          }
        }
      }
    }
    if (positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// ---------- Chunk ----------
export class Chunk {
  constructor(lod, cx, cz) {
    this.coord = { x: cx, z: cz };
    this.lod = lod;
    this.state = "UNLOADED";
    this.blocks = null;
    this.mesh = null;
    this.nextMesh = null;
    this.version = 0;
    this.isInitialMesh = true;
    this.lastAccessTime = performance.now();
    const stride = lod === 0 ? 1 : strideForLOD(lod);
    this.originX = cx * stride * CONFIG.CHUNK_SIZE;
    this.originZ = cz * stride * CONFIG.CHUNK_SIZE;
  }
}

// ---------- World ----------
export class World {
  constructor() {
    this.chunks = new Map();
    this.lodChunks = new Map();
  }
  transitionChunkState(chunk, newState) {
    chunk.state = newState;
  }
  getChunkKey(cx, cz) {
    return `${cx},${cz}`;
  }
  getLODChunkKey(lod, cx, cz) {
    return `${lod}:${cx},${cz}`;
  }
  getChunk(cx, cz) {
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (chunk) chunk.lastAccessTime = performance.now();
    return chunk;
  }
  setChunk(cx, cz, chunk) {
    this.chunks.set(this.getChunkKey(cx, cz), chunk);
  }
  removeChunk(cx, cz) {
    this.chunks.delete(this.getChunkKey(cx, cz));
  }
  getLODChunk(lod, cx, cz) {
    const chunk = this.lodChunks.get(this.getLODChunkKey(lod, cx, cz));
    if (chunk) chunk.lastAccessTime = performance.now();
    return chunk;
  }
  setLODChunk(lod, cx, cz, chunk) {
    this.lodChunks.set(this.getLODChunkKey(lod, cx, cz), chunk);
  }
  removeLODChunk(lod, cx, cz) {
    this.lodChunks.delete(this.getLODChunkKey(lod, cx, cz));
  }

  getBlock(wx, wy, wz) {
    const size = CONFIG.CHUNK_SIZE;
    if (wy < 0) return 9;
    if (wy >= CONFIG.CHUNK_HEIGHT) return 0;
    const cx = Math.floor(wx / size),
      cz = Math.floor(wz / size);
    const chunk = this.getChunk(cx, cz);
    if (chunk && chunk.blocks) {
      const lx = ((wx % size) + size) % size;
      const lz = ((wz % size) + size) % size;
      return chunk.blocks[(wy * size + lz) * size + lx];
    }
    for (let lod = 1; lod <= CONFIG.LOD_RINGS.length; lod++) {
      const stride = strideForLOD(lod);
      const span = size * stride;
      const lcx = Math.floor(wx / span),
        lcz = Math.floor(wz / span);
      const lodChunk = this.getLODChunk(lod, lcx, lcz);
      if (lodChunk && lodChunk.blocks) {
        const localX = Math.floor((wx - lodChunk.originX) / stride);
        const localZ = Math.floor((wz - lodChunk.originZ) / stride);
        if (localX >= 0 && localX < size && localZ >= 0 && localZ < size) {
          return lodChunk.blocks[(wy * size + localZ) * size + localX];
        }
      }
    }
    return 255;
  }

  setBlock(wx, wy, wz, type) {
    const size = CONFIG.CHUNK_SIZE;
    const cx = Math.floor(wx / size),
      cz = Math.floor(wz / size);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.blocks) return false;
    const lx = ((wx % size) + size) % size;
    const lz = ((wz % size) + size) % size;
    const idx = (wy * size + lz) * size + lx;
    if (chunk.blocks[idx] === type) return false;
    chunk.blocks[idx] = type;
    chunk.version++;
    if (chunk.state === "VISIBLE" || chunk.state === "READY")
      this.transitionChunkState(chunk, "DIRTY");

    const markDirty = (ncx, ncz) => {
      const n = this.getChunk(ncx, ncz);
      if (n && (n.state === "VISIBLE" || n.state === "READY"))
        this.transitionChunkState(n, "DIRTY");
    };
    if (lx === 0) markDirty(cx - 1, cz);
    else if (lx === size - 1) markDirty(cx + 1, cz);
    if (lz === 0) markDirty(cx, cz - 1);
    else if (lz === size - 1) markDirty(cx, cz + 1);
    return true;
  }
}

// ---------- ChunkScheduler ----------
export class ChunkScheduler {
  constructor(world, workerSrc, config, mesher, sceneAdapter, seed) {
    this.world = world;
    this.config = config;
    this.mesher = mesher;
    this.sceneAdapter = sceneAdapter;
    this.meshQueue = [];
    this.remeshQueue = [];

    this.lastPlayerX = 0;
    this.lastPlayerZ = 0;
    this.lastDirX = 0;
    this.lastDirZ = 0;

    const poolSize = navigator.hardwareConcurrency
      ? Math.min(6, Math.max(2, navigator.hardwareConcurrency - 2))
      : 3;
    this.pool = new WorkerPool(
      workerSrc,
      poolSize,
      (type, id, cx, cz, lod, blocks, geometry) => {
        let chunk =
          type === "full"
            ? this.world.getChunk(cx, cz)
            : this.world.getLODChunk(lod, cx, cz);
        if (chunk && chunk.state === "GENERATING") {
          chunk.blocks = blocks;
          chunk.nextGeometry = geometry;
          this.world.transitionChunkState(chunk, "GENERATED");
          this.world.transitionChunkState(chunk, "MESH_QUEUED");
          this.meshQueue.push(chunk);
        }
      },
      (job) => {
        if (job.chunkRef && job.chunkRef.state === "REQUESTED") {
          this.world.transitionChunkState(job.chunkRef, "GENERATING");
        }
      },
      seed,
    );
  }

  reset() {
    this.pool.cancel();
    this.meshQueue = [];
    this.remeshQueue = [];
    for (const chunk of Array.from(this.world.chunks.values())) {
      this.sceneAdapter.removeMesh(chunk);
      this.world.transitionChunkState(chunk, "UNLOADED");
    }
    for (const chunk of Array.from(this.world.lodChunks.values())) {
      this.sceneAdapter.removeMesh(chunk);
      this.world.transitionChunkState(chunk, "UNLOADED");
    }
    this.world.chunks.clear();
    this.world.lodChunks.clear();
  }

  updateTargetChunks(playerPos, cameraForward) {
    const size = this.config.CHUNK_SIZE;
    const fullRadBlocks = this.config.FULL_DETAIL_RADIUS * size;
    const px = playerPos.x,
      pz = playerPos.z;
    const playerChunkX = Math.floor(px / size);
    const playerChunkZ = Math.floor(pz / size);

    // ---- Load full detail chunks ----
    const fullRad = this.config.FULL_DETAIL_RADIUS;
    for (let dx = -fullRad; dx <= fullRad; dx++) {
      for (let dz = -fullRad; dz <= fullRad; dz++) {
        if (dx * dx + dz * dz > fullRad * fullRad) continue;
        const cx = playerChunkX + dx,
          cz = playerChunkZ + dz;
        const centerX = cx * size + size / 2;
        const centerZ = cz * size + size / 2;
        const distSq = (centerX - px) ** 2 + (centerZ - pz) ** 2;
        if (distSq > fullRadBlocks * fullRadBlocks) continue;

        let chunk = this.world.getChunk(cx, cz);
        if (
          !chunk ||
          chunk.state === "UNLOADED" ||
          chunk.state === "UNLOADING"
        ) {
          if (!chunk) {
            chunk = new Chunk(0, cx, cz);
            this.world.setChunk(cx, cz, chunk);
          }
          this.world.transitionChunkState(chunk, "REQUESTED");
          this.pool.submitGeneration(cx, cz, chunk);
        }
      }
    }

    // ---- Load LOD chunks ----
    for (let i = 0; i < this.config.LOD_RINGS.length; i++) {
      const ring = this.config.LOD_RINGS[i];
      const lod = i + 1;
      const stride = ring.stride;

      // Calculate radii in blocks
      const outerRadBlocks = ring.radius * size;
      const innerRadBlocks =
        i === 0
          ? this.config.FULL_DETAIL_RADIUS * size
          : this.config.LOD_RINGS[i - 1].radius * size;

      const lcxPlayer = Math.floor(px / (size * stride));
      const lczPlayer = Math.floor(pz / (size * stride));
      const halfRange = Math.ceil(ring.radius / stride);

      for (let lx = -halfRange; lx <= halfRange; lx++) {
        for (let lz = -halfRange; lz <= halfRange; lz++) {
          const lcx = lcxPlayer + lx;
          const lcz = lczPlayer + lz;

          const centerX = lcx * size * stride + (size * stride) / 2;
          const centerZ = lcz * size * stride + (size * stride) / 2;
          const distSq = (centerX - px) ** 2 + (centerZ - pz) ** 2;

          // Skip if outside the outer radius for this LOD ring
          if (distSq > outerRadBlocks * outerRadBlocks) continue;

          // CRITICAL FIX: Check if ANY sub-chunk falls outside the inner radius.
          // If ALL sub-chunks are inside the inner radius, this LOD chunk would
          // overlap with higher-detail chunks, causing z-fighting.
          let hasOutsideSubChunk = false;
          for (let sx = 0; sx < stride; sx++) {
            for (let sz = 0; sz < stride; sz++) {
              const subCx = lcx * stride + sx;
              const subCz = lcz * stride + sz;
              const subCenterX = subCx * size + size / 2;
              const subCenterZ = subCz * size + size / 2;
              const subDistSq = (subCenterX - px) ** 2 + (subCenterZ - pz) ** 2;

              if (subDistSq > innerRadBlocks * innerRadBlocks) {
                hasOutsideSubChunk = true;
                break;
              }
            }
            if (hasOutsideSubChunk) break;
          }

          // If no sub-chunks are outside the inner radius, skip this LOD chunk
          if (!hasOutsideSubChunk) continue;

          // Frustum culling: skip chunks behind the camera
          const dxF = centerX - px;
          const dzF = centerZ - pz;
          if (
            dxF * cameraForward.x + dzF * cameraForward.z <
            -(size * stride * 4)
          ) {
            continue;
          }

          let chunk = this.world.getLODChunk(lod, lcx, lcz);
          if (
            !chunk ||
            chunk.state === "UNLOADED" ||
            chunk.state === "UNLOADING"
          ) {
            if (!chunk) {
              chunk = new Chunk(lod, lcx, lcz);
              this.world.setLODChunk(lod, lcx, lcz, chunk);
            }
            this.world.transitionChunkState(chunk, "REQUESTED");
            this.pool.submitLOD(lcx, lcz, lod, stride, chunk);
          }
        }
      }
    }
    
    // ---- Unload stale chunks ----
    const getTargetLOD = (cx, cz) => {
      const centerX = cx * size + size / 2;
      const centerZ = cz * size + size / 2;
      const distSqBlocks = (centerX - px) ** 2 + (centerZ - pz) ** 2;
      return lodForDistance(distSqBlocks / (size * size));
    };
    const isChunkReady = (state) =>
      ["READY", "VISIBLE", "DIRTY", "REMESH_QUEUED"].includes(state);

    for (const chunk of this.world.chunks.values()) {
      const targetLOD = getTargetLOD(chunk.coord.x, chunk.coord.z);
      if (targetLOD === 0) continue;
      if (targetLOD === -1 || isChunkReady(chunk.state)) {
        if (chunk.state !== "UNLOADING" && chunk.state !== "UNLOADED") {
          this.world.transitionChunkState(chunk, "UNLOADING");
          this.sceneAdapter.removeMesh(chunk);
        }
      }
    }

    for (const chunk of this.world.lodChunks.values()) {
      const stride = strideForLOD(chunk.lod);
      let keep = false;
      const testPoints = [
        [0, 0],
        [stride / 2, stride / 2],
        [stride - 1, 0],
        [0, stride - 1],
      ];
      for (const [sx, sz] of testPoints) {
        const cx = chunk.coord.x * stride + sx,
          cz = chunk.coord.z * stride + sz;
        const targetLOD = getTargetLOD(cx, cz);
        if (targetLOD === chunk.lod) {
          keep = true;
          break;
        }
        if (
          targetLOD !== -1 &&
          targetLOD < chunk.lod &&
          !isChunkReady(this.world.getChunk(cx, cz)?.state)
        ) {
          keep = true;
          break;
        }
      }
      if (!keep && chunk.state !== "UNLOADING" && chunk.state !== "UNLOADED") {
        this.world.transitionChunkState(chunk, "UNLOADING");
        this.sceneAdapter.removeMesh(chunk);
      }
    }
  }

  queueDirtyChunks() {
    for (const chunk of this.world.chunks.values()) {
      if (chunk.state === "DIRTY") {
        this.world.transitionChunkState(chunk, "REMESH_QUEUED");
        if (!this.remeshQueue.includes(chunk)) this.remeshQueue.push(chunk);
      }
    }
    for (const chunk of this.world.lodChunks.values()) {
      if (chunk.state === "DIRTY") {
        this.world.transitionChunkState(chunk, "REMESH_QUEUED");
        if (!this.remeshQueue.includes(chunk)) this.remeshQueue.push(chunk);
      }
    }
  }

  cancelObsoleteWork() {
    this.meshQueue = this.meshQueue.filter((c) => c.state === "MESH_QUEUED");
    this.remeshQueue = this.remeshQueue.filter(
      (c) => c.state === "REMESH_QUEUED",
    );
    this.pool.pendingJobs = this.pool.pendingJobs.filter(
      (job) => job.chunkRef && job.chunkRef.state === "REQUESTED",
    );
  }

  updatePriorities(playerPos, cameraForward) {
    const getDistSq = (c) => {
      const stride = c.lod === 0 ? 1 : strideForLOD(c.lod);
      const cx = c.originX + (this.config.CHUNK_SIZE * stride) / 2;
      const cz = c.originZ + (this.config.CHUNK_SIZE * stride) / 2;
      let distSq = (cx - playerPos.x) ** 2 + (cz - playerPos.z) ** 2;

      const dirX = cx - playerPos.x,
        dirZ = cz - playerPos.z;
      const lenSq = dirX * dirX + dirZ * dirZ;
      if (lenSq > 0) {
        const len = Math.sqrt(lenSq);
        const dot =
          (dirX / len) * cameraForward.x + (dirZ / len) * cameraForward.z;
        if (dot < 0.3) distSq += 10000000;
      }
      return distSq;
    };
    this.pool.pendingJobs.sort(
      (a, b) => getDistSq(a.chunkRef) - getDistSq(b.chunkRef),
    );
    this.meshQueue.sort((a, b) => getDistSq(a) - getDistSq(b));
    this.remeshQueue.sort((a, b) => getDistSq(a) - getDistSq(b));
  }

  buildMeshForChunk(chunk) {
    const lod = chunk.lod;
    const scaleXZ = lod === 0 ? 1 : strideForLOD(lod);
    let geo = chunk.nextGeometry;

    if (!geo) {
      geo = this.mesher.buildGeometry({
        blocks: chunk.blocks,
        lod,
        originX: chunk.originX,
        originZ: chunk.originZ,
        scaleXZ,
        size: this.config.CHUNK_SIZE,
        height: this.config.CHUNK_HEIGHT,
        getBlock: (wx, wy, wz) => this.world.getBlock(wx, wy, wz),
      });
    }

    chunk.nextGeometry = null;
    if (!geo) return null;

    let bufferGeo;
    if (geo instanceof THREE.BufferGeometry) {
      bufferGeo = geo;
    } else {
      bufferGeo = new THREE.BufferGeometry();
      bufferGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(new Float32Array(geo.positions), 3),
      );
      bufferGeo.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(new Float32Array(geo.normals), 3),
      );
      bufferGeo.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(new Float32Array(geo.colors), 3),
      );
      bufferGeo.setIndex(
        new THREE.Uint16BufferAttribute(new Uint16Array(geo.indices), 1),
      );
      bufferGeo.computeBoundingSphere();
    }

    const material =
      lod > 0
        ? this.sceneAdapter.lodMaterials[lod - 1]
        : this.sceneAdapter.blockMaterial;

    const mesh = new THREE.Mesh(bufferGeo, material);

    // FIX: Add small Y-offset for LOD chunks to prevent z-fighting
    const yOffset = lod > 0 ? -0.02 : 0;
    mesh.position.set(chunk.originX, yOffset, chunk.originZ);

    mesh.renderOrder = chunk.lod > 0 ? -1 : 0;
    mesh.castShadow = chunk.lod === 0;
    mesh.receiveShadow = true;
    mesh.userData.blockCount = bufferGeo.index ? bufferGeo.index.count / 3 : 0;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
  }

  dispatch(maxJobs) {
    this.pool.update(maxJobs);
    let meshedThisFrame = 0;
    while (meshedThisFrame < maxJobs && this.meshQueue.length > 0) {
      const chunk = this.meshQueue.shift();
      if (chunk.state !== "MESH_QUEUED") continue;
      this.world.transitionChunkState(chunk, "MESHING");
      chunk.nextMesh = this.buildMeshForChunk(chunk);

      // Hook scene additions to clear old mesh allocations
      this.sceneAdapter.applyMesh(chunk);

      this.world.transitionChunkState(chunk, "READY");
      chunk.isInitialMesh = true;
      meshedThisFrame++;
    }
    let remeshedThisFrame = 0;
    while (remeshedThisFrame < maxJobs && this.remeshQueue.length > 0) {
      const chunk = this.remeshQueue.shift();
      if (chunk.state !== "REMESH_QUEUED") continue;
      this.world.transitionChunkState(chunk, "MESHING");
      chunk.nextMesh = this.buildMeshForChunk(chunk);

      // Hook remeshed scene replacements
      this.sceneAdapter.applyMesh(chunk);

      this.world.transitionChunkState(chunk, "READY");
      chunk.isInitialMesh = false;
      remeshedThisFrame++;
    }
  }

  update(playerPos, cameraForward, frameDeltaMs) {
    this.updateTargetChunks(playerPos, cameraForward);
    this.queueDirtyChunks();
    this.cancelObsoleteWork();
    this.updatePriorities(playerPos, cameraForward);
    this.dispatch(4);
  }

  markNeighborsDirty(chunk) {
    const stride = chunk.lod === 0 ? 1 : strideForLOD(chunk.lod);
    const size = CONFIG.CHUNK_SIZE;
    const minX = chunk.originX - 0.1,
      minZ = chunk.originZ - 0.1;
    const maxX = chunk.originX + size * stride + 0.1,
      maxZ = chunk.originZ + size * stride + 0.1;

    const checkIntersection = (otherChunk) => {
      if (otherChunk === chunk || otherChunk.state !== "VISIBLE") return;
      const otherStride =
        otherChunk.lod === 0 ? 1 : strideForLOD(otherChunk.lod);
      const oMinX = otherChunk.originX,
        oMinZ = otherChunk.originZ;
      const oMaxX = otherChunk.originX + size * otherStride,
        oMaxZ = otherChunk.originZ + size * otherStride;
      if (minX < oMaxX && maxX > oMinX && minZ < oMaxZ && maxZ > oMinZ) {
        this.world.transitionChunkState(otherChunk, "DIRTY");
      }
    };

    for (const c of this.world.chunks.values()) checkIntersection(c);
    for (const c of this.world.lodChunks.values()) checkIntersection(c);
  }
}
