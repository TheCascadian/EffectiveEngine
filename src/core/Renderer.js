import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";

export class Renderer {
  constructor() {
    this.scene = new THREE.Scene();

    // Neutral grey background
    this.scene.background = new THREE.Color(0x333333);
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.5,
      40000,
    );
    this.camera.position.set(8, 460, 8);

    this.renderer = null;
    this._resizeListener = this._onResize.bind(this);
    window.addEventListener("resize", this._resizeListener);
  }

  async init() {
    this.renderer = new WebGPURenderer({ antialias: true });
    await this.renderer.init();

    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    // Restore standard tone mapping
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Enable shadow maps
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this.renderer.domElement);

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
