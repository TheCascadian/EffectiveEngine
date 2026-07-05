import * as THREE from "three";
import { Skybox } from "./Skybox.js";
import { CONFIG } from "../config.js";

export class Lighting {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.skybox = new Skybox(scene, camera);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambient);

    // ============================================================
    // 1. MAIN DIRECTIONAL LIGHT (Sun)
    // ============================================================
    this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.35);
    this.sunLight.position.set(300, 600, 200);
    this.sunLight.castShadow = true;

    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // High resolution for large terrain expanses
    this.sunLight.shadow.mapSize.width = 8192;
    this.sunLight.shadow.mapSize.height = 8192;

    const d = 350;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 50;
    this.sunLight.shadow.camera.far = 900;
    this.sunLight.shadow.camera.updateProjectionMatrix();

    // Default small bias for BasicShadowMap
    this.sunLight.shadow.bias = -0.0001;
    this.sunLight.shadow.normalBias = 0.0;

    // 2. FILL LIGHT
    this.fillLight = new THREE.DirectionalLight(0xccddff, 0.45);
    this.fillLight.position.set(-200, 300, -100);
    this.fillLight.castShadow = false;
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);

    // 3. MOON LIGHT
    this.moonLight = new THREE.DirectionalLight(0xbbbbff, 0.35);
    this.moonLight.position.set(-200, 300, -200);
    this.moonLight.castShadow = false;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);

    this._dayTimer = 0;
    this._enabled = true;
    this._skyboxEnabled = true;

    this.scene.background = new THREE.Color(0x87ceeb);
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    this.ambient.visible = enabled;
    this.sunLight.visible = enabled;
    this.fillLight.visible = enabled;
    this.moonLight.visible = enabled;
    this.skybox.setEnabled(enabled && this._skyboxEnabled);
  }

  setSkyboxEnabled(enabled) {
    this._skyboxEnabled = enabled;
    this.skybox.setEnabled(this._enabled && enabled);
  }

  isEnabled() {
    return this._enabled;
  }
  isSkyboxEnabled() {
    return this._skyboxEnabled;
  }

  setupMaterial(material) {
    material.receiveShadow = true;
    return material;
  }

  updateDayCycle(dayTimer, delta, playerPos) {
    if (!this._enabled) return;

    this._dayTimer = dayTimer;
    // Skybox correctly still tracks camera (player) for distant rendering
    this.skybox.update(dayTimer, delta, playerPos);

    const angle = dayTimer * Math.PI * 2;
    const isDay = Math.sin(angle) > 0;

    let centerPos = playerPos;
    let d = 350;
    let sunDistX = 600;
    let sunDistY = 400;
    let sunBaseY = 300;
    let shadowFar = 900;
    let shadowNear = 50;
    let zOffset = 200;

    if (CONFIG.HOI4_MODE && CONFIG.HOI4_MODE.ENABLED) {
      // Fix lighting orientation strictly over the HOI4 map boundaries
      centerPos = new THREE.Vector3(0, 0, 0);

      d = Math.max(CONFIG.HOI4_MODE.MAP_WIDTH, CONFIG.HOI4_MODE.MAP_HEIGHT) / 2;
      d = Math.max(d, 350);
      d *= 1.2; // Add padding to avoid edge clipping

      sunDistX = d * 1.5;
      sunDistY = d;
      sunBaseY = d;
      shadowFar = d * 3; // Kept tight to save precision
      shadowNear = 10;
      zOffset = 0;
    }

    // --- Adjust Shadow Camera Extents Dynamically ---
    if (this.sunLight.shadow.camera.top !== d) {
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.camera.near = shadowNear;
      this.sunLight.shadow.camera.far = shadowFar;
      this.sunLight.shadow.camera.updateProjectionMatrix();

      if (CONFIG.HOI4_MODE && CONFIG.HOI4_MODE.ENABLED) {
        // Because Renderer is now using BasicShadowMap, there is no blur filter
        // dragging shadow boundaries outward. This means we can drop the huge bias
        // down to a tiny fraction, instantly solving the "Peter Panning" detachment
        // at the base of the cliffs while still preventing acne!
        this.sunLight.shadow.bias = -0.0005;
        this.sunLight.shadow.normalBias = 0.0;
      } else {
        this.sunLight.shadow.bias = -0.0001;
        this.sunLight.shadow.normalBias = 0.0;
      }
    }

    // --- SUN POSITION ---
    const sunX = Math.cos(angle) * sunDistX;
    const sunHeight = Math.max(
      sunBaseY * 0.5,
      Math.sin(angle) * sunDistY + sunBaseY,
    );

    this.sunLight.position.set(
      centerPos.x + sunX,
      centerPos.y + sunHeight,
      centerPos.z + zOffset,
    );
    this.sunLight.target.position.copy(centerPos);
    this.sunLight.target.updateMatrixWorld();

    // --- FILL LIGHT ---
    const fillHeight = Math.max(100, sunHeight * 0.5);
    this.fillLight.position.set(
      centerPos.x - sunX * 0.6,
      centerPos.y + fillHeight,
      centerPos.z - zOffset,
    );
    this.fillLight.target.position.copy(centerPos);
    this.fillLight.target.updateMatrixWorld();

    // --- MOON POSITION ---
    const moonAngle = (dayTimer + 0.5) * Math.PI * 2;
    const moonHeight = Math.max(
      sunBaseY * 0.5,
      Math.sin(moonAngle) * sunDistY + sunBaseY,
    );
    this.moonLight.position.set(
      centerPos.x + Math.cos(moonAngle) * sunDistX,
      centerPos.y + moonHeight,
      centerPos.z - zOffset,
    );
    this.moonLight.target.position.copy(centerPos);
    this.moonLight.target.updateMatrixWorld();

    // Day/night intensities
    this.sunLight.intensity = isDay ? 1.35 : 0.0;
    this.fillLight.intensity = isDay ? 0.45 : 0.0;
    this.moonLight.intensity = !isDay ? 0.35 : 0.0;
    this.ambient.intensity = isDay ? 0.55 : 0.2;

    // Sky & Fog color
    if (isDay) {
      this.scene.background.setHex(0x87ceeb);
    } else {
      this.scene.background.setHex(0x000033);
    }

    if (this.scene.fog && this.scene.fog.color) {
      this.scene.fog.color.copy(this.scene.background);
    }
  }

  setFog(fog) {
    this.scene.fog = fog;
  }

  getTimeOfDay() {
    return this._dayTimer;
  }

  getTimeString() {
    const hoursRaw = (this._dayTimer * 24 + 6) % 24;
    const hrs = Math.floor(hoursRaw).toString().padStart(2, "0");
    const mins = Math.floor((hoursRaw % 1) * 60)
      .toString()
      .padStart(2, "0");
    let phase = "Night";
    if (hoursRaw > 5 && hoursRaw < 8) phase = "Dawn";
    else if (hoursRaw >= 8 && hoursRaw < 17) phase = "Day";
    else if (hoursRaw >= 17 && hoursRaw < 20) phase = "Dusk";
    return { hours: hrs, minutes: mins, phase: phase, hoursRaw: hoursRaw };
  }

  dispose() {
    if (this.skybox) this.skybox.dispose();
    this.scene.remove(this.ambient);
    this.scene.remove(this.sunLight);
    this.scene.remove(this.sunLight.target);
    this.scene.remove(this.fillLight);
    this.scene.remove(this.fillLight.target);
    this.scene.remove(this.moonLight);
    this.scene.remove(this.moonLight.target);
  }
}
