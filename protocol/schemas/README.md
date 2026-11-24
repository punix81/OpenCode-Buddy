# Protocol schemas

`protocol-v1.schema.json` is the **draft** machine-readable contract for USB protocol v1.

- `oneOf` selects the message shape by `type`.
- Envelope fields are common: `v`, `type`, `seq`, optional `ts` and `id`.
- Numeric limits mirror `protocol/protocol-v1.md` §4 and §8.
- Unavailable values are `null`, never `0`.

Status: design draft, ratified in Phase 2. Validation tests, boundary tests and fuzzing are Phase 2
deliverables; no runtime code consumes this schema yet.
