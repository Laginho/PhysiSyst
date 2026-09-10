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
