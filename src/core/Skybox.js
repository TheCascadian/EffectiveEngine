import * as THREE from "three";

/**
 * Simple Skybox System
 */
export class Skybox {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.sunMesh = null;
    this.moonMesh = null;
    this._enabled = true;

    this._initSimpleSkybox();
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    if (this.sunMesh) this.sunMesh.visible = enabled;
    if (this.moonMesh) this.moonMesh.visible = enabled;
  }

  isEnabled() {
    return this._enabled;
  }

  _initSimpleSkybox() {
    // Sharp, flat sun disk
    const sunGeometry = new THREE.CircleGeometry(30, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xfffcd1,
      fog: false,
      depthTest: true, // Must be true so terrain blocks can obscure it
      depthWrite: false, // Prevents the sky elements from messing up depth calculation of regular blocks
      side: THREE.DoubleSide,
    });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunMesh.visible = this._enabled;

    // Force sky elements to render behind everything else in the scene queue
    this.sunMesh.renderOrder = -1;
    this.scene.add(this.sunMesh);

    // Sharp, flat moon disk
    const moonGeometry = new THREE.CircleGeometry(15, 32);
    const moonMaterial = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      fog: false,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    this.moonMesh.visible = this._enabled;

    this.moonMesh.renderOrder = -1;
    this.scene.add(this.moonMesh);
  }

  update(timeOfDay, delta, playerPosition) {
    if (!this._enabled) return;

    // Dynamically scale orbit radius to stay just inside the camera's far clipping plane
    // This prevents the sun from getting clipped out by the engine before the terrain can block it
    const orbitRadius = this.camera.far * 0.95;
    const sunAngle = timeOfDay * Math.PI * 2;

    const sunHeight = Math.sin(sunAngle) * orbitRadius;
    const sunX = Math.cos(sunAngle) * orbitRadius;
    const sunZ = 0;

    this.sunMesh.position.set(
      playerPosition.x + sunX,
      playerPosition.y + sunHeight,
      playerPosition.z + sunZ,
    );
    this.sunMesh.lookAt(playerPosition.x, playerPosition.y, playerPosition.z);

    // Moon tracking opposite orbit path
    const moonAngle = (timeOfDay + 0.5) * Math.PI * 2;
    const moonHeight = Math.sin(moonAngle) * orbitRadius;
    const moonX = Math.cos(moonAngle) * orbitRadius;
    const moonZ = 0;

    this.moonMesh.position.set(
      playerPosition.x + moonX,
      playerPosition.y + moonHeight,
      playerPosition.z + moonZ,
    );
    this.moonMesh.lookAt(playerPosition.x, playerPosition.y, playerPosition.z);

    const isDay = Math.sin(sunAngle) > -0.05;
    this.sunMesh.visible = this._enabled && isDay;
    this.moonMesh.visible = this._enabled && !isDay;
  }

  dispose() {
    if (this.sunMesh) {
      this.scene.remove(this.sunMesh);
      this.sunMesh.geometry.dispose();
      this.sunMesh.material.dispose();
    }
    if (this.moonMesh) {
      this.scene.remove(this.moonMesh);
      this.moonMesh.geometry.dispose();
      this.moonMesh.material.dispose();
    }
  }
}
