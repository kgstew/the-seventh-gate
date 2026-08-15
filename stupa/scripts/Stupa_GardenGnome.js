/**
 * Garden Gnome - red, white, and blue, mapped to look like a garden gnome
 *
 * The Stupa's shape already does most of the work: it's wide at the bottom
 * and tapers to a narrow point at the top -- exactly a gnome's round body
 * narrowing up into a pointy hat. This script just paints that shape:
 *
 *   - Bottom ~40% of the height: BLUE  (jacket)
 *   - Middle ~30% of the height: WHITE (beard)
 *   - Top    ~30% of the height: RED   (pointy hat)
 *
 * Colors are computed directly with rgb()/lerp -- no reference to
 * Chromatik's global Color Palette at all, so this is fully independent
 * and self-contained (matching how "Fixed" mode works on stock patterns,
 * just done by hand here for exact 3-band control).
 *
 * Boundaries are softened with a smoothstep blend so the transition from
 * jacket to beard to hat looks like a soft dye-gradient rather than a hard
 * stripe. A very gentle overall brightness "breathe" keeps it from looking
 * like a frozen static image; set the Breathe knob to 0 for a fully static
 * look if you'd rather it not move at all.
 *
 * INSTALL:
 *   1. Copy this file into your ~/Chromatik/Scripts folder.
 *   2. In Chromatik, add a "Script" pattern device to a channel.
 *   3. Click the folder icon on the device and select this file.
 */

knob("jacketTop", "Jacket Top", "Height fraction where the blue jacket band ends and the white beard begins", 0.40);
knob("beardTop", "Beard Top", "Height fraction where the white beard band ends and the red hat begins", 0.70);
knob("blend", "Blend", "Softness of the transition between color bands", 0.12);
knob("breathe", "Breathe", "Depth of gentle overall brightness breathing (0 = fully static)", 0.15);

var breathePhase = 0;

var BLUE = [20, 70, 230];
var WHITE = [255, 255, 255];
var RED = [230, 20, 20];

function init(model) {
  breathePhase = 0;
}

function preRender(deltaMs, nowMillis, model, colors, enabledAmount) {
  breathePhase += deltaMs / 6000;
}

function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function smooth(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function bandColor(yn) {
  var half = blend * 0.5;

  if (yn < jacketTop - half) return BLUE;
  if (yn < jacketTop + half) {
    var t = smooth((yn - (jacketTop - half)) / (blend || 0.0001));
    return lerp3(BLUE, WHITE, t);
  }
  if (yn < beardTop - half) return WHITE;
  if (yn < beardTop + half) {
    var t = smooth((yn - (beardTop - half)) / (blend || 0.0001));
    return lerp3(WHITE, RED, t);
  }
  return RED;
}

function renderPoint(point, deltaMs) {
  var c = bandColor(point.yn);
  var breatheScale = 1 - breathe * (0.5 + 0.5 * Math.sin(breathePhase * 2 * Math.PI));
  return rgb(
    Math.round(c[0] * breatheScale),
    Math.round(c[1] * breatheScale),
    Math.round(c[2] * breatheScale)
  );
}
