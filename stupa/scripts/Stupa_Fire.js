/**
 * Fire - flames rising from the base, flickering and cooling with height
 *
 * Built from smooth 2D value noise (bilinear-interpolated hashed grid
 * points, two octaves combined for texture) sampled in (angle, height)
 * space -- NOT the sharp per-pixel flicker used in the sparklers/
 * fireworks scripts. Fire needs continuous, organic turbulence rather
 * than harsh random flashing, which is what value noise gives you.
 *
 * The noise field continuously scrolls downward in height over time,
 * which is what makes it read as flames and embers rising rather than a
 * static flickering texture. That noise is multiplied by a height-based
 * falloff (strongest at the base, fading out by the configured flame
 * height) to get a single "heat" value per pixel, which then maps
 * through a black -> red -> orange -> yellow -> near-white ramp, the
 * classic fire color progression, hottest colors matching the most
 * intense flame regions.
 *
 * Angle uses real atan2(z, x), same technique as the other scripts, so
 * "Tongues" controls how many individual flame licks wrap around the
 * structure.
 *
 * IMPORTANT: knob values are only guaranteed to be in scope inside
 * renderPoint -- Chromatik's JS engine does not bind them inside
 * preRender/init. So the clock advance happens inside renderPoint
 * itself, gated to run once per frame via `point.index === 0`.
 *
 * INSTALL: copy into ~/Chromatik/Scripts, add a "Script" pattern device to
 * a channel, and select this file.
 *
 * CONTROLS
 *   Flame Height - how tall the flames typically reach
 *   Turbulence   - how chaotic/detailed the flame texture is
 *   Rise Speed   - how fast the flame texture rises and flickers
 *   Tongues      - how many flame licks wrap around the structure
 *   Intensity    - overall fullness/brightness of the fire
 *   Hue Shift    - shifts the whole fire palette around the color wheel
 *                  (0 = classic orange fire; try other values for
 *                  stylized blue/green/purple flame)
 */

knob("flameHeight", "Flame Height", "How tall the flames typically reach", 0.55);
knob("turbulence", "Turbulence", "How chaotic/detailed the flame texture is", 0.5);
knob("riseSpeed", "Rise Speed", "How fast the flame texture rises and flickers", 0.5);
knobi("tongues", "Tongues", "How many flame licks wrap around the structure", 6, 16);
knob("intensity", "Intensity", "Overall fullness/brightness of the fire", 0.85);
knob("hueShift", "Hue Shift", "Shifts the whole fire palette around the color wheel (0 = classic orange fire)", 0.0);

var clock = 0;

function init(model) {
  clock = 0;
}

// No knob references -- safe helpers, callable from anywhere.
function hash2(x, y) {
  var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2D(x, y) {
  var xi = Math.floor(x);
  var yi = Math.floor(y);
  var xf = x - xi;
  var yf = y - yi;
  var a = hash2(xi, yi);
  var b = hash2(xi + 1, yi);
  var c = hash2(xi, yi + 1);
  var d = hash2(xi + 1, yi + 1);
  var u = xf * xf * (3 - 2 * xf);
  var v = yf * yf * (3 - 2 * yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fireColor(heat, hueShiftAmt) {
  heat = Math.max(0, Math.min(1, heat));
  var hue, sat, level;
  if (heat < 0.5) {
    var t = heat / 0.5;
    hue = 25 * t;          // black/dark red -> red-orange
    sat = 100;
    level = 90 * t;
  } else {
    var t = (heat - 0.5) / 0.5;
    hue = 25 + 25 * t;     // orange -> yellow
    sat = 100 - 40 * t;    // desaturates toward near-white at peak heat
    level = 90 + 10 * t;
  }
  hue = ((hue + hueShiftAmt * 360) % 360 + 360) % 360;
  return hsb(hue, sat, level);
}

function renderPoint(point, deltaMs) {
  if (point.index === 0) {
    clock += deltaMs;
  }

  var dx = point.xn - 0.5;
  var dz = point.zn - 0.5;
  var angleNorm = (Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1;

  var riseAmt = 0.15 + riseSpeed * 1.2;
  var noiseX = angleNorm * tongues;
  var noiseY = point.yn * 5 - (clock / 1000) * riseAmt;

  var n1 = noise2D(noiseX, noiseY);
  var n2 = noise2D(noiseX * 2.4 + 3.1, noiseY * 2.4 + 11.3);
  var detailAmt = 0.2 + turbulence * 0.6;
  var turb = n1 * (1 - detailAmt) + n2 * detailAmt * 1.3;
  turb = Math.max(0, Math.min(1, turb * 1.15));

  var heightNorm = point.yn / Math.max(0.05, flameHeight);
  var heightFalloff = Math.max(0, 1 - heightNorm);
  heightFalloff = Math.pow(heightFalloff, 0.6);

  var heat = heightFalloff * turb * (0.6 + intensity * 0.7);
  heat = Math.max(0, Math.min(1, heat));

  return fireColor(heat, hueShift);
}
