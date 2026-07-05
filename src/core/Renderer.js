import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";

export class Renderer {
  constructor() {
    this.scene = new THREE.Scene();

    // Neutral grey background
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.5,
      40000,
    );
    this.camera.position.set(8, 120, 8); // Dropped starting height to 120

    this.renderer = null;
    this._resizeListener = this._onResize.bind(this);
    window.addEventListener("resize", this._resizeListener);
  }

  async init() {
    const canvas = document.getElementById("gameCanvas");

    this.renderer = new WebGPURenderer({ canvas, antialias: true });
    await this.renderer.init();

    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    // Restore standard tone mapping
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // SHADOWS: PCFShadowMapSoft = soft shadow edges with percentage-closer filtering
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    return this;
  }

  _onResize() {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    window.removeEventListener("resize", this._resizeListener);
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
