#pragma once

#include "wled.h"

// HC-SR04 passage detector for the flashbulb effect.  Targets WLED v16.0.1.
//
// One sensor per gate.  On detection it applies the flashbulb playlist preset,
// then enforces a cooldown before it can fire again.
//
// DETECTION IS RELATIVE, NOT ABSOLUTE.  The trigger is "something got
// deltaCm closer than the running background", not "something is nearer than
// X centimetres".  A gate's quiescent reading is whatever sits across its
// opening -- different at every gate, and drifting with temperature, since
// the speed of sound moves ~0.6 m/s per degree C.  A fixed threshold has to
// be hand-calibrated per gate and re-calibrated as the season changes; a
// background-relative one calibrates itself and detects passage, which is
// what the installation actually wants.
//
// Two consequences worth knowing before changing anything here:
//   * A no-echo reading is fed in as "far", not discarded.  Aimed across an
//     open gate the background IS no-echo, and a passer-by is the first
//     valid reading the sensor ever returns.
//   * A target that stops moving is adopted as the new background after
//     stuckResetSec.  Without that, a bag left in the beam would flash the
//     gate every cooldown until someone removed it.
//
// Hardware: QuinLED Dig-Next-2
//   Trig  -> GPIO 32   (QEXP)  -- VERIFY against the physical board, see README
//   Echo  -> GPIO 33   (QEXP)  -- via level conversion to 3.3V
//   5V    -> external relay JST PH, CONSTANT 5V pin (not the GPIO 5 trigger pin)
//   GND   -> QEXP
//
// Echo is measured with a pin-change interrupt rather than pulseIn(), which
// blocks.  A no-echo pulseIn can stall ~25ms; WLED's frame budget is ~24ms, so
// blocking reads visibly stutter the LEDs.  Nothing here blocks for more than
// the ~14us trigger pulse.

#ifndef USERMOD_ID_HCSR04_FLASHBULB
  #define USERMOD_ID_HCSR04_FLASHBULB 900
#endif

// Echo capture state, shared with the ISR.  Defined in the .cpp.
//
// A phase counter is used instead of reading the pin inside the ISR:
// digitalRead() is not guaranteed to be in IRAM, and calling a flash-resident
// function from an IRAM ISR can crash when flash is busy.  We control when the
// trigger fires, so the edge order is known and a counter is sufficient.
// micros() is IRAM-resident and safe here.
//
//   0 = idle   1 = trigger sent, awaiting rising edge
//   2 = awaiting falling edge   3 = complete, ready to harvest
extern volatile uint8_t       hcsr04Phase;
extern volatile unsigned long hcsr04EchoRiseUs;
extern volatile unsigned long hcsr04EchoFallUs;

void IRAM_ATTR hcsr04EchoISR();

class HCSR04FlashbulbUsermod : public Usermod
{
  private:
    // ---- configuration (persisted to cfg.json, editable in the WLED UI) ----
    bool     enabled         = true;
    int8_t   trigPin         = 32;
    int8_t   echoPin         = 33;
    uint16_t deltaCm         = 40;   // fire when this much CLOSER than background
    uint16_t minValidCm      = 5;    // below this, treat as a bad reading
    uint16_t maxValidCm      = 400;  // above this, nothing is out there
    uint8_t  consecutiveHits = 2;    // readings showing a target before firing
    uint16_t cooldownSec     = 15;   // suppression window after a trigger
    uint16_t readIntervalMs  = 100;  // vary per gate -- see cross-talk note
    uint16_t baselineAdaptSec = 8;   // how fast the background estimate tracks
    uint16_t stuckResetSec   = 60;   // adopt a parked object as background after this
    uint8_t  flashPresetId   = 101;  // "Flashbulb Playlist" in wled_presets.json

    // ---- runtime ----
    bool          initDone        = false;
    bool          pinsOk          = false;
    unsigned long lastTriggerSent = 0;
    unsigned long lastFireTime    = 0;
    bool          haveFired       = false;
    uint8_t       hitStreak       = 0;
    uint16_t      lastDistanceCm  = 0;
    bool          lastReadValid   = false;

    // Background estimate, held in Q8.8 fixed point.  Integer centimetres
    // would never converge: a one-Nth-of-the-way step rounds to zero for
    // any difference smaller than N, so the baseline would stick.
    uint32_t      baselineQ8      = 0;
    bool          baselineValid   = false;
    uint16_t      lastBaselineCm  = 0;
    uint16_t      lastEffDeltaCm  = 0;   // deltaCm after the close-background clamp
    unsigned long targetSince     = 0;   // when the current target first appeared

