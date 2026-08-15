/**
 * Rainbow Tornado - a spinning, turbulent rainbow vortex
 *
 * Uses real angular (azimuthal) position around the vertical axis --
 * computed with atan2(z, x), something the stock Gradient pattern can't
 * do at all (it only has linear x/y/z math, no true angle). That's what
 * makes an actual spinning pinwheel possible here: the color pattern is
 * built from real angle-around-the-circle, then that angle is rotated
 * over time, so bands of rainbow genuinely sweep around the structure
 * like a vortex -- not a 3D-axis illusion.
 *
 * Three things layer together:
 *   1. SPIN    - rainbow bands wrap around the circle (Bands) and rotate
 *                over time (Speed) -- the core tornado motion.
 *   2. TWIST   - an extra hue shift by height, so the spin looks like it
 *                climbs/twists up the funnel rather than spinning flat.
 *   3. TURBULENCE - small pseudo-random per-point flicker in both hue and
 *                brightness, updated several times a second, so it reads
 *                as a chaotic, roiling vortex instead of a smooth,
 *                mechanical pinwheel.
 *
 * Pure HSB, no palette dependency.
 *
 * INSTALL: copy into ~/Chromatik/Scripts, add a "Script" pattern device to
 * a channel, and select this file.
 *
 * CONTROLS
 *   Speed       - how fast the tornado spins
 *   Bands       - how many rainbow bands wrap around it at once
 *   Twist       - how much extra color shift is added by height (helical
 *                 climbing look vs. a flat spinning disc)
 *   Turbulence  - amount of chaotic flicker/wobble (0 = perfectly smooth
 *                 spin, higher = rougher, stormier)
 *   Saturation  - color richness
 *   Brightness  - overall brightness
 */

knob("speed", "Speed", "How fast the tornado spins", 0.5);
knobi("bands", "Bands", "How many rainbow bands wrap around it at once", 3, 9);
knob("twist", "Twist", "Extra color shift added by height (helical climb vs. flat spin)", 0.4);
knob("turbulence", "Turbulence", "Chaotic flicker/wobble amount, 0 = perfectly smooth", 0.35);
knob("saturation", "Saturation", "Color richness", 0.9);
knob("brightness", "Brightness", "Overall brightness", 0.9);

var spinPhase = 0;
var clock = 0;

function init(model) {
  spinPhase = 0;
  clock = 0;
}

function preRender(deltaMs, nowMillis, model, colors, enabledAmount) {
  clock += deltaMs;
  // speed 0 -> ~20s per rotation (slow), speed 1 -> ~1.5s per rotation (fast)
  var cycleMs = 20000 - speed * 18500;
  spinPhase = (spinPhase + deltaMs / cycleMs) % 1;
}

// Deterministic pseudo-random hash, returns 0..1
function hash(x) {
  var s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

function renderPoint(point, deltaMs) {
  var dx = point.xn - 0.5;
  var dz = point.zn - 0.5;

  // True angle around the vertical axis, 0..1
  var angleNorm = (Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1;

  // Rotate the angle by the spin phase -- this is what makes the bands
  // actually sweep around the structure over time, not just shift color.
  var effectiveAngle = (angleNorm - spinPhase + 1) % 1;

  // Turbulence updates roughly 8x/second, seeded per-point so each LED
  // flickers independently rather than the whole structure pulsing as one.
  var noiseSeed = point.index * 0.137 + Math.floor(clock / 120);
  var n = hash(noiseSeed) - 0.5; // -0.5..0.5

  var hue = (effectiveAngle * 360 * bands + point.yn * twist * 360 + n * turbulence * 50) % 360;
  if (hue < 0) hue += 360;

  var flicker = 1 - turbulence * 0.35 * (0.5 + 0.5 * hash(noiseSeed + 7.7));
  var level = brightness * 100 * flicker;

  return hsb(hue, saturation * 100, level);
}
