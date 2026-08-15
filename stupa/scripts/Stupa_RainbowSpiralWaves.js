/**
 * Rainbow Spiral Waves - the true wire-order rainbow chase, with rolling
 * ocean-wave brightness added on top
 *
 * The color layer is identical in technique to the original Rainbow
 * Spiral Chase: every pixel's hue is driven by its real position in the
 * wiring order (point.index / total), not 3D coordinates, so the rainbow
 * genuinely follows Ring01-A -> Ring01-B -> Ring02-A -> ... -> Ring17-B,
 * the actual physical chain, and slides continuously along it over time.
 *
 * Layered on top of that same axis is a brightness wave built from two
 * overlapping traveling sine components at different wavelengths and
 * speeds (a fixed, slightly irrational ratio between them) -- the same
 * trick real ocean swells use: no two wave trains are ever quite in sync,
 * so crests and troughs drift in and out of alignment instead of
 * repeating in a flat, mechanical pulse. Brightness rises and falls as
 * the wave rolls along the wiring order, with a gentle saturation dip at
 * each crest for a touch of whitecap brightening.
 *
 * The color spiral and the wave motion have independent speed controls,
 * so they can move together, apart, or even in opposite directions.
 *
 * IMPORTANT: knob values are only guaranteed to be in scope inside
 * renderPoint -- Chromatik's JS engine does not bind them inside
 * preRender/init. So all per-frame phase advances happen inside
 * renderPoint itself, gated to run once per frame via `point.index === 0`.
 *
 * INSTALL: copy into ~/Chromatik/Scripts, add a "Script" pattern device to
 * a channel, and select this file.
 *
 * CONTROLS
 *   Spiral Speed - how fast the rainbow chases through the wiring order
 *   Wraps        - how many rainbow repeats along the full wiring run
 *   Reverse      - flip the spiral direction
 *   Wave Speed   - how fast the brightness waves roll through
 *   Wave Count   - how many wave crests fit along the full run
 *   Wave Depth   - how dramatic the brightness rise and fall is
 *   Min Level    - brightness floor so troughs never go fully black
 */

knob("spiralSpeed", "Spiral Speed", "How fast the rainbow chases through the wiring order", 0.4);
knobi("wraps", "Wraps", "How many rainbow repeats along the full wiring run", 1, 9);
toggle("reverse", "Reverse", "Flip the spiral direction", false);
knob("waveSpeed", "Wave Speed", "How fast the brightness waves roll through", 0.35);
knobi("waveCount", "Wave Count", "How many wave crests fit along the full run", 4, 14);
knob("waveDepth", "Wave Depth", "How dramatic the brightness rise and fall is", 0.6);
knob("minLevel", "Min Level", "Brightness floor so troughs never go fully black", 0.15);

var totalPoints = 1;
var spiralPhase = 0;
var wavePhase = 0;

function init(model) {
  totalPoints = Math.max(1, model.points.length - 1);
  spiralPhase = 0;
  wavePhase = 0;
}

function renderPoint(point, deltaMs) {
  if (point.index === 0) {
    var lapMs = 90000 - spiralSpeed * 86000;
    var d = deltaMs / lapMs;
    spiralPhase = (spiralPhase + (reverse ? -d : d) + 1) % 1;

    var waveLapMs = 30000 - waveSpeed * 27000;
    wavePhase = (wavePhase + deltaMs / waveLapMs) % 1;
  }

  var frac = point.index / totalPoints;

  // Rainbow spiral hue -- same technique as the original chase.
  var hue = (frac * 360 * wraps + spiralPhase * 360) % 360;

  // Two overlapping traveling sine waves at a fixed, non-repeating ratio
  // (1.7x wavelength, 0.6x speed) for an organic, ocean-swell-like feel
  // instead of a single mechanical pulse.
  var w1 = Math.sin((frac * waveCount - wavePhase) * 2 * Math.PI);
  var w2 = Math.sin((frac * waveCount * 1.7 - wavePhase * 0.6) * 2 * Math.PI + 1.3);
  var waveSum = w1 * 0.65 + w2 * 0.35;
  var waveNorm = 0.5 + 0.5 * waveSum; // 0 (trough) .. 1 (crest)

  var floor = minLevel * 100;
  var level = 100 - (1 - waveNorm) * waveDepth * (100 - floor);

  // Slight desaturation at wave crests -- a touch of whitecap brightening.
  var sat = 100 - waveNorm * 15;

  return hsb(hue, sat, level);
}