    static const char _name[];
    static const char _enabled[];

    // Round-trip time for maxValidCm, plus margin.  400cm -> ~23ms -> 30ms.
    inline unsigned long echoTimeoutMs() const
    {
      return ((unsigned long)maxValidCm * 58UL) / 1000UL + 7UL;
    }

    void sendTrigger()
    {
      hcsr04Phase = 1;
      digitalWrite(trigPin, LOW);
      delayMicroseconds(4);
      digitalWrite(trigPin, HIGH);
      delayMicroseconds(10);
      digitalWrite(trigPin, LOW);
    }

    bool claimPins()
    {
      // WLED 0.15+ made PinManager static.  On 0.14.x and earlier this was
      // the global instance form: pinManager.allocatePin(...)
      if (trigPin < 0 || echoPin < 0) return false;
      if (!PinManager::allocatePin(trigPin, true,  PinOwner::UM_Unspecified)) return false;
      if (!PinManager::allocatePin(echoPin, false, PinOwner::UM_Unspecified)) {
        PinManager::deallocatePin(trigPin, PinOwner::UM_Unspecified);
        return false;
      }
      return true;
    }

    void startSensor()
    {
      pinsOk = claimPins();
      if (!pinsOk) {
        DEBUG_PRINTLN(F("[HCSR04] pin allocation failed - sensor disabled"));
        return;
      }
      pinMode(trigPin, OUTPUT);
      digitalWrite(trigPin, LOW);
      pinMode(echoPin, INPUT);
      hcsr04Phase = 0;
      attachInterrupt(digitalPinToInterrupt(echoPin), hcsr04EchoISR, CHANGE);
      DEBUG_PRINTF("[HCSR04] started, trig=%d echo=%d\n", trigPin, echoPin);
    }

    // Sensor-agnostic detection.  Everything below this line works on a
    // distance in centimetres and knows nothing about ultrasound, so the
    // documented VL53L1X fallback still swaps only harvestMeasurement().
    //
    // We detect a CHANGE against a running background rather than crossing
    // a fixed distance.  A gate's quiescent reading is whatever happens to
    // be across the opening -- different per gate, and drifting with
    // temperature (~0.6 m/s per degree C).  A fixed threshold has to be
    // hand-tuned against that geometry and then re-tuned as it moves; a
    // background-relative one calibrates itself.
    void processReading(uint16_t cm, bool valid)
    {
      // An out-of-range read is a real observation -- "nothing out there" --
      // not a failure, so it is folded in as the far limit rather than
      // discarded.  This is what makes a sensor aimed across an open gate
      // work at all: there the quiescent state IS no echo, and a person
      // passing through is the first valid reading it ever sees.
      uint16_t obs = valid ? cm : maxValidCm;

      lastDistanceCm = cm;
      lastReadValid  = valid;

      if (!baselineValid) {
        baselineQ8    = (uint32_t)obs << 8;
        baselineValid = true;
      }
      uint16_t baseline = (uint16_t)(baselineQ8 >> 8);
      lastBaselineCm    = baseline;

      // A background nearer than deltaCm would put the trip point at or
      // below zero and the gate could never fire at any distance -- dead,
      // silently.  Fall back to half the background so a close-range scene
      // still detects passage.  At real gate geometry (metres of open air,
      // or no echo at all) the configured deltaCm is far below baseline/2
      // and this clamp never engages.
      uint16_t effDelta = deltaCm;
      if (effDelta > baseline / 2) effDelta = baseline / 2;
      if (effDelta < 2)            effDelta = 2;  // 0 would latch permanently on
      lastEffDeltaCm = effDelta;

      // Only "closer than background" counts.  Something receding is the
      // target leaving, and must not fire a second flash on the way out.
      bool near = ((uint32_t)obs + effDelta) <= (uint32_t)baseline;

      if (near) {
        if (hitStreak < 255) hitStreak++;
        if (!targetSince) targetSince = millis();
      } else {
        hitStreak   = 0;
        targetSince = 0;
      }

      if (!near) {
        // Track the background only while the beam is clear, so someone
        // standing in it never becomes the new normal.
        uint16_t n = (uint16_t)((uint32_t)baselineAdaptSec * 1000UL /
                                (readIntervalMs ? readIntervalMs : 1));
        if (n < 1) n = 1;
        baselineQ8 = (uint32_t)((int32_t)baselineQ8 +
                     ((int32_t)((uint32_t)obs << 8) - (int32_t)baselineQ8) / (int32_t)n);
      } else if (stuckResetSec && targetSince &&
                 millis() - targetSince > (unsigned long)stuckResetSec * 1000UL) {
        // Something has parked in front of the sensor -- a bag, a bike, a
        // person who stopped to look.  Adopt it as the new background
        // instead of flashing at it every cooldown until someone moves it.
        // Without this, change detection is strictly worse than a fixed
        // threshold for an installation left unattended overnight.
        baselineQ8  = (uint32_t)obs << 8;
        hitStreak   = 0;
        targetSince = 0;
        DEBUG_PRINTLN(F("[HCSR04] stuck target adopted as background"));
      }
    }

