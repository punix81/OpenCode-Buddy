# Phase 6B Windows USB evidence

**NATIVE VERIFIED** Physical Windows host on 2026-11-27, with native usbser.sys
enumeration and no guest path. SerialPort and PnP reported six serial interfaces.
The Product Owner selected COM23. The board's USB composite parent supplied the
device serial, independently of the serial-interface instance tail.

| Port | Descriptor / transport | USB VID:PID | Identification |
| --- | --- | --- | --- |
| COM1 | ACPI serial communications port | — | Legacy port |
| COM3 | USB serial interface | 1A86:CA21 | Non-Espressif USB serial interface |
| COM4 | USB serial interface | 1D6B:0121 | Non-Espressif composite serial interface |
| COM6, COM7 | Bluetooth SPP | — | Bluetooth serial interfaces |
| COM23 | USB serial interface with Espressif JTAG sibling | 303A:1001 | User-selected Buddy candidate; firmware identity pending |

**BLOCKER** The selected port rejected an exclusive
CreateFile open (Windows error 5). The attempt performed no DCB setup, reads or
writes. The pre-existing Buddy bridge held its normal IPC lock. Release the port,
then run the updated bridge with explicit device selection and the same observed
USB parent. No other port was opened.

**NOT VERIFIED** Firmware hello, exact running firmware image, capabilities,
ready/config ACKs, USB states, metrics, heartbeats, bridge reopen and panel
behavior. A protocol version read from hello is not a binary hash.

**AUTOMATED** The existing partial-ACK test confirms that one acknowledgement
alone cannot release the snapshot. The first successful native link should
record hello version, capabilities, both ACKs, state, MCP and heartbeats. Run
one controlled restart/reopen and a short interval without the bridge using the
installed image. Leave cold boots, physical disconnects, resets and endurance
for the separately approved campaign.

**NOT VERIFIED** The Phase 5 USB RX failure cannot be compared until the port
is available. Its root cause remains open.
