# FINAL_REPORT.md — physics-sim v1

Multi-agent build completed **2026-08-23** · orchestrated by PLAN (Traycer) with MAKE (implementation) and READ (independent verification).

---

## 1. Executive Summary

physics-sim v1 is a **pt-BR classical-mechanics scene simulator**: users assemble bodies (retângulo/bola/cunha), apply forces, define friction contacts, and watch deterministic Rapier2D physics play out on a canvas — built as a single-page React app with zero runtime dependencies beyond React and `@dimforge/rapier2d-compat`.

**All twelve software tasks (T0–T11) closed with independent READ verification.** Final state: **329 tests green across 19 test files**, all four quality gates green (`npm test` / `npm run lint` / `npm run typecheck` / `npm run build`). One task (T12 manual device pass) is **pending user execution** by explicit choice — spec bars automated UI testing, so touch/mobile verification is human-in-the-loop.

Highlights:
- **Physics correctness proven against closed forms**, not vibes: incline `a=g(sinα−μk·cosα)`, projectile parabola/range, perfectly-inelastic collision (momentum ±3%, KE ±4%), and the flagship wedge equilibrium `F=(M+m)g·tanα` verified *inside the simulator* with tangency guards that defeat settle-window masking.
- **Honest engineering contracts**, compile-enforced where possible: force anchors are body-origin-relative (`@ts-expect-error` probes prove id/bodyId immutability), contact identity is an ordered pair, `replaceScene` is transactional, persistence is payload-first with rollback.
- **Every feature survived adversarial review**: 22 REJECT verdicts across 12 tasks were all resolved at root cause (details §3).

## 2. Scope Delivered (T0–T11)

| Task | Deliverable | Tests |
|---|---|---|
| T0 Scaffold | Vite 8 + React 19 + TS 6 strict + Vitest 4 | smoke |
| T1 Scene codec | Versioned Scene doc, parse/serialize single path, soft validation + `collectWarnings`, 28-case invalid-mutation table | 40 |
| T2 Simulator seam | Rapier2D wrapper, TIMESTEP=1/60 deterministic, structured exact friction-potential solver (odd cycles pin, feasible-systems exact per ADR-0003 addendum) | 63 |
| T3 Acceptance suite | Incline/projectile/wedge-flagship/inelastic-collision closed-form families, public seam only | 71 |
| T4 Render layer | Pure world↔screen transform, zero-dep Canvas2D (grid ladder [40,100)px w/ hang guards, arrow primitive), DPR-aware | 92 |
| T5 Body editing | Immutable doc ops, hit-test topmost-wins, drag/rotate/resize/α handles, snap-to-origin, palette, clamped panel entry | 131 |
| T6 Forces & contacts | Force editor (origin-relative anchors, world-frame direction), auditable ordered-pair contacts w/ pt-BR guard reasons, editable g, amber warnings | 142 |
| T7 Playback | Pure fractional-step scheduler (speeds scale steps-per-frame, never dt), live-vs-structural routing classifier, `setGravity` live seam, particle mode w/ post-carry relock, transactional rebuild + commit-on-success flags, viewport-exit proof | 242 |
| T8 Observation | `readContacts()` seam (flipped-normal corrected), global vector overlay (weight/applied/normals), readout panel w/ AccelTracker finite-difference acceleration, 100 ms ref polling (zero 60 Hz re-renders) | 261 |
| T9 Persistence | Debounced autosave (400 ms, flush-on-explicit-transition), multi-scene CRUD via `switchToScene` chokepoint, discriminated corrupt-index recovery, payload-first ordering w/ rollback + amber surfacing, export/import through codec | 301 |
| T10 Presets | 4 codec-built presets incl. wedge flagship #1 (simulator-stepped equilibrium pin, 1e-9 placement + tick-1 tangency guards), hatched ground, persisted gallery-ack flag | 308 |
| T11 i18n | 81-key pt-BR + EN catalogs, `t(key,params)` w/ fallback + interpolation, persisted language pref, physics terminology consumed by real labels (μs/μk/particle mode), render-time warning translation | 329 |

## 3. Process Record

**Protocol:** test-first (red→green), every changeset gated by READ's independent reproduction of all four gates plus adversarial verification (mutation replay, SSR harnesses, coverage reproduction, package-manifest hash checks). Max 3 fix loops per task before BLOCKED.

**Gate outcomes:**

