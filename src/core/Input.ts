/**
 * Keyboard + mouse input with pointer lock, plus a virtual injection layer so
 * Playwright e2e tests can drive the game without real pointer lock.
 */
export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'jump' | 'sprint' | 'interact' | 'fireAmber' | 'fireCyan' | 'pause' | 'reset';

const KEYMAP: Record<string, Action> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'interact',
  KeyP: 'pause',
  KeyR: 'reset',
  Mouse0: 'fireAmber',
  Mouse2: 'fireCyan',
};

export class Input {
  private down = new Set<Action>();
  private pressedThisFrame = new Set<Action>();
  private dx = 0;
  private dy = 0;
  /** When true (e2e), pointer lock is not required and injected input is used. */
  simulated = false;
  enabled = false;
  /** When true, a touch layout is active: no pointer lock required. */
  touchMode = false;
  /** Analog stick vector from touch joystick: x = strafe (-1..1), y = forward (-1..1). */
  touchMove = { x: 0, y: 0 };
  /** Touch look sensitivity multiplier relative to mouse sensitivity. */
  touchLookScale = 2.2;
  onPointerLockLost: (() => void) | null = null;
  onMouseDownWhileUnlocked: (() => void) | null = null;

  private canvas: HTMLCanvasElement | null = null;

  bind(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const a = KEYMAP[e.code];
      if (a) {
        if (e.code === 'Space') e.preventDefault();
        this.press(a);
      }
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.isLocked && !this.simulated) {
        this.onMouseDownWhileUnlocked?.();
        return;
      }
      const a = KEYMAP['Mouse' + e.button];
      if (a) this.press(a);
    });
    window.addEventListener('mouseup', (e) => {
      const a = KEYMAP['Mouse' + e.button];
      if (a) this.release(a);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.isLocked && this.enabled) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.isLocked && this.enabled && !this.simulated) {
        this.releaseAll();
        this.onPointerLockLost?.();
      }
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  get isLocked(): boolean {
    if (this.simulated || this.touchMode) return true;
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    if (this.touchMode || this.simulated) return;
    if (this.canvas && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock?.();
    }
  }

  exitLock(): void {
    if (this.touchMode || this.simulated) return;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // --- state queries ---
  isDown(a: Action): boolean { return this.enabled && this.down.has(a); }
  wasPressed(a: Action): boolean { return this.enabled && this.pressedThisFrame.has(a); }

  /**
   * Combined movement intent: keyboard (digital) + touch joystick (analog).
   * Returns forward (-1..1, + = ahead) and strafe (-1..1, + = right).
   */
  moveVector(): { forward: number; strafe: number } {
    let forward = (this.down.has('forward') ? 1 : 0) - (this.down.has('back') ? 1 : 0);
    let strafe = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    if (this.touchMode) {
      forward += this.touchMove.y;
      strafe += this.touchMove.x;
    }
    return {
      forward: Math.max(-1, Math.min(1, forward)),
      strafe: Math.max(-1, Math.min(1, strafe)),
    };
  }

  /** Consume accumulated mouse deltas (call once per frame). */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0; this.dy = 0;
    return d;
  }

  /** Call at the end of each frame to clear edge-triggered presses. */
  endFrame(): void { this.pressedThisFrame.clear(); }

  releaseAll(): void { this.down.clear(); this.pressedThisFrame.clear(); }

  // --- injection (debug / e2e) ---
  press(a: Action): void { if (!this.down.has(a)) this.pressedThisFrame.add(a); this.down.add(a); }
  release(a: Action): void { this.down.delete(a); }
  injectMouse(dx: number, dy: number): void { this.dx += dx; this.dy += dy; }
  /** Touch look drag: scaled up relative to mouse (fingers move slower). */
  injectLook(dx: number, dy: number): void {
    this.dx += dx * this.touchLookScale;
    this.dy += dy * this.touchLookScale;
  }
  /** Set the analog stick vector (x = strafe, y = forward), clamped to -1..1. */
  setTouchMove(x: number, y: number): void {
    this.touchMove.x = Math.max(-1, Math.min(1, x));
    this.touchMove.y = Math.max(-1, Math.min(1, y));
  }
  /** Tap an action for edge-triggered handlers (e2e). */
  tap(a: Action): void { this.pressedThisFrame.add(a); }
}
