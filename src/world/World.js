
import * as THREE from "three";
import { CONFIG, strideForLOD, lodForDistance } from "../config.js";
import { Chunk } from "./Chunk.js";
import { Mesher } from "./Mesher.js";

export class World {
  constructor(scene, blockMaterial, lodMaterials, mesher) {
    this.scene = scene;
    this.blockMaterial = blockMaterial;
    this.lodMaterials = lodMaterials;
    this.mesher = mesher;

    this.chunks = new Map(); // full detail chunks
    this.lodChunks = new Map(); // LOD chunks

    this.meshQueue = [];
    this.remeshQueue = [];

    this.lastPlayerX = 0;
    this.lastPlayerZ = 0;
    this.lastDirX = 0;
    this.lastDirZ = 0;
    this.totalBlocks = 0;
    this.loadedChunks = [];

    // Callback used to dirty shadow maps when scene geometry updates
    this.onMeshApplied = null;

    // Will be set during init
    this.seed = 0;
  }

  /**
   * Initialize with a world seed; also sets up worker pool.
   */
  init(seed) {
    this.seed = seed;
    this.mesher.initWorkerPool(
      seed,
      (type, id, cx, cz, lod, blocks, geometry) => {
        this.#onWorkerDone(type, id, cx, cz, lod, blocks, geometry);
      },
      (job) => {
        if (job.chunkRef && job.chunkRef.state === "REQUESTED") {
          this.#transitionChunkState(job.chunkRef, "GENERATING");
        }
      },
    );
  }