    // Convert a completed echo pulse to centimetres.  Isolated so a
    // VL53L1X swap replaces only the read path.
    void harvestMeasurement()
    {
      unsigned long widthUs = hcsr04EchoFallUs - hcsr04EchoRiseUs;
      hcsr04Phase = 0;

      // Speed of sound ~343 m/s, halved for the round trip: cm = us / 58.
      uint16_t cm = (uint16_t)(widthUs / 58UL);

      if (cm < minValidCm || cm > maxValidCm) processReading(cm, false);
      else                                    processReading(cm, true);
    }

  public:
    void setup() override
    {
      if (enabled) startSensor();
      initDone = true;
    }

    void loop() override
    {
      if (!enabled || !initDone || !pinsOk) return;

      unsigned long now = millis();

      // 1. Harvest a completed measurement.
      if (hcsr04Phase == 3) harvestMeasurement();

      // 2. Time out a measurement whose echo never returned.  Common and
      //    normal -- it just means nothing is within range.  That is an
      //    observation, so it feeds the detector as "far" rather than being
      //    thrown away: for a sensor aimed across an open gate, no-echo is
      //    the background, and discarding it would leave no baseline to
      //    detect a change against.
      if (hcsr04Phase != 0 && now - lastTriggerSent > echoTimeoutMs()) {
        hcsr04Phase = 0;
        processReading(0, false);
      }

      // 3. Fire, if the streak is satisfied and we are out of cooldown.
      if (hitStreak >= consecutiveHits) {
        bool cooled = !haveFired
                    || (now - lastFireTime >= (unsigned long)cooldownSec * 1000UL);
        if (cooled) {
          applyPreset(flashPresetId);
          lastFireTime = now;
          haveFired    = true;
          DEBUG_PRINTF("[HCSR04] triggered at %ucm\n", lastDistanceCm);
        }
        hitStreak = 0;
      }

      // 4. Send the next trigger pulse.
      if (hcsr04Phase == 0 && now - lastTriggerSent >= readIntervalMs) {
        sendTrigger();
        lastTriggerSent = now;
      }
    }

    // Live readout in the WLED info panel.  This is what makes on-site
    // threshold calibration possible without a laptop -- do not remove it.
    //
    // NOTE: createNestedObject/createNestedArray are the ArduinoJson 6 form.
    // They still compile under ArduinoJson 7 with deprecation warnings.  If
    // your build errors on them, the AJ7 equivalents are:
    //     root["u"].to<JsonObject>()      instead of createNestedObject("u")
    //     user["Name"].to<JsonArray>()    instead of createNestedArray("Name")
    void addToJsonInfo(JsonObject& root) override
    {
      JsonObject user = root["u"];
      if (user.isNull()) user = root.createNestedObject("u");

      JsonArray dist = user.createNestedArray(F("Gate distance"));
      if (!enabled || !pinsOk) {
        dist.add(F("off"));
        dist.add("");
      } else if (lastReadValid) {
        dist.add(lastDistanceCm);
        dist.add(F(" cm"));
      } else {
        dist.add(F("no echo"));
        dist.add("");
      }

      // The background estimate and the distance that would fire are what
      // make on-site tuning possible now that detection is relative: a bare
      // distance reading no longer tells you whether the gate is about to
      // trigger.  Stand where a visitor would, read "Gate trips under", and
      // set deltaCm so that number sits comfortably inside the opening.
      JsonArray base = user.createNestedArray(F("Gate background"));
      if (!enabled || !pinsOk || !baselineValid) {
        base.add(F("--"));
        base.add("");
      } else {
        base.add(lastBaselineCm);
        base.add(F(" cm"));
      }

      JsonArray trip = user.createNestedArray(F("Gate trips under"));
      if (!enabled || !pinsOk || !baselineValid) {
        trip.add(F("--"));
        trip.add("");
      } else {
        trip.add(lastBaselineCm > lastEffDeltaCm ? lastBaselineCm - lastEffDeltaCm : 0);
        // Flag when the configured delta is being clamped, so a gate aimed
        // at a near background reads as "working, but not as configured"
        // rather than looking correctly set up while behaving differently.
        trip.add(lastEffDeltaCm < deltaCm ? F(" cm (delta clamped)") : F(" cm"));
      }

      JsonArray state = user.createNestedArray(F("Flashbulb"));
      unsigned long cooldownMs = (unsigned long)cooldownSec * 1000UL;
      unsigned long since      = millis() - lastFireTime;
      if (!enabled || !pinsOk) {
        state.add(F("disabled"));
        state.add("");
      } else if (haveFired && since < cooldownMs) {
        state.add((uint16_t)((cooldownMs - since) / 1000UL));
        state.add(F("s cooldown"));
      } else {
        state.add(F("armed"));
        state.add("");
      }
    }

