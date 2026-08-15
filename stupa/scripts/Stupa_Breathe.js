/**
 * Breathe - a slow, ambient breathing effect told through COLOR, not brightness
 *
 * The "breath" now lives entirely in the hue: as the breath cycle
 * advances, every point's color sweeps forward through the rainbow, so
 * inhale/exhale reads as the whole structure's color slowly cycling
 * rather than dimming up and down. Brightness stays high throughout --
 * by default it doesn't dim at all, and it's hard-floored so it can never
 * go below 50% even if you dial in some brightness movement later.
 *
 * The same tilted 3D axis from before (mostly vertical, with a horizontal
 * tilt at an adjustable compass Angle) still controls how the hue is
 * offset across space, so instead of every LED changing color in perfect
 * unison, there's a gentle traveling color wave sweeping front-to-back as
 * it breathes.
 *
 * INSTALL: copy into ~/Chromatik/Scripts, add a "Script" pattern device to
 * a channel, and select this file.
 *
 * CONTROLS
 *   Rate       - breathing speed (slow -> fast)
 *   Angle      - compass direction the color wave sweeps across
 *   Spread     - how much hue differs across the structure at any instant
 *                (0 = every LED always matches, higher = more of a
 *                visible traveling color wave)
 *   Loops      - how many full trips around the rainbow happen per breath
 *   Base Hue   - starting/anchor color of the sweep
 *   Saturation - color richness
 *   Min Level  - brightness floor, 50% to 100% (100% = no brightness
 *                movement at all -- the breathing is 100% color-driven)
 */

knob("rate", "Rate", "Breathing speed, slow to fast", 0.3);
knob("angle", "Angle", "Compass direction the color wave sweeps across", 0.0);
knob("spread", "Spread", "How much hue differs across the structure at any instant", 0.25);
knobi("loops", "Loops", "How many full trips around the rainbow happen per breath cycle", 1, 5);
knob("baseHue", "Base Hue", "Starting/anchor color of the sweep", 0.58);
knob("saturation", "Saturation", "Color richness", 0.85);
knob("minLevel", "Min Level", "Brightness floor: 0 = 50% floor with gentle movement, 1 = constant 100%, no brightness movement", 1.0);

var breathPhase = 0;

function init(model) {
  breathPhase = 0;
}

function preRender(deltaMs, nowMillis, model, colors, enabledAmount) {
  // rate 0 -> ~20s per full breath (slow), rate 1 -> ~4s per breath (fast)
  var cycleMs = 20000 - rate * 16000;
  breathPhase = (breathPhase + deltaMs / cycleMs) % 1;
}

function renderPoint(point, deltaMs) {
  var angleRad = angle * 2 * Math.PI;

  // Horizontal position relative to center, projected onto the chosen
  // compass angle.
  var dx = point.xn - 0.5;
  var dz = point.zn - 0.5;
  var horiz = dx * Math.cos(angleRad) + dz * Math.sin(angleRad);
  var horizPos = clamp(horiz / 0.5, -1, 1) * 0.5 + 0.5;

  // Combined 3D axis: mostly vertical, with the horizontal tilt layered
  // in -- this offsets each point's hue slightly, creating the traveling
  // color wave as the breath advances.
  var axisPos = clamp(0.7 * point.yn + 0.3 * horizPos, 0, 1);

  // Hue sweeps through the rainbow as time (breathPhase) advances --
  // this IS the breathing. axisPos*spread staggers it across space so
  // it's a wave, not a single flashing color.
  var hue = (baseHue * 360 + axisPos * spread * 360 + breathPhase * loops * 360) % 360;

  // Brightness floor is hard-locked between 50% and 100%. At the default
  // Min Level (1.0) brightness never moves at all -- 100% constant --
  // the breathing is entirely carried by color.
  var floor = 50 + minLevel * 50;
  var breath = 0.5 + 0.5 * Math.sin(breathPhase * 2 * Math.PI);
  var level = floor + (100 - floor) * breath;

  return hsb(hue, saturation * 100, level);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
