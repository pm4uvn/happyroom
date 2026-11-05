"use client";

/**
 * Movement input shared by keyboard and the on-screen joystick.
 * Values are in "screen space": x = right, y = up (away from the camera), magnitude ≤ 1.
 */
export interface MoveInput {
  joystick: { x: number; y: number };
  keys: Set<string>;
}

export function createMoveInput(): MoveInput {
  return { joystick: { x: 0, y: 0 }, keys: new Set() };
}

const KEYMAP: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function readInput(input: MoveInput): { x: number; y: number } {
  let x = input.joystick.x;
  let y = input.joystick.y;
  for (const code of input.keys) {
    const v = KEYMAP[code];
    if (v) {
      x += v[0];
      y += v[1];
    }
  }
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

/** Attach keyboard listeners; ignores keys typed into form fields. */
export function bindKeyboard(input: MoveInput): () => void {
  const isTyping = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return (
      !!el &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
    );
  };
  const down = (e: KeyboardEvent) => {
    if (!(e.code in KEYMAP) || isTyping(e)) return;
    if (e.code.startsWith("Arrow")) e.preventDefault();
    input.keys.add(e.code);
  };
  const up = (e: KeyboardEvent) => input.keys.delete(e.code);
  const clear = () => input.keys.clear();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", clear);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", clear);
  };
}
