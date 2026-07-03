import { strideForLOD } from "../config.js";

export class Chunk {
  constructor(lod, cx, cz) {
    this.coord = { x: cx, z: cz };
    this.lod = lod;
    this.state = "UNLOADED"; // UNLOADED, REQUESTED, GENERATING, GENERATED, MESH_QUEUED, MESHING, READY, DIRTY, REMESH_QUEUED, UNLOADING
    this.blocks = null;
    this.mesh = null;
    this.nextMesh = null;
    this.nextGeometry = null;
    this.version = 0;
    this.isInitialMesh = true;
    this.lastAccessTime = performance.now();

    const stride = lod === 0 ? 1 : strideForLOD(lod);
    this.originX = cx * stride * 32;
    this.originZ = cz * stride * 32;
  }
}
