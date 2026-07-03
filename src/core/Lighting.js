import * as THREE from "three";
import { Skybox } from "./Skybox.js";

/**
 * Simple Lighting System with day/night cycle
 */
export class Lighting {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Initialize skybox
    this.skybox = new Skybox(scene, camera);

    // Simple ambient light
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambient);

    // Simple directional light for sun
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.sunLight.position.set(200, 500, 200);
    this.sunLight.castShadow = false;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Simple directional light for moon
    this.moonLight = new THREE.DirectionalLight(0xbbbbff, 0.2);
    this.moonLight.position.set(-200, 300, -200);
    this.moonLight.castShadow = false;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);

    // State
    this._dayTimer = 0;
    this._enabled = true;
    this._skyboxEnabled = true;

    // Set initial scene background
    this.scene.background = new THREE.Color(0x87ceeb);
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    this.ambient.visible = enabled;
    this.sunLight.visible = enabled;
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
    return material;
  }

  updateDayCycle(dayTimer, delta, playerPos) {
    if (!this._enabled) return;
    
    this._dayTimer = dayTimer;
    
    // Update skybox
    this.skybox.update(dayTimer, delta, playerPos);

    // Simple sun position
    const angle = dayTimer * Math.PI * 2;
    const sunHeight = Math.sin(angle) * 400 + 200;
    const sunX = Math.cos(angle) * 600;
    
    this.sunLight.position.set(
      playerPos.x + sunX,
      playerPos.y + sunHeight,
      playerPos.z + 200
    );
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    // Simple moon position (opposite of sun)
    const moonAngle = (dayTimer + 0.5) * Math.PI * 2;
    const moonHeight = Math.sin(moonAngle) * 300 + 250;
    const moonX = Math.cos(moonAngle) * 500;
    
    this.moonLight.position.set(
      playerPos.x + moonX,
      playerPos.y + moonHeight,
      playerPos.z - 200
    );
    this.moonLight.target.position.copy(playerPos);
    this.moonLight.target.updateMatrixWorld();

    // Simple light intensity based on day/night
    const isDay = Math.sin(angle) > 0;
    const dayFactor = Math.max(0, Math.sin(angle));
    
    this.sunLight.intensity = isDay ? 0.8 : 0.0;
    this.moonLight.intensity = !isDay ? 0.2 : 0.0;
    this.ambient.intensity = isDay ? 0.5 : 0.1;

    // Simple sky color change
    if (isDay) {
      this.scene.background.setHex(0x87ceeb); // Day sky blue
    } else {
      this.scene.background.setHex(0x000033); // Night dark blue
    }
    
    // Update fog if it exists
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
    const mins = Math.floor((hoursRaw % 1) * 60).toString().padStart(2, "0");
    
    let phase = "Night";
    if (hoursRaw > 5 && hoursRaw < 8) phase = "Dawn";
    else if (hoursRaw >= 8 && hoursRaw < 17) phase = "Day";
    else if (hoursRaw >= 17 && hoursRaw < 20) phase = "Dusk";
    
    return { hours: hrs, minutes: mins, phase: phase, hoursRaw: hoursRaw };
  }

  dispose() {
    if (this.skybox) {
      this.skybox.dispose();
    }

    this.scene.remove(this.ambient);
    this.scene.remove(this.sunLight);
    this.scene.remove(this.sunLight.target);
    this.scene.remove(this.moonLight);
    this.scene.remove(this.moonLight.target);
  }
}