| Task | Iterations to PASS | Notable root causes found by review |
|---|---|---|
| T0 | 1 | — |
| T1 | 2 | Hard mass-validation violated soft-only mandate → `collectWarnings` policy born |
| T2 | 3 | Odd friction cycles falsely infeasible → solver rewritten as exact structured solve; undeclared-contact leak → ADR-0003 addendum |
| T3 | 2 | Anchor contract contradiction (COM vs origin); fixture penetration hidden by settle windows |
| T4 | 3 | Grid envelope mathematically unachievable as specified ([T,2.5T) proof); ppm=0 infinite loop |
| T5 | 3 (+micro-fix) | Union-collapsing `Partial<Omit>`; origin-snap semantics; stale duplicate panel branches |
| T6 | 2 | Force refs could dangle → type-level immutability + runtime guard; layering doctrine documented |
| T7 | 2×2 (M1/M2) | Non-transactional `replaceScene` double-free; commit-before-success flag ordering |
| T8 | 3 | Acceleration divided one timestep by multi-step batches (~2g at 2×); pins bypassed wiring → AccelTracker extraction |
| T9 | 6 | Debounce defeated by cleanup-flush; delete resurrection; orphaned index entries; hollow adapter fixtures |
| T10 | 3 | Flagship unpinned in simulator; gallery heuristic reopened for any singleton |
| T11 | 3 | Hollow fallback pin; EN-mode pt-BR leaks; terminology catalogued but unconsumed; stale-language warnings |

**Team / operations:** 3 MAKE instances (big-pickle → muse-spark-1.2-contributor-free ×2, replaced after self-archive and a planned context reset), 2 READ instances (codex; second spawned at the T10 boundary per context-hygiene protocol). Reliability measures added mid-build: watchdog protocol (ack-on-message, stale-ledger re-dispatch) and a Windows Scheduled Task (`PhysicsSimWatchdog`) alerting the user if the pipeline stalls >30 min.

**Time accounting caveat:** LOGS.md mixes host-clock and agent-reported timestamps (drift ≤2 h, flagged and corrected late in the build), so aggregate wall-clock figures are indicative only. **Gross elapsed span ≈ 19 h** (00:35–19:45 local). **Excluding infrastructure outages** — chiefly the overnight Nvidia-502 gate stall (~7.5 h) — **effective pipeline time ≈ 11.5 h**; further excluding user-conversation idle windows (~1 h: T3-M2 conversation overlap, PLAN stall recovery, scattered dead turns) gives **≈ 10–10.5 h of actual build+review time**, with review overhead ≈ 25–30% of task time — the investment that caught 22 defect classes before they shipped.

## 4. Known Limitations (v1)

1. **Elastic collisions deferred to v1.x** — schema has no restitution knob (spec Out-of-Scope); engine default e=0 matches the inelastic case.
2. **Undeclared-contact friction leak** — scenes mixing declared positive-friction edges with undeclared contacts get approximate (not exact) friction on the undeclared pairs; accepted residual per ADR-0003 addendum with revisit trigger.
3. ~~**Window resize during playback** — canvas backing store sized once at mount; resizing stretches rendering until reload (T4 deferral, unchanged).~~ **Resolved in PHY-15**: the canvas measures its container (`ResizeObserver`), re-derives logical size, DPR backing store and the world↔screen transform on every change; pixels-per-metre scales with width so the framing is size-invariant.
4. **Contact normal arrows are direction-only** (fixed length) — magnitudes would need Rapier EventQueue plumbing judged not cheap on this seam.
5. **Weight arrows draw at body origin**, not true triangle centroid (offset documented; centroid anchor rule applies to forces).
6. **Gallery acknowledgement is one-way** — no UI reset path for the first-open gallery in v1 (button remains available).
7. **StrictMode dev double-mount** may append duplicate notices once (deduped display; dev-mode cosmetic).
8. **Story-1 letter deviation**: palette is click-to-place, not drag-drop (accepted v1 trade-off).
9. **Contact μ edits are structural** — they trigger a carried rebuild rather than a live mutation (μ feeds the global potential solve; rebuild is trajectory-transparent).
10. **rAF/React adapter untested by automation** — spec bars automated UI tests; behaviour is pinned via `makeAppLike` pure mirrors instead.

## 5. Pending Before Calling v1 Done

- **T12 Manual device pass** (user-deferred): the 18-item mobile-touch + desktop checklist posted by PLAN. On ❌ findings, route to MAKE as fix items; results recorded here and in TASKS.md.

