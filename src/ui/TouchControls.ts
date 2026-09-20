/**
 * Touch controls for mobile: left virtual joystick (move), right-half drag
 * (look), and buttons for jump / interact / amber+cyan portals / sprint /
 * pause. No pointer lock is needed on touch — Input.touchMode bypasses it.
 */
import type { Action } from '../core/Input';
import { Input } from '../core/Input';

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches === true
  );
}

const STICK_RADIUS = 52;
const DEAD_ZONE = 0.15;

export class TouchControls {
  private root: HTMLElement;
  private stickBase!: HTMLElement;
  private stickKnob!: HTMLElement;
  private visible = false;
  private stickTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private sprintOn = false;
  onPause: (() => void) | null = null;

  constructor(private ui: HTMLElement, private input: Input) {
    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.classList.add('hidden');
    this.root.innerHTML = `
      <div id="touch-stick"><div id="touch-knob"></div></div>
      <div id="touch-buttons">
        <button class="touch-btn portal amber" data-act="fireAmber" aria-label="Fire amber portal">◐</button>
        <button class="touch-btn portal cyan" data-act="fireCyan" aria-label="Fire cyan portal">◑</button>
        <button class="touch-btn jump" data-act="jump" aria-label="Jump">▲</button>
        <button class="touch-btn interact" data-act="interact" aria-label="Interact">E</button>
        <button class="touch-btn sprint" data-act="sprint" aria-label="Toggle sprint">»</button>
      </div>
      <button id="touch-pause" aria-label="Pause">II</button>
    `;
    this.ui.appendChild(this.root);
    this.stickBase = this.root.querySelector('#touch-stick')!;
    this.stickKnob = this.root.querySelector('#touch-knob')!;

    this.bindStick();
    this.bindLook();
    this.bindButtons();
  }

  get active(): boolean {
    return this.input.touchMode;
  }

  /** Enable touch mode (called once when a touch device is detected). */
  enable(): void {
    this.input.touchMode = true;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    this.ui.classList.toggle('touch-active', v);
    if (!v) {
      this.input.setTouchMove(0, 0);
      this.stickTouchId = null;
      this.lookTouchId = null;
      this.resetKnob();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ---------------------------------------------------------- joystick
  private bindStick(): void {
    const start = (e: TouchEvent) => {
      if (this.stickTouchId !== null) return;
      const t = e.changedTouches[0];
      this.stickTouchId = t.identifier;
      this.moveStick(t.clientX, t.clientY);
      e.preventDefault();
    };
    const move = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickTouchId) {
          this.moveStick(t.clientX, t.clientY);
          e.preventDefault();
        }
      }
    };
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickTouchId) {
          this.stickTouchId = null;
          this.input.setTouchMove(0, 0);
          this.resetKnob();
        }
      }
    };
    this.stickBase.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }

  private moveStick(clientX: number, clientY: number): void {
    const rect = this.stickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (clientX - cx) / STICK_RADIUS;
    let dy = (clientY - cy) / STICK_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    // Dead zone so resting thumbs don't drift.
    const mag = Math.hypot(dx, dy);
    if (mag < DEAD_ZONE) {
      dx = 0;
      dy = 0;
    }
    // Screen up (dy<0) = forward (+1). x = strafe right.
    this.input.setTouchMove(dx, -dy);
    this.stickKnob.style.transform =
      `translate(calc(-50% + ${dx * STICK_RADIUS * 0.6}px), calc(-50% + ${dy * STICK_RADIUS * 0.6}px))`;
  }

  private resetKnob(): void {
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  // ---------------------------------------------------------- look drag
  private bindLook(): void {
    // Drags anywhere that aren't on controls look around. Buttons and the
    // stick stop propagation via their own handlers / pointer-events.
    const onStart = (e: TouchEvent) => {
      if (!this.visible) return;
      for (const t of Array.from(e.changedTouches)) {
        const peer = document.elementFromPoint(t.clientX, t.clientY);
        if (peer?.closest?.('#touch-controls')) continue;
        if (peer?.closest?.('.screen')) continue;
        if (this.lookTouchId === null) {
          this.lookTouchId = t.identifier;
          this.lastLook.x = t.clientX;
          this.lastLook.y = t.clientY;
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) {
          const dx = t.clientX - this.lastLook.x;
          const dy = t.clientY - this.lastLook.y;
          this.lastLook.x = t.clientX;
          this.lastLook.y = t.clientY;
          if (this.input.enabled) this.input.injectLook(dx, dy);
          e.preventDefault();
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    // Attach to window with passive:false so we can preventDefault (no scroll).
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  }

  // ---------------------------------------------------------- buttons
  private bindButtons(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.touch-btn').forEach((btn) => {
      const act = btn.dataset.act as Action;
      if (act === 'sprint') {
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.sprintOn = !this.sprintOn;
          btn.classList.toggle('on', this.sprintOn);
          if (this.sprintOn) this.input.press('sprint');
          else this.input.release('sprint');
        }, { passive: false });
        // Also allow mouse for desktop testing.
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!isTouchDevice()) {
            this.sprintOn = !this.sprintOn;
            btn.classList.toggle('on', this.sprintOn);
            if (this.sprintOn) this.input.press('sprint');
            else this.input.release('sprint');
          }
        });
        return;
      }
      const down = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.press(act);
      };
      const up = (e: Event) => {
        e.stopPropagation();
        this.input.release(act);
      };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up);
      btn.addEventListener('touchcancel', up);
      // Desktop fallback (devtools device emulation / testing).
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
    });

    const pause = this.root.querySelector('#touch-pause')!;
    pause.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onPause?.();
    }, { passive: false });
    pause.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPause?.();
    });
  }

  dispose(): void {
    this.root.remove();
  }
}
