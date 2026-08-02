#pragma once

#include "wled.h"

// HC-SR04 proximity trigger for the flashbulb effect.  Targets WLED 0.16.x.
//
// One sensor per gate.  On detection it applies the flashbulb playlist preset,
// then enforces a cooldown before it can fire again.
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
    uint16_t thresholdCm     = 150;  // fire when closer than this
    uint16_t minValidCm      = 5;    // below this, treat as a bad reading
    uint16_t maxValidCm      = 400;  // above this, treat as no target
    uint8_t  consecutiveHits = 2;    // readings under threshold before firing
    uint16_t cooldownSec     = 15;   // suppression window after a trigger
    uint16_t readIntervalMs  = 100;  // vary per gate -- see cross-talk note
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

    // Convert a completed echo pulse to centimetres and fold it into the
    // detection streak.  Isolated so a VL53L1X swap replaces only the read
    // path: everything downstream (streak, cooldown, config, info panel) is
    // sensor-agnostic and unchanged.
    void harvestMeasurement()
    {
      unsigned long widthUs = hcsr04EchoFallUs - hcsr04EchoRiseUs;
      hcsr04Phase = 0;

      // Speed of sound ~343 m/s, halved for the round trip: cm = us / 58.
      uint16_t cm = (uint16_t)(widthUs / 58UL);

      if (cm < minValidCm || cm > maxValidCm) {
        lastReadValid = false;
        hitStreak = 0;
        return;
      }

      lastDistanceCm = cm;
      lastReadValid  = true;

      if (cm <= thresholdCm) {
        if (hitStreak < 255) hitStreak++;
      } else {
        hitStreak = 0;
      }
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
      //    normal -- it just means nothing is within range.
      if (hcsr04Phase != 0 && now - lastTriggerSent > echoTimeoutMs()) {
        hcsr04Phase   = 0;
        lastReadValid = false;
        hitStreak     = 0;
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
      top[FPSTR(_enabled)]   = enabled;
      top["trigPin"]         = trigPin;
      top["echoPin"]         = echoPin;
      top["thresholdCm"]     = thresholdCm;
      top["minValidCm"]      = minValidCm;
      top["maxValidCm"]      = maxValidCm;
      top["consecutiveHits"] = consecutiveHits;
      top["cooldownSec"]     = cooldownSec;
      top["readIntervalMs"]  = readIntervalMs;
      top["flashPresetId"]   = flashPresetId;
    }

    bool readFromConfig(JsonObject& root) override
    {
      JsonObject top = root[FPSTR(_name)];
      if (top.isNull()) return false;

      int8_t prevTrig = trigPin, prevEcho = echoPin;

      bool ok = true;
      ok &= getJsonValue(top[FPSTR(_enabled)],   enabled,         true);
      ok &= getJsonValue(top["trigPin"],         trigPin,         32);
      ok &= getJsonValue(top["echoPin"],         echoPin,         33);
      ok &= getJsonValue(top["thresholdCm"],     thresholdCm,     150);
      ok &= getJsonValue(top["minValidCm"],      minValidCm,      5);
      ok &= getJsonValue(top["maxValidCm"],      maxValidCm,      400);
      ok &= getJsonValue(top["consecutiveHits"], consecutiveHits, 2);
      ok &= getJsonValue(top["cooldownSec"],     cooldownSec,     15);
      ok &= getJsonValue(top["readIntervalMs"],  readIntervalMs,  100);
      ok &= getJsonValue(top["flashPresetId"],   flashPresetId,   101);

      if (consecutiveHits < 1) consecutiveHits = 1;
      if (readIntervalMs < 40) readIntervalMs = 40;  // keep clear of echo timeout

      // Pin changes need a reboot.  These are fixed for the life of the
      // install, so re-initialising the ISR live is deliberately unsupported.
      if (initDone && (trigPin != prevTrig || echoPin != prevEcho)) {
        DEBUG_PRINTLN(F("[HCSR04] pin change staged - reboot to apply"));
      }

      return ok;
    }

    uint16_t getId() override { return USERMOD_ID_HCSR04_FLASHBULB; }
};
