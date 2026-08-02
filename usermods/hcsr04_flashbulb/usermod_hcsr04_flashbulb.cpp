#include "usermod_hcsr04_flashbulb.h"

// ISR-shared echo capture state.  See the header for why a phase counter is
// used instead of digitalRead() inside the ISR.
volatile uint8_t       hcsr04Phase      = 0;
volatile unsigned long hcsr04EchoRiseUs = 0;
volatile unsigned long hcsr04EchoFallUs = 0;

void IRAM_ATTR hcsr04EchoISR()
{
  if (hcsr04Phase == 1) {
    hcsr04EchoRiseUs = micros();
    hcsr04Phase = 2;
  } else if (hcsr04Phase == 2) {
    hcsr04EchoFallUs = micros();
    hcsr04Phase = 3;
  }
}

const char HCSR04FlashbulbUsermod::_name[]    PROGMEM = "HCSR04Flashbulb";
const char HCSR04FlashbulbUsermod::_enabled[] PROGMEM = "enabled";

// WLED 0.15+ registration.  Usermods are PlatformIO libraries enabled via
// `custom_usermods` in platformio_override.ini; there is no longer any manual
// editing of usermods_list.cpp.
//
// VERIFY this macro against a stock usermod in your 0.16.1 tree (for example
// usermods/PIR_sensor_switch/) -- this is the single line most likely to
// differ between point releases.
static HCSR04FlashbulbUsermod hcsr04_flashbulb;
REGISTER_USERMOD(hcsr04_flashbulb);
