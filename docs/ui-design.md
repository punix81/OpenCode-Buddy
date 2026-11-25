# OpenCode Buddy display and interaction

**VERIFIED** — the production renderer and Linux preview share the six display layouts, eye geometry, indexed sprite and LovyanGFX fonts. The device source is the state accepted by the protocol parser. The desktop tool supplies labelled mock fixtures.

- [Palette, type and safe geometry](design/design-system.md)
- [Twelve expressions](design/buddy-expressions.md)
- [Dashboard layouts and metric semantics](design/dashboard-layouts.md)
- [Motion, quiet mode and gestures](design/animation-guidelines.md)
- [Earlier and redesigned pixels](design/previews/comparison.png)
- [Desktop preview and reproduction](../tools/ui-preview/README.md)

## Touch through the enclosure

| Gesture | Default recognition | Action |
|---|---|---|
| Short | Release below the long threshold, wait for the 350 ms double window | Next page |
| Double | Second short release within the double window | Buddy |
| Long | Release after at least 1500 ms | Toggle quiet |
| Very long | Hold through 5000 ms | Reset local preferences once |

**VERIFIED** — firmware debounce defaults to 35 ms. The four input actions use the existing gesture classifier. Permission remains a display notification. Mock sources carry an on-screen marker on every page.

**NOT VERIFIED** — enclosure readability and physical gesture latency with the redesigned image.
