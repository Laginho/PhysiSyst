---
title: "T04 initial velocity core — READ gate"
kind: review
---

Verdict PASS

## Re-verification after fix 04b

Re-verification at 2026-09-03T19:00:38-03:00 confirmed that the committed ticket-04b coverage closes the only rejection cause:

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 20 test files, 368/368 tests |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — production bundle generated; only the existing chunk-size warning was reported |

READ replayed mutation 6 by inserting `vx`/`vy` before the canonical Body keys. Exactly the three committed ticket-04b regressions failed: byte-identical reserialization, explicit Body key order, and clean `isDirty` after load. Production was restored immediately, the targeted suite returned green, and the full four-gate run above passed.

All six required mutations are now caught by committed tests. Ticket 04 satisfies its acceptance criteria and the mandatory mutate-verify protocol.

## Initial rejection evidence (historical)

The four gates were reproduced independently before the adversarial replay and again after every temporary mutation had been restored:

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 20 test files, 365/365 tests |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — production bundle generated; only the existing chunk-size warning was reported |

### Adversarial mutation replay

Mutations 1–5 were applied to production code, the full `npm test` suite was run, at least one test failed, and the source was restored immediately afterward. Mutation 6 left the committed suite green, so it does not satisfy the mandatory replay gate.

| # | Mutation | Failure observed |
| --- | --- | --- |
| 1 | Parser injects `vy: 0` when `vy` is absent | 16 failures / 349 passed: legacy round-trip/dirty-state assertions and the ticket-04 absent-field assertions, including `codec.test.ts` “a version-1 Body without Initial velocity parses with the field absent” |
| 2 | Remove/loosen `vx` finite-number validation | 3 failures / 362 passed: the three `codec.test.ts` invalid-`vx` cases |
| 3 | Remove v₀ application during world build | 3 failures / 362 passed: `simulator.test.ts` initial velocity, closed-form displacement, and rebuild-from-document cases |
| 4 | Remove linear-velocity carry from structural rebuild | 7 failures / 358 passed: kinematic carry, transparent rebuild, particle-mode carry, and ticket-04 carried-rebuild cases in `simulator.test.ts` |
| 5 | Make routing ignore `vx`/`vy` edits | 1 failure / 364 passed: `routing.test.ts` “an Initial velocity edit is STRUCTURAL” |
| 6 | Serialize `vx`/`vy` before the existing canonical body keys | 0 failures / 365 passed in the committed suite. A temporary independent JSON-byte-order assertion failed, showing the defect, but no committed regression test catches it. |

The temporary byte-order test and all six production mutations were removed/restored; the final four-gate run is green.

### Ticket criteria review

- `SCENE_VERSION` remains 1. `vx`/`vy` are optional in `src/scene/types.ts`; the parser only writes them when present and validates them as finite numbers, preserving pre-v2 omission.
- The simulator applies v₀ only to dynamic bodies at world build and restores carried linear velocity during structural rebuilds.
- `routeDocChange` compares both optional components, while absent-vs-absent bodies remain live-routable.
- The fixed-body UI condition is present by inspection in `src/App.tsx`: `!body.fixed` gates both velocity fields. No automated UI test was added, per the brief’s policy.
- `properties.vx` and `properties.vy` exist in both `pt-BR` and EN catalogs; the catalog parity tests pass.
- Scene version and pre-v2 round-trip behavior remain covered by the green codec/persistence suite. `package.json` shows no dependency added for this ticket.
- No temporary production mutation or temporary test file remains. This workspace has no `.git` metadata, so the scope review used the brief’s named changeset and the current source/tests directly rather than a commit diff.

## Resolved root causes

1. The committed regression suite checks semantic object equality for initial-velocity scenes but does not assert `JSON.stringify(serialize(parse(doc)))` byte equality when `vx`/`vy` are present.
2. Because the deep-equality assertions ignore JavaScript object insertion order, moving `vx`/`vy` ahead of the canonical keys passes all 365 committed tests even though the serialized bytes change.

The implementation is restored and the four final gates are green, but the mandatory adversarial replay is incomplete until the serialization-order regression is covered.
