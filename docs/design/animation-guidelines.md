# Motion and interaction

**VERIFIED implementation.** Derive motion from monotonic milliseconds. State entry changes the expression clock. Repeated snapshots retain that clock, including after a local terminal notification expires. A later transition through a different reported state can start a new celebration. Protocol v1 has no identity for two consecutive indistinguishable terminal events.

- Lens height and asymmetry ease over 240 ms. A 240 ms lid cycle occurs once per 4.2 seconds. Breathing has a 4.8 second period.
- Success glints stop after 1.7 seconds. The existing terminal TTL controls the label. Permission persists until the source resolves it.
- The pager briefly widens on navigation. Short advances, double returns home, long toggles quiet and very long resets preferences. Automatic return uses 60 seconds and is suspended in quiet mode.
- Quiet mode fixes the gaze, visor, radar and activity phases, suppresses stars and uses the final expression geometry. Labels still update with incoming data.
- Frame scheduling retains the existing active 40 ms interval, lower idle cadence and slower dashboard updates. Each push transfers the existing sprite. Rendering uses bounded primitives, one palette and fixed-size text buffers.

**NOT VERIFIED** — achieved FPS, first-frame latency, panel transfer cost with the indexed palette and USB stability under long sustained load.
