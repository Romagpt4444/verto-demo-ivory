// Shared, framework-free state for the tooth. GSAP timelines write to it,
// the Three.js scene reads it every frame. Keeping it here means the scroll
// choreography can be built before the (lazy-loaded) 3D code arrives.

export const TAU = Math.PI * 2;

/** Rotation (Y) at which each service stage is presented, in radians. */
export const STAGE_ANGLES = [0.3 * Math.PI, 0.7 * Math.PI, 1.1 * Math.PI, 1.5 * Math.PI, 1.9 * Math.PI];
/** Tilt (X) toward the camera per stage: therapy shows the chewing surface. */
export const STAGE_TILTS = [0.82, 0.06, 0.38, -0.08, 0.02];

export const toothState = {
  enter: 0, // 0..1, tooth floats up from below while the section scrolls in
  exit: 0, // 0..1, tooth shrinks and leaves when "about" covers the stage
  rotY: -0.35,
  rotX: 0.14,
  hlFill: 0, // therapy: filling in the occlusal fissure
  hlVeneer: 0, // aesthetics: veneer on the facing surface
  crown: 0, // prosthetics: zirconia crown seated (0 = above, hidden)
  rootCut: 0, // implantology: natural roots dissolve
  implant: 0, // implantology: implant screwed in
  xray: 0, // endodontics: enamel turns translucent, pulp glows
  markers: [0, 0, 0, 0, 0],
};

export type ToothState = typeof toothState;

/** Point on the crown surface that faces the camera when the tooth is rotated by `angle`. */
export function facingPoint(angle: number, radius: number, y: number): [number, number, number] {
  return [-Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

/** Marker anchors in tooth-local space (same frame as the generated GLB). */
export const MARKER_ANCHORS: [number, number, number][] = [
  [-0.08, 1.06, 0.0], // filling: central pit
  facingPoint(STAGE_ANGLES[1], 0.98, 0.72), // veneer
  facingPoint(STAGE_ANGLES[2], 0.72, 1.28), // crown
  facingPoint(STAGE_ANGLES[3], 0.4, -1.05), // implant thread
  [0.03, 0.42, 0.0], // pulp chamber
];