  #onWorkerDone(type, id, cx, cz, lod, blocks, geometry) {
    let chunk =
      type === "full" ? this.getChunk(cx, cz) : this.getLODChunk(lod, cx, cz);
    if (chunk && chunk.state === "GENERATING") {
      chunk.blocks = blocks;
      chunk.nextGeometry = geometry;
      this.#transitionChunkState(chunk, "GENERATED");
      this.#transitionChunkState(chunk, "MESH_QUEUED");
      this.meshQueue.push(chunk);
    }
  }

  // ---------- Chunk accessors ----------
  getChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const chunk = this.chunks.get(key);
    if (chunk) chunk.lastAccessTime = performance.now();
    return chunk;
  }

  setChunk(cx, cz, chunk) {
    this.chunks.set(`${cx},${cz}`, chunk);
  }

  removeChunk(cx, cz) {
    this.chunks.delete(`${cx},${cz}`);
  }

  getLODChunk(lod, cx, cz) {
    const key = `${lod}:${cx},${cz}`;
    const chunk = this.lodChunks.get(key);
    if (chunk) chunk.lastAccessTime = performance.now();
    return chunk;
  }

  setLODChunk(lod, cx, cz, chunk) {
    this.lodChunks.set(`${lod}:${cx},${cz}`, chunk);
  }

  removeLODChunk(lod, cx, cz) {
    this.lodChunks.delete(`${lod}:${cx},${cz}`);
  }

  // ---------- State transitions ----------
  #transitionChunkState(chunk, newState) {
    chunk.state = newState;
  }

  // ---------- Block access ----------
  getBlock(wx, wy, wz) {
    const size = CONFIG.CHUNK_SIZE;
    if (wy < 0) return 9;
    if (wy >= CONFIG.CHUNK_HEIGHT) return 0;
    const cx = Math.floor(wx / size);
    const cz = Math.floor(wz / size);
    const chunk = this.getChunk(cx, cz);
    if (chunk && chunk.blocks) {
      const lx = ((wx % size) + size) % size;
      const lz = ((wz % size) + size) % size;
      return chunk.blocks[(wy * size + lz) * size + lx];
    }
    // Check LOD chunks
    for (let lod = 1; lod <= CONFIG.LOD_RINGS.length; lod++) {
      const stride = strideForLOD(lod);
      const span = size * stride;
      const lcx = Math.floor(wx / span);
      const lcz = Math.floor(wz / span);
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
    const cx = Math.floor(wx / size);
    const cz = Math.floor(wz / size);
    const chunk = this.getChunk(cx, cz);
    if (!chunk || !chunk.blocks) return false;
    const lx = ((wx % size) + size) % size;
    const lz = ((wz % size) + size) % size;
    const idx = (wy * size + lz) * size + lx;
    if (chunk.blocks[idx] === type) return false;
    chunk.blocks[idx] = type;
    chunk.version++;
    if (chunk.state === "VISIBLE" || chunk.state === "READY") {
      this.#transitionChunkState(chunk, "DIRTY");
    }
    // Mark neighbors dirty
    const markDirty = (ncx, ncz) => {
      const n = this.getChunk(ncx, ncz);
      if (n && (n.state === "VISIBLE" || n.state === "READY")) {
        this.#transitionChunkState(n, "DIRTY");
      }
    };
    if (lx === 0) markDirty(cx - 1, cz);
    else if (lx === size - 1) markDirty(cx + 1, cz);
    if (lz === 0) markDirty(cx, cz - 1);
    else if (lz === size - 1) markDirty(cx, cz + 1);
    return true;
  }

  // ---------- Scene integration ----------
  #applyMesh(chunk) {
    if (chunk.mesh) {
      this.scene.remove(chunk.mesh);
      if (this.onMeshApplied) this.onMeshApplied();
      if (chunk.lod === 0) {
        const idx = this.loadedChunks.indexOf(chunk.mesh);
        if (idx !== -1) this.loadedChunks.splice(idx, 1);
      }
      this.totalBlocks -= chunk.mesh.userData.blockCount || 0;
      chunk.mesh.geometry.dispose();
    }
    chunk.mesh = chunk.nextMesh;
    chunk.nextMesh = null;
    if (chunk.mesh) {
      this.scene.add(chunk.mesh);
      if (this.onMeshApplied) this.onMeshApplied();
      if (chunk.lod === 0) this.loadedChunks.push(chunk.mesh);
      this.totalBlocks += chunk.mesh.userData.blockCount || 0;
    }
  }

  #removeMesh(chunk) {
    if (chunk.mesh) {
      this.scene.remove(chunk.mesh);
      if (this.onMeshApplied) this.onMeshApplied();
      if (chunk.lod === 0) {
        const idx = this.loadedChunks.indexOf(chunk.mesh);
        if (idx !== -1) this.loadedChunks.splice(idx, 1);
      }
      this.totalBlocks -= chunk.mesh.userData.blockCount || 0;
      chunk.mesh.geometry.dispose();
      chunk.mesh = null;
    }
    if (chunk.nextMesh) {
      chunk.nextMesh.geometry.dispose();
      chunk.nextMesh = null;
    }
  }

  // ---------- Update logic (formerly ChunkScheduler) ----------
  update(playerPos, cameraForward) {
    this.#updateTargetChunks(playerPos, cameraForward);
    this.#queueDirtyChunks();
    this.#cancelObsoleteWork();
    this.#updatePriorities(playerPos, cameraForward);
    this.#dispatch(4);
  }

  #updateTargetChunks(playerPos, cameraForward) {
    const size = CONFIG.CHUNK_SIZE;
    const fullRadBlocks = CONFIG.FULL_DETAIL_RADIUS * size;
    const px = playerPos.x,
      pz = playerPos.z;
    const playerChunkX = Math.floor(px / size);
    const playerChunkZ = Math.floor(pz / size);

    // ---- Load full detail chunks ----
    const fullRad = CONFIG.FULL_DETAIL_RADIUS;
    for (let dx = -fullRad; dx <= fullRad; dx++) {
      for (let dz = -fullRad; dz <= fullRad; dz++) {
        if (dx * dx + dz * dz > fullRad * fullRad) continue;
        const cx = playerChunkX + dx,
          cz = playerChunkZ + dz;
        const centerX = cx * size + size / 2;
        const centerZ = cz * size + size / 2;
        const distSq = (centerX - px) ** 2 + (centerZ - pz) ** 2;
        if (distSq > fullRadBlocks * fullRadBlocks) continue;

        let chunk = this.getChunk(cx, cz);
        if (
          !chunk ||
          chunk.state === "UNLOADED" ||
          chunk.state === "UNLOADING"
        ) {
          if (!chunk) {
            chunk = new Chunk(0, cx, cz);
            this.setChunk(cx, cz, chunk);
          }
          this.#transitionChunkState(chunk, "REQUESTED");
          this.mesher.requestGeneration(chunk);
        }
      }
    }

    // ---- Load LOD chunks ----
    for (let i = 0; i < CONFIG.LOD_RINGS.length; i++) {
      const ring = CONFIG.LOD_RINGS[i];
      const lod = i + 1;
      const stride = ring.stride;
      const outerRadBlocks = ring.radius * size;
      const innerRadBlocks =
        i === 0
          ? CONFIG.FULL_DETAIL_RADIUS * size
          : CONFIG.LOD_RINGS[i - 1].radius * size;

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
          if (distSq > outerRadBlocks * outerRadBlocks) continue;

          // Check if any sub-chunk is outside inner radius
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
          if (!hasOutsideSubChunk) continue;

          // Frustum culling: skip chunks behind the camera
          const dxF = centerX - px,
            dzF = centerZ - pz;
          if (
            dxF * cameraForward.x + dzF * cameraForward.z <
            -(size * stride * 4)
          )
            continue;

          let chunk = this.getLODChunk(lod, lcx, lcz);
          if (
            !chunk ||
            chunk.state === "UNLOADED" ||
            chunk.state === "UNLOADING"
          ) {
            if (!chunk) {
              chunk = new Chunk(lod, lcx, lcz);
              this.setLODChunk(lod, lcx, lcz, chunk);
            }
            this.#transitionChunkState(chunk, "REQUESTED");
            this.mesher.requestGeneration(chunk);
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

    for (const chunk of this.chunks.values()) {
      const targetLOD = getTargetLOD(chunk.coord.x, chunk.coord.z);
      if (targetLOD === 0) continue;
      if (targetLOD === -1 || isChunkReady(chunk.state)) {
        if (chunk.state !== "UNLOADING" && chunk.state !== "UNLOADED") {
          this.#transitionChunkState(chunk, "UNLOADING");
          this.#removeMesh(chunk);
        }
      }
    }

    for (const chunk of this.lodChunks.values()) {
      const stride = strideForLOD(chunk.lod);
      let keep = false;
      const testPoints = [
        [0, 0],
        [stride / 2, stride / 2],
        [stride - 1, 0],
        [0, stride - 1],
      ];
      for (const [sx, sz] of testPoints) {
        const cx = chunk.coord.x * stride + sx;
        const cz = chunk.coord.z * stride + sz;
        const targetLOD = getTargetLOD(cx, cz);
        if (targetLOD === chunk.lod) {
          keep = true;
          break;
        }
        if (
          targetLOD !== -1 &&
          targetLOD < chunk.lod &&
          !isChunkReady(this.getChunk(cx, cz)?.state)
        ) {
          keep = true;
          break;
        }
      }
      if (!keep && chunk.state !== "UNLOADING" && chunk.state !== "UNLOADED") {
        this.#transitionChunkState(chunk, "UNLOADING");
        this.#removeMesh(chunk);
      }
    }
  }

  #queueDirtyChunks() {
    for (const chunk of this.chunks.values()) {
      if (chunk.state === "DIRTY") {
        this.#transitionChunkState(chunk, "REMESH_QUEUED");
        if (!this.remeshQueue.includes(chunk)) this.remeshQueue.push(chunk);
      }
    }
    for (const chunk of this.lodChunks.values()) {
      if (chunk.state === "DIRTY") {
        this.#transitionChunkState(chunk, "REMESH_QUEUED");
        if (!this.remeshQueue.includes(chunk)) this.remeshQueue.push(chunk);
      }
    }
  }

  #cancelObsoleteWork() {
    this.meshQueue = this.meshQueue.filter((c) => c.state === "MESH_QUEUED");
    this.remeshQueue = this.remeshQueue.filter(
      (c) => c.state === "REMESH_QUEUED",
    );
    if (this.mesher.workerPool) {
      this.mesher.workerPool.pendingJobs =
        this.mesher.workerPool.pendingJobs.filter(
          (job) => job.chunkRef && job.chunkRef.state === "REQUESTED",
        );
    }
  }

  #updatePriorities(playerPos, cameraForward) {
    const getDistSq = (c) => {
      const stride = c.lod === 0 ? 1 : strideForLOD(c.lod);
      const cx = c.originX + (CONFIG.CHUNK_SIZE * stride) / 2;
      const cz = c.originZ + (CONFIG.CHUNK_SIZE * stride) / 2;
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
    if (this.mesher.workerPool) {
      this.mesher.workerPool.pendingJobs.sort(
        (a, b) => getDistSq(a.chunkRef) - getDistSq(b.chunkRef),
      );
    }
    this.meshQueue.sort((a, b) => getDistSq(a) - getDistSq(b));
    this.remeshQueue.sort((a, b) => getDistSq(a) - getDistSq(b));
  }

  #buildMeshForChunk(chunk) {
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
        size: CONFIG.CHUNK_SIZE,
        height: CONFIG.CHUNK_HEIGHT,
        getBlock: (wx, wy, wz) => this.getBlock(wx, wy, wz),
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

    const material = lod > 0 ? this.lodMaterials[lod - 1] : this.blockMaterial;
    const mesh = new THREE.Mesh(bufferGeo, material);
    const yOffset = lod > 0 ? -0.02 : 0;
    mesh.position.set(chunk.originX, yOffset, chunk.originZ);
    mesh.renderOrder = chunk.lod > 0 ? -1 : 0;
    
    // NATIVE SHADOWS!
    mesh.castShadow = chunk.lod === 0;
    mesh.receiveShadow = true;
    
    mesh.userData.blockCount = bufferGeo.index ? bufferGeo.index.count / 3 : 0;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
  }

  #dispatch(maxJobs) {
    this.mesher.dispatchWorkers(maxJobs);

    let meshedThisFrame = 0;
    while (meshedThisFrame < maxJobs && this.meshQueue.length > 0) {
      const chunk = this.meshQueue.shift();
      if (chunk.state !== "MESH_QUEUED") continue;
      this.#transitionChunkState(chunk, "MESHING");
      chunk.nextMesh = this.#buildMeshForChunk(chunk);
      this.#applyMesh(chunk);
      this.#transitionChunkState(chunk, "READY");
      chunk.isInitialMesh = true;
      meshedThisFrame++;
    }

    let remeshedThisFrame = 0;
    while (remeshedThisFrame < maxJobs && this.remeshQueue.length > 0) {
      const chunk = this.remeshQueue.shift();
      if (chunk.state !== "REMESH_QUEUED") continue;
      this.#transitionChunkState(chunk, "MESHING");
      chunk.nextMesh = this.#buildMeshForChunk(chunk);
      this.#applyMesh(chunk);
      this.#transitionChunkState(chunk, "READY");
      chunk.isInitialMesh = false;
      remeshedThisFrame++;
    }
  }

  // ---- Stats ----
  getStats() {
    return {
      fullChunks: this.chunks.size,
      lodChunks: this.lodChunks.size,
      totalBlocks: this.totalBlocks,
      loadedMeshes: this.loadedChunks.length,
    };
  }

  // ---- Reset ----
  reset() {
    this.mesher.cancelAll();
    this.meshQueue = [];
    this.remeshQueue = [];
    for (const chunk of Array.from(this.chunks.values())) {
      this.#removeMesh(chunk);
      this.#transitionChunkState(chunk, "UNLOADED");
    }
    for (const chunk of Array.from(this.lodChunks.values())) {
      this.#removeMesh(chunk);
      this.#transitionChunkState(chunk, "UNLOADED");
    }
    this.chunks.clear();
    this.lodChunks.clear();
    this.loadedChunks = [];
    this.totalBlocks = 0;
  }

  dispose() {
    this.reset();
    this.mesher.dispose();
  }
}