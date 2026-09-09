# PHY-03: Scene hygiene — honest warnings + grounded scenes

**What to build:** Warnings only flag real problems: Fixed bodies are exempt from the positive-mass warning (mass 0 is legitimate for them), and every warning names the offending Body by id instead of array position. Every new Scene starts with a ground: the blank-scene factory includes a fixed hatched ground (same recipe as the presets), and the free-fall Preset gains a ground under the falling Body.

**Blocked by:** None (can start immediately).

Stage: done

- [x] A Fixed body with mass 0 produces no positive-mass warning
- [x] A dynamic Body with mass ≤ 0 still warns, and the warning message identifies the Body by id, not array index
- [x] A newly created blank Scene contains a fixed hatched ground
- [x] The free-fall Preset contains a ground
- [x] Pre-existing scenes (with or without ground) parse unchanged
- [x] Regression tests are mutate-verified per the AGENTS.md build protocol
- [x] All four gates green (`test`, `lint`, `typecheck`, `build`)
