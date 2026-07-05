// entities/Player.js
import * as THREE from "three";
import { CONFIG } from "../config.js";
import { BLOCK_TYPES } from "../blockRegistry.js";

/**
 * Hybrid pointer lock system.
 * Attempts native requestPointerLock first, falls back to soft-lock in restricted environments (HOI4 CEF).
 */
class HybridPointerLock extends EventTarget {
  constructor(domElement) {
    super();
    this.domElement = domElement;
    this._isLocked = false;
    this._usingNativeLock = false;
    this.onMove = null;

    this.hasNativePointerLock = !!(
      document.pointerLockElement !== undefined ||
      document.mozPointerLockElement !== undefined ||
      document.webkitPointerLockElement !== undefined
    );

    this._lastX = window.innerWidth / 2;
    this._lastY = window.innerHeight / 2;

    if (this.hasNativePointerLock) {
      document.addEventListener("pointerlockchange", () => this.#onPointerLockChange());
      document.addEventListener("pointerlockerror", () => this.#onPointerLockError());
    }

    window.addEventListener("mousemove", (e) => this.#onMouseMove(e));
    this.domElement.addEventListener("click", () => this.lock());
  }

  lock() {
    if (this._isLocked) return;

    if (this.hasNativePointerLock) {
      const requestPointerLock =
        this.domElement.requestPointerLock ||
        this.domElement.mozRequestPointerLock ||
        this.domElement.webkitRequestPointerLock;

      if (requestPointerLock) {
        requestPointerLock.call(this.domElement).catch(() => {
          this.#activateSoftLock();
        });
        return;
      }
    }

    this.#activateSoftLock();
  }

  #activateSoftLock() {
    this._isLocked = true;
    this._usingNativeLock = false;
    this.domElement.style.cursor = "none";
    this.dispatchEvent(new Event("lock"));
  }

  #onPointerLockChange() {
    const locked =
      document.pointerLockElement === this.domElement ||
      document.mozPointerLockElement === this.domElement ||
      document.webkitPointerLockElement === this.domElement;

    if (locked && !this._isLocked) {
      this._isLocked = true;
      this._usingNativeLock = true;
      this.dispatchEvent(new Event("lock"));
    }
  }

  #onPointerLockError() {
    if (this._isLocked && this._usingNativeLock) {
      this.#activateSoftLock();
    }
  }

  unlock() {
    if (!this._isLocked) return;

    if (this._usingNativeLock) {
      document.exitPointerLock =
        document.exitPointerLock ||
        document.mozExitPointerLock ||
        document.webkitExitPointerLock;
      document.exitPointerLock();
    }

    this._isLocked = false;
    this._usingNativeLock = false;
    this.domElement.style.cursor = "auto";
    this.dispatchEvent(new Event("unlock"));
  }

  get isLocked() {
    return this._isLocked;
  }

  get usingNativeLock() {
    return this._usingNativeLock;
  }

  #onMouseMove(e) {
    if (!this._isLocked) {
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      return;
    }

