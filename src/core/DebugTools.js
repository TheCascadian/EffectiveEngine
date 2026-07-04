import * as THREE from "three";
import { GUI } from "lil-gui";
import { CONFIG, strideForLOD } from "../config.js";

/**
 * Comprehensive Debugging and Development Tools using lil-gui
 *
 * Features:
 * - Performance monitoring with detailed metrics
 * - Scene inspection and object picking
 * - Chunk/world visualization tools
 * - Lighting and shadow debugging
 * - Camera path recording and playback
 * - Memory usage tracking
 * - Live terrain regeneration with debounced inputs
 * - Custom debug overlays
 */
export class DebugTools {
  constructor(scene, camera, renderer, world = null, lighting = null) {
    if (!scene || !camera) {
      throw new Error("DebugTools: scene and camera are required");
    }

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this._world = world;
    this.lighting = lighting;

    // Debug UI elements
    this.debugPanel = null;
    this.debugOverlay = null;
    this.performanceGraph = null;
    this.sceneGraph = null;

    // GUI instances
    this.gui = null;
    this.terrainFolder = null;

    // Debug objects
    this.debugObjects = [];
    this.gridHelper = null;
    this.axisHelper = null;
    this.chunkBorders = new Map(); // Key: "x,z" coordinate string
    this.lodBorders = new Map(); // Key: "lod:x,z" coordinate string

    // Performance tracking
    this.performanceData = {
      fps: [],
      frameTimes: [],
      memory: [],
      drawCalls: [],
      triangles: [],
      textures: [],
      shaders: [],
    };

    // Camera recording
    this.cameraPath = [];
    this.isRecording = false;
    this.isPlaying = false;
    this.playbackIndex = 0;
    this._recordingInterval = null;
    this._playbackInterval = null;
    this._performanceLoopId = null;

    // Picking
    this.pickedObject = null;
    this.pickPosition = null;
    this.pickMarker = null;

    // Terrain regeneration state
    this._terrainDirty = false;
    this.terrainInputs = null;
    this.terrainParams = null;

    // Settings
    this.settings = {
      showStats: true,
      showGrid: false,
      showAxis: false,
      showChunkBorders: false,
      showLODBorders: false,
      showLightHelpers: false,
      showPerformanceGraph: false,
      showSceneGraph: false,
      showWireframe: false,
      showBoundingBoxes: false,
      showFPS: true,
      showMemory: true,
      showDrawCalls: true,
      showTriangles: true,
      maxPerformanceHistory: 100,
    };

    // Initialize debug UI
    this._initDebugUI();
    this._initDebugObjects();
    this._initPerformanceTracking();
  }

  // Getter and Setter for world to handle dynamic folder creation
  get world() {
    return this._world;
  }

  set world(value) {
    this._world = value;
    if (value) {
      this._createTerrainRegenFolder();
    }
  }

