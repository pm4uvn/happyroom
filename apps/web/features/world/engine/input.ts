"use client";

/**
 * World input: keyboard (WASD / arrows, Shift = sprint), on-screen joystick and accessible hold
 * buttons all write into one shared state read by the CharacterController every frame.
 */
export interface WorldInput {
  keys: Set<string>;
  stick: { x: number; y: number };
  buttons: { x: number; y: number };
  sprintToggle: boolean;
}

export function createWorldInput(): WorldInput {
  return { keys: new Set(), stick: { x: 0, y: 0 }, buttons: { x: 0, y: 0 }, sprintToggle: false };
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function readWorldInput(i: WorldInput): { x: number; y: number; sprint: boolean } {
  let x = i.stick.x + i.buttons.x;
  let y = i.stick.y + i.buttons.y;
  for (const k of i.keys) {
    const v = MOVE_KEYS[k];
    if (v) {
      x += v[0];
      y += v[1];
    }
  }
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  const stickSprint = Math.hypot(i.stick.x, i.stick.y) > 0.92; // push the stick to the rim to run
  return {
    x,
    y,
    sprint: i.sprintToggle || i.keys.has("ShiftLeft") || i.keys.has("ShiftRight") || stickSprint,
  };
}

export function bindWorldKeyboard(i: WorldInput): () => void {
  const typing = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
  };
  const down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    if (e.code in MOVE_KEYS || e.code.startsWith("Shift")) {
      if (e.code.startsWith("Arrow")) e.preventDefault();
      i.keys.add(e.code);
    }
  };
  const up = (e: KeyboardEvent) => i.keys.delete(e.code);
  const clear = () => i.keys.clear();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", clear);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", clear);
  };
}
