/**
 * Rainbow Spiral Chase (with black gaps) - the true wire-order rainbow
 * chase, cut into segments by small sections of black
 *
 * Identical base technique to the original Rainbow Spiral Chase: every
 * pixel's hue is driven by its real position in the wiring order
 * (point.index / total), not 3D coordinates, so the rainbow genuinely
 * follows the physical chain (Ring01-A -> Ring01-B -> Ring02-A -> ... ->
 * Ring17-B) and slides continuously along it over time.
 *
 * Layered on top: a periodic brightness notch (built from a cosine wave
 * raised to a power, so the dips are smooth-edged rather than a hard
 * on/off cut) drops brightness to black at regular intervals along that
 * same position value -- so the black gaps are locked to the rainbow's
 * motion and travel through the structure together with the color, like
 * dark notches cut into a moving ribbon of light.
 *
 * IMPORTANT: knob values are only guaranteed to be in scope inside
 * renderPoint -- Chromatik's JS engine does not bind them inside
 * preRender/init. So the phase advance happens inside renderPoint itself,
 * gated to run once per frame via `point.index === 0`.
 *
 * INSTALL: copy into ~/Chromatik/Scripts, add a "Script" pattern device to
 * a channel, and select this file.
 *
 * CONTROLS
 *   Speed         - how fast the color chases through the wiring order
 *   Wraps         - how many rainbow repeats along the full wiring run
 *   Reverse       - flip the chase direction
 *   Gaps Per Wrap - how many black sections appear within each rainbow
 *                   repeat
 *   Gap Sharpness - how small/sharp each black section is (low = broad,
 *                   soft dips; high = small, crisp black notches)
 */

knob("speed", "Speed", "How fast the color chases through the wiring order", 0.5);
knobi("wraps", "Wraps", "How many rainbow repeats along the full wiring run", 1, 9);
toggle("reverse", "Reverse", "Flip the chase direction if it runs the wrong way", false);
knobi("gapsPerWrap", "Gaps Per Wrap", "How many black sections appear within each rainbow repeat", 3, 20);
knob("gapSharpness", "Gap Sharpness", "How small/sharp each black section is", 0.75);

var totalPoints = 1;
var phase = 0;

function init(model) {
  totalPoints = Math.max(1, model.points.length - 1);
  phase = 0;
}

function renderPoint(point, deltaMs) {
  if (point.index === 0) {
    var lapMs = 90000 - speed * 86000;
    var delta = deltaMs / lapMs;
    phase = (phase + (reverse ? -delta : delta) + 1) % 1;
  }

  var frac = point.index / totalPoints;

  // Continuous (unwrapped) position -- hue wraps it with %360, the gap
  // wave uses it directly since cosine is naturally periodic.
  var pos = frac * wraps + phase;

  var hue = (pos * 360) % 360;
  if (hue < 0) hue += 360;

  // Smooth periodic notch: cosine raised to a power narrows the dip
  // without a hard on/off edge. `dip` is a narrow spike centered on each
  // gap location (narrower as gapSharpness increases); inverting it gives
  // a mask that's mostly full brightness with small dark notches cut in,
  // rather than the other way around.
  var wave = 0.5 + 0.5 * Math.cos(pos * gapsPerWrap * 2 * Math.PI);
  var sharpness = 1 + gapSharpness * 14;
  var dip = Math.pow(wave, sharpness);
  var mask = 1 - dip;

  var level = mask * 100;

  return hsb(hue, 100, level);
}
