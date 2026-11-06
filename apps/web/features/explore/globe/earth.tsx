"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { drawLand, graticule, pathsToSegments, type GeoData } from "./geo";
import { GLOBE_COLORS } from "./palette";

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D landMap;
  uniform float hasLand;
  uniform vec3 oceanDeep;
  uniform vec3 oceanLit;
  uniform vec3 landDark;
  uniform vec3 landLit;
  uniform vec3 coastGlow;
  uniform vec3 rimColor;
  uniform vec3 lightDir;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vec4 tex = texture2D(landMap, vUv);
    float land = tex.r * hasLand;
    float coast = tex.g * hasLand * (1.0 - tex.r * 0.6);
    vec3 n = normalize(vNormalView);
    vec3 l = normalize(lightDir);
    float ndl = max(dot(n, l), 0.0);
    float wrap = clamp(dot(n, l) * 0.5 + 0.5, 0.0, 1.0);
    float facing = max(dot(n, vViewDir), 0.0);
    float fres = pow(1.0 - facing, 3.0);

    vec3 ocean = mix(oceanDeep, oceanLit, wrap * wrap);
    vec3 halfV = normalize(l + vViewDir);
    ocean += pow(max(dot(n, halfV), 0.0), 90.0) * 0.07 * vec3(0.55, 0.85, 1.0);
    vec3 ground = mix(landDark, landLit, 0.2 + 0.8 * wrap);
    vec3 col = mix(ocean, ground, land);
    col += coastGlow * coast * (0.3 + 0.7 * wrap) * 0.35;
    col += rimColor * fres * 0.55;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const atmosphereFragment = /* glsl */ `
  uniform vec3 glowColor;
  uniform float strength;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    // Back faces of a larger shell: d ≈ 0 at the shell's outer edge, ≈ -0.5 at the planet's limb.
    float d = dot(normalize(vNormalView), normalize(vViewDir));
    float i = pow(clamp(-d / 0.5, 0.0, 1.0), 2.2) * strength;
    gl_FragColor = vec4(glowColor * i, i);
    #include <colorspace_fragment>
  }
`;

const color = (hex: string) => new THREE.Color(hex);

export function Earth({ geo, textureSize }: { geo: GeoData | null; textureSize: number }) {
  const gl = useThree((s) => s.gl);

  const landTexture = useMemo(() => {
    if (!geo || typeof document === "undefined") return null;
    const size = Math.min(textureSize, gl.capabilities.maxTextureSize);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size / 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // R = land mask, G = soft coastal band (added on top).
    drawLand(ctx, geo.land, canvas.width, canvas.height, { fill: "#ff0000" });
    ctx.globalCompositeOperation = "lighter";
    ctx.filter = `blur(${Math.max(1, size / 2048)}px)`;
    drawLand(ctx, geo.land, canvas.width, canvas.height, {
      fill: "rgba(0,0,0,0)",
      stroke: "#00ff00",
      strokeWidth: Math.max(2, size / 1024),
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [geo, gl, textureSize]);

  useEffect(() => () => landTexture?.dispose(), [landTexture]);

  const earthMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
        uniforms: {
          landMap: { value: landTexture },
          hasLand: { value: landTexture ? 1 : 0 },
          oceanDeep: { value: color(GLOBE_COLORS.oceanDeep) },
          oceanLit: { value: color(GLOBE_COLORS.oceanLit) },
          landDark: { value: color(GLOBE_COLORS.landDark) },
          landLit: { value: color(GLOBE_COLORS.landLit) },
          coastGlow: { value: color(GLOBE_COLORS.coastGlow) },
          rimColor: { value: color(GLOBE_COLORS.rim) },
          lightDir: { value: new THREE.Vector3(-0.55, 0.6, 0.85) },
        },
      }),
    [landTexture],
  );
  useEffect(() => () => earthMaterial.dispose(), [earthMaterial]);

  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: earthVertex,
        fragmentShader: atmosphereFragment,
        uniforms: { glowColor: { value: color(GLOBE_COLORS.atmosphere) }, strength: { value: 1.25 } },
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => atmosphereMaterial.dispose(), [atmosphereMaterial]);

  const coastGeometry = useMemo(() => segments(geo?.land, 1.0015), [geo]);
  const borderGeometry = useMemo(() => segments(geo?.borders, 1.001), [geo]);
  const gridGeometry = useMemo(() => segments(graticule(20), 1.0006), []);
  useEffect(() => () => coastGeometry?.dispose(), [coastGeometry]);
  useEffect(() => () => borderGeometry?.dispose(), [borderGeometry]);
  useEffect(() => () => gridGeometry?.dispose(), [gridGeometry]);

  return (
    <group>
      <mesh material={earthMaterial} renderOrder={0}>
        <sphereGeometry args={[1, 128, 96]} />
      </mesh>
      {gridGeometry && (
        <lineSegments geometry={gridGeometry}>
          <lineBasicMaterial color={GLOBE_COLORS.grid} transparent opacity={0.09} depthWrite={false} />
        </lineSegments>
      )}
      {borderGeometry && (
        <lineSegments geometry={borderGeometry}>
          <lineBasicMaterial color={GLOBE_COLORS.border} transparent opacity={0.28} depthWrite={false} />
        </lineSegments>
      )}
      {coastGeometry && (
        <lineSegments geometry={coastGeometry}>
          <lineBasicMaterial color={GLOBE_COLORS.coast} transparent opacity={0.9} depthWrite={false} />
        </lineSegments>
      )}
      <mesh material={atmosphereMaterial} scale={1.16}>
        <sphereGeometry args={[1, 64, 48]} />
      </mesh>
    </group>
  );
}

function segments(paths: GeoData["land"] | undefined, radius: number): THREE.BufferGeometry | null {
  if (!paths) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pathsToSegments(paths, radius), 3));
  g.computeBoundingSphere();
  return g;
}
