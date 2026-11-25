# Local mock display preview

Run from the repository root on Linux with Python 3, Pillow, GNU Make, a C++17 compiler and the pinned firmware LovyanGFX library installed in PlatformIO's project library cache.

```sh
python3 tools/ui-preview/preview.py
```

Open **http://127.0.0.1:8765/**. The first run builds the host sprite backend. Use `--port` to select another local port. The server listens only on loopback. Stop with Ctrl+C. All display input is synthetic.

Select any of six screens and twelve expressions. Switch between typical, missing, extreme and degraded data. Offline removes the simulated host. The permission button changes the simulated state without navigating. Touch supports tap, double tap and the two hold durations. Keyboard users can hold Space or Enter on the touch button. Native size uses 240 CSS pixels. Light surround changes the viewing environment. The face retains its dark palette.

```sh
python3 tools/ui-preview/preview.py --sheets
python3 tools/ui-preview/test_preview.py
```

**VERIFIED** — the desktop executable calls the firmware layout and animation functions. Each requested frame uses the real indexed sprite and fonts. The two generated contact sheets use deterministic mock time. The historical comparison sheet includes host renderings of the earlier C++ sources at f3a0406.

**Differences from hardware.** The browser rescales a PNG, selects frames at browser speed and simulates touch timing and preferences in memory. The host reads RGB from the palette before panel conversion. It has no SPI timing, physical USB, NVS, touch debounce, viewing-angle effects or enclosure. The native fixture clock is controlled by the browser and its synthetic snapshots are static. **NOT VERIFIED** — hardware FPS, heap, physical colors and physical touch.
