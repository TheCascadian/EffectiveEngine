// main.js
import { Engine } from "./core/Engine.js";
import {
  setHoi4MapDimensions,
  setHoi4LandMask,
  disableHoi4Mode,
} from "./config.js";

(async () => {
  const CHUNK_SIZE = 32;
  const SEA_LEVEL_RAW = 94; // must match worker.js calculateBaseHeight ocean/land split

  function buildHoi4LandMask(heightData, width, height) {
    const centerOffsetX = width / 2;
    const centerOffsetZ = height / 2;
    const horizontalScale = 1.2; // Match the scale used in worker.js

    const worldHalfWidth = centerOffsetX * horizontalScale;
    const worldHalfHeight = centerOffsetZ * horizontalScale;

    const minCx = Math.floor(-worldHalfWidth / CHUNK_SIZE) - 1;
    const maxCx = Math.ceil(worldHalfWidth / CHUNK_SIZE) + 1;
    const minCz = Math.floor(-worldHalfHeight / CHUNK_SIZE) - 1;
    const maxCz = Math.ceil(worldHalfHeight / CHUNK_SIZE) + 1;

    const chunksX = maxCx - minCx;
    const chunksZ = maxCz - minCz;
    const mask = new Uint8Array(chunksX * chunksZ);

    const samples = [
      [0, 0],
      [CHUNK_SIZE - 1, 0],
      [0, CHUNK_SIZE - 1],
      [CHUNK_SIZE - 1, CHUNK_SIZE - 1],
      [CHUNK_SIZE >> 1, CHUNK_SIZE >> 1],
    ];

    for (let iz = 0; iz < chunksZ; iz++) {
      for (let ix = 0; ix < chunksX; ix++) {
        const cx = ix + minCx,
          cz = iz + minCz;
        const wx0 = cx * CHUNK_SIZE,
          wz0 = cz * CHUNK_SIZE;
        let isLand = false;
        for (const [sx, sz] of samples) {
          const hx = Math.floor((wx0 + sx) / horizontalScale + centerOffsetX);
          const hz = Math.floor((wz0 + sz) / horizontalScale + centerOffsetZ);
          if (hx < 0 || hx >= width || hz < 0 || hz >= height) continue;
          if (heightData[hz * width + hx] > SEA_LEVEL_RAW) {
            isLand = true;
            break;
          }
        }
        mask[iz * chunksX + ix] = isLand ? 1 : 0;
      }
    }

    setHoi4LandMask(mask, chunksX, chunksZ, minCx, minCz);
  }

  // 1. Initialize the engine FIRST
  const engine = new Engine();
  await engine.init();
  console.log("Engine ready");

  // 2. Define the map loading function so it has access to 'engine'
  async function loadHOI4Map() {
    try {
      console.log("Fetching HOI4 map images...");

      // Load Heightmap
      const heightImg = new Image();
      heightImg.src = "heightmap.png";
      await new Promise((resolve, reject) => {
        heightImg.onload = resolve;
        heightImg.onerror = reject;
      });

      // Load Terrain map
      const terrainImg = new Image();
      terrainImg.src = "terrain.png";
      await new Promise((resolve, reject) => {
        terrainImg.onload = resolve;
        terrainImg.onerror = reject;
      });

      // Process Heightmap
      const canvas = document.createElement("canvas");
      canvas.width = heightImg.width;
      canvas.height = heightImg.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(heightImg, 0, 0);
      const hData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const totalPixels = canvas.width * canvas.height;
      const hoi4HeightData = new Uint8Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) hoi4HeightData[i] = hData[i * 4];

      // Process Terrain map
      const terrainCanvas = document.createElement("canvas");
      terrainCanvas.width = terrainImg.width;
      terrainCanvas.height = terrainImg.height;
      const tCtx = terrainCanvas.getContext("2d", { willReadFrequently: true });
      tCtx.drawImage(terrainImg, 0, 0);
      const hoi4TerrainData = new Uint8Array(
        tCtx.getImageData(0, 0, terrainCanvas.width, terrainCanvas.height).data,
      );

      // Update config
      setHoi4MapDimensions(canvas.width, canvas.height);
      buildHoi4LandMask(hoi4HeightData, canvas.width, canvas.height);

      // Broadcast to workers (FIX: 'engine' is now correctly in scope)
      if (
        engine.world &&
        engine.world.mesher &&
        engine.world.mesher.workerPool
      ) {
        engine.world.mesher.workerPool.broadcastHoi4MapData(
          hoi4HeightData.buffer,
          null,
          canvas.width,
          canvas.height,
          hoi4TerrainData.buffer,
          terrainCanvas.width,
          terrainCanvas.height,
        );
      }

      engine.world.reset();
      console.log("✅ Real HOI4 Map + Terrain applied!");
    } catch (e) {
      console.error("Failed to load HOI4 map:", e);
      disableHoi4Mode();
    }
  }

  // 3. Give the engine a moment to start workers, then load the maps
  setTimeout(loadHOI4Map, 1500);
})();
