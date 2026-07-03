import * as THREE from "three";
import {
  CONFIG,
  BLOCK_COLORS,
  randFromCoords,
  strideForLOD,
} from "../config.js";
import { WORKER_SRC } from "../worker.js";

// ---------- Block Color Map (Matches your worker) ----------
function blockColor(type) {
  switch (type) {
    case 1:
      return [0.361, 0.663, 0.141];
    case 2:
      return [0.475, 0.333, 0.227];
    case 3:
      return [0.533, 0.549, 0.553];
    case 4:
      return [0.89, 0.788, 0.525];
    case 5:
      return [0.361, 0.251, 0.2];
    case 6:
      return [0.227, 0.478, 0.157];
    case 7:
      return [0.259, 0.647, 0.961];
    case 8:
      return [1.0, 1.0, 1.0];
    case 9:
      return [0.227, 0.247, 0.267];
    case 10:
      return [0.541, 0.169, 0.886];
    case 11:
      return [0.294, 0.0, 0.51];
    case 12:
      return [0.867, 0.627, 0.867];
    case 13:
      return [0.2, 1.0, 0.706];
    case 14:
      return [1.0, 0.2, 1.0];
    case 15:
      return [0.824, 0.706, 0.549];
    case 16:
      return [0.804, 0.361, 0.361];
    case 17:
      return [0.871, 0.722, 0.529];
    case 18:
      return [0.133, 0.545, 0.133];
    case 19:
      return [0.102, 0.102, 0.102];
    case 20:
      return [1.0, 0.6, 0.0];
    case 21:
      return [0.545, 0.0, 0.0];
    case 22:
      return [0.0, 0.392, 0.0];
    case 23:
      return [0.678, 0.847, 0.902];
    default:
      return [1.0, 0.0, 1.0];
  }
}

// ---------- WorkerPool (complete) ----------
class WorkerPool {
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
        terrainParams: this.terrainParams,
      });
      dispatched++;
    }
  }
}

// ---------- Mesher ----------
export class Mesher {
  constructor() {
    this.workerPool = null;
  }

  initWorkerPool(seed, onJobDone, onJobDispatch) {
    const poolSize = navigator.hardwareConcurrency
      ? Math.min(6, Math.max(2, navigator.hardwareConcurrency - 2))
      : 3;
    this.workerPool = new WorkerPool(
      WORKER_SRC,
      poolSize,
      onJobDone,
      onJobDispatch,
      seed,
    );
    this.terrainParams = {};
  }

  setTerrainParams(params) {
    this.terrainParams = { ...this.terrainParams, ...params };
  }

  // --- FIX: FULL CPU GREEDY MESHER IMPLEMENTATION ---
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
    // Use the provided blocks array directly (from chunk.blocks)
    // Or fallback to getBlock if we're simulating (not used here, but keeps compatibility)
    const blockAt = (x, y, z) => {
      if (x < 0 || x >= size || y < 0 || y >= height || z < 0 || z >= size) {
        return y <= 60 ? 7 : 0;
      }
      // Main thread has direct block access
      if (blocks) {
        return blocks[(y * size + z) * size + x];
      }
      // fallback for unloaded chunks
      return getBlock(originX + x * scaleXZ, y, originZ + z * scaleXZ);
    };

    const positions = [],
      normals = [],
      colors = [],
      indices = [];
    const dims = [size, height, size];

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
            const a = blockAt(x[0], x[1], x[2]);
            const b = blockAt(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
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
              const col = blockColor(blockType);
              const wx = originX + x[0] * scaleXZ,
                wy = x[1],
                wz = originZ + x[2] * scaleXZ;
              const isWater = blockType === 7;
              const vary = isWater
                ? 1.0
                : 0.92 + randFromCoords(wx, wy, wz) * 0.16;

              let slopeShade = 0.85;
              if (d === 1) slopeShade = c > 0 ? 1.0 : 0.6;
              else if (d === 0) slopeShade = 0.75;
              else slopeShade = 0.8;

              const nx = d === 0 ? (c > 0 ? 1 : -1) : 0;
              const ny = d === 1 ? (c > 0 ? 1 : -1) : 0;
              const nz = d === 2 ? (c > 0 ? 1 : -1) : 0;

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

              [p0, p1, p2, p3].forEach((p) => {
                positions.push(p[0], p[1], p[2]);
                normals.push(nx, ny, nz);
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

    // Build BufferGeometry directly to save time
    const bufferGeo = new THREE.BufferGeometry();
    bufferGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    bufferGeo.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    bufferGeo.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );
    bufferGeo.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
    bufferGeo.computeBoundingSphere();

    return bufferGeo;
  }

  requestGeneration(chunk) {
    if (!this.workerPool) return;
    if (chunk.lod === 0) {
      this.workerPool.submitGeneration(chunk.coord.x, chunk.coord.z, chunk);
    } else {
      const stride = chunk.lod === 0 ? 1 : strideForLOD(chunk.lod);
      this.workerPool.submitLOD(
        chunk.coord.x,
        chunk.coord.z,
        chunk.lod,
        stride,
        chunk,
      );
    }
  }

  dispatchWorkers(maxJobs) {
    if (this.workerPool) this.workerPool.update(maxJobs);
  }

  cancelAll() {
    if (this.workerPool) this.workerPool.cancel();
  }

  dispose() {
    // optional cleanup
  }
}
