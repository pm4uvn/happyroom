"use client";

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * AssetManager — loads GLB/glTF assets once, shares them by URL with reference counting, reports
 * progress, and frees GPU memory (geometries, materials, textures) when the last user releases.
 * Zones request assets on enter and release them on leave, so switching zones does not leak.
 */
interface Entry {
  promise: Promise<GLTF>;
  refs: number;
  gltf?: GLTF;
}

export class AssetManager {
  private cache = new Map<string, Entry>();
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  /** Whether a URL exists (HEAD), so optional assets can fall back to procedural geometry. */
  async exists(url: string): Promise<boolean> {
    try {
      const r = await fetch(url, { method: "HEAD" });
      return r.ok;
    } catch {
      return false;
    }
  }

  acquire(url: string, onProgress?: (fraction: number) => void): Promise<GLTF> {
    let e = this.cache.get(url);
    if (!e) {
      const entry: Entry = {
        refs: 0,
        promise: new Promise<GLTF>((resolve, reject) =>
          this.loader.load(
            url,
            (g) => {
              entry.gltf = g;
              resolve(g);
            },
            (ev) => ev.total && onProgress?.(ev.loaded / ev.total),
            reject,
          ),
        ),
      };
      entry.promise.catch(() => this.cache.delete(url));
      this.cache.set(url, entry);
      e = entry;
    }
    e.refs += 1;
    return e.promise;
  }

  release(url: string) {
    const e = this.cache.get(url);
    if (!e) return;
    e.refs -= 1;
    if (e.refs > 0) return;
    this.cache.delete(url);
    if (e.gltf) disposeObject(e.gltf.scene);
  }

  stats() {
    return { cached: this.cache.size, refs: [...this.cache.values()].reduce((n, e) => n + e.refs, 0) };
  }
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}

export const assetManager =
  typeof window === "undefined" ? (null as unknown as AssetManager) : new AssetManager();
