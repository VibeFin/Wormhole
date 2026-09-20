import { describe, expect, it } from 'vitest';
import { Input } from '../../src/core/Input';

describe('Input touch mode', () => {
  it('bypasses pointer lock when touchMode is on', () => {
    const input = new Input();
    input.touchMode = true;
    expect(input.isLocked).toBe(true);
  });

  it('clamps the analog stick vector to -1..1', () => {
    const input = new Input();
    input.setTouchMove(2, -3);
    expect(input.touchMove.x).toBe(1);
    expect(input.touchMove.y).toBe(-1);
  });

  it('combines keyboard + stick in moveVector', () => {
    const input = new Input();
    input.touchMode = true;
    input.press('forward');
    input.setTouchMove(0.5, 0.5);
    // keyboard forward (1) + stick forward (0.5) clamps to 1
    expect(input.moveVector()).toEqual({ forward: 1, strafe: 0.5 });
    input.release('forward');
    input.setTouchMove(-0.25, -0.75);
    expect(input.moveVector()).toEqual({ forward: -0.75, strafe: -0.25 });
  });

  it('scales touch look drag', () => {
    const input = new Input();
    input.touchLookScale = 2;
    input.injectLook(10, -5);
    const d = input.consumeMouseDelta();
    expect(d).toEqual({ dx: 20, dy: -10 });
  });
});
