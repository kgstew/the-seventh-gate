/**
 * Rain - falling streaks against a dark stormy sky, with occasional
 * lightning
 *
 * Different technique from the Blizzard script's diffuse noise cloud:
 * rain reads as individual falling STREAKS, so each of a fixed number of
 * "drop slots" is given a deterministic angular position and a falling
 * head position computed purely from time (no stored per-drop state, so
 * changing Density live doesn't need any array bookkeeping). A point
 * lights up when it's close to a drop's current angle AND sits in the
 * short trailing tail just above that drop's head -- bright right at the
 * head, fading out up the tail, which is what reads as a streak rather
 * than a solid falling ring or a twinkle field.
 *
 * Wind slowly shifts each drop's angle further as it falls, so rain
 * slants more the longer it's been falling -- a believable windswept
 * look rather than perfectly straight vertical lines.
 *
 * Lightning is also fully time-procedural: the timeline is divided into
 * fixed slots, and a hash of each slot decides whether a flash happens in
 * it and when -- when one lands, the whole structure briefly washes
 * toward bright white-ish and decays fast, like a real strike.
 *
 * IMPORTANT: knob values are only guaranteed to be in scope inside
 * renderPoint -- Chromatik's JS engine does not bind them inside
 * preRender/init. So the clock advance happens inside renderPoint itself,
 * gated to run once per frame via `point.index === 0`.
 *
 * INSTALL: copy into ~/Chromatik/Scripts, add a "Script" pattern device to
 * a channel, and select this file.
 *
 * CONTROLS
 *   Speed         - how fast the rain falls
 *   Density       - how many individual rain streaks fall at once
 *   Streak Length - how long each streak's fading tail is
 *   Wind          - how much the rain slants sideways as it falls
 *   Saturation    - color richness (low = pale/white rain)
 *   Lightning     - how often lightning flashes light up the whole sky
 *   Sky Level     - brightness of the dark stormy background between drops
 */

knob("speed", "Speed", "How fast the rain falls", 0.55);
knobi("density", "Density", "How many individual rain streaks fall at once", 24, 49);
knob("streakLength", "Streak Length", "How long each streak's fading tail is", 0.4);
knob("wind", "Wind", "How much the rain slants sideways as it falls", 0.25);
knob("saturation", "Saturation", "Color richness (low = pale/white rain)", 0.3);
knob("lightning", "Lightning", "How often lightning flashes light up the whole sky", 0.15);
knob("skyLevel", "Sky Level", "Brightness of the dark stormy background between drops", 0.12);

var clock = 0;

function init(model) {
  clock = 0;
}

// No knob references -- safe helpers, callable from anywhere.
function hash(x) {
  var s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

function circularDelta(a, b) {
  var d = a - b;
  return d - Math.round(d);
}

function renderPoint(point, deltaMs) {
  if (point.index === 0) {
    clock += deltaMs;
  }

  var dx = point.xn - 0.5;
  var dz = point.zn - 0.5;
  var pointAngle = (Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1;

  var t = clock / 1000;
  var fallRate = 0.12 + speed * 0.85;
  var streakLenNorm = 0.05 + streakLength * 0.35;
  var angularHalfWidth = 0.012;

  var maxIntensity = 0;
  var numDrops = density + 1;

  for (var d = 0; d < numDrops; d++) {
    var speedMul = 0.6 + hash(d * 3.71) * 0.8;
    var startOffset = hash(d * 9.13) * 5000;
    var fallCycle = ((t + startOffset) * fallRate * speedMul) % 1;
    var head = 1 - fallCycle;

    var dropAngle = (hash(d * 17.29 + 100) + wind * 0.3 * fallCycle) % 1;

    var vDist = point.yn - head;
    if (vDist >= 0 && vDist <= streakLenNorm) {
      var angleDelta = circularDelta(pointAngle, dropAngle);
      var aFalloff = 1 - Math.abs(angleDelta) / angularHalfWidth;
      if (aFalloff > 0) {
        var vFactor = 1 - vDist / streakLenNorm;
        var dropIntensity = vFactor * aFalloff;
        if (dropIntensity > maxIntensity) {
          maxIntensity = dropIntensity;
        }
      }
    }
  }

  var skyLevelPct = skyLevel * 30;
  var hue = 213;
  var sat = saturation * 100 * (1 - maxIntensity) + 6 * maxIntensity;
  var level = skyLevelPct + maxIntensity * (100 - skyLevelPct);

  // Time-procedural lightning: fixed slots, hash decides if/when a flash
  // fires within each slot.
  var slotMs = 6000;
  var slotIndex = Math.floor(clock / slotMs);
  var tInSlot = clock - slotIndex * slotMs;
  var slotRoll = hash(slotIndex * 13.71 + 42.1);
  var flashIntensity = 0;
  if (slotRoll < lightning * 0.7) {
    var flashStart = hash(slotIndex * 7.31 + 5.5) * (slotMs - 400);
    var flashDur = 220;
    var localT = tInSlot - flashStart;
    if (localT >= 0 && localT <= flashDur) {
      flashIntensity = Math.pow(1 - localT / flashDur, 3);
    }
  }

  level = level + (100 - level) * flashIntensity;
  sat = sat * (1 - flashIntensity) + 4 * flashIntensity;

  return hsb(hue, Math.max(0, Math.min(100, sat)), Math.max(0, Math.min(100, level)));
}
