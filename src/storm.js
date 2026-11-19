// Storm: pure circle math (tested) + the animated wall mesh.
import * as THREE from 'three';

// circles[0] covers the island; circles[i + 1] is where phase i shrinks to, always inside circles[i].
export function stormPlan(rand, { startRadius, phases }, accept = () => true) {
  const circles = [{ x: 0, z: 0, r: startRadius }];
  for (const ph of phases) {
    const prev = circles[circles.length - 1], r = startRadius * ph.frac;
    let c = { x: prev.x, z: prev.z, r };
    for (let k = 0; k < 30; k++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * (prev.r - r) * (circles.length === 1 ? 0.55 : 1);
      const x = prev.x + Math.cos(a) * d, z = prev.z + Math.sin(a) * d;
      if (accept(x, z)) { c = { x, z, r }; break; }
    }
    circles.push(c);
  }
  return circles;
}

// Where the storm is at time t (seconds since the match started).
export function stormAt(circles, phases, t) {
  let t0 = 0;
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i], a = circles[i], b = circles[i + 1];
    if (t < t0 + ph.wait) return { phase: i, shrinking: false, ...a, next: b, left: t0 + ph.wait - t, dps: ph.dps };
    t0 += ph.wait;
    if (t < t0 + ph.shrink) {
      const k = (t - t0) / ph.shrink;
      return { phase: i, shrinking: true, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, r: a.r + (b.r - a.r) * k, next: b, left: t0 + ph.shrink - t, dps: ph.dps };
    }
    t0 += ph.shrink;
  }
  const last = circles[circles.length - 1];
  return { phase: phases.length, shrinking: false, ...last, next: last, left: 0, dps: phases[phases.length - 1].dps };
}

export const outside = (s, x, z) => Math.hypot(x - s.x, z - s.z) > s.r;

// ---- wall ----
export function createStormWall(scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying vec3 vW;
      void main() {
        float a = atan(vW.z, vW.x);
        float s = sin(a * 60.0 + vW.y * 0.08 - uTime * 1.5) * 0.5 + 0.5;
        float s2 = sin(a * 23.0 - vW.y * 0.05 + uTime * 0.7) * 0.5 + 0.5;
        vec3 col = mix(vec3(0.42, 0.12, 0.85), vec3(0.85, 0.35, 1.0), s * s2);
        float fade = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
        gl_FragColor = vec4(col, (0.42 + 0.25 * s) * fade);
      }`,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 700, 128, 1, true), mat);
  wall.position.y = 300; wall.renderOrder = 2; wall.frustumCulled = false;
  scene.add(wall);
  return {
    wall,
    update(s, t) { wall.position.x = s.x; wall.position.z = s.z; wall.scale.set(Math.max(s.r, 0.5), 1, Math.max(s.r, 0.5)); mat.uniforms.uTime.value = t; },
  };
}