## 6. Next Steps (v1.x candidates)

- Restitution knob + elastic-collision acceptance family (schema v2).
- True-COM weight arrows and general hatch flags (schema additions).
- Contact-force magnitudes via EventQueue for scaled normal arrows.
- Gallery reset affordance; pulley bodies (polia terminology already localized).
- Consider raising the review bar earlier: the hollow-pin pattern (tests passing beside broken/mutated production code) recurred three times (T8/T9/T11) — a standing "mutate-verify your own regression" rule is now de facto and worth formalizing in AGENTS.md.

---

# physics-sim v2 — Textbook polish, contact snap, initial velocity

**Closeout swept 2026-09-09.** Ten coordinated changes (tickets 01–10) making scenes look and behave like the textbook problems students study, plus this acceptance sweep (11).

## Scope Delivered (01–10)

| Ticket | Deliverable |
|---|---|
| 01 Vector sizing | One shared bounded non-linear rule (`vectorArrowLengthPx`, √magnitude clamped to [24,120] px) consumed by weight, applied-force, and `v₀` arrows alike |
| 02 Textbook bodies + mass labels | White/black-outline rendering; `massLabels()` derives `m`/`M`, subscripted (`m_a`, `m_b`) only when two bodies share a symbol, re-flowing on delete; fixed bodies hatched, unlabeled |
| 03 Scene hygiene | Mass warnings exempt fixed bodies, name the offending body; new scenes (including projectile/free-fall presets) start with a ground |
| 04 Initial velocity core | Per-body `v0` in the Scene doc; simulator seam consumes it at spawn |
| 05 Contact snap | Dragging a body near a neighbor lands it flush, rotation aligned to the touched surface |
| 06 Readout truth | Acceleration survives pausing (`AccelTracker`, elapsed = steps·dt); `≈` marks only analytic estimates for Contact participants, never Fixed bodies |
| 07 `v₀` polar arrow | Cartesian and polar (magnitude + angle) entry, drawn via the same arrow primitive as forces |
| 08 Projectile preset redesign | Preset launches via real `v₀`, not a sustained fake force; gallery copy (pt-BR + EN) matches |
| 09 Body panel split | Mass/fixed/`v₀` up front; mouse-redundant numeric fields under "ver mais" |
| 10 Drag-to-trash | Trash target in the canvas corner, visible only mid-drag; drop routes through the existing `removeBodyAndDependents` (dependents cleanup, structural rebuild with carry-over — no new deletion path) |

## Acceptance Sweep (11) — Gate Outcomes

- **400 tests / 23 files, all green** (`npm test`), incl. the `v₀` parabola/range closed-form family (`sim/acceptance.test.ts`, launch-height re-crossing within 2% of `R = 2·v0x·v0y/g`).
- **lint, typecheck, build all green** (build: one non-blocking >500 kB chunk-size advisory, pre-existing, out of scope).
- **Cross-ticket scenario verified live** (real browser, not jsdom): textbook wedge scene with mass-labeled bodies → contact-snap onto the incline (rotation aligned to surface) → drag-to-trash removal (label re-flow confirmed: `m_b` deleted, survivor relabels `m_a` → `m`) → projectile preset paused mid-flight showing a `v₀` arrow sized by the same rule as weight/applied arrows.
- **i18n parity**: catalog-completeness suite (`i18n.test.ts`) asserts pt-BR/EN key sets are identical; passing as part of the 400.
- **Independent mutate-replay pass** on three new-seam functions, each mutation caught by its targeted test then restored: `pointInTrash` bounding-box inversion (editor/trash.test.ts), `vectorArrowLengthPx` sqrt→linear (render/overlay.test.ts), `massLabels` subscript-suppression (render/draw.test.ts). Working tree confirmed clean after restoration.

## Known Limitations (v2, carried forward from v1 §4 unless noted)

All ten v1 items stand. No new limitations introduced by v2 — the drag-to-trash, contact-snap, and initial-velocity seams reused existing structural-rebuild and dependents-cleanup paths rather than adding new state machinery.

---

# physics-sim v3 — Release digno (desktop)

**Closeout in progress, PHY-17.** Five tickets making the app reachable by a student without Node or git — a public URL, four automated gates, and four first-run gaps closed (snap now declares Contact, undo/redo, a canvas that fits its container, a loading screen with personality) — plus this closeout sweep.

## Scope Delivered (PHY-12–PHY-16)

