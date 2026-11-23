import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { rng } from '../util.js';

export const SUN_DIR = new THREE.Vector3(0.45, 0.75, 0.3).normalize();
const HORIZON = new THREE.Color('#a9dcff');

export function createSky(scene) {
  scene.background = HORIZON.clone();
  scene.fog = new THREE.FogExp2(new THREE.Color('#9fd3ff'), 0.0011);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vD;
      void main(){
        float h = vD.y;
        vec3 top = vec3(0.10, 0.42, 0.93), mid = vec3(0.30, 0.66, 1.0), hor = vec3(0.70, 0.88, 1.0);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, top, smoothstep(0.18, 0.75, h));
        c = mix(c, vec3(0.62, 0.85, 1.0), smoothstep(0.0, -0.2, h));
        float s = max(dot(vD, uSun), 0.);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.) * 2.5 + pow(s, 12.) * 0.18);
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  // puffy cartoon clouds in a ring
  const r = rng(42), parts = [];
  const cloudGeo = () => {
    const g = [];
    const n = 5 + ((r() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const rad = 18 + r() * 22;
      g.push(new THREE.IcosahedronGeometry(rad, 2).scale(1, 0.62, 0.85).translate((i - n / 2) * 22 + r() * 10, r() * 12, r() * 16));
    }
    return mergeGeometries(g);
  };
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 1300 + r() * 900;
    parts.push(cloudGeo().scale(1.5, 1.2, 1.5).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * d, 260 + r() * 260, Math.sin(a) * d));
  }
  const cg = mergeGeometries(parts);
  const cpos = cg.attributes.position, cnrm = cg.attributes.normal, cc = new Float32Array(cpos.count * 3);
  const top = new THREE.Color('#ffffff'), bot = new THREE.Color('#c9b7e6');
  const tmp = new THREE.Color();
  for (let i = 0; i < cpos.count; i++) { tmp.copy(bot).lerp(top, cnrm.getY(i) * 0.5 + 0.5); cc.set([tmp.r, tmp.g, tmp.b], i * 3); }
  cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const clouds = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  scene.add(clouds);

  const hemi = new THREE.HemisphereLight('#cfeaff', '#6f9a3a', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dc', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  return {
    sun, clouds, dome,
    update(dt, focus, cameraPos) {
      dome.position.copy(cameraPos);
      // thinner haze high up, so the island stays readable from the barge (~590 m)
      scene.fog.density = 0.0011 * Math.min(1, 300 / Math.max(1, cameraPos.y));
      clouds.rotation.y += dt * 0.004;
      // shadow camera follows the focus point, snapped to texels to avoid shimmer
      const snap = 140 / 2048;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.target.position.set(fx, focus.y, fz);
      sun.position.set(fx, focus.y, fz).addScaledVector(SUN_DIR, 200);
    },
  };
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.18 }, uContrast: { value: 1.06 }, uVignette: { value: 0.22 }, uTint: { value: new THREE.Vector4(0, 0, 0, 0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVignette; uniform vec4 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1. - smoothstep(0.45, 0.9, d) * uVignette;
      c.rgb = mix(c.rgb, uTint.rgb, uTint.a * (0.35 + smoothstep(0.2, 0.75, d) * 0.65));
      gl_FragColor = c;
    }`,
};

export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.45, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return { composer, bloom, grade };
}
