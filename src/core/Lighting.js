import * as THREE from "three";

export class Lighting {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.scene.background = new THREE.Color(0x87ceeb);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambient);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.position.set(200, 500, 200);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 1500;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this._dayTimer = 0;
    this._shadowsEnabled = true;
    this._materials = [];
  }

  setupMaterial(material) {
    this._materials.push(material);
    return material;
  }

  updateDayCycle(dayTimer, delta, playerPos) {
    this._dayTimer = dayTimer;
    const angle = dayTimer * Math.PI * 2;
    const sunHeight = Math.sin(angle) * 600 + 100;
    const sunX = Math.cos(angle) * 600;
    this.sunLight.position.set(
      playerPos.x + sunX,
      playerPos.y + sunHeight,
      playerPos.z + 200,
    );
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    const nightFactor = Math.max(0, -Math.sin(angle));
    this.sunLight.intensity = 0.4 + (1 - nightFactor) * 0.6;
    this.ambient.intensity = 0.15 + (1 - nightFactor) * 0.25;
    const r = 0.1 * nightFactor + 0.53 * (1 - nightFactor);
    const g = 0.1 * nightFactor + 0.81 * (1 - nightFactor);
    const b = 0.2 * nightFactor + 0.92 * (1 - nightFactor);
    this.scene.background.setRGB(r, g, b);
    if (this.scene.fog && this.scene.fog.color)
      this.scene.fog.color.setRGB(r, g, b);
  }

  updateShadowDistance(radius) {
    const cam = this.sunLight.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.updateProjectionMatrix();
  }

  setFog(fog) {
    this.scene.fog = fog;
  }

  setShadowsEnabled(enabled) {
    this._shadowsEnabled = enabled;
    this.sunLight.castShadow = enabled;
    this._materials.forEach((m) => (m.needsUpdate = true));
  }
}
