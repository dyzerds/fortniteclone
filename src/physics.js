import RAPIER from '@dimforge/rapier3d-compat';

export let R = null;
export let world = null;
export let staticBody = null;
const tags = new Map(); // collider handle -> { kind, ref, ... }

export async function initPhysics() {
  await RAPIER.init();
  R = RAPIER;
  world = new R.World({ x: 0, y: 0, z: 0 }); // gravity is applied by our own controllers
  staticBody = world.createRigidBody(R.RigidBodyDesc.fixed());
}

export function addStatic(desc, tagData) {
  const c = world.createCollider(desc, staticBody);
  if (tagData) tags.set(c.handle, tagData);
  return c;
}

export function setTag(collider, t) { tags.set(collider.handle, t); }
export const tagOf = (collider) => tags.get(collider.handle);

export function removeCollider(c) {
  if (!c) return;
  tags.delete(c.handle);
  world.removeCollider(c, false);
}

// Returns { dist, point:{x,y,z}, normal:{x,y,z}, collider, tag } or null.
export function raycast(o, d, maxDist, excludeCollider = null, predicate = undefined) {
  const ray = new R.Ray(o, d);
  const hit = world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, excludeCollider ?? undefined, undefined, predicate);
  if (!hit) return null;
  const t = hit.timeOfImpact;
  return {
    dist: t,
    point: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t },
    normal: hit.normal,
    collider: hit.collider,
    tag: tags.get(hit.collider.handle),
  };
}
