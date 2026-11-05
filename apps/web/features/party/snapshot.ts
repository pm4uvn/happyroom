"use client";

/**
 * Branded share card from the live 3D canvas. Contains only the room render, the party title and
 * the public HAPPYROOM URL — never the invite link or any guest list.
 */
export async function composeShareCard(
  canvas: HTMLCanvasElement,
  title: string,
  siteUrl: string,
): Promise<Blob> {
  const W = 1200;
  const H = 1500;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#9178E8");
  bg.addColorStop(1, "#F9A6BA");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Photo, cover-fitted into a rounded frame.
  const frame = { x: 60, y: 60, w: W - 120, h: 1080 };
  ctx.save();
  roundRect(ctx, frame.x, frame.y, frame.w, frame.h, 48);
  ctx.clip();
  const scale = Math.max(frame.w / canvas.width, frame.h / canvas.height);
  const sw = frame.w / scale;
  const sh = frame.h / scale;
  ctx.drawImage(
    canvas,
    (canvas.width - sw) / 2,
    (canvas.height - sh) / 2,
    sw,
    sh,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
  );
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "800 64px 'Baloo 2', 'Nunito', system-ui, sans-serif";
  ctx.fillText(truncate(ctx, title, W - 140), W / 2, 1250);
  ctx.font = "600 36px 'Nunito', system-ui, sans-serif";
  ctx.globalAlpha = 0.9;
  ctx.fillText("Celebrate Together. Anywhere.", W / 2, 1320);
  ctx.font = "700 34px 'Nunito', system-ui, sans-serif";
  ctx.fillText(`HAPPYROOM · ${siteUrl.replace(/^https?:\/\//, "")}`, W / 2, 1420);

  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
