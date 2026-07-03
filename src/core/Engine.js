import * as THREE from "three";
import { Renderer } from "./Renderer.js";
import { Lighting } from "./Lighting.js";
import { World } from "../world/World.js";
import { Mesher } from "../world/Mesher.js";
import { Player } from "../entities/Player.js";
import { DebugTools } from "./DebugTools.js";
import { CONFIG } from "../config.js";

export class Engine {
  constructor() {
    this.renderer = new Renderer();
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;

    this.lighting = new Lighting(this.scene, this.camera);
    this.mesher = new Mesher();

    this.blockMaterial = null;
    this.lodMaterials = [];
    this.world = null;

    this.player = new Player(this.camera, document.body);

    this.blocker = document.getElementById("blocker");
    this.pauseMenu = document.getElementById("pauseMenu");
    this.isPaused = false;
    this.currentBlockType = 1;
    this.slots = document.querySelectorAll(".slot");

    this.outline = this._createOutline();

    // DOM Nodes for Detailed Stats
    this.statPos = document.getElementById("statPos");
    this.statFacing = document.getElementById("statFacing");
    this.statTime = document.getElementById("statTime");
    this.statPerf = document.getElementById("statPerf");
    this.statChunks = document.getElementById("statChunks");
    this.statBlocks = document.getElementById("statBlocks");
    this.statFlight = document.getElementById("statFlight");

    // Initialize debug tools
    this.debugTools = new DebugTools(
      this.scene, 
      this.camera, 
      this.renderer.renderer,
      null, // world will be set after init
      this.lighting
    );

    this._setupBasicUI();
    this._setupBlockSelection();
    this._setupDebugControls();

    this._lastFrameTime = 0;
    this._frameCount = 0;
    this._fpsTime = 0;
    this._currentFPS = 0;
  }

