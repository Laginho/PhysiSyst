---
title: "T03 scene hygiene — READ gate"
kind: review
---

PASS

## Evidence

The four gates were reproduced independently before the adversarial replay and again after every temporary mutation had been restored:

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 20 test files, 349/349 tests |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS — production bundle generated; only the existing chunk-size warning was reported |

### Adversarial mutation replay

Each mutation was applied to production code, the full `npm test` suite was run, at least one test failed, and the production code was restored immediately afterward.

| # | Mutation | Failure observed |
| --- | --- | --- |
| 1 | Remove the Fixed-body exemption from the mass warning | 3 failures / 346 passed: `codec.test.ts` Fixed exemption, `persistence.test.ts` blank ground warning, and `presets.test.ts` free-fall warning |
| 2 | Replace the Body id in the mass warning with `?` | 4 failures / 345 passed: dynamic warning naming and aggregate warning assertions in `codec.test.ts` |
| 3 | Remove `groundBody()` from `blankScene()` | 1 failure / 348 passed: `persistence.test.ts` blank scene ground assertion |
| 4 | Remove `groundBody()` from the free-fall preset | 1 failure / 348 passed: `presets.test.ts` free-fall ground assertion |
| 5 | Mutate the shared ground id from `chao` to `chao-mutado` | 5 failures / 344 passed: blank-scene, wedge, free-fall, preset parsing, and persistence assertions |
| 6 | Reorder `groundBody()` keys so its serialized order differs from `parse()` | 1 failure / 348 passed: `persistence.test.ts` `isDirty`/autosave canonical-order guard |

### Ticket criteria review

- `collectWarnings` keeps warnings soft-only: `parse` does not call it or reject unphysical mass; the warning tests confirm parse/serialize identity for such scenes.
- Fixed bodies with mass 0 are exempt, while dynamic mass ≤ 0 produces `body '<id>': mass should be a positive number`; force and contact warnings retain their intentional array indices.
- `SCENE_VERSION` remains 1, the Scene root/body schema is unchanged, and pre-existing scenes with or without ground parse and serialize unchanged.
- `groundBody()` is the shared fixed rectangle recipe with id `chao`, used by `blankScene()`, wedge-flagship, and free-fall. Its key order matches the codec’s canonical parsed body order, preserving `isDirty` stability.
- `package.json` contains no dependency added by this ticket.
- No temporary production mutation remains. This workspace has no `.git` metadata, so the scope review used the brief’s named changeset and the current source/tests directly rather than a commit diff.

No root causes for rejection.