    void addToConfig(JsonObject& root) override
    {
      JsonObject top = root.createNestedObject(FPSTR(_name));
      top[FPSTR(_enabled)]    = enabled;
      top["trigPin"]          = trigPin;
      top["echoPin"]          = echoPin;
      top["deltaCm"]          = deltaCm;
      top["minValidCm"]       = minValidCm;
      top["maxValidCm"]       = maxValidCm;
      top["consecutiveHits"]  = consecutiveHits;
      top["cooldownSec"]      = cooldownSec;
      top["readIntervalMs"]   = readIntervalMs;
      top["baselineAdaptSec"] = baselineAdaptSec;
      top["stuckResetSec"]    = stuckResetSec;
      top["flashPresetId"]    = flashPresetId;
    }

    bool readFromConfig(JsonObject& root) override
    {
      JsonObject top = root[FPSTR(_name)];
      if (top.isNull()) return false;

      int8_t prevTrig = trigPin, prevEcho = echoPin;

      uint16_t prevDelta = deltaCm, prevMax = maxValidCm;

      bool ok = true;
      ok &= getJsonValue(top[FPSTR(_enabled)],    enabled,          true);
      ok &= getJsonValue(top["trigPin"],          trigPin,          32);
      ok &= getJsonValue(top["echoPin"],          echoPin,          33);
      ok &= getJsonValue(top["deltaCm"],          deltaCm,          40);
      ok &= getJsonValue(top["minValidCm"],       minValidCm,       5);
      ok &= getJsonValue(top["maxValidCm"],       maxValidCm,       400);
      ok &= getJsonValue(top["consecutiveHits"],  consecutiveHits,  2);
      ok &= getJsonValue(top["cooldownSec"],      cooldownSec,      15);
      ok &= getJsonValue(top["readIntervalMs"],   readIntervalMs,   100);
      ok &= getJsonValue(top["baselineAdaptSec"], baselineAdaptSec, 8);
      ok &= getJsonValue(top["stuckResetSec"],    stuckResetSec,    60);
      ok &= getJsonValue(top["flashPresetId"],    flashPresetId,    101);

      if (consecutiveHits < 1)  consecutiveHits  = 1;
      if (readIntervalMs < 40)  readIntervalMs   = 40;  // keep clear of echo timeout
      if (baselineAdaptSec < 1) baselineAdaptSec = 1;
      if (deltaCm < 1)          deltaCm          = 1;   // 0 would latch permanently on

      // Re-seed the background when the tuning that defines it changes, so
      // an on-site edit takes effect on the next reading instead of bleeding
      // in over baselineAdaptSec.
      if (initDone && (deltaCm != prevDelta || maxValidCm != prevMax)) {
        baselineValid = false;
        hitStreak     = 0;
        targetSince   = 0;
      }

      // Pin changes need a reboot.  These are fixed for the life of the
      // install, so re-initialising the ISR live is deliberately unsupported.
      if (initDone && (trigPin != prevTrig || echoPin != prevEcho)) {
        DEBUG_PRINTLN(F("[HCSR04] pin change staged - reboot to apply"));
      }

      return ok;
    }

    uint16_t getId() override { return USERMOD_ID_HCSR04_FLASHBULB; }
};
