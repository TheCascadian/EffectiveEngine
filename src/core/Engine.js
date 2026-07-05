// Engine.js
import * as THREE from "three";
import { Renderer } from "./Renderer.js";
import { Lighting } from "./Lighting.js";
import { World } from "../world/World.js";
import { Mesher } from "../world/Mesher.js";
import { Player } from "../entities/Player.js";
import { DebugTools } from "./DebugTools.js";
import { CONFIG } from "../config.js";
import { IsometricCamera } from "./camera/IsometricCamera.js";

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

    this.player = null;
    this.isoCamera = null;
    this.isIsoMode = true;

    this.blocker = document.getElementById("blocker");
    this.pauseMenu = document.getElementById("pauseMenu");
    this.isPaused = false;

    this.outline = this._createOutline();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 8;

    this.statsPanel = document.getElementById("stats");
    this.statPos = document.getElementById("statPos");
    this.statFacing = document.getElementById("statFacing");
    this.statTime = document.getElementById("statTime");
    this.statPerf = document.getElementById("statPerf");
    this.statChunks = document.getElementById("statChunks");
    this.statBlocks = document.getElementById("statBlocks");
    this.statFlight = document.getElementById("statFlight");

    this.baseFov = 70;
    this.zoomFactor = 1.0;
    this.isZooming = false;

    this.keys = { q: false, e: false };

    this._lastFrameTime = 0;
    this._frameCount = 0;
    this._fpsTime = 0;
    this._currentFPS = 0;
  }

  async init() {
    await this.renderer.init();
    const canvas = this.renderer.renderer.domElement;

    // We no longer need the keyCatcher for block placement,
    // but we keep it for isometric WASD movement.
    const keyCatcher = document.createElement("input");
    keyCatcher.type = "text";
    keyCatcher.style.position = "absolute";
    keyCatcher.style.opacity = "0";
    keyCatcher.style.left = "-1000px";
    keyCatcher.style.top = "-1000px";
    keyCatcher.setAttribute("autocomplete", "off");
    keyCatcher.setAttribute("spellcheck", "false");
    document.body.appendChild(keyCatcher);

    canvas.addEventListener("pointerdown", () => {
      keyCatcher.focus();
    });
    keyCatcher.focus();

    keyCatcher.addEventListener("input", (e) => {
      e.target.value = "";
    });

    document.addEventListener("contextmenu", (e) => e.preventDefault());

    // Keyboard events for isometric controls ONLY
    window.addEventListener(
      "keydown",
      (e) => {
        const blockedKeys = [
          "Space",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "KeyQ",
          "KeyE",
          "KeyF",
        ];

        if (blockedKeys.includes(e.code)) {
          e.preventDefault();
        }

        const key = e.key.toLowerCase();
        if (key === "q" || key === "e") {
          if (this.isIsoMode) this.keys[key] = true;
        }
        if (key === "i") {
          this._toggleIsometric();
        }
      },
      { capture: true },
    );

    window.addEventListener(
      "keyup",
      (e) => {
        const key = e.key.toLowerCase();
        if (key === "q" || key === "e") this.keys[key] = false;
      },
      { capture: true },
    );

    this.blockMaterial = this.lighting.setupMaterial(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.FrontSide,
        flatShading: true,
        dithering: true,
      }),
    );

    // Prevent self-shadowing artifacts on flat voxel faces
    this.blockMaterial.shadowSide = THREE.FrontSide;

    this.lodMaterials = CONFIG.LOD_RINGS.map((_, i) => {
      const mat = this.blockMaterial.clone();
      mat.fog = true;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = (i + 1) * 4;
      mat.polygonOffsetUnits = (i + 1) * 4;
      return this.lighting.setupMaterial(mat);
    });

    const seed = Math.floor(Math.random() * 2147483646) + 1;
    this.world = new World(
      this.scene,
      this.blockMaterial,
      this.lodMaterials,
      this.mesher,
    );
    this.world.init(seed);

    this.player = new Player(this.camera, canvas);

    this.debugTools = new DebugTools(
      this.scene,
      this.camera,
      this.renderer.renderer,
      this.world,
      this.lighting,
    );

    this.isoCamera = new IsometricCamera(this.camera, canvas);
    this.isoCamera.target.copy(this.camera.position);

    this._setupBasicUI();
    this._setupDebugControls();
    this._setupAdvancedUI();
    this._setupZoom();

    if (this.isIsoMode) this._toggleIsometric(true);

    this._animate();
    console.log("Engine initialised with seed", seed);
    return this;
  }

  // Replace your _setupBasicUI with this version
  _setupBasicUI() {
    // Stats toggle button
    const toggleStatsBtn = document.getElementById("toggleStatsBtn");
    if (toggleStatsBtn) {
      toggleStatsBtn.addEventListener("click", () => {
        const isVisible = this.statsPanel.style.display !== "none";
        this.statsPanel.style.display = isVisible ? "none" : "block";
      });
    }

    // Pause button (from the toolbar)
    const pauseBtn = document.getElementById("pauseBtn");
    if (pauseBtn) {
      pauseBtn.addEventListener("click", () => this._togglePause());
    }

    // Resume button (inside the pause menu)
    const resumeBtn = document.getElementById("resumeBtn");
    if (resumeBtn) {
      resumeBtn.addEventListener("click", () => this._togglePause());
    }

    // Debug panel toggle button
    const debugBtn = document.getElementById("toggleDebugBtn");
    if (debugBtn) {
      debugBtn.addEventListener("click", () => this._toggleDebugPanel());
    }

    // Isometric toggle button
    const isoBtn = document.getElementById("toggleIsoBtn");
    if (isoBtn) {
      isoBtn.addEventListener("click", () => this._toggleIsometric());
    }

    // Do NOT hide the pause menu permanently – it must be hidden initially
    if (this.pauseMenu) {
      this.pauseMenu.style.display = "none"; // hidden by default
    }
    // Block overlay is not needed in CEF mode
    if (this.blocker) {
      this.blocker.style.display = "none";
    }
  }

  _setupDebugControls() {
    const debugBtn = document.createElement("button");
    debugBtn.id = "debugBtn";
    debugBtn.textContent = "Debug Tools";
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
    debugBtn.addEventListener("click", () => this._toggleDebugPanel());

    const pauseMenuPanel = this.pauseMenu.querySelector(".panel");
    if (pauseMenuPanel) pauseMenuPanel.appendChild(debugBtn);

    if (this.renderer.renderer) {
      this.renderer.renderer.domElement.addEventListener("click", (event) => {
        if (this.debugTools && this.player.isLocked && !this.isPaused) {
          this.debugTools.pickObject(event);
        }
      });
    }
  }

  _toggleDebugPanel() {
    if (this.debugTools) {
      const isVisible = this.debugTools.gui.domElement.style.display !== "none";
      this.debugTools.gui.domElement.style.display = isVisible
        ? "none"
        : "block";
      this.statsPanel.style.display = isVisible ? "block" : "none";
      this.debugTools.debugOverlay.style.display = isVisible ? "none" : "block";
    }
  }

  _setupAdvancedUI() {
    const renderDistInput = document.getElementById("renderDist");
    const renderValSpan = document.getElementById("renderVal");

    if (renderDistInput && renderValSpan) {
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

        if (this.scene.fog && this.scene.fog.near < 999999) {
          this.scene.fog.far = maxDistUnits;
        }

        this.camera.far = maxDistUnits + 1000;
        this.camera.updateProjectionMatrix();

        if (this.world && !this.world.isFinalized) this.world.reset();
      });
      renderDistInput.value = CONFIG.FULL_DETAIL_RADIUS;
    }

    const initialMaxDist =
      CONFIG.LOD_RINGS[CONFIG.LOD_RINGS.length - 1].radius * CONFIG.CHUNK_SIZE;
    this.scene.fog = new THREE.Fog(0xaaccff, 60, initialMaxDist);
    this.lighting.setFog(this.scene.fog);

    const fogToggle = document.getElementById("fogToggle");
    if (fogToggle) {
      if (!fogToggle.checked) {
        this.scene.fog.near = 9999999;
        this.scene.fog.far = 9999999;
      }

      fogToggle.addEventListener("change", (e) => {
        const currentMaxDist =
          CONFIG.LOD_RINGS[CONFIG.LOD_RINGS.length - 1].radius *
          CONFIG.CHUNK_SIZE;
        if (e.target.checked) {
          this.scene.fog.near = 60;
          this.scene.fog.far = currentMaxDist;
        } else {
          this.scene.fog.near = 9999999;
          this.scene.fog.far = 9999999;
        }
      });
    }
  }

  // --- ZOOM (Hold 'C' + Mouse Wheel) ---
  _setupZoom() {
    this.baseFov = this.camera.fov;

    document.addEventListener("keydown", (e) => {
      if ((e.key === "c" || e.key === "C") && !this.isZooming) {
        this.isZooming = true;
        this.zoomFactor = 1.0;
        this.baseFov = this.camera.fov;
      }
    });

    document.addEventListener("keyup", (e) => {
      if ((e.key === "c" || e.key === "C") && this.isZooming) {
        this.isZooming = false;
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
      }
    });

    const wheelHandler = (e) => {
      if (!this.isZooming) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      this.zoomFactor = Math.max(0.1, Math.min(15.0, this.zoomFactor + delta));
      this.camera.fov = Math.max(
        1,
        Math.min(120, this.baseFov / this.zoomFactor),
      );
      this.camera.updateProjectionMatrix();
    };

    window.addEventListener("wheel", wheelHandler, { passive: false });
  }

  // Replace your _togglePause with this version
  _togglePause() {
    this.isPaused = !this.isPaused;

    if (this.pauseMenu) {
      this.pauseMenu.style.display = this.isPaused ? "flex" : "none";
    }

    // In isometric mode (CEF), we don't need pointer lock.
    // Only attempt to lock/unlock if we are in first-person mode.
    if (!this.isIsoMode && this.player) {
      if (this.isPaused) {
        this.player.unlock();
      } else {
        this.player.lock();
      }
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

  // --- UPDATED: Outline is hidden in Isometric mode ---
  _updateOutline() {
    if (this.world.isFinalized || this.isIsoMode) {
      this.outline.visible = false;
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObjects(
      this.world.loadedChunks,
      false,
    );
    if (hits.length > 0 && hits[0].face) {
      const point = hits[0].point
        .clone()
        .addScaledVector(hits[0].face.normal.clone(), -0.01);
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
    this._dayTimer += delta / 3600;
    this._dayTimer %= 1.0;

    this.lighting.updateDayCycle(this._dayTimer, delta, this.camera.position);
    if (this.debugTools) this.debugTools.update(delta);

    if (this.isIsoMode) {
      // CRITICAL FIX: Remove key handlers from Engine._animate
      // Let IsometricCamera handle WASD + Q/E internally using delta time
      this.isoCamera.update(delta);
      this.outline.visible = false;
    } else {
      if (this.player.isLocked || this.player.gamepadIndex !== null) {
        this.player.update(delta, this.world);
        this._updateOutline();
      } else {
        this.outline.visible = false;
      }
    }

    const forward = this.player.getForward();
    this.world.update(this.camera.position, forward);

    this.renderer.render();

    if (now - this._fpsTime >= 1000) {
      this._currentFPS = Math.round(
        (this._frameCount * 1000) / (now - this._fpsTime),
      );
      this._frameCount = 0;
      this._fpsTime = now;
    }
    this._frameCount++;

    this._updateStatsDisplays(this.world.getStats());
  }

  _toggleIsometric(force = false) {
    if (!force) this.isIsoMode = !this.isIsoMode;

    if (this.isIsoMode) {
      if (this.player && this.player.isLocked) this.player.unlock();
      if (this.blocker) this.blocker.style.display = "none";

      const px = this.camera.position.x;
      const pz = this.camera.position.z;
      let surfaceY = CONFIG.SEA_LEVEL;
      for (let y = Math.floor(this.camera.position.y); y >= 0; y--) {
        const block = this.world.getBlock(Math.floor(px), y, Math.floor(pz));
        if (block !== 0 && block !== 255) {
          surfaceY = y + 1;
          break;
        }
      }
      this.isoCamera.target.set(px, surfaceY, pz);
      this.isoCamera.theta = Math.PI / 4;
      this.isoCamera.phi = Math.PI / 3;
      this.isoCamera.radius = 150;
      console.log("Isometric mode ON");
    } else {
      if (this.blocker) this.blocker.style.display = "flex";
      console.log("Isometric mode OFF");
    }
  }

  dispose() {
    this.renderer.destroy();
    this.lighting.dispose?.();
    this.world.dispose?.();
    this.debugTools.dispose?.();
  }
}
