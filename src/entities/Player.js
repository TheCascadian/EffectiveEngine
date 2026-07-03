import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { CONFIG } from "../config.js";

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.controls.lockSpeed = 0.002;

    this.position = camera.position;
    this.velocity = new THREE.Vector3();
    this.isFlying = false;
    this.sprintMultiplier = 1.0;

    // Track real speed & position
    this.lastPos = this.position.clone();
    this.currentSpeed = 0;

    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      " ": false,
      shift: false,
    };

    this.#setupInput();
  }

  #setupInput() {
    window.addEventListener("keydown", (e) => {
      // Ignore inputs if the user is typing in the console
      if (document.activeElement && document.activeElement.tagName === "INPUT")
        return;

      if (e.key in this.keys) this.keys[e.key] = true;
      if (e.key === "Shift") this.sprintMultiplier = 2.0;
      if (e.key === "f" || e.key === "F") {
        this.isFlying = !this.isFlying;
        if (!this.isFlying) this.velocity.y = 0;
      }
    });

    window.addEventListener("keyup", (e) => {
      if (document.activeElement && document.activeElement.tagName === "INPUT")
        return;

      if (e.key in this.keys) this.keys[e.key] = false;
      if (e.key === "Shift") this.sprintMultiplier = 1.0;
    });
  }

  /**
   * Get compass direction the player is facing
   */
  getFacing() {
    const f = this.getForward();
    // Calculate angle in degrees
    const angle = Math.atan2(f.x, f.z) * (180 / Math.PI);

    if (angle > -45 && angle <= 45) return "South (+Z)";
    if (angle > 45 && angle <= 135) return "East (+X)";
    if (angle > -135 && angle <= -45) return "West (-X)";
    return "North (-Z)";
  }

  /**
   * Update player physics and movement.
   */
  update(delta, world) {
    if (!this.controls.isLocked) return;

    const camera = this.camera;
    const pos = camera.position;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.quaternion,
    );
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const moveVec = new THREE.Vector3();
    if (this.keys.w) moveVec.add(forward);
    if (this.keys.s) moveVec.sub(forward);
    if (this.keys.a) moveVec.sub(right);
    if (this.keys.d) moveVec.add(right);

    const footY = pos.y - 1.6;
    const centerY = footY + 1.0;

    // Flying
    if (this.isFlying) {
      let speed = CONFIG.PLAYER_SPEED * 2.0;
      if (moveVec.lengthSq() > 0)
        moveVec.normalize().multiplyScalar(speed * delta);
      pos.x += moveVec.x;
      pos.z += moveVec.z;
      let vertical = 0;
      if (this.keys[" "]) vertical = CONFIG.PLAYER_SPEED * 2.0 * delta;
      if (this.keys.shift) vertical = -CONFIG.PLAYER_SPEED * 2.0 * delta;
      pos.y += vertical;
      pos.y = Math.max(1, Math.min(CONFIG.CHUNK_HEIGHT * 2, pos.y));
    }
    // Walking
    else {
      const headBlock = world.getBlock(
        Math.floor(pos.x),
        Math.floor(pos.y - 0.2),
        Math.floor(pos.z),
      );
      const footBlock = world.getBlock(
        Math.floor(pos.x),
        Math.floor(footY),
        Math.floor(pos.z),
      );
      const inWater = headBlock === 7 || footBlock === 7;
      let currentSpeed =
        CONFIG.PLAYER_SPEED * (inWater ? 0.6 : 1.0) * this.sprintMultiplier;

      if (moveVec.lengthSq() > 0)
        moveVec.normalize().multiplyScalar(currentSpeed * delta);

      // Collision detection (simplified)
      const collides = (x, y, z) => {
        const hw = 0.3,
          hh = 1.0;
        const minX = Math.floor(x - hw),
          maxX = Math.floor(x + hw);
        const minY = Math.floor(y - hh),
          maxY = Math.floor(y + hh);
        const minZ = Math.floor(z - hw),
          maxZ = Math.floor(z + hw);
        for (let by = minY; by <= maxY; by++) {
          for (let bx = minX; bx <= maxX; bx++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
              const block = world.getBlock(bx, by, bz);
              if (block > 0 && block !== 7 && block !== 255) return true;
            }
          }
        }
        return false;
      };

      // Move X
      let newX = pos.x + moveVec.x;
      if (!collides(newX, centerY, pos.z)) pos.x = newX;
      // Move Z
      let newZ = pos.z + moveVec.z;
      if (!collides(pos.x, centerY, newZ)) pos.z = newZ;

      // Gravity & jump
      if (inWater) {
        this.velocity.y -= CONFIG.GRAVITY * 0.2 * delta;
        if (this.keys[" "]) this.velocity.y = CONFIG.PLAYER_JUMP_SPEED * 0.5;
      } else {
        this.velocity.y -= CONFIG.GRAVITY * delta;
      }

      let newCenterY = centerY + this.velocity.y * delta;
      if (!collides(pos.x, newCenterY, pos.z)) {
        pos.y = newCenterY - 1.0 + 1.6;
      } else {
        this.velocity.y = 0;
      }

      if (!inWater && this.keys[" "] && collides(pos.x, centerY - 0.1, pos.z)) {
        this.velocity.y = CONFIG.PLAYER_JUMP_SPEED;
      }
    }

    // Calculate absolute speed (meters per second)
    const dist = pos.distanceTo(this.lastPos);
    this.currentSpeed = dist / delta;
    this.lastPos.copy(pos);
  }

  lock() {
    this.controls.lock();
  }

  unlock() {
    this.controls.unlock();
  }

  get isLocked() {
    return this.controls.isLocked;
  }

  getForward() {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.quaternion,
    );
    f.y = 0;
    f.normalize();
    return f;
  }
}
