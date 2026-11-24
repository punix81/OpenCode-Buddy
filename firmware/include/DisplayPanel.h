#pragma once

// Panel definition reproduced from the working reference firmware
// ../Codex-Quota-Mini/include/display.h. Every value below is verified against
// that file; see docs/hardware-audit.md §1.1.
//
// GC9A01, 240 x 240, SPI2_HOST, 27 MHz, inverted colours, BGR order.

#define LGFX_USE_V1
#include <LovyanGFX.hpp>

class DisplayPanel : public lgfx::LGFX_Device {
  lgfx::Bus_SPI bus_;
  lgfx::Panel_GC9A01 panel_;

 public:
  DisplayPanel() {
    auto spi = bus_.config();
    spi.spi_host = SPI2_HOST;
    spi.freq_write = 27000000;
    spi.pin_sclk = 2;
    spi.pin_mosi = 4;
    spi.pin_miso = -1;
    spi.pin_dc = 1;
    bus_.config(spi);
    panel_.setBus(&bus_);

    auto panel = panel_.config();
    panel.pin_cs = 5;
    panel.pin_rst = 0;
    panel.invert = true;
    panel.rgb_order = true;
    panel_.config(panel);
    setPanel(&panel_);
  }
};