| Ticket | Deliverable |
|---|---|
| PHY-12 Release mechanics | LICENSE MIT, CI (4 gates, Node 22, on PR + push), GitHub Pages deploy via Actions, `base: '/PhysiSyst/'`, `version` 0.3.0 |
| PHY-13 Snap declares Contact | Snap resolver returns the winning neighbor; Contact created on pointer-up with μs=μk=0 (ADR-0002 default); duplicate pair is a silent no-op; Contact survives the body being dragged away |
| PHY-14 Undo/redo, Delete, shortcuts | Pure history module (50-entry cap), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Delete/Backspace, Space/→/R/Esc, `?` shortcut popover, ↶↷ buttons in the playback bar |
| PHY-15 Canvas fits its container | `fitCanvas` letterboxes to 3:2 (600px floor), `ResizeObserver`-driven; camera, transform and trash hit-box all derive from the current size instead of mount-time constants |
| PHY-16 Loading screen | wasm boot fires on mount; overlay rotates 10 pt-BR/EN physics jokes; failure shows a fixed error with a working retry |

## Gate Outcomes

- **459 tests / 27 files, all green** (`npm test`); lint, `tsc --noEmit`, and `vite build` clean (only the pre-existing >500 kB chunk-size advisory). Reverified locally on `main` at `b9c4776` (PHY-17 merge) for this closeout.
- CI green on the latest merge (`b9c4776`, PHY-17): https://github.com/Laginho/PhysiSyst/actions/runs/34666067722
- Deploy green on the same commit: https://github.com/Laginho/PhysiSyst/actions/runs/34666093713

**Infrastructure gap found and fixed during this closeout (PHY-17):** GitHub Pages had never actually been enabled on the repository (`has_pages: false`) — every `Deploy` run since PHY-12 failed with `Get Pages site failed`, and `https://laginho.github.io/PhysiSyst/` 404'd. PHY-12's own criterion 7 (record the first green deploy link) was never fulfilled or checked, so this went unnoticed for three merges. Fixed by enabling Pages via `gh api repos/Laginho/PhysiSyst/pages -X POST -f build_type=workflow` and re-running Deploy. Related gap: the whole PHY-16 branch (18 commits, merge included) had been merged to local `main` but never pushed to `origin` — CI/Deploy had literally never run against it. Fixed with `git push`; both are now green on the true latest commit, and the site serves the current build.

## Desktop Manual Pass (D1–D8)

Run against the published site (`https://laginho.github.io/PhysiSyst/`), not localhost. **All eight items executed; six pass clean, two pass with a defect spun into its own ticket.**

