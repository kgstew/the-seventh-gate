/**
 * Rainbow Hurricane - a slow, majestic multicolored spiral storm with a
 * calm eye
 *
 * A hurricane's signature look isn't a tornado's tight, violent, straight
 * vertical funnel -- it's a broad, slow-turning spiral of curving rain
 * bands winding into a small, calm eye. This uses the same real-angle
 * technique as the tornado script (atan2(z, x), not the linear-only math
 * stock Gradient patterns are limited to), but the phase is now curved by
 * BOTH angle and distance-from-eye together, which is what makes the
 * bands genuinely curl into a spiral shape instead of just wrapping
 * straight around.
 *
 * The narrow top of the Stupa stands in for the eye (small, calm, pale),
 * and the wide base is the outer spiral bands (full color, more texture)
 * -- distance from the eye increases as you move down.
 *
 * Four things layer together:
 *   1. SPIRAL   - color bands (Bands) curve around by both angle and
 *                 distance-from-eye (Curl) and rotate slowly over time
 *                 (Speed) -- this curving is what reads as "hurricane"
 *                 rather than "tornado."
 *   2. EYE      - a region near the top (Eye Size) stays desaturated and
 *                 calm, the way a real eye is clear even as the storm
 *                 rages around it.
 *   3. TEXTURE  - a slower, broader pseudo-random flicker than the
 *                 tornado's (storm texture, not chaos), scaled down near
 *                 the eye and stronger in the outer bands.
 *   4. COLOR    - full HSB, no palette dependency.
 *
 * INSTALL: copy into ~/Chromatik/Scripts, add a "Script" pattern device to
 * a channel, and select this file.
 *
 * CONTROLS
 *   Speed       - how fast the storm rotates (defaults slow/majestic)
 *   Curl        - how tightly the spiral bands wind from eye to edge
 *   Bands       - how many spiral color bands/arms
 *   Eye Size    - how large the calm central eye is
 *   Turbulence  - amount of storm texture/roughness in the outer bands
 *   Saturation  - color richness in the outer bands
 *   Brightness  - overall brightness
 */

knob("speed", "Speed", "How fast the storm rotates", 0.25);
knob("curl", "Curl", "How tightly the spiral bands wind from eye to edge", 0.55);
knobi("bands", "Bands", "How many spiral color bands/arms", 4, 9);
knob("eyeSize", "Eye Size", "How large the calm central eye is", 0.22);
knob("turbulence", "Turbulence", "Storm texture/roughness in the outer bands", 0.3);
knob("saturation", "Saturation", "Color richness in the outer bands", 0.9);
knob("brightness", "Brightness", "Overall brightness", 0.85);

var spinPhase = 0;
var clock = 0;

function init(model) {
  spinPhase = 0;
  clock = 0;
}

function preRender(deltaMs, nowMillis, model, colors, enabledAmount) {
  clock += deltaMs;
  // speed 0 -> ~40s per rotation (slow, majestic), speed 1 -> ~6s per rotation
  var cycleMs = 40000 - speed * 34000;
  spinPhase = (spinPhase + deltaMs / cycleMs) % 1;
}

function hash(x) {
  var s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(edge0, edge1, x) {
  var t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 0.0001)));
  return t * t * (3 - 2 * t);
}

function renderPoint(point, deltaMs) {
  var dx = point.xn - 0.5;
  var dz = point.zn - 0.5;
  var angleNorm = (Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1;

  // Distance from the eye: 0 at the top (eye), 1 at the bottom (outer edge)
  var eyeDist = 1 - point.yn;

  // 0 inside the eye (calm), ramps to 1 in the outer storm bands
  var eyeFactor = smoothstep(0, eyeSize, eyeDist);

  // The key "hurricane" move: phase depends on BOTH angle and distance
  // from the eye, so bands curve into a spiral rather than wrap straight.
  var effectiveAngle = (angleNorm - spinPhase - eyeDist * curl + 1) % 1;

  // Slower, broader texture than the tornado's flicker -- storm texture,
  // not violent chaos -- and scaled down near the calm eye.
  var noiseSeed = point.index * 0.101 + Math.floor(clock / 450);
  var n = hash(noiseSeed) - 0.5;

  var hue = (effectiveAngle * 360 * bands) % 360;
  if (hue < 0) hue += 360;

  var effSat = saturation * 100 * (0.25 + 0.75 * eyeFactor);
  var flicker = 1 - turbulence * 0.3 * eyeFactor * (0.5 + 0.5 * hash(noiseSeed + 3.3));
  var level = brightness * 100 * flicker;

  return hsb(hue, effSat, level);
}
