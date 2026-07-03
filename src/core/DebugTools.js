import * as THREE from "three";
import { GUI } from "lil-gui";

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
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.world = world;
    this.lighting = lighting;

    // Debug UI elements
    this.debugPanel = null;
    this.debugOverlay = null;
    this.performanceGraph = null;
    this.sceneGraph = null;

    // GUI instance
    this.gui = null;

    // Debug objects
    this.debugObjects = [];
    this.gridHelper = null;
    this.axisHelper = null;
    this.chunkBorders = new Map();
    this.lodBorders = new Map();

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

    // Picking
    this.pickedObject = null;
    this.pickPosition = null;
    this.pickMarker = null;

    // Terrain regeneration state
    this._terrainDirty = false;
    this.terrainInputs = null;
    this.terrainParams = null;

    // Wireframe materials for WebGPU compatibility
    this._wireframeMaterials = new Map();
    this._originalMaterials = new Map();

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

  _initDebugUI() {
    // Create GUI
    this.gui = new GUI({ 
      title: "EffectiveEngine Debug",
      width: 320,
      closeOnTop: true
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
    this.performanceGraph.style.cssText = "width: 100%; height: 150px; background: #000; margin-top: 10px; display: none;";
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
  }

  _createDebugFolders() {
    // Visualization Folder
    const vizFolder = this.gui.addFolder("Visualization");
    vizFolder.add(this.settings, "showGrid").name("Show Grid").onChange((v) => this.toggleGrid(v));
    vizFolder.add(this.settings, "showAxis").name("Show Axis").onChange((v) => this.toggleAxis(v));
    vizFolder.add(this.settings, "showChunkBorders").name("Show Chunk Borders").onChange((v) => this.toggleChunkBorders(v));
    vizFolder.add(this.settings, "showLODBorders").name("Show LOD Borders").onChange((v) => this.toggleLODBorders(v));
    vizFolder.add(this.settings, "showLightHelpers").name("Show Light Helpers").onChange((v) => this.toggleLightHelpers(v));
    vizFolder.add(this.settings, "showWireframe").name("Wireframe Mode").onChange((v) => this.toggleWireframe(v));
    vizFolder.add(this.settings, "showBoundingBoxes").name("Show Bounding Boxes").onChange((v) => this.toggleBoundingBoxes(v));

    // Performance Folder
    const perfFolder = this.gui.addFolder("Performance");
    perfFolder.add(this.settings, "showPerformanceGraph").name("Show Graph").onChange((v) => {
      this.performanceGraph.style.display = v ? "block" : "none";
    });
    perfFolder.add(this.settings, "showSceneGraph").name("Show Scene Graph").onChange((v) => {
      this.sceneGraph.style.display = v ? "block" : "none";
      if (v) this.updateSceneGraph();
    });
    perfFolder.add(this.settings, "maxPerformanceHistory").name("History Length").min(10).max(500).step(10);

    // Lighting Folder
    if (this.lighting) {
      const lightingFolder = this.gui.addFolder("Lighting");
      lightingFolder.add(this.lighting, "enabled").name("Enable Lighting").onChange((v) => this.lighting.setEnabled(v));
      lightingFolder.add(this.lighting, "skyboxEnabled").name("Enable Skybox").onChange((v) => this.lighting.setSkyboxEnabled(v));
    }

    // Camera Folder
    const cameraFolder = this.gui.addFolder("Camera");
    cameraFolder.add({ record: () => this.toggleRecording() }, "record").name("Start/Stop Recording");
    cameraFolder.add({ play: () => this.togglePlayback() }, "play").name("Play/Stop Recording");
    cameraFolder.add({ clear: () => this.clearCameraPath() }, "clear").name("Clear Path");

    // Terrain Regeneration Folder
    this._createTerrainRegenFolder();

    // Stats Folder
    const statsFolder = this.gui.addFolder("Stats Display");
    statsFolder.add(this.settings, "showFPS").name("Show FPS");
    statsFolder.add(this.settings, "showMemory").name("Show Memory");
    statsFolder.add(this.settings, "showDrawCalls").name("Show Draw Calls");
    statsFolder.add(this.settings, "showTriangles").name("Show Triangles");

    // Add clear button
    this.gui.add({ clear: () => this.clearPerformanceData() }, "clear").name("Clear Performance Data");
  }

  _createTerrainRegenFolder() {
    const terrainFolder = this.gui.addFolder("Terrain Regeneration");
    
    // Store terrain parameters in a dedicated object for lil-gui
    this.terrainConfig = {
      chunkSize: 32,
      chunkHeight: 1536,
      seaLevel: 60,
      detailRadius: 6,
      mountainScale: 0.45,
      peakScale: 0.5,
      noiseFreq: 0.002,
      regenerate: () => this.regenerateTerrain()
    };

    terrainFolder.add(this.terrainConfig, "chunkSize").name("Chunk Size").min(8).max(128).step(1).onChange(() => {
      this._terrainDirty = true;
    });
    terrainFolder.add(this.terrainConfig, "chunkHeight").name("Chunk Height").min(64).max(2048).step(64).onChange(() => {
      this._terrainDirty = true;
    });
    terrainFolder.add(this.terrainConfig, "seaLevel").name("Sea Level").min(0).max(1000).step(1).onChange(() => {
      this._terrainDirty = true;
    });
    terrainFolder.add(this.terrainConfig, "detailRadius").name("Detail Radius").min(2).max(20).step(1).onChange(() => {
      this._terrainDirty = true;
    });
    terrainFolder.add(this.terrainConfig, "mountainScale").name("Mountain Scale").min(0.1).max(1.0).step(0.05).onChange(() => {
      this._terrainDirty = true;
    });
    terrainFolder.add(this.terrainConfig, "peakScale").name("Peak Scale").min(0.1).max(1.0).step(0.05).onChange(() => {
      this._terrainDirty = true;
    });
    terrainFolder.add(this.terrainConfig, "noiseFreq").name("Noise Frequency").min(0.0005).max(0.01).step(0.0005).onChange(() => {
      this._terrainDirty = true;
    });
    terrainFolder.add(this.terrainConfig, "regenerate").name("Regenerate Terrain");
  }

  _initDebugObjects() {
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
  }

  _initPerformanceTracking() {
    // Set up performance monitoring
    this._lastFrameTime = performance.now();
    this._frameCount = 0;
    this._fpsUpdateTime = performance.now();
    this._currentFPS = 0;

    // Start performance tracking loop
    this._performanceLoop();
  }

  _performanceLoop() {
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
    requestAnimationFrame(() => this._performanceLoop());
  }

  _collectPerformanceData(delta, now) {
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
    if (this.renderer) {
      const info = this.renderer.info;
      this.performanceData.drawCalls.push(info.render.calls);
      this.performanceData.triangles.push(info.render.triangles);
      this.performanceData.textures.push(info.memory.textures);
      this.performanceData.shaders.push(info.programs.length);
    }

    // Limit history
    const maxHistory = this.settings.maxPerformanceHistory;
    for (const key in this.performanceData) {
      if (this.performanceData[key].length > maxHistory) {
        this.performanceData[key].shift();
      }
    }
  }

  _updateDebugOverlay() {
    if (!this.debugOverlay) return;

    let html = "";

    if (this.settings.showFPS) {
      html += `FPS: ${this._currentFPS}<br>`;
    }

    if (
      this.settings.showMemory &&
      window.performance &&
      window.performance.memory
    ) {
      const mem = (window.performance.memory.usedJSHeapSize / 1048576).toFixed(
        2,
      );
      html += `MEM: ${mem} MB<br>`;
    }

    if (this.settings.showDrawCalls && this.renderer) {
      const calls = this.renderer.info.render.calls;
      html += `DRAW: ${calls}<br>`;
    }

    if (this.settings.showTriangles && this.renderer) {
      const tris = this.renderer.info.render.triangles.toLocaleString();
      html += `TRIS: ${tris}<br>`;
    }

    // Add camera info
    if (this.camera) {
      const pos = this.camera.position;
      html += `CAM: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}<br>`;
    }

    // Add world info
    if (this.world) {
      const stats = this.world.getStats();
      html += `CHUNKS: ${stats.fullChunks + stats.lodChunks}<br>`;
      html += `BLOCKS: ${stats.totalBlocks.toLocaleString()}<br>`;
    }

    this.debugOverlay.innerHTML = html;
  }

  _drawPerformanceGraph() {
    if (!this.performanceGraph) return;

    const ctx = this.performanceGraph.getContext("2d");
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
    if (this.performanceData.fps.length > 1) {
      ctx.strokeStyle = "#0f0";
      ctx.lineWidth = 2;
      ctx.beginPath();

      const maxFPS = Math.max(...this.performanceData.fps, 60);
      const minFPS = Math.min(...this.performanceData.fps, 0);
      const range = maxFPS - minFPS || 1;

      for (let i = 0; i < this.performanceData.fps.length; i++) {
        const x = (i / (this.performanceData.fps.length - 1)) * width;
        const y =
          height - ((this.performanceData.fps[i] - minFPS) / range) * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Draw frame time graph
    if (this.performanceData.frameTimes.length > 1) {
      ctx.strokeStyle = "#f00";
      ctx.lineWidth = 1;
      ctx.beginPath();

      const maxTime = Math.max(...this.performanceData.frameTimes, 33);
      const minTime = Math.min(...this.performanceData.frameTimes, 0);
      const range = maxTime - minTime || 1;

      for (let i = 0; i < this.performanceData.frameTimes.length; i++) {
        const x = (i / (this.performanceData.frameTimes.length - 1)) * width;
        const y =
          height -
          ((this.performanceData.frameTimes[i] - minTime) / range) * height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  updateSceneGraph() {
    if (!this.sceneGraph || !this.settings.showSceneGraph) return;

    let html =
      '<div style="font-weight: bold; margin-bottom: 5px;">Scene Graph</div>';

    // Count objects by type
    const counts = {};
    this.scene.traverse((obj) => {
      const type = obj.type;
      counts[type] = (counts[type] || 0) + 1;
    });

    for (const type in counts) {
      html += `<div>${type}: ${counts[type]}</div>`;
    }

    this.sceneGraph.innerHTML = html;
  }

  // Debug visualization toggles
  toggleGrid(show) {
    if (this.gridHelper) this.gridHelper.visible = show;
  }

  toggleAxis(show) {
    if (this.axisHelper) this.axisHelper.visible = show;
  }

  toggleChunkBorders(show) {
    if (!this.world) return;

    if (show) {
      // Create border helpers for all loaded chunks
      this.world.loadedChunks.forEach((chunk) => {
        if (!this.chunkBorders.has(chunk)) {
          // Ensure bounding box is computed
          if (!chunk.geometry.boundingBox) chunk.geometry.computeBoundingBox();

          let box = chunk.geometry.boundingBox;

          // Prevent Infinity values from crashing WebGPU
          if (!box || box.isEmpty()) {
            box = new THREE.Box3(
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, 0, 0),
            );
          }

          const helper = new THREE.Box3Helper(box, 0x00ff00);
          this.chunkBorders.set(chunk, helper);
          this.scene.add(helper);
        }
      });
    } else {
      // Remove and dispose all chunk border helpers
      this.chunkBorders.forEach((helper) => {
        this.scene.remove(helper);
        helper.geometry.dispose();
        helper.material.dispose();
      });
      this.chunkBorders.clear();
    }
  }

  toggleLODBorders(show) {
    if (!this.world) return;

    if (show) {
      // This would need to be implemented based on your LOD system
      // For now, we'll just show a message
      console.log("LOD border visualization would be shown here");
    }
  }

  toggleLightHelpers(show) {
    if (!this.lighting) return;

    if (show) {
      // Add helpers for all lights in the scene
      this.scene.traverse((obj) => {
        if (obj.isLight && !obj.helper) {
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
            obj.helper = helper;
            this.scene.add(helper);
            this.debugObjects.push(helper);
          }
        }
      });
    } else {
      // Remove all light helpers
      this.scene.traverse((obj) => {
        if (obj.isLight && obj.helper) {
          this.scene.remove(obj.helper);
          obj.helper = null;
        }
      });
      this.debugObjects = this.debugObjects.filter((obj) => !obj.isLightHelper);
    }
  }

  toggleWireframe(show) {
    if (!this.world) return;

    // WebGPU doesn't support wireframe property on standard materials
    // We need to create wireframe materials for WebGPU
    this.world.loadedChunks.forEach((chunk) => {
      if (chunk.material) {
        if (show) {
          // Store original material if not already stored
          if (!this._originalMaterials.has(chunk)) {
            this._originalMaterials.set(chunk, chunk.material);
          }
          // Create or reuse wireframe material
          if (!this._wireframeMaterials.has(chunk.material)) {
            const wireframeMat = new THREE.MeshBasicMaterial({
              color: 0xffffff,
              wireframe: true,
              vertexColors: chunk.material.vertexColors,
            });
            this._wireframeMaterials.set(chunk.material, wireframeMat);
          }
          chunk.material = this._wireframeMaterials.get(chunk.material);
        } else {
          // Restore original material
          if (this._originalMaterials.has(chunk)) {
            chunk.material = this._originalMaterials.get(chunk);
          }
        }
      }
    });
  }

  toggleBoundingBoxes(show) {
    if (!this.world) return;

    if (show) {
      this.world.loadedChunks.forEach((chunk) => {
        if (chunk && !chunk.boundingBoxHelper) {
          let box = new THREE.Box3().setFromObject(chunk);

          // Prevent Infinity values from crashing WebGPU
          if (box.isEmpty()) {
            box = new THREE.Box3(
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, 0, 0),
            );
          }

          const helper = new THREE.Box3Helper(box, 0xff0000);
          chunk.boundingBoxHelper = helper;
          this.scene.add(helper);
          this.debugObjects.push(helper);
        }
      });
    } else {
      this.world.loadedChunks.forEach((chunk) => {
        if (chunk && chunk.boundingBoxHelper) {
          this.scene.remove(chunk.boundingBoxHelper);
          chunk.boundingBoxHelper.geometry.dispose();
          chunk.boundingBoxHelper.material.dispose();
          chunk.boundingBoxHelper = null;
        }
      });
      this.debugObjects = this.debugObjects.filter((obj) => !obj.isBox3Helper);
    }
  }

  // Terrain Regeneration
  regenerateTerrain() {
    if (!this.world) {
      console.error("Error: World not initialized");
      return;
    }

    const config = this.terrainConfig;
    
    // Get values from inputs
    const chunkSize = parseInt(config.chunkSize) || 32;
    const chunkHeight = parseInt(config.chunkHeight) || 1536;
    const seaLevel = parseInt(config.seaLevel) || 60;
    const detailRadius = parseInt(config.detailRadius) || 6;
    const mountainScale = parseFloat(config.mountainScale) || 0.45;
    const peakScale = parseFloat(config.peakScale) || 0.5;
    const noiseFreq = parseFloat(config.noiseFreq) || 0.002;

    // Update CONFIG values
    CONFIG.CHUNK_SIZE = chunkSize;
    CONFIG.CHUNK_HEIGHT = chunkHeight;
    CONFIG.SEA_LEVEL = seaLevel;
    CONFIG.FULL_DETAIL_RADIUS = detailRadius;

    // Update LOD rings based on new detail radius
    let currentRadius = detailRadius;
    for (let i = 0; i < CONFIG.LOD_RINGS.length; i++) {
      currentRadius += detailRadius * Math.pow(2, i);
      CONFIG.LOD_RINGS[i].radius = currentRadius;
    }

    // Update camera far plane and fog
    if (this.camera) {
      const maxDistUnits = CONFIG.LOD_RINGS[CONFIG.LOD_RINGS.length - 1].radius * CONFIG.CHUNK_SIZE;
      if (this.scene.fog) this.scene.fog.far = maxDistUnits;
      this.camera.far = maxDistUnits + 1000;
      this.camera.updateProjectionMatrix();
    }

    // Pass terrain parameters to mesher
    if (this.world && this.world.mesher) {
      this.world.mesher.setTerrainParams({
        mountainScale,
        peakScale,
        noiseFreq
      });
    }

    // Reset the world to regenerate with new parameters
    this.world.reset();
    
    // Force camera update to trigger chunk loading
    if (this.camera) {
      this.world.update(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    }

    // Clear dirty flag
    this._terrainDirty = false;

    console.log("Terrain regenerated with new parameters");
  }

  // Camera recording and playback
  toggleRecording() {
    this.isRecording = !this.isRecording;

    if (this.isRecording) {
      this.cameraPath = [];
      this._startRecording();
    } else {
      this._stopRecording();
    }
  }

  _startRecording() {
    this._recordingInterval = setInterval(() => {
      const cameraData = {
        position: this.camera.position.clone(),
        rotation: this.camera.rotation.clone(),
        time: Date.now(),
      };
      this.cameraPath.push(cameraData);
    }, 100); // Record every 100ms
  }

  _stopRecording() {
    if (this._recordingInterval) {
      clearInterval(this._recordingInterval);
      this._recordingInterval = null;
    }
  }

  togglePlayback() {
    if (this.cameraPath.length === 0) {
      console.log("No camera path recorded");
      return;
    }

    this.isPlaying = !this.isPlaying;

    if (this.isPlaying) {
      this.playbackIndex = 0;
      this._startPlayback();
    } else {
      this._stopPlayback();
    }
  }

  _startPlayback() {
    const startTime = Date.now();
    const firstFrame = this.cameraPath[0];
    const startTimeOffset = startTime - firstFrame.time;

    this._playbackInterval = setInterval(() => {
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

      // Apply camera position and rotation
      this.camera.position.copy(frame.position);
      this.camera.rotation.copy(frame.rotation);
      this.camera.updateProjectionMatrix();

      // Stop playback when we reach the end
      if (closestIndex >= this.cameraPath.length - 1) {
        this.togglePlayback();
      }
    }, 16); // ~60fps playback
  }

  _stopPlayback() {
    if (this._playbackInterval) {
      clearInterval(this._playbackInterval);
      this._playbackInterval = null;
    }
  }

  clearCameraPath() {
    this.cameraPath = [];
    this.playbackIndex = 0;
    this._stopRecording();
    this._stopPlayback();
  }

  // Object picking
  pickObject(event) {
    if (!this.camera || !this.renderer) return;

    // Calculate mouse position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Create raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    // Intersect with all objects in the scene
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
      console.log("Picked object:", intersect.object);
      console.log("Position:", intersect.point);
      console.log("Distance:", intersect.distance);

      // Update debug overlay with pick info
      if (this.debugOverlay) {
        const objType = intersect.object.type || "Unknown";
        const objName = intersect.object.name || "(unnamed)";
        this.debugOverlay.innerHTML += `<br>PICKED: ${objType} (${objName})<br>`;
        this.debugOverlay.innerHTML += `POS: ${intersect.point.x.toFixed(2)}, ${intersect.point.y.toFixed(2)}, ${intersect.point.z.toFixed(2)}<br>`;
        this.debugOverlay.innerHTML += `DIST: ${intersect.distance.toFixed(2)}<br>`;
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
  }

  // Utility functions
  clearPerformanceData() {
    for (const key in this.performanceData) {
      this.performanceData[key] = [];
    }
  }

  getPerformanceStats() {
    return {
      fps: this._currentFPS,
      frameTimes: [...this.performanceData.frameTimes],
      memory: [...this.performanceData.memory],
      drawCalls: [...this.performanceData.drawCalls],
      triangles: [...this.performanceData.triangles],
    };
  }

  // Update debug tools (call this every frame)
  update(delta) {
    // Update scene graph if visible
    if (this.settings.showSceneGraph) {
      this.updateSceneGraph();
    }

    // Update chunk borders if enabled
    if (this.settings.showChunkBorders && this.world) {
      this.world.loadedChunks.forEach((chunk) => {
        if (!this.chunkBorders.has(chunk)) {
          if (!chunk.geometry.boundingBox) chunk.geometry.computeBoundingBox();

          let box = chunk.geometry.boundingBox;
          if (!box || box.isEmpty()) {
            box = new THREE.Box3(
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, 0, 0),
            );
          }

          const helper = new THREE.Box3Helper(box, 0x00ff00);
          this.chunkBorders.set(chunk, helper);
          this.scene.add(helper);
        }
      });
    }
  }
  
  dispose() {
    // Clean up debug objects
    this.debugObjects.forEach((obj) => {
      if (obj.parent) obj.parent.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });

    // Clean up helpers
    if (this.gridHelper) this.scene.remove(this.gridHelper);
    if (this.axisHelper) this.scene.remove(this.axisHelper);
    if (this.pickMarker) this.scene.remove(this.pickMarker);

    // Clean up wireframe materials
    if (this._wireframeMaterials) {
      this._wireframeMaterials.forEach((material) => {
        material.dispose();
      });
      this._wireframeMaterials.clear();
    }
    if (this._originalMaterials) {
      this._originalMaterials.clear();
    }

    // Clean up GUI
    if (this.gui) {
      this.gui.destroy();
      if (this.gui.domElement && this.gui.domElement.parentNode) {
        this.gui.domElement.parentNode.removeChild(this.gui.domElement);
      }
    }

    // Clean up UI
    if (this.debugPanel && this.debugPanel.parentNode) {
      this.debugPanel.parentNode.removeChild(this.debugPanel);
    }
    if (this.debugOverlay && this.debugOverlay.parentNode) {
      this.debugOverlay.parentNode.removeChild(this.debugOverlay);
    }

    // Stop recording/playback
    this._stopRecording();
    this._stopPlayback();
  }
}