| Item | Result |
|---|---|
| **D1** Cold open | ⚠️ **Partial.** In Chromium: the loading badge shows a joke (pt-BR "Discutindo se g é 9,8 ou 10…", EN "Convincing Schrödinger's cat to cooperate…"), clears when the engine boots, the scene renders, and the console is empty. Edge and Firefox were not exercised. |
| **D2** Mouse editing | ⚠️ **Pass with one defect.** Palette creates rectangle, ball and wedge; drag, rotate (0 → 0.767 rad), resize (ball r 0.75 → 1.52; wedge base 2 → 3.02), α by handle (30° → 43.5°) and topmost-wins hit-testing all work. Defect: the first drag of an *unselected* body lands ~2 m off — **PHY-18**. |
| **D3** Snap → Contact → friction | ✅ **Pass.** Snap seats the block flush (perpendicular distance exactly 0.5000 m = half-height) and declares `retangulo ↔ cunha` with μs=μk=0; μ is editable from the panel; dragging the block away keeps the pair. Physics matches the closed form: at α=30°, μk=0.1, measured \|a\| = 4.06 m/s² against `g(sin30° − 0.1·cos30°)` = 4.056, and \|v\| = 1.35 m/s after 20 steps against 1.352 predicted. At μs=0.8 > tan30° = 0.577 the block does not move over 103 steps. |
| **D4** Playback | ✅ **Pass.** Play/pause, step and restart all work by button; `→` (step) and `R` (restart) confirmed with genuine `keydown` events (`ArrowRight` advances `passos` by exactly 1; `r` resets it to 0). `Espaço` could not be dispatched as a real keydown from this session's browser tooling — every alias tried (`space`, `Space`, `spacebar`) arrives with an empty `key`/`code`, while `ArrowRight`/`r`/`Delete` all arrived correctly, so this is a gap in the tool, not the app; `actionForKey(' ') → togglePlay` is asserted in `shortcuts.test.ts` (part of the green gate). \|v\| and \|a\| update live (0 → 4.09 m/s over 25 steps of free fall); pausing mid-fall held \|a\| at 9.81 m/s² instead of zeroing it. The speed slider updates `velocidade` immediately; its 2×/0.5× wall-clock rate could not be independently timed live — the same render-loop stall noted below (rAF suspended while the pane is hidden) hit this session too partway through — but `playback/scheduler.ts` implements it as a deterministic step-accumulator (`acc += speed` per frame) with its own green `scheduler.test.ts`, which is stronger evidence than a timing sample this environment can't reliably produce anyway. |
| **D5** Undo/redo/Delete | ✅ **Pass.** Ctrl+Z collapses a whole drag into one undo step, Ctrl+Y redoes, ↶↷ disable at both ends of the stack, Delete removes the body *and* its contacts, the `?` popover opens by button and by `?` and closes by Esc and `?`. Backspace in a numeric field does not delete the body; that it deletes a *digit* could not be confirmed (the automation harness's synthetic Backspace performs no text edit — `shortcuts.ts` returns `null` for `inTextField`, so the code path is right, but it wants a human keystroke). |
| **D6** Resize | ⚠️ **Pass with one defect.** 3:2 ratio and full-scene visibility hold from 600×600 up through 1800×1000, including through a live resize *during* playback (simulation kept advancing, ratio unchanged). Drag and Delete stayed pixel-accurate after a resize (dragged a ball to (9.55, 4.89) m, then Delete removed exactly that body). Defect: below roughly 975 px of window width, the canvas's own 600 px floor (`CANVAS_MIN_WIDTH`, `fitCanvas.ts`) is wider than the column that holds it, and since that column allows overflow, the canvas bleeds out — measured at viewport 900×700, canvas `x = −22` (partly off-screen) and overlapping the inspector column — **PHY-20**. |
| **D7** Persistence | ⚠️ **Pass with one defect.** Auto-save, duplicate, export (`cena-3.json`, 911 B, valid) and import (round-tripped a modified `g`) all work; the scene list survives reload; switching scenes clears the undo stack. Defect: reload always reopens the first scene instead of the one being edited — **PHY-19**. |
| **D8** Language | ✅ **Pass.** pt-BR ↔ EN switches every string including the `?` menu and the loading jokes, `physics-sim:lang` persists the choice, no raw keys reach the screen, and no horizontal overflow. Body ids (`chao`, `rampa`, `bloco`) stay Portuguese in both languages — they are scene data, not UI strings. |

### Defects opened by this pass

| Ticket | Defect |
|---|---|
| **PHY-18** | Selecting a body renders the inspector, grows the page 784 → 954 px, and shifts the vertically-centred canvas down ~85 px mid-drag; the first drag of an unselected body therefore drops it ~2 m above the cursor. x is always exact, y is off by exactly the layout shift. |
| **PHY-19** | The active scene id is never persisted (`currentId` initialises to `index[0]`), so reload always reopens Cena 1. Scene contents and the scene list do survive. |
| **PHY-20** | Below ~975 px of window width, the canvas's 600 px floor no longer fits the column that holds it, and (since that column permits overflow, needed for drag handles) the canvas bleeds off-screen and behind the inspector instead of the layout yielding first. |

All three were fixed after this report was written (2026-09-13/14): PHY-18 and
PHY-19 merged 2026-09-13/14; PHY-20 merged 2026-09-15 by stacking the columns
below ~914 px, with acceptance criterion 3 reworded to "never bleeds left, any
right-hand excess is reachable by page scroll" since the 600 px floor cannot fit
a viewport narrower than ~620 px. PHY-21 (2026-09-14) moved the Chromium test
harness into `src/test/browser.ts`. Details in `.scratch/physics-sim-v3/`.

## v1 T12 Mobile Items — `wontfix`

The 10 mobile-touch items from v1's T12 checklist (posted 2026-08-23) are declared `wontfix`: physics-sim's public is the Brazilian desktop student (Windows), and mobile is out of horizon (v3 spec, Out of Scope). T12's 8 desktop items are superseded by D1–D8 above. The original checklist text was posted in conversation and never persisted to a repo file — `.scratch/physics-sim/TASKS.md` and `LOGS.md` record its existence (10 mobile + 8 desktop items) but not the item-by-item wording, so it isn't reproduced here.

## Known Limitations (carried from v1 §4)

All ten v1 items stand, with one change: **#3 (window resize during playback) is resolved by PHY-15** — the canvas now measures its container via `ResizeObserver` and never stretches.

## Next Steps (v4 candidates)

- Constraints: rope → pulley → spring.
- Restitution (elastic collisions), out of scope since v1.
- Code-split the Rapier2D wasm bundle (the >500 kB chunk advisory has stood since v1).

---

# physics-sim v4 — Vínculos: corda, polia e mola

**Closeout PHY-33, 2026-09-25.** Ten tickets (PHY-23–PHY-32) and twelve cleanups (CLEAN-01–CLEAN-12) add the first Constraints to the Scene: an ideal rope over any sequence of pulleys, fixed and movable pulleys (mass is a Realism option), and an ideal spring (damping; mass is a Realism option). The palette gains Rope, Pulley and Spring tools with Anchor snap. Every vector carries a letter. The gallery becomes a Preset tree with eight new presets, and the Rapier wasm moves out of the entry chunk. The whole cycle ran unattended in one sweatshop session (`sweatshop/2026-09-24-1853`).

## Scope Delivered (PHY-23–PHY-32)

| Ticket | Deliverable |
|---|---|
| PHY-23 Tracer: rope over a fixed pulley | Schema `pulleys` + `constraints` (rope `a`/`via`/`b`, length never stored), the rope as the simulator's own constraint around the world step (ADR-0004), Atwood acceptance family |
| PHY-24 General rope | Pendulum (rope to a fixed body), slack (one-sided), several pulleys, movable pulley; loop, pendulum, table-hanging and 2:1 families |
| PHY-25 Pulley with mass | Disk pulley that turns with the rope without slipping, a different `T` on each side (`T₁`, `T₂`…) |
| PHY-26 Ideal spring | `k`, `x₀`, `c`; the force is applied through the rope hook (`k·Δx` + damping), not Rapier's spring joint, which lost ~30% amplitude in 5 periods |
| PHY-27 Editor I: Anchor snap + Spring tool | Anchor snap (center of mass, face midpoint, vertex) for spring ends and force application points; spring inspector with `x₀` and `Δx` linked (`Δx` edits write `x₀ = x − Δx`) |
| PHY-28 Editor II: Pulley and Rope tools | Pulley by one click on a body, rope by anchor → pulleys in order → anchor; rope, pulley and spring selectable; deleting cleans up dependents |
| PHY-29 Constraint arrows and vector labels | `T` and `F_el` arrows; a letter beside every vector (`P`, `N`, `F`, `T`, `F_el`, `v₀`; `W`, `F_s` in en-US), numbered only when two of a kind exist; `T`/`F_el`/`Δx` in the readout panel |
| PHY-30 Spring with mass | Massive spring as a chain of nodes, `F_el` per end (`F_el₁`, `F_el₂`) |
| PHY-31 Preset tree | Area → part → topic (*Tópicos de Física*); only nodes holding a preset are shown; names/descriptions in i18n; eight new presets (Atwood, table-hanging, movable pulley, loop pendulum, simple pendulum, three mass-springs) |
| PHY-32 Code-split of the wasm | Rapier in a lazily loaded chunk; entry chunk under 500 kB |

The CLEAN tickets kept ADR-0004 and the code in step with each other. They covered position-based prediction, the pieces of a pulley with mass, the spring as a force, and the re-seated spring chain in the carry. They also removed the geometry that the editor modules duplicated, and hardened the code split (CLEAN-01/02).

## Gate Outcomes

- **703 tests / 30 files, all green** (`npm test`); `eslint .`, `tsc --noEmit` and `vite build` clean. Rerun for this closeout on `phy/PHY-33-closeout-v4`, cut from the session branch at `edf6b16`.
- Build: entry `index-*.js` 285.67 kB (gzip 88.13 kB), lazy `sim-*.js` 2,132.26 kB (gzip 809.71 kB). The >500 kB advisory still prints, but only the lazy Rapier chunk is over the limit (PHY-32 criterion 2).
- CI green on the latest merge on `main` (`ca9aab8`, PR #8): https://github.com/Laginho/PhysiSyst/actions/runs/36055658405, Deploy green on the same commit: https://github.com/Laginho/PhysiSyst/actions/runs/36055754319. **v4 itself has not been through CI yet.** It lives on the session branch, and CI runs on pull requests and on `main`. It will run when the driver opens the session PR.

## Desktop Manual Pass (1–8)

Run in headless Chromium at 1280×1080, pt-BR, against the Vite dev server of this branch. The published site still serves v3. The pass drove the repo's own CDP harness (`src/test/browser.ts`), with the real palette buttons, pointer clicks on the canvas and the inspector's fields. It read the results off the readout panel and took canvas screenshots. No scene document was written by hand. **All eight items pass. The pass found three defects, each opened as its own `needs-triage` ticket.**

| Item | Result |
|---|---|
| **1** Atwood by hand, `T` against the closed form | ✅ **Pass.** Fixed ceiling (4 × 0.5 m) at (6, 8), blocks of 0.4 m with m₁ = 3 kg and m₂ = 2 kg, pulley mounted by Anchor snap on the ceiling's bottom-face midpoint, rope from block 1's top face over the pulley to block 2's top face (both anchors snapped). After 30 steps, `T = 23.54 N` against `2m₁m₂g/(m₁+m₂) = 23.544 N`, and block 1 reads \|a\| = 1.96 m/s² against 1.962. |
| **2** Table + hanging block, declared μₖ | ✅ **Pass.** Fixed table 8 × 4 m (top at y = 4), block m₁ = 2 kg on it, hanging block m₂ = 1 kg. The pulley was snapped to the table's top-right vertex and its radius set to 0.2 m in the inspector. The rope runs from the block's right-face midpoint over the pulley to the hanging block's top, and the `mesa ↔ bloco` Contact was declared from the contacts panel. With μ = 0, \|a\| = 3.27 m/s² against g/3 = 3.270. With μs = μk = 0.2, \|a\| = 1.96 against `(m₂ − μₖm₁)g/(m₁+m₂)` = 1.962. |
| **3** Movable pulley: the load moves half as far as the counterweight | ✅ **Pass, with one defect.** Load M = 3 kg with a movable pulley snapped to its center of mass, fixed pulley on the ceiling at a free point, counterweight m = 1 kg. The rope runs ceiling → under the movable pulley → over the fixed one → counterweight. In 40 steps the load went down 0.31 m and the counterweight up 0.63 m (ratio −0.49 at the panel's two decimals). \|a\| was 1.40 and 2.80 m/s² against `(2m − M)g/(M + 4m)` = 1.401 and twice that. Defect: a load that fits inside its pulley can never be clicked — **PHY-37**. The hand-built load had to be 0.8 m wide, and the preset's 0.3 m load selects only the pulley. |
| **4** Slow loop: the rope goes slack near the top | ✅ **Pass, with one defect.** Loop preset (L = 1 m) with `v₀` lowered in the panel to √(4gL) = 6.26 m/s, so v² at the top would be 0, below gL. With the rope selected, `T` falls 45.5 → 36.0 → 24.4 → 13.7 → 5.5 N in steps of 5, and from step 30 (0.5 s) it reads 0 and **"frouxa"**. The rope stays slack after that. Control: the unmodified preset (v₀² = 6gL) stays taut the whole turn, with `T` ≥ 7.32 N sampled every 5 steps. The ideal minimum at the top is mg = 9.81 N. The gap is ADR-0004's documented energy loss, about 4% per fast turn. Defect found by the control: reopening the preset resumed the previous run instead of starting from the document — **PHY-36**. |
| **5** Spring "compressed 5 cm" by the `Δx` field | ✅ **Pass, with one defect.** In the horizontal mass-spring preset (k = 40 N/m, m = 1 kg), typing `Δx = −0.05` wrote `x₀ = x − Δx` (1.50 → 1.85 m) and left the block where it was, as the spec says. The block then oscillated between 6.10 and 6.20 m, an amplitude of 5 cm. Successive maxima came at 60 and 59 steps, periods of 1.000 s and 0.983 s, against `2π√(m/k)` = 0.9935 s. Defect: before the first step, the panel reads \|a\| = 9.81 m/s² with no `≈`, and after one step it reads 2.00 = k·\|Δx\|/m — **PHY-38**. |
| **6** Labels legible, `P` → `W` in English | ✅ **Pass.** With "mostrar todos os vetores" on, four scenes were screenshotted: the wedge (`P₂`, `N₁`, `N₂`, `F`), Atwood (`T` on each leg, `P₁`, `P₂`), the horizontal spring (`F_el`, `N`, `P`) and the projectile (`v₀`, `P`). Every letter sits clear of its arrow and is readable. Switching to English repaints at once: `P₂` → `W₂`, `P` → `W`, `F_el` → `F_s`, and `N`, `F`, `T`, `v₀` stay the same. Two cosmetic observations, not opened as tickets: a block resting on the floor draws two `N` arrows (one per contact point), and both are labelled `N` because they belong to one contact pair. The `m_a`/`m_b` mass labels are wider than 0.4 m blocks and cross their outline. |
| **7** Delete a body with rope, pulley and spring attached; Ctrl+Z | ✅ **Pass.** Atwood preset, plus a spring added with the Mola tool from the ceiling to block 2. Deleting the selected ceiling left bodies `chao`, `bloco-1` and `bloco-2`, with no pulleys and no constraints: the pulley on the ceiling, the rope over it and the spring all went in the same edit, and the canvas shows only the two blocks. Ctrl+Z brought the saved document back byte-identical to the one before the delete. |
| **8** Preset tree: only nodes with a preset, every new preset runs | ✅ **Pass.** The gallery shows five groups, all of them nodes of `TREE` and none empty. Mecânica / Dinâmica / Princípios has Atwood, table-hanging, movable pulley and the wedge. Atrito entre sólidos has the incline. Resultantes tangencial e centrípeta has the loop pendulum. Movimentos em campo gravitacional uniforme has free fall and projectile. Ondulatória / MHS has horizontal, vertical, simple pendulum and damped. Each of the eight new presets was opened from the gallery under its own name and played for 1 s (about 57 steps). The canvas changed every time, with no simulation error and no warnings. |

### Defects opened by this pass

| Ticket | Defect |
|---|---|
| **PHY-36** | Switching scenes doesn't reset playback. `carryOver` keeps the simulated state of every body with the same id and the same pose, and the step counter keeps counting, so reopening a preset or switching to a duplicated scene resumes the old run. This predates v4. |
| **PHY-37** | A pulley wins the click over its mount body across its whole disk. A body that fits inside its pulley (the "Polia móvel" preset's load) can't be selected, dragged or deleted on the canvas. |
| **PHY-38** | Before the first step, the readout's analytic acceleration ignores ropes and springs, and marks `≈` only for Contacts. A block on a stretched spring reads g as if exact. |

Also open at closeout, filed during the run: **PHY-34** (applied-force torque accumulates between steps, `needs-triage`), **PHY-35** (the last edit is lost on reload or tab close, `ready-for-agent`) and **CLEAN-13** (unverified findings from the CLEAN-12 review, `blocked` for stage 1). Loose end: `package-lock.json` still records `version` 0.3.0. It is outside PHY-33's files, and the next `npm install` rewrites it.

## Known Limitations

**Carried from v1 §4:** #1 (no restitution), #2 (undeclared-contact friction leak), #4 (contact normals are direction-only), #5 (weight arrow at the body origin), #6 (one-way gallery acknowledgement), #7 (StrictMode dev double notice), #8 (click-to-place palette) and #9 (μ edits rebuild) all stand. #3 was resolved in v3 (PHY-15). #10 is partly addressed: `src/test/browser.ts` drives a real Chromium for layout, but the rAF render loop is still not asserted by automation.

**New in v4:**

1. **The rope drains a fast swing**: about 4% of a 1 m loop's energy per turn at v₀² = 6gL, from the velocity projection in `correctRope`. It is marked `ponytail:`, and the upgrade path is a RATTLE-style projection (ADR-0004 Consequences).
2. **Out of scope by spec**: a loose pulley (hung from another rope), rope–pulley friction, axle friction, ropes with mass or elasticity, and compatibility with older documents.
3. **The >500 kB build advisory** remains on the lazy Rapier chunk (2.1 MB). Only the entry chunk was in scope.
4. The readout-panel refinements (the step-0 estimate aside, see PHY-38) wait for the UX polish phase, per the spec.

## Next Steps

Following the v4 spec's roadmap (*Depois da v4*):

- Triage PHY-36, PHY-37, PHY-38 (this pass) and PHY-34.
- Mechanics roadmap, in order: restitution (elastic collisions) → energy, momentum and contact-force readouts (friction arrow, normal magnitude: v1 limitation #4) → pivot, rigid rod, ω₀ → variable force and accelerated frame → gravitation → buoyancy.
- A preset curation stage, with its own grilling, at the end of mechanics.
- A UX polish phase, including the readout panel.
- `/audit` until the repo is in good shape, before publishing.
