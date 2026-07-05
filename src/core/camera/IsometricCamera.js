// src/camera/IsometricCamera.js
import * as THREE from "three";

export class IsometricCamera {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3(0, 0, 0);

    this.theta = Math.PI / 4;
    this.phi = Math.PI / 3;
    this.radius = 150;

    // Pan speed multiplier
    this.panSensitivity = 0.5;
    // Keyboard movement speed (blocks per second)
    this.keyboardSpeed = 25.0;

    this.isRotating = false;
    this.isPanning = false;
    this.previousMouse = { x: 0, y: 0 };

    // Keyboard state
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      q: false,
      e: false,
    };

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    this.domElement.addEventListener("pointerdown", this._onPointerDown);
    this.domElement.addEventListener("pointermove", this._onPointerMove);
    this.domElement.addEventListener("pointerup", this._onPointerUp);
    this.domElement.addEventListener("wheel", this._onWheel, {
      passive: false,
    });
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  _onKeyDown(e) {
    const key = e.key.toLowerCase();
    if (
      key === "w" ||
      key === "a" ||
      key === "s" ||
      key === "d" ||
      key === "q" ||
      key === "e"
    ) {
      e.preventDefault();
      this.keys[key] = true;
    }
  }

  _onKeyUp(e) {
    const key = e.key.toLowerCase();
    if (
      key === "w" ||
      key === "a" ||
      key === "s" ||
      key === "d" ||
      key === "q" ||
      key === "e"
    ) {
      e.preventDefault();
      this.keys[key] = false;
    }
  }

  _onPointerDown(e) {
    // Left Click = Rotate
    if (e.button === 0) {
      this.isRotating = true;
      this.previousMouse.x = e.clientX;
      this.previousMouse.y = e.clientY;
      this.domElement.setPointerCapture(e.pointerId);
    }
    // Right Click = Pan
    else if (e.button === 2) {
      this.isPanning = true;
      this.previousMouse.x = e.clientX;
      this.previousMouse.y = e.clientY;
      this.domElement.setPointerCapture(e.pointerId);
    }
  }

  _onPointerMove(e) {
    if (!this.isRotating && !this.isPanning) return;

    const dx = e.clientX - this.previousMouse.x;
    const dy = e.clientY - this.previousMouse.y;
    this.previousMouse.x = e.clientX;
    this.previousMouse.y = e.clientY;

    if (this.isRotating) {
      const rotationSensitivity = 0.005;
      this.theta -= dx * rotationSensitivity;
      this.phi -= dy * rotationSensitivity;
      // Clamp vertical rotation so we don't flip upside down
      this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));
    } else if (this.isPanning) {
      // Calculate forward and right vectors based on current camera rotation
      const forward = new THREE.Vector3(0, 0, -1);
      const quat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, this.theta, 0, "YXZ"),
      );
      forward.applyQuaternion(quat);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3(1, 0, 0);
      right.applyQuaternion(quat);
      right.y = 0;
      right.normalize();

      // Move the target relative to the camera's orientation
      const moveX = right.clone().multiplyScalar(-dx * this.panSensitivity);
      const moveZ = forward.clone().multiplyScalar(-dy * this.panSensitivity);

      this.target.add(moveX);
      this.target.add(moveZ);
    }
  }

  _onPointerUp(e) {
    if (e.button === 0) this.isRotating = false;
    if (e.button === 2) this.isPanning = false;

    if (!this.isRotating && !this.isPanning) {
      if (this.domElement.hasPointerCapture(e.pointerId)) {
        this.domElement.releasePointerCapture(e.pointerId);
      }
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    this.radius *= 1 + delta * 0.15;
    this.radius = Math.max(10, Math.min(1500, this.radius));
  }

  update(delta) {
    // --- Keyboard Panning Logic (WASD) ---
    const forward = new THREE.Vector3(0, 0, -1);
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, this.theta, 0, "YXZ"),
    );
    forward.applyQuaternion(quat);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(quat);
    right.y = 0;
    right.normalize();

    const moveVec = new THREE.Vector3(0, 0, 0);
    if (this.keys.w) moveVec.add(forward);
    if (this.keys.s) moveVec.sub(forward);
    if (this.keys.a) moveVec.sub(right);
    if (this.keys.d) moveVec.add(right);

    if (moveVec.lengthSq() > 0) {
      moveVec.normalize().multiplyScalar(this.keyboardSpeed * delta);
      this.target.add(moveVec);
    }

    // --- Keyboard Rotation (Q/E) ---
    const rotationSpeed = 1.5; // radians per second
    if (this.keys.q) this.theta -= rotationSpeed * delta;
    if (this.keys.e) this.theta += rotationSpeed * delta;

    // Compute camera position from spherical coordinates around the target
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);

    this.camera.position.copy(this.target).add(new THREE.Vector3(x, y, z));
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.domElement.removeEventListener("pointerdown", this._onPointerDown);
    this.domElement.removeEventListener("pointermove", this._onPointerMove);
    this.domElement.removeEventListener("pointerup", this._onPointerUp);
    this.domElement.removeEventListener("wheel", this._onWheel);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }
}
