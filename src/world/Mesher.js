// world/Mesher.js
import * as THREE from "three";
import {
  CONFIG,
  randFromCoords,
  strideForLOD,
  getEffectiveChunkHeight,
} from "../config.js";
import { BLOCK_COLORS } from "../blockRegistry.js";
import { WORKER_SRC } from "../worker.js";

function blockColor(type) {
  if (type >= 0 && type < BLOCK_COLORS.length) {
    return BLOCK_COLORS[type];
  }
  return [1.0, 0.0, 1.0];
}

class WorkerPool {
  constructor(
    workerSrc,
    poolSize,
    onJobDone,
    onJobDispatch,
    seed,
    blockColors,
  ) {
    this.onJobDone = onJobDone;
    this.onJobDispatch = onJobDispatch;
    this.freeWorkers = [];
    this.pendingJobs = [];
    this.allWorkers = [];
    this.generation = 0;
    this.terrainParams = {};

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
      w.postMessage({ type: "init", seed, blockColors });
      this.freeWorkers.push(w);
      this.allWorkers.push(w);
    }
  }

  broadcastHoi4MapData(
    heightDataBuffer,
    biomeDataBuffer,
    width,
    height,
    terrainDataBuffer,
    terrainWidth,
    terrainHeight,
  ) {
    this.allWorkers.forEach((w) => {
      const heightCopy = heightDataBuffer.slice(0);
      const terrainCopy = terrainDataBuffer ? terrainDataBuffer.slice(0) : null;
      const biomeCopy = biomeDataBuffer ? biomeDataBuffer.slice(0) : null;

      const transferables = [heightCopy];
      if (terrainCopy) transferables.push(terrainCopy);
      if (biomeCopy) transferables.push(biomeCopy);

      w.postMessage(
        {
          type: "set_hoi4_map",
          width: width,
          height: height,
          heightData: heightCopy,
          biomeData: biomeCopy,
          terrainData: terrainCopy,
          terrainWidth: terrainWidth || width,
          terrainHeight: terrainHeight || height,
          offsetX: 0,
          offsetZ: 0,
        },
        transferables,
      );
    });
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

  update(maxDispatch = 4) {
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
        height: getEffectiveChunkHeight(),
        seaLevel: CONFIG.SEA_LEVEL,
        terrainParams: this.terrainParams,
        blocks: job.blocks || null,
      });
      dispatched++;
    }
  }
}

export class Mesher {
  constructor() {
    this.workerPool = null;
    this.terrainParams = {};
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
      BLOCK_COLORS,
    );
    this.terrainParams = {};
  }

  setTerrainParams(params) {
    this.terrainParams = { ...this.terrainParams, ...params };
    if (this.workerPool) this.workerPool.terrainParams = this.terrainParams;
  }

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
    if (blocks) {
      let isEmpty = true;
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i] !== 0) {
          isEmpty = false;
          break;
        }
      }
      if (isEmpty) return null;
    }

    const blockAt = (x, y, z) => {
      if (x >= 0 && x < size && y >= 0 && y < height && z >= 0 && z < size) {
        if (blocks) {
          return blocks[(y * size + z) * size + x];
        }
        if (getBlock) {
          return getBlock(originX + x * scaleXZ, y, originZ + z * scaleXZ);
        }
        return 0;
      }

      if (getBlock) {
        return getBlock(originX + x * scaleXZ, y, originZ + z * scaleXZ);
      }

      return 0;
    };

    const positions = [],
      colors = [],
      normals = [],
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

              let nx = 0,
                ny = 0,
                nz = 0;
              if (d === 0) nx = c > 0 ? 1 : -1;
              else if (d === 1) ny = c > 0 ? 1 : -1;
              else nz = c > 0 ? 1 : -1;

              const vary = 1.0;
              let slopeShade = 1.0;
              if (d === 1) slopeShade = c > 0 ? 1.0 : 0.75;
              else slopeShade = 0.9;

              const fColR = Math.round(col[0] * vary * slopeShade * 255);
              const fColG = Math.round(col[1] * vary * slopeShade * 255);
              const fColB = Math.round(col[2] * vary * slopeShade * 255);

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
                colors.push(fColR, fColG, fColB);
                normals.push(nx, ny, nz);
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

    const bufferGeo = new THREE.BufferGeometry();
    bufferGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    bufferGeo.setAttribute(
      "color",
      new THREE.Uint8BufferAttribute(colors, 3, true),
    );
    bufferGeo.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
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

  dispose() {}

  submitRemesh(chunk) {
    if (!this.workerPool) return;
    const id =
      this.workerPool.generation + "_" + this.workerPool.pendingJobs.length;
    this.workerPool.pendingJobs.push({
      id,
      type: "remesh",
      cx: chunk.coord.x,
      cz: chunk.coord.z,
      blocks: chunk.blocks,
      chunkRef: chunk,
    });
  }
}
