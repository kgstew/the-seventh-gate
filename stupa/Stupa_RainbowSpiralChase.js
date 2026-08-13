/**
 * Rainbow Spiral Chase - true wiring-order color chase
 *
 * This colors every pixel by its actual position in the model's point
 * index -- which follows the real installation wiring: Ring 1 Side A from
 * its first LED to its last, then straight on into Ring 1 Side B (the
 * chain just keeps going, so it naturally continues from wherever Side A's
 * wire ends), then only once BOTH sides of a ring are complete does the
 * index move on to Ring 2 Side A, and so on up through Ring 17.
 *
 * No 3D coordinate math is used at all, so there's no "always starts at
 * the same inside point on every ring" artifact -- each pixel's color is
 * tied directly to its real place in the data chain, not to its position
 * in space.
 *
 * The rainbow itself then continuously slides along that same chain over
 * time (the "phase"), wrapping seamlessly from the very last pixel back to
 * the very first -- that's what reads as color chasing up the spiral.
 *
 * INSTALL:
 *   1. Copy this file into your ~/Chromatik/Scripts folder.
 *   2. In Chromatik, add a "Script" pattern device to a channel.
 *   3. Click the folder icon on the device and select this file.
 *   4. The Speed / Wraps / Reverse knobs will appear automatically.
 *
 * The file is watched automatically -- edit and save, and Chromatik
 * reloads it live without needing to re-add the device.
 */

knob("speed", "Speed", "How fast the color chases through the wiring order", 0.5);
knobi("wraps", "Wraps", "How many times the rainbow repeats along the full wiring run (1 = single smooth rainbow bottom to top)", 1, 9);
toggle("reverse", "Reverse", "Flip the chase direction if it runs the wrong way", false);

var totalPoints = 1;
var phase = 0;

function init(model) {
  // model.points is ordered exactly as pixels were added to the model,
  // which for this project follows fixture order: Ring01-A, Ring01-B,
  // Ring02-A, Ring02-B, ... Ring17-A, Ring17-B -- i.e. the real wiring
  // chain from the bottom ring to the top.
  totalPoints = Math.max(1, model.points.length - 1);
  phase = 0;
}

function preRender(deltaMs, nowMillis, model, colors, enabledAmount) {
  // Speed knob 0 -> ~90s per full lap (slow), 1 -> ~4s per lap (fast).
  var lapMs = 90000 - speed * 86000;
  var delta = deltaMs / lapMs;
  phase = (phase + (reverse ? -delta : delta) + 1) % 1;
}

function renderPoint(point, deltaMs) {
  // Position in the wiring chain, 0 at the very first LED, 1 at the very
  // last -- NOT a spatial coordinate, purely the pixel's index in the
  // data stream.
  var frac = point.index / totalPoints;
  var hue = (frac * 360 * wraps + phase * 360) % 360;
  return hsb(hue, 100, 100);
}