  _initDebugUI() {
    try {
      // Create GUI
      this.gui = new GUI({
        title: "EffectiveEngine Debug",
        width: 320,
        closeOnTop: true,
      });

      this.gui.domElement.id = "debugPanel";
      this.gui.domElement.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        z-index: 1000;
        display: none;
      `;
      document.body.appendChild(this.gui.domElement);

      // Create debug overlay for quick info
      this.debugOverlay = document.createElement("div");
      this.debugOverlay.id = "debugOverlay";
      this.debugOverlay.style.cssText = `
        position: absolute;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 8px 12px;
        color: #0ff;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        z-index: 1000;
        line-height: 1.4;
        display: none;
      `;
      document.body.appendChild(this.debugOverlay);

      // Create performance graph canvas
      this.performanceGraph = document.createElement("canvas");
      this.performanceGraph.id = "performanceGraph";
      this.performanceGraph.width = 300;
      this.performanceGraph.height = 150;
      this.performanceGraph.style.cssText =
        "width: 100%; height: 150px; background: #000; margin-top: 10px; display: none;";
      this.gui.domElement.appendChild(this.performanceGraph);

      // Create scene graph container
      this.sceneGraph = document.createElement("div");
      this.sceneGraph.id = "sceneGraph";
      this.sceneGraph.style.cssText = `
        margin-top: 10px;
        max-height: 200px;
        overflow-y: auto;
        background: rgba(255, 255, 255, 0.05);
        padding: 5px;
        border-radius: 4px;
        font-size: 10px;
        display: none;
      `;
      this.gui.domElement.appendChild(this.sceneGraph);

      // Add debug folders
      this._createDebugFolders();
    } catch (err) {
      console.error("DebugTools: Failed to initialize debug UI:", err);
    }
  }

  _createDebugFolders() {
    if (!this.gui) return;

    try {
      // Visualization Folder
      const vizFolder = this.gui.addFolder("Visualization");
      vizFolder
        .add(this.settings, "showGrid")
        .name("Show Grid")
        .onChange((v) => this.toggleGrid(v));
      vizFolder
        .add(this.settings, "showAxis")
        .name("Show Axis")
        .onChange((v) => this.toggleAxis(v));
      vizFolder
        .add(this.settings, "showChunkBorders")
        .name("Show Chunk Borders")
        .onChange((v) => this.toggleChunkBorders(v));
      vizFolder
        .add(this.settings, "showLODBorders")
        .name("Show LOD Borders")
        .onChange((v) => this.toggleLODBorders(v));
      vizFolder
        .add(this.settings, "showLightHelpers")
        .name("Show Light Helpers")
        .onChange((v) => this.toggleLightHelpers(v));
      vizFolder
        .add(this.settings, "showWireframe")
        .name("Wireframe Mode")
        .onChange((v) => this.toggleWireframe(v));
      vizFolder
        .add(this.settings, "showBoundingBoxes")
        .name("Show Bounding Boxes")
        .onChange((v) => this.toggleBoundingBoxes(v));

      // Performance Folder
      const perfFolder = this.gui.addFolder("Performance");
      perfFolder
        .add(this.settings, "showPerformanceGraph")
        .name("Show Graph")
        .onChange((v) => {
          if (this.performanceGraph) {
            this.performanceGraph.style.display = v ? "block" : "none";
          }
        });
      perfFolder
        .add(this.settings, "showSceneGraph")
        .name("Show Scene Graph")
        .onChange((v) => {
          if (this.sceneGraph) {
            this.sceneGraph.style.display = v ? "block" : "none";
            if (v) this.updateSceneGraph();
          }
        });
      perfFolder
        .add(this.settings, "maxPerformanceHistory")
        .name("History Length")
        .min(10)
        .max(500)
        .step(10);

      // Lighting Folder
      if (this.lighting) {
        const lightingFolder = this.gui.addFolder("Lighting");
        const lightingConfig = {
          enabled: this.lighting.isEnabled(),
          skyboxEnabled: this.lighting.isSkyboxEnabled(),
        };
        lightingFolder
          .add(lightingConfig, "enabled")
          .name("Enable Lighting")
          .onChange((v) => {
            if (this.lighting) this.lighting.setEnabled(v);
          });
        lightingFolder
          .add(lightingConfig, "skyboxEnabled")
          .name("Enable Skybox")
          .onChange((v) => {
            if (this.lighting) this.lighting.setSkyboxEnabled(v);
          });
      }

      // Camera Folder
      const cameraFolder = this.gui.addFolder("Camera");
      cameraFolder
        .add({ record: () => this.toggleRecording() }, "record")
        .name("Start/Stop Recording");
      cameraFolder
        .add({ play: () => this.togglePlayback() }, "play")
        .name("Play/Stop Recording");
      cameraFolder
        .add({ clear: () => this.clearCameraPath() }, "clear")
        .name("Clear Path");

      // Terrain Regeneration Folder
      if (this.world) {
        this._createTerrainRegenFolder();
      }

      // Stats Folder
      const statsFolder = this.gui.addFolder("Stats Display");
      statsFolder.add(this.settings, "showFPS").name("Show FPS");
      statsFolder.add(this.settings, "showMemory").name("Show Memory");
      statsFolder.add(this.settings, "showDrawCalls").name("Show Draw Calls");
      statsFolder.add(this.settings, "showTriangles").name("Show Triangles");

      // Add clear button
      this.gui
        .add({ clear: () => this.clearPerformanceData() }, "clear")
        .name("Clear Performance Data");
    } catch (err) {
      console.error("DebugTools: Failed to create debug folders:", err);
    }
  }

  _createTerrainRegenFolder() {
    if (!this.gui || !this.world || this.terrainFolder) return;

    try {
      this.terrainFolder = this.gui.addFolder("Terrain Regeneration");

      this.terrainConfig = {
        chunkSize: CONFIG.CHUNK_SIZE,
        chunkHeight: CONFIG.CHUNK_HEIGHT,
        seaLevel: CONFIG.SEA_LEVEL,
        detailRadius: CONFIG.FULL_DETAIL_RADIUS,
        mountainScale: 0.25,
        peakScale: 0.4,
        noiseFreq: 0.002,
        regenerate: () => this.regenerateTerrain(),
      };

      this.terrainFolder
        .add(this.terrainConfig, "chunkSize")
        .name("Chunk Size")
        .min(8)
        .max(128)
        .step(1)
        .onChange(() => {
          this._terrainDirty = true;
        });
      this.terrainFolder
        .add(this.terrainConfig, "chunkHeight")
        .name("Chunk Height")
        .min(64)
        .max(2048)
        .step(64)
        .onChange(() => {
          this._terrainDirty = true;
        });
      this.terrainFolder
        .add(this.terrainConfig, "seaLevel")
        .name("Sea Level")
        .min(0)
        .max(1000)
        .step(1)
        .onChange(() => {
          this._terrainDirty = true;
        });
      this.terrainFolder
        .add(this.terrainConfig, "detailRadius")
        .name("Detail Radius")
        .min(2)
        .max(20)
        .step(1)
        .onChange(() => {
          this._terrainDirty = true;
        });
      this.terrainFolder
        .add(this.terrainConfig, "mountainScale")
        .name("Mountain Scale")
        .min(0.1)
        .max(1.0)
        .step(0.05)
        .onChange(() => {
          this._terrainDirty = true;
        });
      this.terrainFolder
        .add(this.terrainConfig, "peakScale")
        .name("Peak Scale")
        .min(0.1)
        .max(1.0)
        .step(0.05)
        .onChange(() => {
          this._terrainDirty = true;
        });
      this.terrainFolder
        .add(this.terrainConfig, "noiseFreq")
        .name("Noise Frequency")
        .min(0.0005)
        .max(0.01)
        .step(0.0005)
        .onChange(() => {
          this._terrainDirty = true;
        });
      this.terrainFolder
        .add(this.terrainConfig, "regenerate")
        .name("Regenerate Terrain");
    } catch (err) {
      console.error(
        "DebugTools: Failed to create terrain regeneration folder:",
        err,
      );
    }
  }

  _initDebugObjects() {
    try {
      // Grid helper
      this.gridHelper = new THREE.GridHelper(100, 100, 0x333333, 0x333333);
      this.gridHelper.visible = false;
      this.scene.add(this.gridHelper);

      // Axis helper
      this.axisHelper = new THREE.AxesHelper(10);
      this.axisHelper.visible = false;
      this.scene.add(this.axisHelper);

      // Pick marker
      this.pickMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true }),
      );
      this.pickMarker.visible = false;
      this.scene.add(this.pickMarker);
    } catch (err) {
      console.error("DebugTools: Failed to initialize debug objects:", err);
    }
  }

  _initPerformanceTracking() {
    this._lastFrameTime = performance.now();
    this._frameCount = 0;
    this._fpsUpdateTime = performance.now();
    this._currentFPS = 0;

    this._performanceLoop();
  }

  _performanceLoop() {
    try {
      // If loop has been requested to stop (e.g. on disposal), abort
      if (this._performanceLoopId === null && this._frameCount > 0) return;

      const now = performance.now();
      const delta = now - this._lastFrameTime;
      this._lastFrameTime = now;

      // Collect performance data
      this._collectPerformanceData(delta, now);

      // Update debug overlay
      this._updateDebugOverlay();

      // Draw performance graph
      if (this.settings.showPerformanceGraph) {
        this._drawPerformanceGraph();
      }

      // Continue loop
      this._performanceLoopId = requestAnimationFrame(() =>
        this._performanceLoop(),
      );
    } catch (err) {
      console.error("DebugTools: Error in performance loop:", err);
      // Safe guard against infinite execution blocks during disposal
      if (this._performanceLoopId !== null) {
        this._performanceLoopId = requestAnimationFrame(() =>
          this._performanceLoop(),
        );
      }
    }
  }

  _collectPerformanceData(delta, now) {
    try {
      // FPS
      this._frameCount++;
      if (now - this._fpsUpdateTime >= 1000) {
        this._currentFPS = Math.round(
          (this._frameCount * 1000) / (now - this._fpsUpdateTime),
        );
        this._frameCount = 0;
        this._fpsUpdateTime = now;
      }

      // Store performance data
      this.performanceData.fps.push(this._currentFPS);
      this.performanceData.frameTimes.push(delta);

      // Memory usage (approximate)
      if (window.performance && window.performance.memory) {
        this.performanceData.memory.push(
          window.performance.memory.usedJSHeapSize / 1048576,
        );
      } else {
        this.performanceData.memory.push(0);
      }

      // Renderer stats
      if (this.renderer && this.renderer.info) {
        const info = this.renderer.info;
        this.performanceData.drawCalls.push(info.render?.calls || 0);
        this.performanceData.triangles.push(info.render?.triangles || 0);
        this.performanceData.textures.push(info.memory?.textures || 0);

        // Safe access for WebGPURenderer compatibility
        this.performanceData.shaders.push(info.programs?.length || 0);
      }

      // Limit history
      const maxHistory = this.settings.maxPerformanceHistory;
      for (const key in this.performanceData) {
        if (this.performanceData[key].length > maxHistory) {
          this.performanceData[key].shift();
        }
      }
    } catch (err) {
      console.error("DebugTools: Error collecting performance data:", err);
    }
  }

  _updateDebugOverlay() {
    if (!this.debugOverlay) return;

    try {
      let html = "";

      if (this.settings.showFPS) {
        html += `FPS: ${this._currentFPS}<br>`;
      }

      if (
        this.settings.showMemory &&
        window.performance &&
        window.performance.memory
      ) {
        const mem = (
          window.performance.memory.usedJSHeapSize / 1048576
        ).toFixed(2);
        html += `MEM: ${mem} MB<br>`;
      }

      if (this.settings.showDrawCalls && this.renderer && this.renderer.info) {
        const calls = this.renderer.info.render?.calls || 0;
        html += `DRAW: ${calls}<br>`;
      }

      if (this.settings.showTriangles && this.renderer && this.renderer.info) {
        const tris = (
          this.renderer.info.render?.triangles || 0
        ).toLocaleString();
        html += `TRIS: ${tris}<br>`;
      }

      // Add camera info
      if (this.camera) {
        const pos = this.camera.position;
        html += `CAM: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}<br>`;
      }

      // Add world info
      if (this.world && typeof this.world.getStats === "function") {
        try {
          const stats = this.world.getStats();
          if (stats) {
            html += `CHUNKS: ${(stats.fullChunks || 0) + (stats.lodChunks || 0)}<br>`;
            html += `BLOCKS: ${(stats.totalBlocks || 0).toLocaleString()}<br>`;
          }
        } catch (err) {
          console.warn("DebugTools: Failed to get world stats:", err);
        }
      }

      this.debugOverlay.innerHTML = html;
    } catch (err) {
      console.error("DebugTools: Error updating debug overlay:", err);
    }
  }

  _drawPerformanceGraph() {
    if (!this.performanceGraph) return;

    try {
      const ctx = this.performanceGraph.getContext("2d");
      if (!ctx) return;

      const width = this.performanceGraph.width;
      const height = this.performanceGraph.height;

      // Clear canvas
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = height * (i / 4);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw FPS graph
      if (this.performanceData.fps && this.performanceData.fps.length > 1) {
        ctx.strokeStyle = "#0f0";
        ctx.lineWidth = 2;
        ctx.beginPath();

        const fpsData = this.performanceData.fps;
        const maxFPS = Math.max(60, ...fpsData.slice(-100));
        const minFPS = Math.min(0, ...fpsData.slice(-100));
        const range = Math.max(1, maxFPS - minFPS);

        for (let i = 0; i < fpsData.length; i++) {
          const x = (i / Math.max(1, fpsData.length - 1)) * width;
          const y = height - ((fpsData[i] - minFPS) / range) * height;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // Draw frame time graph
      if (
        this.performanceData.frameTimes &&
        this.performanceData.frameTimes.length > 1
      ) {
        ctx.strokeStyle = "#f00";
        ctx.lineWidth = 1;
        ctx.beginPath();

        const timeData = this.performanceData.frameTimes;
        const maxTime = Math.max(33, ...timeData.slice(-100));
        const minTime = Math.min(0, ...timeData.slice(-100));
        const range = Math.max(1, maxTime - minTime);

        for (let i = 0; i < timeData.length; i++) {
          const x = (i / Math.max(1, timeData.length - 1)) * width;
          const y = height - ((timeData[i] - minTime) / range) * height;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
    } catch (err) {
      console.error("DebugTools: Error drawing performance graph:", err);
    }
  }

  updateSceneGraph() {
    if (!this.sceneGraph || !this.settings.showSceneGraph) return;

    try {
      let html =
        '<div style="font-weight: bold; margin-bottom: 5px;">Scene Graph</div>';

      // Count objects by type
      const counts = {};
      this.scene.traverse((obj) => {
        const type = obj.type || "Unknown";
        counts[type] = (counts[type] || 0) + 1;
      });

      for (const type in counts) {
        html += `<div>${type}: ${counts[type]}</div>`;
      }

      this.sceneGraph.innerHTML = html;
    } catch (err) {
      console.error("DebugTools: Error updating scene graph:", err);
    }
  }

  // Debug visualization toggles
  toggleGrid(show) {
    try {
      if (this.gridHelper) this.gridHelper.visible = show;
    } catch (err) {
      console.error("DebugTools: Error toggling grid:", err);
    }
  }

  toggleAxis(show) {
    try {
      if (this.axisHelper) this.axisHelper.visible = show;
    } catch (err) {
      console.error("DebugTools: Error toggling axis:", err);
    }
  }

  toggleChunkBorders(show) {
    if (!this.world) return;
    if (show) {
      for (const chunk of this.world.chunks.values()) {
        if (chunk.state !== "READY" && chunk.state !== "VISIBLE") continue;
        const key = `${chunk.coord.x},${chunk.coord.z}`;
        if (this.chunkBorders.has(key)) continue;

        const min = new THREE.Vector3(chunk.originX, 0, chunk.originZ);
        const max = new THREE.Vector3(
          chunk.originX + CONFIG.CHUNK_SIZE,
          CONFIG.CHUNK_HEIGHT,
          chunk.originZ + CONFIG.CHUNK_SIZE,
        );
        const helper = new THREE.Box3Helper(new THREE.Box3(min, max), 0x00ff00);
        this.chunkBorders.set(key, helper);
        this.scene.add(helper);
      }
    } else {
      this.chunkBorders.forEach((helper) => {
        this.scene.remove(helper);
        helper.geometry?.dispose();
        helper.material?.dispose();
      });
      this.chunkBorders.clear();
    }
  }

  toggleLODBorders(show) {
    if (!this.world) return;
    if (show) {
      for (const chunk of this.world.lodChunks.values()) {
        if (chunk.state !== "READY" && chunk.state !== "VISIBLE") continue;
        const key = `${chunk.lod}:${chunk.coord.x},${chunk.coord.z}`;
        if (this.lodBorders.has(key)) continue;

        const stride = strideForLOD(chunk.lod);
        const size = CONFIG.CHUNK_SIZE * stride;
        const min = new THREE.Vector3(chunk.originX, 0, chunk.originZ);
        const max = new THREE.Vector3(
          chunk.originX + size,
          CONFIG.CHUNK_HEIGHT,
          chunk.originZ + size,
        );
        const helper = new THREE.Box3Helper(new THREE.Box3(min, max), 0xffaa00);
        this.lodBorders.set(key, helper);
        this.scene.add(helper);
      }
    } else {
      this.lodBorders.forEach((helper) => {
        this.scene.remove(helper);
        helper.geometry?.dispose();
        helper.material?.dispose();
      });
      this.lodBorders.clear();
    }
  }

  toggleLightHelpers(show) {
    if (!this.lighting) return;

    try {
      if (show) {
        // Add helpers for all lights in the scene
        this.scene.traverse((obj) => {
          if (!obj.isLight || obj.userData.helper) return;

          try {
            let helper;
            if (obj.isDirectionalLight) {
              helper = new THREE.DirectionalLightHelper(obj, 5);
            } else if (obj.isPointLight) {
              helper = new THREE.PointLightHelper(obj, 1);
            } else if (obj.isSpotLight) {
              helper = new THREE.SpotLightHelper(obj);
            } else if (obj.isHemisphereLight) {
              helper = new THREE.HemisphereLightHelper(obj, 1);
            }

            if (helper) {
              obj.userData.helper = helper;
              this.scene.add(helper);
              this.debugObjects.push(helper);
            }
          } catch (err) {
            console.warn("DebugTools: Error creating light helper:", err);
          }
        });
      } else {
        // Remove all light helpers safely
        this.scene.traverse((obj) => {
          if (obj.isLight && obj.userData.helper) {
            try {
              this.scene.remove(obj.userData.helper);
              obj.userData.helper.geometry?.dispose();
              obj.userData.helper.material?.dispose();
              obj.userData.helper = null;
            } catch (err) {
              console.warn("DebugTools: Error removing light helper:", err);
            }
          }
        });
        this.debugObjects = this.debugObjects.filter(
          (obj) => !(obj.type && obj.type.endsWith("Helper")),
        );
      }
    } catch (err) {
      console.error("DebugTools: Error toggling light helpers:", err);
    }
  }

  toggleWireframe(show) {
    if (!this.world) return;
    if (show) {
      for (const chunk of this.world.chunks.values()) {
        if (chunk.state !== "READY" && chunk.state !== "VISIBLE") continue;
        if (!chunk.mesh || chunk._wireframeHelper) continue;

        const edges = new THREE.EdgesGeometry(chunk.mesh.geometry);
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
        const helper = new THREE.LineSegments(edges, mat);

        chunk.mesh.add(helper);
        chunk._wireframeHelper = helper;
      }
    } else {
      for (const chunk of this.world.chunks.values()) {
        if (chunk._wireframeHelper && chunk.mesh) {
          chunk.mesh.remove(chunk._wireframeHelper);
          chunk._wireframeHelper.geometry?.dispose();
          chunk._wireframeHelper.material?.dispose();
          chunk._wireframeHelper = null;
        }
      }
    }
  }

  toggleBoundingBoxes(show) {
    if (!this.world) return;
    if (show) {
      for (const chunk of this.world.chunks.values()) {
        if (chunk.state !== "READY" && chunk.state !== "VISIBLE") continue;
        const min = new THREE.Vector3(chunk.originX, 0, chunk.originZ);
        const max = new THREE.Vector3(
          chunk.originX + CONFIG.CHUNK_SIZE,
          CONFIG.CHUNK_HEIGHT,
          chunk.originZ + CONFIG.CHUNK_SIZE,
        );
        const helper = new THREE.Box3Helper(new THREE.Box3(min, max), 0xff0000);
        this.debugObjects.push(helper);
        this.scene.add(helper);
      }
    } else {
      this.debugObjects = this.debugObjects.filter((obj) => {
        if (obj.type === "Box3Helper" || obj instanceof THREE.Box3Helper) {
          this.scene.remove(obj);
          obj.geometry?.dispose();
          obj.material?.dispose();
          return false;
        }
        return true;
      });
    }
  }

  // Terrain Regeneration
  regenerateTerrain() {
    if (!this.world) {
      console.error("DebugTools: World not initialized");
      return;
    }

    if (!this.terrainConfig) {
      console.error("DebugTools: Terrain config not initialized");
      return;
    }

    try {
      const config = this.terrainConfig;

      // Get values from inputs with fallbacks
      const chunkSize = Math.max(
        8,
        Math.min(128, parseInt(config.chunkSize) || 32),
      );
      const chunkHeight = Math.max(
        64,
        Math.min(2048, parseInt(config.chunkHeight) || 1536),
      );
      const seaLevel = Math.max(
        0,
        Math.min(1000, parseInt(config.seaLevel) || 60),
      );
      const detailRadius = Math.max(
        2,
        Math.min(20, parseInt(config.detailRadius) || 6),
      );
      const mountainScale = Math.max(
        0.1,
        Math.min(1.0, parseFloat(config.mountainScale) || 0.25),
      );
      const peakScale = Math.max(
        0.1,
        Math.min(1.0, parseFloat(config.peakScale) || 0.4),
      );
      const noiseFreq = Math.max(
        0.0005,
        Math.min(0.01, parseFloat(config.noiseFreq) || 0.002),
      );

      // Update CONFIG values
      CONFIG.CHUNK_SIZE = chunkSize;
      CONFIG.CHUNK_HEIGHT = chunkHeight;
      CONFIG.SEA_LEVEL = seaLevel;
      CONFIG.FULL_DETAIL_RADIUS = detailRadius;

      // Update LOD rings based on new detail radius
      if (CONFIG.LOD_RINGS && Array.isArray(CONFIG.LOD_RINGS)) {
        let currentRadius = detailRadius;
        for (let i = 0; i < CONFIG.LOD_RINGS.length; i++) {
          currentRadius += detailRadius * Math.pow(2, i);
          CONFIG.LOD_RINGS[i].radius = currentRadius;
        }
      }

      // Update camera far plane and fog
      if (this.camera) {
        try {
          const maxDistUnits =
            (CONFIG.LOD_RINGS?.[CONFIG.LOD_RINGS.length - 1]?.radius || 256) *
            chunkSize;
          if (this.scene.fog) {
            this.scene.fog.far = maxDistUnits;
          }
          this.camera.far = maxDistUnits + 1000;
          this.camera.updateProjectionMatrix();
        } catch (err) {
          console.warn("DebugTools: Error updating camera:", err);
        }
      }

      // Pass terrain parameters to mesher
      if (this.world && this.world.mesher) {
        try {
          this.world.mesher.setTerrainParams({
            mountainScale,
            peakScale,
            noiseFreq,
          });
        } catch (err) {
          console.warn("DebugTools: Error setting terrain params:", err);
        }
      }

      // Reset the world to regenerate with new parameters
      if (typeof this.world.reset === "function") {
        this.world.reset();
      }

      // Force camera update to trigger chunk loading
      if (this.camera && typeof this.world.update === "function") {
        try {
          const dir = new THREE.Vector3();
          this.camera.getWorldDirection(dir);
          this.world.update(this.camera.position, dir);
        } catch (err) {
          console.warn("DebugTools: Error updating world:", err);
        }
      }

      // Clear dirty flag
      this._terrainDirty = false;

      console.log("DebugTools: Terrain regenerated with new parameters");
    } catch (err) {
      console.error("DebugTools: Error regenerating terrain:", err);
    }
  }

  // Camera recording and playback
  toggleRecording() {
    try {
      this.isRecording = !this.isRecording;

      if (this.isRecording) {
        this.cameraPath = [];
        this._startRecording();
      } else {
        this._stopRecording();
      }
    } catch (err) {
      console.error("DebugTools: Error toggling recording:", err);
    }
  }

  _startRecording() {
    try {
      this._stopRecording();
      this._recordingInterval = setInterval(() => {
        try {
          const cameraData = {
            position: this.camera.position.clone(),
            rotation: this.camera.rotation.clone(),
            time: Date.now(),
          };
          this.cameraPath.push(cameraData);
        } catch (err) {
          console.warn("DebugTools: Error recording camera frame:", err);
        }
      }, 100);
    } catch (err) {
      console.error("DebugTools: Error starting recording:", err);
    }
  }

  _stopRecording() {
    try {
      if (this._recordingInterval !== null) {
        clearInterval(this._recordingInterval);
        this._recordingInterval = null;
      }
    } catch (err) {
      console.error("DebugTools: Error stopping recording:", err);
    }
  }

  togglePlayback() {
    try {
      if (!this.cameraPath || this.cameraPath.length === 0) {
        console.log("DebugTools: No camera path recorded");
        return;
      }

      this.isPlaying = !this.isPlaying;

      if (this.isPlaying) {
        this.playbackIndex = 0;
        this._startPlayback();
      } else {
        this._stopPlayback();
      }
    } catch (err) {
      console.error("DebugTools: Error toggling playback:", err);
    }
  }

  _startPlayback() {
    try {
      this._stopPlayback();

      if (!this.cameraPath || this.cameraPath.length === 0) return;

      const startTime = Date.now();
      const firstFrame = this.cameraPath[0];

      this._playbackInterval = setInterval(() => {
        try {
          const now = Date.now();
          const elapsed = now - startTime;

          // Find the closest frame
          let closestIndex = 0;
          let closestTime = Infinity;

          for (let i = 0; i < this.cameraPath.length; i++) {
            const frameTime = this.cameraPath[i].time - firstFrame.time;
            const timeDiff = Math.abs(frameTime - elapsed);

            if (timeDiff < closestTime) {
              closestTime = timeDiff;
              closestIndex = i;
            }
          }

          this.playbackIndex = closestIndex;
          const frame = this.cameraPath[closestIndex];

          if (frame) {
            // Apply camera position and rotation
            this.camera.position.copy(frame.position);
            this.camera.rotation.copy(frame.rotation);
            this.camera.updateProjectionMatrix();
          }

          // Stop playback when we reach the end
          if (closestIndex >= this.cameraPath.length - 1) {
            this.togglePlayback();
          }
        } catch (err) {
          console.warn("DebugTools: Error during playback:", err);
          this._stopPlayback();
        }
      }, 16);
    } catch (err) {
      console.error("DebugTools: Error starting playback:", err);
    }
  }

  _stopPlayback() {
    try {
      if (this._playbackInterval !== null) {
        clearInterval(this._playbackInterval);
        this._playbackInterval = null;
      }
    } catch (err) {
      console.error("DebugTools: Error stopping playback:", err);
    }
  }

  clearCameraPath() {
    try {
      this.cameraPath = [];
      this.playbackIndex = 0;
      this._stopRecording();
      this._stopPlayback();
    } catch (err) {
      console.error("DebugTools: Error clearing camera path:", err);
    }
  }

  // Object picking
  pickObject(event) {
    if (!this.camera || !this.renderer || !event) return;

    try {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);

      const intersects = raycaster.intersectObjects(this.scene.children, true);

      if (intersects.length > 0) {
        const intersect = intersects[0];
        this.pickedObject = intersect.object;
        this.pickPosition = intersect.point.clone();

        // Show pick marker
        if (this.pickMarker) {
          this.pickMarker.position.copy(intersect.point);
          this.pickMarker.visible = true;
        }

        // Log pick info
        console.log("DebugTools: Picked object:", intersect.object);
        console.log("DebugTools: Position:", intersect.point);
        console.log("DebugTools: Distance:", intersect.distance);

        // Update debug overlay with pick info
        if (this.debugOverlay) {
          const objType = intersect.object.type || "Unknown";
          const objName = intersect.object.name || "(unnamed)";
          const pickInfo =
            `PICKED: ${objType} (${objName})<br>` +
            `POS: ${intersect.point.x.toFixed(2)}, ${intersect.point.y.toFixed(2)}, ${intersect.point.z.toFixed(2)}<br>` +
            `DIST: ${intersect.distance.toFixed(2)}<br>`;

          const currentHtml = this.debugOverlay.innerHTML;
          this.debugOverlay.innerHTML = currentHtml + pickInfo;
        }

        return intersect;
      } else {
        // Clear pick
        this.pickedObject = null;
        this.pickPosition = null;

        if (this.pickMarker) {
          this.pickMarker.visible = false;
        }

        return null;
      }
    } catch (err) {
      console.error("DebugTools: Error picking object:", err);
      return null;
    }
  }

  // Utility functions
  clearPerformanceData() {
    try {
      for (const key in this.performanceData) {
        this.performanceData[key] = [];
      }
    } catch (err) {
      console.error("DebugTools: Error clearing performance data:", err);
    }
  }

  getPerformanceStats() {
    return {
      fps: this._currentFPS || 0,
      frameTimes: [...(this.performanceData.frameTimes || [])],
      memory: [...(this.performanceData.memory || [])],
      drawCalls: [...(this.performanceData.drawCalls || [])],
      triangles: [...(this.performanceData.triangles || [])],
    };
  }

  // Update debug tools (call this every frame)
  update(delta) {
    if (!delta || typeof delta !== "number" || delta < 0) return;

    try {
      // Update scene graph if visible
      if (this.settings.showSceneGraph) {
        this.updateSceneGraph();
      }

      // Update chunk borders if enabled
      if (this.settings.showChunkBorders && this.world) {
        try {
          for (const chunk of this.world.chunks.values()) {
            if (chunk.state !== "READY" && chunk.state !== "VISIBLE") continue;
            const key = `${chunk.coord.x},${chunk.coord.z}`;
            if (this.chunkBorders.has(key)) continue;

            try {
              const min = new THREE.Vector3(chunk.originX, 0, chunk.originZ);
              const max = new THREE.Vector3(
                chunk.originX + CONFIG.CHUNK_SIZE,
                CONFIG.CHUNK_HEIGHT,
                chunk.originZ + CONFIG.CHUNK_SIZE,
              );
              const helper = new THREE.Box3Helper(
                new THREE.Box3(min, max),
                0x00ff00,
              );
              this.chunkBorders.set(key, helper);
              this.scene.add(helper);
            } catch (err) {
              console.warn("DebugTools: Error updating chunk border:", err);
            }
          }
        } catch (err) {
          console.warn("DebugTools: Error in chunk border update:", err);
        }
      }

      // Update LOD borders if enabled
      if (this.settings.showLODBorders && this.world) {
        try {
          for (const chunk of this.world.lodChunks.values()) {
            if (chunk.state !== "READY" && chunk.state !== "VISIBLE") continue;
            const key = `${chunk.lod}:${chunk.coord.x},${chunk.coord.z}`;
            if (this.lodBorders.has(key)) continue;

            try {
              const stride = strideForLOD(chunk.lod);
              const size = CONFIG.CHUNK_SIZE * stride;
              const min = new THREE.Vector3(chunk.originX, 0, chunk.originZ);
              const max = new THREE.Vector3(
                chunk.originX + size,
                CONFIG.CHUNK_HEIGHT,
                chunk.originZ + size,
              );
              const helper = new THREE.Box3Helper(
                new THREE.Box3(min, max),
                0xffaa00,
              );
              this.lodBorders.set(key, helper);
              this.scene.add(helper);
            } catch (err) {
              console.warn("DebugTools: Error updating LOD border:", err);
            }
          }
        } catch (err) {
          console.warn("DebugTools: Error in LOD border update:", err);
        }
      }

      // Sync wireframes for newly loaded chunks if wireframe mode is on
      if (this.settings.showWireframe && this.world) {
        try {
          for (const chunk of this.world.chunks.values()) {
            if (chunk.state !== "READY" && chunk.state !== "VISIBLE") continue;
            if (chunk.mesh && !chunk._wireframeHelper) {
              const edges = new THREE.EdgesGeometry(chunk.mesh.geometry);
              const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
              const helper = new THREE.LineSegments(edges, mat);
              chunk.mesh.add(helper);
              chunk._wireframeHelper = helper;
            }
          }
        } catch (err) {
          console.warn("DebugTools: Error updating wireframes:", err);
        }
      }
    } catch (err) {
      console.error("DebugTools: Error in update:", err);
    }
  }

  dispose() {
    try {
      // Stop animations
      this._stopRecording();
      this._stopPlayback();

      // Stop performance loop
      if (this._performanceLoopId !== null) {
        cancelAnimationFrame(this._performanceLoopId);
        this._performanceLoopId = null;
      }

      // Clean up debug objects
      if (Array.isArray(this.debugObjects)) {
        this.debugObjects.forEach((obj) => {
          try {
            if (obj && obj.parent) obj.parent.remove(obj);
            if (obj && obj.geometry) obj.geometry.dispose();
            if (obj && obj.material) obj.material.dispose();
          } catch (err) {
            console.warn("DebugTools: Error disposing debug object:", err);
          }
        });
      }

      // Clean up helpers
      try {
        if (this.gridHelper) this.scene.remove(this.gridHelper);
        if (this.axisHelper) this.scene.remove(this.axisHelper);
        if (this.pickMarker) this.scene.remove(this.pickMarker);
      } catch (err) {
        console.warn("DebugTools: Error removing helpers:", err);
      }

      // Clean up chunk borders
      if (this.chunkBorders) {
        try {
          this.chunkBorders.forEach((helper) => {
            try {
              if (helper && helper.parent) helper.parent.remove(helper);
              if (helper && helper.geometry) helper.geometry.dispose();
              if (helper && helper.material) helper.material.dispose();
            } catch (err) {
              console.warn("DebugTools: Error disposing chunk border:", err);
            }
          });
          this.chunkBorders.clear();
        } catch (err) {
          console.warn("DebugTools: Error clearing chunk borders:", err);
        }
      }

      // Clean up LOD borders
      if (this.lodBorders) {
        try {
          this.lodBorders.forEach((helper) => {
            try {
              if (helper && helper.parent) helper.parent.remove(helper);
              if (helper && helper.geometry) helper.geometry.dispose();
              if (helper && helper.material) helper.material.dispose();
            } catch (err) {
              console.warn("DebugTools: Error disposing LOD border:", err);
            }
          });
          this.lodBorders.clear();
        } catch (err) {
          console.warn("DebugTools: Error clearing LOD borders:", err);
        }
      }

      // Clean up wireframes
      if (this.world) {
        try {
          for (const chunk of this.world.chunks.values()) {
            if (chunk._wireframeHelper && chunk.mesh) {
              chunk.mesh.remove(chunk._wireframeHelper);
              chunk._wireframeHelper.geometry?.dispose();
              chunk._wireframeHelper.material?.dispose();
              chunk._wireframeHelper = null;
            }
          }
        } catch (err) {
          console.warn("DebugTools: Error cleaning wireframes:", err);
        }
      }

      // Clean up GUI
      if (this.gui) {
        try {
          this.gui.destroy();
          if (this.gui.domElement && this.gui.domElement.parentNode) {
            this.gui.domElement.parentNode.removeChild(this.gui.domElement);
          }
        } catch (err) {
          console.warn("DebugTools: Error disposing GUI:", err);
        }
      }

      // Clean up UI Elements
      try {
        if (this.debugPanel && this.debugPanel.parentNode) {
          this.debugPanel.parentNode.removeChild(this.debugPanel);
        }
        if (this.debugOverlay && this.debugOverlay.parentNode) {
          this.debugOverlay.parentNode.removeChild(this.debugOverlay);
        }
      } catch (err) {
        console.warn("DebugTools: Error removing UI elements:", err);
      }

      console.log("DebugTools: Disposed successfully");
    } catch (err) {
      console.error("DebugTools: Error during disposal:", err);
    }
  }
}
