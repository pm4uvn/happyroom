"use client";

/** Rendering capability detection used to pick a quality tier or the 2D fallback. */
export type QualityTier = "high" | "low";

export interface GpuProbe {
  webgl: boolean;
  /** CPU rasteriser (SwiftShader, llvmpipe, WARP…): VMs, GPU-blocklisted machines, headless browsers. */
  software: boolean;
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|warp/i;

export function probeGpu(): GpuProbe {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { webgl: false, software: false };
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    // Release the probe context immediately so it does not count against the browser's limit.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { webgl: true, software: SOFTWARE_RENDERER.test(renderer) };
  } catch {
    return { webgl: false, software: false };
  }
}

/**
 * Conservative heuristic for low-end devices. PerformanceMonitor in the scene refines this at
 * runtime by lowering the pixel ratio if the frame rate drops.
 */
export function detectQualityTier(gpu: GpuProbe = probeGpu()): QualityTier {
  if (gpu.software) return "low";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return "low";
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) return "low";
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.screen.width, window.screen.height) < 500;
  return coarse && small ? "low" : "high";
}
