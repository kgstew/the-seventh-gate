/**
 * Bouncing Balls - white background with black balls bouncing through it
 *
 * The whole structure is a plain white background (zero saturation, full
 * brightness). On top of that, a handful of black balls bounce up and
 * down the height of the structure (reflecting off the top and bottom)
 * while independently drifting around it -- since black is just zero
 * brightness, each ball reads as a dark void moving through the white
 * field, like ink drops or shadow orbs.
 *
 * Both colors here are achromatic (no hue at all), so this version drops
 * the color-cycling machinery entirely -- it's just white fading to black
 * around each ball's position.
 *
 * Each ball lives in a simple 2D space: height (0 = bottom, 1 = top) and
 * angle around the vertical axis (real atan2(z, x)). Height bounces with
 * a simple reflection at the boundaries; angle wraps around continuously.
 * Every ball gets its own randomized speed and starting position/
 * direction at load time, so they don't all move in lockstep.
 *
 * IMPORTANT: knob values (numBalls, ballSpeed, etc.) are only guaranteed
 * to be in scope inside renderPoint -- Chromatik's JS engine does not
 * bind them inside preRender/init. So all per-frame state (ball physics)
 * is updated from inside renderPoint itself, gated to run once per frame
 * via `point.index === 0`.
 *
 * INSTALL: copy into ~/Chromatik/Scripts, add a "Script" pattern device to
 * a channel, and select this file.
 *
 * CONTROLS
 *   Balls          - how many bouncing balls
 *   Ball Speed     - how fast balls bounce up and down
 *   Orbit Speed    - how fast balls drift around the structure
 *   Ball Size      - size of each ball's dark void
 *   Background Lvl - brightness of the white background
 */

knobi("numBalls", "Balls", "How many bouncing balls", 3, 9);
knob("ballSpeed", "Ball Speed", "How fast balls bounce up and down", 0.4);
knob("orbitSpeed", "Orbit Speed", "How fast balls drift around the structure", 0.25);
knob("ballSize", "Ball Size", "Size of each ball's dark void", 0.18);
knob("bgLevel", "Background Lvl", "Brightness of the white background", 1.0);

var balls = [];

function init(model) {
  // Reset only -- do NOT reference knob variables here, they are not
  // reliably in scope inside init().
  balls = [];
}

// No knob references in this helper -- safe to call from anywhere.
function makeBall() {
  return {
    y: Math.random(),
    yDir: Math.random() < 0.5 ? -1 : 1,
    ySpeedMul: 0.7 + Math.random() * 0.6,
    angle: Math.random(),
    angleDir: Math.random() < 0.5 ? -1 : 1,
    angleSpeedMul: 0.7 + Math.random() * 0.6
  };
}

// No knob references -- safe helper.
function circularDelta(a, b) {
  var d = a - b;
  return d - Math.round(d); // shortest signed distance, -0.5..0.5
}

function renderPoint(point, deltaMs) {
  // Once-per-frame physics update, run only on the first point of each
  // frame. Knob variables (numBalls, ballSpeed, orbitSpeed) are
  // referenced directly inside renderPoint's own body, which is the one
  // place Chromatik guarantees them to be defined.
  if (point.index === 0) {
    while (balls.length < numBalls) balls.push(makeBall());
    if (balls.length > numBalls) balls.length = numBalls;

    var yBase = (0.05 + ballSpeed * 0.55) * (deltaMs / 1000);
    var aBase = (0.05 + orbitSpeed * 0.55) * (deltaMs / 1000);

    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];

      b.y += b.yDir * yBase * b.ySpeedMul;
      if (b.y < 0) { b.y = 0; b.yDir = 1; }
      if (b.y > 1) { b.y = 1; b.yDir = -1; }

      b.angle += b.angleDir * aBase * b.angleSpeedMul;
      b.angle = ((b.angle % 1) + 1) % 1;
    }
  }

  var dx = point.xn - 0.5;
  var dz = point.zn - 0.5;
  var angleNorm = (Math.atan2(dz, dx) / (2 * Math.PI) + 1) % 1;

  var influence = 0;
  for (var i = 0; i < balls.length; i++) {
    var b = balls[i];
    var dy = point.yn - b.y;
    var da = circularDelta(angleNorm, b.angle);
    // Angle is weighted up since 0..1 there represents the full way around,
    // while 0..1 in height is the full height -- keeps the balls looking
    // reasonably round rather than smeared around the ring.
    var dist = Math.sqrt(dy * dy + (da * 1.6) * (da * 1.6));
    var infl = 1 - dist / Math.max(0.02, ballSize);
    if (infl > 0) {
      infl = infl * infl;
      if (infl > influence) influence = infl;
    }
  }

  // White background fading to black at each ball's center. Both colors
  // are achromatic, so hue and saturation are irrelevant here -- only
  // brightness changes.
  var level = bgLevel * 100 * (1 - influence);

  return hsb(0, 0, level);
}
