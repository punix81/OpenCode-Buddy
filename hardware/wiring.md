# Wiring

Reproduce exactly the proven reference configuration. Do not "improve" pin assignments: they are
verified against working firmware (`docs/hardware-audit.md` §1).

## Diagram

```text
              ESP32-C3 Super Mini
            ┌───────────────────┐
   3V3 ─────┤ 3V3           IO2 ├──── SCL  (display SPI clock)
   GND ─────┤ GND           IO4 ├──── SDA  (display SPI data / MOSI)
            │               IO1 ├──── DC   (display data/command)
            │               IO5 ├──── CS   (display chip select)
            │               IO0 ├──── RST  (display reset)
            │               IO6 ├──── I/O  (TTP223 output)
            │               USB ├──── USB-C cable to host
            └───────────────────┘

   GC9A01 240×240:  VCC→3V3  GND→GND  SCL→IO2  SDA→IO4  DC→IO1  CS→IO5  RST→IO0
   TTP223        :  VCC→3V3  GND→GND  I/O→IO6
```

## Connection table

| From | To | Wire |
| --- | --- | --- |
| Display VCC | 3V3 | red |
| Display GND | GND | black |
| Display SCL | GPIO2 | any |
| Display SDA | GPIO4 | any |
| Display DC | GPIO1 | any |
| Display CS | GPIO5 | any |
| Display RST | GPIO0 | any |
| TTP223 VCC | 3V3 | red |
| TTP223 GND | GND | black |
| TTP223 I/O | GPIO6 | any |
| Host USB-C | board USB-C | data-capable cable |

## Rules

1. **Power off / unplug USB before rewiring.** The panel is not hot-plug safe.
2. Use a **data** USB-C cable. Charge-only cables enumerate nothing.
3. Keep SPI wires short (≤ 10 cm) and route them away from the USB pair; 27 MHz clock.
4. Connect the display's backlight pin the same way as on the reference build; do not add a
   transistor, resistor or level shifter (constraint: no extra components).
5. The TTP223 output is active HIGH and the firmware enables an internal pulldown.
6. GPIO0 and GPIO2 are boot strapping pins; do not hold them low/high externally during reset.
7. Do not connect 5 V to any display or sensor pin.

## First power-up checklist

- [ ] Display backlight on, no white screen after ~1 s.
- [ ] Firmware reports `hello` on the serial line.
- [ ] A touch generates exactly one `interaction` message.
- [ ] No brown-out reset during full-brightness animation.

Items marked as requiring hardware are Phase 1 verification and need explicit approval to flash.