    if (this._usingNativeLock) {
      const deltaX = e.movementX || 0;
      const deltaY = e.movementY || 0;

      if (this.onMove && (deltaX !== 0 || deltaY !== 0)) {
        this.onMove(deltaX, deltaY);
      }
    } else {
      const deltaX = e.clientX - this._lastX;
      const deltaY = e.clientY - this._lastY;

      if (this.onMove) {
        this.onMove(deltaX, deltaY);
      }

      this._lastX = e.clientX;
      this._lastY = e.clientY;
    }
  }
}

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.controls = new HybridPointerLock(domElement);
    this.lookSensitivity = 0.003;

    this.position = camera.position;
    this.velocity = new THREE.Vector3();
    this.isFlying = false;
    this.sprintMultiplier = 1.0;

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

    // MOUSE MOVEMENT STATE
    this.mouseMoveActive = false;
    this.mouseMoveState = { x: 0, y: 0 };
    this.mouseForwardInput = 0;
    this.mouseStrafeInput = 0;

    // WHEEL STATE
    this.wheelUp = false;
    this.wheelDown = false;
    this._wheelTimeout = null;

    this.gamepadIndex = null;
    this.gamepadDeadzone = 0.15;
    this.gamepadLookSensitivity = 2.5;

    window.addEventListener("gamepadconnected", (e) => {
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
    });

    this.#setupInput();
    this.#setupMouseLook();
    this.#setupMouseMovement();
    this.#setupMouseWheel();
    this.#setupFlightToggle(); // NEW: middle-click to toggle flight
  }

  getLockMode() {
    if (!this.controls.isLocked) return "unlocked";
    return this.controls.usingNativeLock ? "native" : "soft";
  }

  getCapabilities() {
    return {
      nativePointerLockAvailable: this.controls.hasNativePointerLock,
      currentMode: this.getLockMode(),
    };
  }

  #setupInput() {
    window.addEventListener("keydown", (e) => {
      if (document.activeElement && document.activeElement.tagName === "INPUT")
        return;

      const key = e.key.toLowerCase();
      if (key in this.keys) this.keys[key] = true;
      if (key === "shift") this.sprintMultiplier = 2.0;
      if (key === "f") {
        this.#toggleFlight();
      }
    }, true);

    window.addEventListener("keyup", (e) => {
      if (document.activeElement && document.activeElement.tagName === "INPUT")
        return;

      const key = e.key.toLowerCase();
      if (key in this.keys) this.keys[key] = false;
      if (key === "shift") this.sprintMultiplier = 1.0;
    }, true);
  }

  #toggleFlight() {
    this.isFlying = !this.isFlying;
    if (!this.isFlying) this.velocity.y = 0;
    console.log("Flight mode:", this.isFlying ? "ON" : "OFF");
  }

  #setupMouseLook() {
    this.controls.onMove = (deltaX, deltaY) => {
      if (!this.controls.isLocked) return;

      const sensitivity = this.controls.usingNativeLock ? 0.003 : 0.0005;

      const euler = new THREE.Euler(0, 0, 0, "YXZ");
      euler.setFromQuaternion(this.camera.quaternion);

      euler.y -= deltaX * sensitivity;
      euler.x -= deltaY * sensitivity;

      euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

      this.camera.quaternion.setFromEuler(euler);
    };
  }

  #setupMouseMovement() {
    window.addEventListener("mousedown", (e) => {
      if (!this.controls.isLocked) return;
      if (e.button === 2) {
        this.mouseMoveActive = true;
        this.mouseMoveState.x = 0;
        this.mouseMoveState.y = 0;
        this.mouseForwardInput = 0;
        this.mouseStrafeInput = 0;
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 2) {
        this.mouseMoveActive = false;
        this.mouseMoveState.x = 0;
        this.mouseMoveState.y = 0;
        this.mouseForwardInput = 0;
        this.mouseStrafeInput = 0;
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.controls.isLocked) return;

      if (this.mouseMoveActive) {
        this.mouseMoveState.y += e.movementY || 0;
        this.mouseMoveState.x += e.movementX || 0;

        const deadzone = 3;
        const sensitivity = 0.015;

        const rawForward = -this.mouseMoveState.y * sensitivity;
        const rawStrafe = this.mouseMoveState.x * sensitivity;

        this.mouseForwardInput = Math.abs(rawForward) > deadzone * sensitivity
          ? Math.max(-1, Math.min(1, rawForward))
          : 0;
        this.mouseStrafeInput = Math.abs(rawStrafe) > deadzone * sensitivity
          ? Math.max(-1, Math.min(1, rawStrafe))
          : 0;
      }
    });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // NEW: Middle-click toggles flight mode (since 'f' key is blocked in CEF)
  #setupFlightToggle() {
    window.addEventListener("mousedown", (e) => {
      if (!this.controls.isLocked) return;
      if (e.button === 1) {
        // Middle mouse button
        e.preventDefault();
        this.#toggleFlight();
      }
    });
  }

  #setupMouseWheel() {
    window.addEventListener("wheel", (e) => {
      if (!this.controls.isLocked) return;

      // deltaY < 0 = scroll UP (user wants to go UP/jump)
      // deltaY > 0 = scroll DOWN (user wants to go DOWN/descend)
      if (e.deltaY < 0) {
        this.wheelUp = true;
        this.wheelDown = false;
      } else if (e.deltaY > 0) {
        this.wheelUp = false;
        this.wheelDown = true;
      }

      // Clear wheel state after a short delay (wheel is discrete, not held)
      if (this._wheelTimeout) clearTimeout(this._wheelTimeout);
      this._wheelTimeout = setTimeout(() => {
        this.wheelUp = false;
        this.wheelDown = false;
      }, 150);

      e.preventDefault();
    }, { passive: false });
  }

  #applyDeadzone(value) {
    if (Math.abs(value) < this.gamepadDeadzone) return 0;
    return value;
  }

  #pollGamepad(delta) {
    if (this.gamepadIndex === null) return;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[this.gamepadIndex];
    if (!pad) return;

    const moveX = this.#applyDeadzone(pad.axes[0] || 0);
    const moveY = this.#applyDeadzone(pad.axes[1] || 0);
    const lookX = this.#applyDeadzone(pad.axes[2] || 0);
    const lookY = this.#applyDeadzone(pad.axes[3] || 0);

    this.keys.w = moveY < 0;
    this.keys.s = moveY > 0;
    this.keys.a = moveX < 0;
    this.keys.d = moveX > 0;

    const jumpButton = pad.buttons[0] && pad.buttons[0].pressed;
    const sprintButton = pad.buttons[10] && pad.buttons[10].pressed;
    this.keys[" "] = !!jumpButton;
    this.sprintMultiplier = sprintButton ? 2.0 : 1.0;

    if (pad.buttons[3] && pad.buttons[3].pressed && !this._flyButtonHeld) {
      this.#toggleFlight();
    }
    this._flyButtonHeld = pad.buttons[3] && pad.buttons[3].pressed;

    if (lookX !== 0 || lookY !== 0) {
      const euler = new THREE.Euler(0, 0, 0, "YXZ");
      euler.setFromQuaternion(this.camera.quaternion);

      euler.y -= lookX * this.gamepadLookSensitivity * delta;
      euler.x -= lookY * this.gamepadLookSensitivity * delta;

      euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

      this.camera.quaternion.setFromEuler(euler);
    }
  }

  getFacing() {
    const f = this.getForward();
    const angle = Math.atan2(f.x, f.z) * (180 / Math.PI);

    if (angle > -45 && angle <= 45) return "South (+Z)";
    if (angle > 45 && angle <= 135) return "East (+X)";
    if (angle > -135 && angle <= -45) return "West (-X)";
    return "North (-Z)";
  }

  update(delta, world) {
    this.#pollGamepad(delta);

    if (!this.controls.isLocked && this.gamepadIndex === null) return;

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

    // KEYBOARD INPUT
    if (this.keys.w) moveVec.add(forward);
    if (this.keys.s) moveVec.sub(forward);
    if (this.keys.a) moveVec.sub(right);
    if (this.keys.d) moveVec.add(right);

    // MOUSE RIGHT-CLICK DRAG INPUT
    if (this.mouseMoveActive) {
      if (this.mouseForwardInput !== 0) {
        moveVec.add(forward.clone().multiplyScalar(this.mouseForwardInput));
      }
      if (this.mouseStrafeInput !== 0) {
        moveVec.add(right.clone().multiplyScalar(this.mouseStrafeInput));
      }
    }

    const footY = pos.y - 1.6;
    const centerY = footY + 1.0;

    // ============================================
    // FLYING MODE
    // ============================================
    if (this.isFlying) {
      let speed =
        CONFIG.PLAYER_SPEED * (this.sprintMultiplier > 1.0 ? 25.0 : 5.0);

      if (moveVec.lengthSq() > 0)
        moveVec.normalize().multiplyScalar(speed * delta);

      pos.x += moveVec.x;
      pos.z += moveVec.z;

      // VERTICAL: keyboard space/shift OR mouse wheel
      let vertical = 0;

      // Keyboard (standalone browser)
      if (this.keys[" "]) vertical = speed * delta;
      if (this.keys.shift) vertical = -speed * delta;

      // Mouse wheel (CEF fallback)
      if (this.wheelUp) vertical = speed * delta * 2.0;   // scroll up = ascend
      if (this.wheelDown) vertical = -speed * delta * 2.0; // scroll down = descend

      pos.y += vertical;
      pos.y = Math.max(1, Math.min(CONFIG.CHUNK_HEIGHT * 2, pos.y));
    }
    // ============================================
    // WALKING MODE
    // ============================================
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
      const inWater =
        headBlock === BLOCK_TYPES.WATER || footBlock === BLOCK_TYPES.WATER;
      let currentSpeed =
        CONFIG.PLAYER_SPEED * (inWater ? 0.6 : 1.0) * this.sprintMultiplier;

      if (moveVec.lengthSq() > 0)
        moveVec.normalize().multiplyScalar(currentSpeed * delta);

      // Collision detection
      const collides = (x, y, z) => {
        const hw = 0.3, hh = 1.0;
        const minX = Math.floor(x - hw), maxX = Math.floor(x + hw);
        const minY = Math.floor(y - hh), maxY = Math.floor(y + hh);
        const minZ = Math.floor(z - hw), maxZ = Math.floor(z + hw);
        for (let by = minY; by <= maxY; by++) {
          for (let bx = minX; bx <= maxX; bx++) {
            for (let bz = minZ; bz <= maxZ; bz++) {
              const block = world.getBlock(bx, by, bz);
              if (block > 0 && block !== BLOCK_TYPES.WATER && block !== 255)
                return true;
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
        if (this.keys[" "] || this.wheelUp) this.velocity.y = CONFIG.PLAYER_JUMP_SPEED * 0.5;
      } else {
        this.velocity.y -= CONFIG.GRAVITY * delta;
      }

      let newCenterY = centerY + this.velocity.y * delta;
      if (!collides(pos.x, newCenterY, pos.z)) {
        pos.y = newCenterY - 1.0 + 1.6;
      } else {
        this.velocity.y = 0;
      }

      // Jump: keyboard space OR mouse wheel up
      const jumpRequested = this.keys[" "] || this.wheelUp;
      if (!inWater && jumpRequested && collides(pos.x, centerY - 0.1, pos.z)) {
        this.velocity.y = CONFIG.PLAYER_JUMP_SPEED;
      }
    }

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