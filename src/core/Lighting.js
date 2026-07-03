import * as THREE from "three";
import { Skybox } from "./Skybox.js";

/**
 * Enhanced Lighting System with:
 * - Dynamic day/night cycle (60 IRL minutes = 1 game day)
 * - Integrated skybox with celestial bodies
 * - Improved atmospheric scattering
 * - Configurable light parameters
 */
export class Lighting {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Initialize skybox
    this.skybox = new Skybox(scene, camera);

    // Main light sources
    this.ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambient);

    // Sun light (main directional light) - NO SHADOWS
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.position.set(200, 500, 200);
    this.sunLight.castShadow = false; // DISABLED SHADOWS
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Moon light (secondary directional light for night)
    this.moonLight = new THREE.DirectionalLight(0xbbbbff, 0.1);
    this.moonLight.position.set(-200, 300, -200);
    this.moonLight.castShadow = false; // DISABLED SHADOWS
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);

    // Hemisphere light for sky/ground color
    this.hemisphereLight = new THREE.HemisphereLight(
      0x87ceeb, // sky color
      0x333333, // ground color
      0.3
    );
    this.scene.add(this.hemisphereLight);

    // State
    this._dayTimer = 0; // 0-1 representing 24-hour cycle
    this._materials = [];
    this._timeScale = 1.0; // 1.0 = real-time, higher = faster
    this._enabled = true;
    this._skyboxEnabled = true;

    // Configuration
    this.config = {
      dayLengthMinutes: 60, // 60 IRL minutes = 1 game day
      sunIntensityDay: 1.0,
      sunIntensityNight: 0.0,
      ambientIntensityDay: 0.4,
      ambientIntensityNight: 0.1,
      hemisphereIntensityDay: 0.3,
      hemisphereIntensityNight: 0.1,
      sunColorDay: 0xffffff,
      sunColorDawn: 0xffaa66,
      sunColorDusk: 0xff6666,
      sunColorNight: 0x000000,
      ambientColorDay: 0xffffff,
      ambientColorNight: 0x444466,
      skyColorDay: 0x87ceeb,
      skyColorNight: 0x000033,
      groundColorDay: 0x444444,
      groundColorNight: 0x111122
    };
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    this.ambient.visible = enabled;
    this.sunLight.visible = enabled;
    this.moonLight.visible = enabled;
    this.hemisphereLight.visible = enabled;
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
    this._materials.push(material);
    return material;
  }

  /**
   * Update the day/night cycle
   * @param {number} dayTimer - Normalized time (0-1) representing 24-hour cycle
   * @param {number} delta - Time since last frame in seconds
   * @param {THREE.Vector3} playerPos - Current player position
   */
  updateDayCycle(dayTimer, delta, playerPos) {
    if (!this._enabled) return;
    
    this._dayTimer = dayTimer;
    
    // Update skybox
    this.skybox.update(dayTimer, delta, playerPos);

    // Calculate time-based factors
    const angle = dayTimer * Math.PI * 2;
    const nightFactor = Math.max(0, -Math.sin(angle));
    const dawnFactor = Math.sin(angle + Math.PI * 0.5) * 0.5 + 0.5;
    const duskFactor = Math.sin(angle - Math.PI * 0.5) * 0.5 + 0.5;
    
    // Update sun position and intensity
    const sunHeight = Math.sin(angle) * 800 + 300;
    const sunX = Math.cos(angle) * 1000;
    const sunZ = Math.cos(angle * 0.3) * 500; // Add some variation
    
    this.sunLight.position.set(
      playerPos.x + sunX,
      playerPos.y + sunHeight,
      playerPos.z + sunZ
    );
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    // Update moon position (opposite of sun)
    const moonAngle = (dayTimer + 0.5) * Math.PI * 2;
    const moonHeight = Math.sin(moonAngle) * 600 + 400;
    const moonX = Math.cos(moonAngle) * 800;
    const moonZ = Math.cos(moonAngle * 0.3) * 400;
    
    this.moonLight.position.set(
      playerPos.x + moonX,
      playerPos.y + moonHeight,
      playerPos.z + moonZ
    );
    this.moonLight.target.position.copy(playerPos);
    this.moonLight.target.updateMatrixWorld();

    // Calculate light intensities based on time of day
    const sunIntensity = this._calculateSunIntensity(dayTimer);
    const ambientIntensity = this._calculateAmbientIntensity(dayTimer);
    const hemisphereIntensity = this._calculateHemisphereIntensity(dayTimer);

    // Update light colors based on time of day
    const sunColor = this._calculateSunColor(dayTimer);
    const ambientColor = this._calculateAmbientColor(dayTimer);
    const skyColor = this._calculateSkyColor(dayTimer);
    const groundColor = this._calculateGroundColor(dayTimer);

    // Apply light settings
    this.sunLight.intensity = sunIntensity;
    this.sunLight.color.setHex(sunColor);
    
    this.ambient.intensity = ambientIntensity;
    this.ambient.color.setHex(ambientColor);
    
    this.hemisphereLight.intensity = hemisphereIntensity;
    this.hemisphereLight.color.setHex(skyColor);
    this.hemisphereLight.groundColor.setHex(groundColor);

    // Update moon light
    this.moonLight.intensity = (1 - sunIntensity) * 0.2;
    
    // Update scene background and fog
    this.scene.background.setHex(skyColor);
    if (this.scene.fog && this.scene.fog.color) {
      this.scene.fog.color.setHex(skyColor);
    }
  }

  _calculateSunIntensity(dayTimer) {
    // 6 AM to 6 PM: full intensity
    // 6 PM to 6 AM: fade out
    const normalizedTime = (dayTimer * 24) % 24;
    
    if (normalizedTime >= 6 && normalizedTime <= 18) {
      // Daytime
      const peakTime = 12;
      const distanceFromPeak = Math.abs(normalizedTime - peakTime);
      const peakFactor = 1 - Math.pow(distanceFromPeak / 6, 2);
      return this.config.sunIntensityDay * peakFactor;
    } else {
      // Nighttime
      const dawnDistance = normalizedTime < 6 ? 6 - normalizedTime : normalizedTime - 18;
      const fadeFactor = Math.min(1, dawnDistance / 1); // 1 hour transition
      return this.config.sunIntensityNight + 
             (this.config.sunIntensityDay - this.config.sunIntensityNight) * 
             (1 - fadeFactor);
    }
  }

  _calculateAmbientIntensity(dayTimer) {
    const normalizedTime = (dayTimer * 24) % 24;
    
    if (normalizedTime >= 6 && normalizedTime <= 18) {
      // Daytime
      return this.config.ambientIntensityDay;
    } else {
      // Nighttime
      return this.config.ambientIntensityNight;
    }
  }

  _calculateHemisphereIntensity(dayTimer) {
    const normalizedTime = (dayTimer * 24) % 24;
    
    if (normalizedTime >= 6 && normalizedTime <= 18) {
      return this.config.hemisphereIntensityDay;
    } else {
      return this.config.hemisphereIntensityNight;
    }
  }

  _calculateSunColor(dayTimer) {
    const normalizedTime = (dayTimer * 24) % 24;
    
    if (normalizedTime >= 5 && normalizedTime <= 7) {
      // Dawn
      const progress = (normalizedTime - 5) / 2;
      return this._lerpHex(
        this.config.sunColorDawn,
        this.config.sunColorDay,
        progress
      );
    } else if (normalizedTime >= 17 && normalizedTime <= 19) {
      // Dusk
      const progress = (normalizedTime - 17) / 2;
      return this._lerpHex(
        this.config.sunColorDay,
        this.config.sunColorDusk,
        progress
      );
    } else if (normalizedTime >= 7 && normalizedTime <= 17) {
      // Day
      return this.config.sunColorDay;
    } else {
      // Night
      return this.config.sunColorNight;
    }
  }

  _calculateAmbientColor(dayTimer) {
    const normalizedTime = (dayTimer * 24) % 24;
    
    if (normalizedTime >= 6 && normalizedTime <= 18) {
      return this.config.ambientColorDay;
    } else {
      return this.config.ambientColorNight;
    }
  }

  _calculateSkyColor(dayTimer) {
    const normalizedTime = (dayTimer * 24) % 24;
    
    if (normalizedTime >= 5 && normalizedTime <= 7) {
      // Dawn
      const progress = (normalizedTime - 5) / 2;
      return this._lerpHex(0x000033, this.config.skyColorDay, progress);
    } else if (normalizedTime >= 17 && normalizedTime <= 19) {
      // Dusk
      const progress = (normalizedTime - 17) / 2;
      return this._lerpHex(this.config.skyColorDay, 0x000033, progress);
    } else if (normalizedTime >= 7 && normalizedTime <= 17) {
      // Day
      return this.config.skyColorDay;
    } else {
      // Night
      return this.config.skyColorNight;
    }
  }

  _calculateGroundColor(dayTimer) {
    const normalizedTime = (dayTimer * 24) % 24;
    
    if (normalizedTime >= 6 && normalizedTime <= 18) {
      return this.config.groundColorDay;
    } else {
      return this.config.groundColorNight;
    }
  }

  _lerpHex(color1, color2, factor) {
    const c1 = new THREE.Color(color1);
    const c2 = new THREE.Color(color2);
    return c1.lerp(c2, factor).getHex();
  }

  setTimeScale(scale) {
    this._timeScale = scale;
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
    // Dispose skybox
    if (this.skybox) {
      this.skybox.dispose();
    }

    // Remove lights
    this.scene.remove(this.ambient);
    this.scene.remove(this.sunLight);
    this.scene.remove(this.sunLight.target);
    this.scene.remove(this.moonLight);
    this.scene.remove(this.moonLight.target);
    this.scene.remove(this.hemisphereLight);
  }
}