  async init() {
    await this.renderer.init();

    this.blockMaterial = this.lighting.setupMaterial(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.FrontSide,
        flatShading: true,
      }),
    );

    this.lodMaterials = CONFIG.LOD_RINGS.map((_, i) =>
      this.lighting.setupMaterial(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.9,
          metalness: 0.0,
          side: THREE.FrontSide,
          fog: true,
          flatShading: true,
          polygonOffset: true,
          polygonOffsetFactor: (i + 1) * 4,
          polygonOffsetUnits: (i + 1) * 4,
        }),
      ),
    );

    const seed = Math.floor(Math.random() * 2147483646) + 1;
    this.world = new World(
      this.scene,
      this.blockMaterial,
      this.lodMaterials,
      this.mesher,
    );
    this.world.init(seed);

    // Set world reference in debug tools
    this.debugTools.world = this.world;

    this._setupAdvancedUI();
    this._setupBlockModification();

    // Trigger input event to setup shadow scale based on distance natively
    const renderDistInput = document.getElementById("renderDist");
    if (renderDistInput) {
      renderDistInput.dispatchEvent(new Event("input"));
    }

    this._animate();
    console.log("Engine initialised with seed", seed);
    return this;
  }

  _setupBasicUI() {
    this.blocker.addEventListener("click", () => {
      if (!this.isPaused) this.player.lock();
    });

    this.player.controls.addEventListener("lock", () => {
      if (!this.isPaused) {
        this.blocker.style.display = "none";
        this.pauseMenu.style.display = "none";
      }
    });
    this.player.controls.addEventListener("unlock", () => {
      if (!this.isPaused) this.blocker.style.display = "flex";
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this._togglePause();
      // Debug toggle with F3 (F1 opens help in Edge)
      if (e.key === "F3") this._toggleDebugPanel();
      // Debug overlay with F4
      if (e.key === "F4" && this.debugTools) {
        this.debugTools.debugOverlay.style.display = 
          this.debugTools.debugOverlay.style.display === "none" ? "block" : "none";
      }
    });

    document
      .getElementById("resumeBtn")
      .addEventListener("click", () => this._togglePause());
  }

  _setupDebugControls() {
    // Add debug toggle button to pause menu
    const debugBtn = document.createElement('button');
    debugBtn.id = 'debugBtn';
    debugBtn.textContent = 'Debug Tools';
    debugBtn.style.cssText = `
      padding: 12px;
      margin-top: 4px;
      border: 2px solid #7a2a34;
      background: #3a1f24;
      color: #d8cfc8;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      cursor: pointer;
      box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.6);
    `;
    debugBtn.addEventListener('click', () => this._toggleDebugPanel());
    
    const pauseMenuPanel = this.pauseMenu.querySelector('.panel');
    if (pauseMenuPanel) {
      pauseMenuPanel.appendChild(debugBtn);
    }

    // Add debug object picking
    if (this.renderer.renderer) {
      this.renderer.renderer.domElement.addEventListener('click', (event) => {
        if (this.debugTools && this.player.isLocked && !this.isPaused) {
          this.debugTools.pickObject(event);
        }
      });
    }
  }

  _toggleDebugPanel() {
    if (this.debugTools) {
      const isVisible = this.debugTools.debugPanel.style.display !== "none";
      this.debugTools.debugPanel.style.display = isVisible ? "none" : "block";
      this.debugTools.debugOverlay.style.display = isVisible ? "none" : "block";
    }
  }

  _setupAdvancedUI() {
    const renderDistInput = document.getElementById("renderDist");
    const renderValSpan = document.getElementById("renderVal");

    renderDistInput.addEventListener("input", (e) => {
      const v = parseInt(e.target.value);
      renderValSpan.textContent = v;
      CONFIG.FULL_DETAIL_RADIUS = v;

      let currentRadius = v;
      for (let i = 0; i < CONFIG.LOD_RINGS.length; i++) {
        currentRadius += v * Math.pow(2, i);
        CONFIG.LOD_RINGS[i].radius = currentRadius;
      }

      const maxDistUnits =
        CONFIG.LOD_RINGS[CONFIG.LOD_RINGS.length - 1].radius *
        CONFIG.CHUNK_SIZE;

      if (this.scene.fog) this.scene.fog.far = maxDistUnits;
      this.camera.far = maxDistUnits + 1000;
      this.camera.updateProjectionMatrix();

      if (this.world) this.world.reset();
    });
    renderDistInput.value = CONFIG.FULL_DETAIL_RADIUS;

    document.getElementById("fogToggle").addEventListener("change", (e) => {
      const maxDistUnits =
        CONFIG.LOD_RINGS[CONFIG.LOD_RINGS.length - 1].radius *
        CONFIG.CHUNK_SIZE;
      this.lighting.setFog(
        e.target.checked ? new THREE.Fog(0xaaccff, 60, maxDistUnits) : null,
      );
    });
  }

  _setupBlockSelection() {
    window.addEventListener("keydown", (e) => {
      if (e.key >= "1" && e.key <= "9") {
        this.currentBlockType = parseInt(e.key);
        this.slots.forEach((slot) => slot.classList.remove("active"));
        if (this.slots[this.currentBlockType - 1]) {
          this.slots[this.currentBlockType - 1].classList.add("active");
        }
      }
    });
  }

  _setupBlockModification() {
    if (!this.renderer.renderer) return;

    document.addEventListener("mousedown", (event) => {
      if (!this.player.isLocked || this.isPaused) return;
      if (event.button !== 0 && event.button !== 2) return;

      const raycaster = new THREE.Raycaster();
      raycaster.far = 8;
      raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      const hits = raycaster.intersectObjects(this.world.loadedChunks, false);
      if (hits.length === 0 || !hits[0].face) return;

      const hit = hits[0];
      const point = hit.point.clone();
      const normal = hit.face.normal.clone();

      if (event.button === 0) {
        point.addScaledVector(normal, -0.01);
        this.world.setBlock(
          Math.floor(point.x),
          Math.floor(point.y),
          Math.floor(point.z),
          0,
        );
      } else {
        point.addScaledVector(normal, 0.01);
        const y = Math.floor(point.y);
        if (y >= 0 && y < CONFIG.CHUNK_HEIGHT) {
          this.world.setBlock(
            Math.floor(point.x),
            y,
            Math.floor(point.z),
            this.currentBlockType,
          );
        }
      }
    });

    this.renderer.renderer.domElement.addEventListener("contextmenu", (e) =>
      e.preventDefault(),
    );
  }

  _togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.player.unlock();
      this.pauseMenu.style.display = "flex";
      this.blocker.style.display = "none";
    } else {
      this.pauseMenu.style.display = "none";
      this.player.lock();
    }
  }

  _createOutline() {
    const geo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const mat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat);
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  _updateOutline() {
    const raycaster = new THREE.Raycaster();
    raycaster.far = 8;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = raycaster.intersectObjects(this.world.loadedChunks, false);
    if (hits.length > 0 && hits[0].face) {
      const hit = hits[0];
      const normal = hit.face.normal.clone();
      const point = hit.point.clone().addScaledVector(normal, -0.01);
      this.outline.position.set(
        Math.floor(point.x) + 0.5,
        Math.floor(point.y) + 0.5,
        Math.floor(point.z) + 0.5,
      );
      this.outline.visible = true;
    } else {
      this.outline.visible = false;
    }
  }

  _updateStatsDisplays(stats) {
    const p = this.camera.position;
    this.statPos.textContent = `XYZ: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    this.statFacing.textContent = `Facing: ${this.player.getFacing()}`;

    // Get time info from lighting system
    const timeInfo = this.lighting.getTimeString();
    this.statTime.textContent = `Time: ${timeInfo.hours}:${timeInfo.minutes} (${timeInfo.phase})`;

    this.statPerf.textContent = `FPS: ${this._currentFPS} | Speed: ${this.player.currentSpeed.toFixed(1)} m/s`;
    this.statChunks.textContent = `Chunks: ${stats.fullChunks} | LOD: ${stats.lodChunks}`;
    this.statBlocks.textContent = `Blocks: ${stats.totalBlocks.toLocaleString()}`;
    this.statFlight.textContent = `Flight: ${this.player.isFlying ? "ON" : "OFF"}`;
    this.statFlight.style.color = this.player.isFlying ? "#66cc66" : "#42a5f5";
  }

  _animate() {
    requestAnimationFrame(() => this._animate());

    const now = performance.now();
    const delta = Math.min((now - this._lastFrameTime) * 0.001, 0.05);
    this._lastFrameTime = now;

if (!this._dayTimer) this._dayTimer = 0;
    
    // 60 IRL minutes = 1 game day
    // 60 minutes * 60 seconds = 3600 seconds per game day
    this._dayTimer += delta / 3600;
    this._dayTimer %= 1.0;

    // Update lighting with 60-minute day cycle
    this.lighting.updateDayCycle(this._dayTimer, delta, this.camera.position);
    
    // Update debug tools
    if (this.debugTools) {
      this.debugTools.update(delta);
    }

    if (this.player.isLocked && !this.isPaused) {
      this.player.update(delta, this.world);
      this._updateOutline();
    } else {
      this.outline.visible = false;
    }

    const forward = this.player.getForward();
    this.world.update(this.camera.position, forward);

    this.renderer.render();

    // FPS computation
    if (now - this._fpsTime >= 1000) {
      this._currentFPS = Math.round(
        (this._frameCount * 1000) / (now - this._fpsTime),
      );
      this._frameCount = 0;
      this._fpsTime = now;
    }
    this._frameCount++;

    // Write all data to HTML panel
    this._updateStatsDisplays(this.world.getStats());
  }

  dispose() {
    this.renderer.destroy();
    this.lighting.dispose?.();
    this.world.dispose?.();
    this.debugTools.dispose?.();
  }
}
