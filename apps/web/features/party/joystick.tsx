"use client";

import { useRef, useState, type RefObject } from "react";
import type { MoveInput } from "./input";

const RADIUS = 48;

/** Touch/pointer virtual joystick (bottom-left). Writes a normalised vector into the shared input. */
export function Joystick({ inputRef, label }: { inputRef: RefObject<MoveInput>; label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeRef = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    inputRef.current.joystick.x = dx / RADIUS;
    inputRef.current.joystick.y = -dy / RADIUS;
  };

  const reset = () => {
    activeRef.current = null;
    setKnob({ x: 0, y: 0 });
    inputRef.current.joystick.x = 0;
    inputRef.current.joystick.y = 0;
  };

  return (
    <div
      ref={base}
      role="application"
      aria-label={label}
      className="pointer-events-auto relative grid size-32 touch-none select-none place-items-center rounded-full bg-white/40 ring-1 ring-white/70 backdrop-blur"
      onPointerDown={(e) => {
        activeRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activeRef.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      data-testid="joystick"
    >
      <span
        className="size-14 rounded-full bg-white shadow-lift ring-2 ring-dream/40"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        aria-hidden
      />
    </div>
  );
}
