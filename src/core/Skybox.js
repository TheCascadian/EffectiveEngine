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
    // Simple sun - just a colored sphere
    const sunGeometry = new THREE.SphereGeometry(50, 8, 8);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunMesh.visible = this._enabled;
    this.scene.add(this.sunMesh);
    
    // Simple moon
    const moonGeometry = new THREE.SphereGeometry(30, 8, 8);
    const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    this.moonMesh.visible = this._enabled;
    this.scene.add(this.moonMesh);
  }
  
  update(timeOfDay, delta, playerPosition) {
    if (!this._enabled) return;
    
    // Simple sun position based on time of day
    const sunAngle = timeOfDay * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle) * 300 + 100;
    const sunX = Math.cos(sunAngle) * 500;
    const sunZ = 200;
    
    this.sunMesh.position.set(
      playerPosition.x + sunX,
      playerPosition.y + sunHeight,
      playerPosition.z + sunZ
    );
    
    // Moon opposite of sun
    const moonAngle = (timeOfDay + 0.5) * Math.PI * 2;
    const moonHeight = Math.sin(moonAngle) * 200 + 150;
    const moonX = Math.cos(moonAngle) * 400;
    const moonZ = 200;
    
    this.moonMesh.position.set(
      playerPosition.x + moonX,
      playerPosition.y + moonHeight,
      playerPosition.z + moonZ
    );
    
    // Hide sun at night, moon during day
    const isDay = Math.sin(sunAngle) > 0;
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
