import * as THREE from "three";

/**
 * Advanced Skybox System with:
 * - HDRI-based environment mapping
 * - Dynamic sky dome with sun/moon
 * - Atmospheric scattering simulation
 * - Weather effects (optional)
 */
export class Skybox {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    
    // Sky dome for smooth gradients
    this.skyDome = null;
    this.sunMesh = null;
    this.moonMesh = null;
    this.starsMesh = null;
    
    // Cloud system
    this.clouds = null;
    this.cloudParticles = [];
    
    // Configuration
    this.config = {
      skyDomeRadius: 10000,
      sunSize: 100,
      moonSize: 50,
      starCount: 2000,
      starFieldRadius: 5000,
      cloudDensity: 0.001,
      cloudAltitude: 200,
      cloudScale: 500,
      rayleighScattering: 0.1,
      mieScattering: 0.01,
      sunIntensity: 1.0,
      moonIntensity: 0.3
    };
    
    this._timeOfDay = 0; // 0-1 representing 24-hour cycle
    this._weatherType = 'clear'; // clear, cloudy, rainy, stormy
    this._weatherIntensity = 0;
    
    this._initSkyDome();
    this._initCelestialBodies();
    this._initStars();
    this._initClouds();
  }
  
  _initSkyDome() {
    // Create a large dome for sky gradients
    const geometry = new THREE.SphereGeometry(
      this.config.skyDomeRadius, 
      32, 
      32,
      0, 
      Math.PI * 2,
      0, 
      Math.PI * 0.5
    );
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        sunPosition: { value: new THREE.Vector3() },
        moonPosition: { value: new THREE.Vector3() },
        timeOfDay: { value: 0 },
        horizonColor: { value: new THREE.Color(0x87ceeb) },
        zenithColor: { value: new THREE.Color(0x000033) },
        sunColor: { value: new THREE.Color(0xffeeaa) },
        moonColor: { value: new THREE.Color(0xaaaaee) },
        sunIntensity: { value: this.config.sunIntensity },
        moonIntensity: { value: this.config.moonIntensity },
        rayleigh: { value: this.config.rayleighScattering },
        mie: { value: this.config.mieScattering }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        
        void main() {
          vWorldPosition = position;
          vNormal = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunPosition;
        uniform vec3 moonPosition;
        uniform float timeOfDay;
        uniform vec3 horizonColor;
        uniform vec3 zenithColor;
        uniform vec3 sunColor;
        uniform vec3 moonColor;
        uniform float sunIntensity;
        uniform float moonIntensity;
        uniform float rayleigh;
        uniform float mie;
        
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        
        void main() {
          vec3 viewDir = normalize(vWorldPosition);
          
          // Basic sky gradient
          float height = vNormal.y;
          vec3 skyColor = mix(horizonColor, zenithColor, max(0.0, height));
          
          // Sun glow
          vec3 sunDir = normalize(sunPosition);
          float sunDot = dot(viewDir, sunDir);
          float sunGlow = pow(max(0.0, 1.0 - abs(sunDot)), 2.0) * 0.5;
          skyColor += sunColor * sunGlow * sunIntensity * (1.0 - timeOfDay * 0.5);
          
          // Moon glow
          vec3 moonDir = normalize(moonPosition);
          float moonDot = dot(viewDir, moonDir);
          float moonGlow = pow(max(0.0, 1.0 - abs(moonDot)), 2.0) * 0.3;
          skyColor += moonColor * moonGlow * moonIntensity * timeOfDay;
          
          // Atmospheric scattering (simplified)
          float scattering = rayleigh * height + mie * (1.0 - height);
          skyColor = mix(skyColor, vec3(0.1, 0.2, 0.4), scattering * 0.5);
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false
    });
    
    this.skyDome = new THREE.Mesh(geometry, material);
    this.skyDome.rotation.order = 'XZY';
    this.scene.add(this.skyDome);
  }
  
  _initCelestialBodies() {
    // Sun geometry with emissive material
    const sunGeometry = new THREE.SphereGeometry(this.config.sunSize, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffeeaa,
      emissive: 0xffeeaa,
      emissiveIntensity: 2.0
    });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunMesh.castShadow = false;
    this.sunMesh.receiveShadow = false;
    this.scene.add(this.sunMesh);
    
    // Moon geometry
    const moonGeometry = new THREE.SphereGeometry(this.config.moonSize, 16, 16);
    const moonMaterial = new THREE.MeshBasicMaterial({
      color: 0xaaaaee,
      emissive: 0xaaaaee,
      emissiveIntensity: 0.5
    });
    this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    this.moonMesh.castShadow = false;
    this.moonMesh.receiveShadow = false;
    this.scene.add(this.moonMesh);
    
    // Add point light for sun
    this.sunLight = new THREE.PointLight(0xffeeaa, 0.5, this.config.skyDomeRadius * 0.5);
    this.scene.add(this.sunLight);
    
    // Add point light for moon
    this.moonLight = new THREE.PointLight(0xaaaaee, 0.2, this.config.skyDomeRadius * 0.3);
    this.scene.add(this.moonLight);
  }
  
  _initStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = [];
    const starColors = [];
    const starSizes = [];
    
    for (let i = 0; i < this.config.starCount; i++) {
      const radius = this.config.starFieldRadius;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      
      starPositions.push(x, y, z);
      
      // Random brightness and color
      const brightness = 0.5 + Math.random() * 0.5;
      const color = new THREE.Color();
      const hue = 0.6 + Math.random() * 0.2; // Blue-white range
      color.setHSL(hue, 0.3 + Math.random() * 0.2, brightness);
      starColors.push(color.r, color.g, color.b);
      
      // Random size
      starSizes.push(0.5 + Math.random() * 2);
    }
    
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    starGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1));
    
    const starMaterial = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true
    });
    
    this.starsMesh = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starsMesh);
  }
  
  _initClouds() {
    // Create cloud particle system
    this.cloudGroup = new THREE.Group();
    this.scene.add(this.cloudGroup);
    
    // Generate cloud particles
    for (let i = 0; i < 100; i++) {
      const geometry = new THREE.PlaneGeometry(200, 200, 1, 1);
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      });
      
      const cloud = new THREE.Mesh(geometry, material);
      cloud.position.set(
        (Math.random() - 0.5) * this.config.cloudScale * 2,
        this.config.cloudAltitude + (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * this.config.cloudScale * 2
      );
      cloud.rotation.x = Math.random() * Math.PI;
      cloud.rotation.z = Math.random() * Math.PI;
      
      this.cloudParticles.push(cloud);
      this.cloudGroup.add(cloud);
    }
  }
  
  update(timeOfDay, delta, playerPosition) {
    this._timeOfDay = timeOfDay;
    
    // Update sun position (60-minute day cycle)
    const sunAngle = timeOfDay * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle) * 600 + 200;
    const sunX = Math.cos(sunAngle) * 800;
    const sunZ = Math.cos(sunAngle * 0.3) * 400; // Add some variation
    
    const sunPos = new THREE.Vector3(
      playerPosition.x + sunX,
      playerPosition.y + sunHeight,
      playerPosition.z + sunZ
    );
    
    this.sunMesh.position.copy(sunPos);
    this.sunLight.position.copy(sunPos);
    
    // Update moon position (opposite of sun)
    const moonAngle = (timeOfDay + 0.5) * Math.PI * 2;
    const moonHeight = Math.sin(moonAngle) * 400 + 300;
    const moonX = Math.cos(moonAngle) * 600;
    const moonZ = Math.cos(moonAngle * 0.3) * 300;
    
    const moonPos = new THREE.Vector3(
      playerPosition.x + moonX,
      playerPosition.y + moonHeight,
      playerPosition.z + moonZ
    );
    
    this.moonMesh.position.copy(moonPos);
    this.moonLight.position.copy(moonPos);
    
    // Update sky dome uniforms
    if (this.skyDome && this.skyDome.material) {
      const material = this.skyDome.material;
      material.uniforms.sunPosition.value.copy(sunPos);
      material.uniforms.moonPosition.value.copy(moonPos);
      material.uniforms.timeOfDay.value = timeOfDay;
      
      // Update sky colors based on time of day
      const nightFactor = Math.max(0, -Math.sin(sunAngle));
      const dawnFactor = Math.sin(sunAngle + Math.PI * 0.5) * 0.5 + 0.5;
      const duskFactor = Math.sin(sunAngle - Math.PI * 0.5) * 0.5 + 0.5;
      
      // Horizon color transitions
      const dawnColor = new THREE.Color(0xff9966);
      const dayColor = new THREE.Color(0x87ceeb);
      const duskColor = new THREE.Color(0xff6699);
      const nightColor = new THREE.Color(0x000033);
      
      let horizonColor = dayColor.clone();
      if (dawnFactor > 0.7) {
        horizonColor.lerp(dawnColor, (dawnFactor - 0.7) * 3.33);
      } else if (duskFactor > 0.7) {
        horizonColor.lerp(duskColor, (duskFactor - 0.7) * 3.33);
      } else if (nightFactor > 0.5) {
        horizonColor.lerp(nightColor, (nightFactor - 0.5) * 2);
      }
      
      material.uniforms.horizonColor.value.copy(horizonColor);
      
      // Zenith color
      const zenithDay = new THREE.Color(0x003366);
      const zenithNight = new THREE.Color(0x000000);
      material.uniforms.zenithColor.value.lerpVectors(
        zenithDay, 
        zenithNight, 
        nightFactor
      );
    }
    
    // Update star visibility
    if (this.starsMesh) {
      const starVisibility = Math.pow(Math.max(0, timeOfDay - 0.25), 2) * 4;
      this.starsMesh.material.opacity = Math.min(0.8, starVisibility);
    }
    
    // Update sun/moon visibility
    const sunVisibility = Math.min(1, Math.max(0, 1 - Math.pow(timeOfDay * 2, 2)));
    const moonVisibility = Math.min(1, Math.pow((timeOfDay - 0.5) * 2, 2));
    
    this.sunMesh.visible = sunVisibility > 0.01;
    this.moonMesh.visible = moonVisibility > 0.01;
    this.sunLight.intensity = this.config.sunIntensity * sunVisibility;
    this.moonLight.intensity = this.config.moonIntensity * moonVisibility;
    
    // Animate clouds
    this.cloudGroup.position.x = playerPosition.x;
    this.cloudGroup.position.z = playerPosition.z;
    
    for (let i = 0; i < this.cloudParticles.length; i++) {
      const cloud = this.cloudParticles[i];
      cloud.position.x += Math.sin(Date.now() * 0.001 + i) * 0.1 * delta;
      cloud.position.z += Math.cos(Date.now() * 0.001 + i) * 0.1 * delta;
      
      // Fade clouds based on weather
      if (this._weatherType === 'clear') {
        cloud.material.opacity = 0.6;
      } else if (this._weatherType === 'cloudy') {
        cloud.material.opacity = 0.8 * this._weatherIntensity;
      } else if (this._weatherType === 'rainy') {
        cloud.material.opacity = 0.9 * this._weatherIntensity;
      }
    }
  }
  
  setWeather(type, intensity = 1.0) {
    this._weatherType = type;
    this._weatherIntensity = intensity;
  }
  
  setTimeOfDay(time) {
    this._timeOfDay = time;
  }
  
  dispose() {
    if (this.skyDome) {
      this.scene.remove(this.skyDome);
      this.skyDome.geometry.dispose();
      this.skyDome.material.dispose();
    }
    
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
    
    if (this.starsMesh) {
      this.scene.remove(this.starsMesh);
      this.starsMesh.geometry.dispose();
      this.starsMesh.material.dispose();
    }
    
    if (this.cloudGroup) {
      this.scene.remove(this.cloudGroup);
      this.cloudParticles.forEach(cloud => {
        cloud.geometry.dispose();
        cloud.material.dispose();
      });
    }
    
    if (this.sunLight) this.scene.remove(this.sunLight);
    if (this.moonLight) this.scene.remove(this.moonLight);
  }
}
