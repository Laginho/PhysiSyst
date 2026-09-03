# TASKS.md â€” physics-sim v1 Â· Build Ledger

Project: physics-sim v1 â€” see [`spec.md`](spec.md), ADR-0001..0003 in [`../../docs/adr/`](../../docs/adr/), glossary in [`../../CONTEXT.md`](../../CONTEXT.md).
Team (FREE lineup): **PLAN** = x-preview-f-free (orchestration) Â· **MAKE** = big-pickle (implementation) Â· **READ** = nemotron-3-ultra-free (review).
Start: 2026-08-23 00:35:10 local.
Environment: local-only, **no git/GitHub** â€” quality gates are enforced through this ledger plus the verification loop below instead of commits/PRs.

## Protocol

1. MAKE implements one task at a time, test-first (Vitest red â†’ green â†’ refactor), using the `/ponytail` skill (minimal-code ladder).
2. Every MAKE change set is verified by READ (code review + full test suite green) before the next task starts.
3. On READ rejection: failure log goes back to MAKE. Max 3 retry loops per task, then mark BLOCKED here, log in LOGS.md, move to next unblocked task.
4. Wall-clock timestamps logged in `LOGS.md` around every dispatch/receipt.
5. Context hygiene: child agents keep sessions per-task where practical; compaction at â‰¥140k tokens when measurable.
6. **Watchdog protocol** (added 2026-08-23 16:20 after triple-stall): (a) PLAN keeps at least one `expectReply` dispatch in flight at ALL times â€” a turn may only end with work outstanding somewhere; (b) any agent receiving ANY message acks within its turn, even one line â€” silence = dead turn; (c) on waking, an agent checks LOGS.md tail age before idling: if >30 min stale and T13 open, it re-dispatches the oldest in-progress item instead of waiting; (d) mechanical backstop: Scheduled Task `PhysicsSimWatchdog` (every 10 min) pops a user alert when LOGS.md goes >30 min stale while FINAL_REPORT.md is absent (`watchdog.ps1`, self-latching, silent once FINAL_REPORT.md exists).
7. **Context hygiene v2** (added 2026-08-23 21:10, supersedes rule 5's passive compaction note): token meters are NOT observable by any team member, so enforcement is procedural â€” (a) MAKE and READ are archived + respawned fresh at every task closure boundary (onboarding brief is scripted, costs one message); (b) PLAN keeps dispatches/report summaries dense, never pastes full transcripts between agents; (c) all durable state lives in TASKS.md/LOGS.md so ANY agent is replaceable without information loss; (d) user may archive/compact PLAN from the UI at any time â€” the objective-summary pattern recovers orchestration state from the ledgers.

## Tasks

### Tier 0 â€” Foundation
- [x] **T0 Â· Scaffold**: Vite + React + TypeScript at repo root, package name `physics-sim`. Vitest wired. Local CI gate = `npm run lint && npm run typecheck && npm test` all green. Acceptance: one smoke test passes; `npm run build` succeeds. âœ… READ PASS (1 iter)

### Tier 1 â€” Domain core (Seams 1 & 2)
- [x] **T1 Â· Scene codec** (Seam 2): versioned Scene document (`constants.g`, `bodies[]`, `forces[]`, `contacts[]`). Parse / serialize / validate with exactly one serialization path. Table-driven tests: valid minimal scene, each invalid mutation â†’ specific error, round-trip identity. âœ… READ PASS (2 iter; iter 1 FAIL â†’ soft-validation policy + `collectWarnings` landed)
- [x] **T2 Â· Simulator seam** (Seam 1 core): Rapier2D (WASM) wrapper â€” `buildWorld(scene)` â†’ step â†’ readback of position/velocity/rotation/contact data. Fixed-timestep, deterministic; speed multiplier scales steps-per-frame, never dt. No React imports. ðŸ”¨ MAKE: M1â€“M3 delivered (52/52 tests, 4/4 gates). READ REJECT (iter 1) 09:45:59: 2 blockers + 1 major + 1 minor â†’ fix loop 1/3 in flight.
- [x] **T3 Â· Physics acceptance suite**: closed-form checks with documented tolerances, public seam only â€” block on incline `a = g(sinÎ± âˆ’ Î¼kÂ·cosÎ±)`; wedge + horizontal `F = (M+m)gÂ·tanÎ±` keeps block stationary relative to wedge (flagship: end-to-end potentials + forces + triangle colliders); projectile parabola/range; perfectly-inelastic collision (momentum + KE dissipation). Free-fall `h(t)` âœ… shipped in T2/M1. *Elastic collisions deferred*: schema has no restitution; spec Out-of-Scope bars the knob; engine default e=0 matches inelastic case â€” v1.x realism opts.

### Tier 2 â€” Editor & playback UI
- [x] **T4 Â· Render layer**: Canvas 2D, worldâ†”screen transform, grid beneath + snap toggle, vector-arrow overlay primitive.
- [x] **T5 Â· Body editing**: element palette drag-drop; shapes rect/circle/triangle; triangle angle handle `Î±`; Fixed toggle; move/rotate/resize handles + exact numeric entry in properties panel; duplicate/delete; optional snap-to-grid. ðŸš€ M1 dispatched 14:00:40 (selection/hit-test/drag + properties + duplicate/delete); M2 queued (palette, handles, Î± handle, snap).
- [x] **T6 Â· Forces, contacts, constants, validation** ✅ READ PASS iter 2 (1 REJECT → force-ref immutability: ForcePatch Omit bodyId + addForce existence guard 'corpo inexistente'; layering doctrine in doc.ts header). 142/142 tests.
- [x] **T7 - Playback**: play/pause/reset; speed 0.25x-2x; single-frame step; live value edits (forces/g) mutate running world; structural edits rebuild w/ carry at frame boundary; particle mode locks rotation scene-wide; viewport-exit verified (no invisible walls). READ PASS: M1 iter 2, M2 iter 2 (2 REJECTs -> transactional replaceScene + commit-on-success rebuild flags).
- [x] **T8 - Observation**: readout panel (per-body pos/vel/acc); live force vectors (weight at COM, normals at contact points, applied forces at anchors). READ PASS iter 3 (2 REJECTs -> elapsed-carry AccelTracker consumer w/ revert-failing regression; world-space contact fallback). 261/261 tests.

### Tier 3 â€” Scenes over time, presets, language
- [x] **T9 - Persistence**: autosave to localStorage keyed per Scene; multi-scene switcher; export/import .json through the same codec path as loading. READ PASS iter 6 (5 REJECTs - debounce/transition semantics, delete ordering, corrupt-index handling, adapter fidelity). 301/301 tests.
- [x] **T10 - Presets**: gallery on first open; preset #1 = wedge pushed by horizontal force (classic figure, hatched ground); blank-canvas always available. READ PASS iter 3 (2 REJECTs -> simulator-stepped flagship pin w/ tangency guards + persisted gallery-ack flag). 308/308 tests.
- [x] **T11 - i18n**: message catalogs pt-BR default + EN secondary; accurate physics terminology consumed by real labels; universal symbols. READ PASS iter 3 (2 REJECTs). 329/329 tests.

### Tier 4 â€” Close-out
- [ ] **T12 Â· Device pass**: mobile playback path verified manually (open preset â†’ play â†’ tweak slider via touch); desktop editing pass; checklist recorded here. No UI/e2e automated tests in v1 (spec).
- [x] **T13 - FINAL_REPORT.md**: executive summary, aggregated time ledger from LOGS.md, effort breakdown (build vs test/review), known limitations and next steps. Composed by PLAN directly from READ-approved ledger rows (no production code changed; no separate gate needed). T12 recorded as pending-user.

## Status

| Task | Status | Notes |
|---|---|---|
| T0 | ✅ done | READ PASS, 1 iteration (1 silent-turn retry). React 19 · Vite 8 · TS 6 strict · Vitest 4. |
| T1 | ✅ done | READ PASS iter 2 (iter 1 FAIL → soft-validation + `collectWarnings`). |
| T2 | ✅ done | READ PASS iter 3 (2 REJECTs → solver exactness rewrite, force-ID hard error, warnings reset, **ADR-0003 addendum** amending friction contract). Public seam: {TIMESTEP, createSimulator, BodyState, Simulator}. 63/63 tests. |
| T3 | ✅ done | READ PASS iter 2. 71 tests; five closed-form families incl. wedge flagship. Carry-forwards: origin-relative anchor contract, triangle centroid rule (→T7), elastic deferred (v1.x), doc-rebuild resets state (→T7 decision). |
| T4 | ✅ done | READ PASS iter 3 (2 REJECTs → honest [40,100) grid envelope + drawGrid ppm=0 hang guard). Pure transform, zero-dep Canvas2D, DPR-aware App w/ demo scene. Resize handling deferred to polish pass. |
| T5 | ✅ done | READ PASS iter 3 (2 REJECTs → id-patch type narrowing + origin-snap semantics + duplicate-branch cleanup). Full body editing incl. palette, handles, α handle, snap. Click-to-place vs story-1 letter noted for FINAL_REPORT. M1+M2: 131/131 tests. |
| T6 | ✅ done | READ PASS iter 2 (1 REJECT → force bodyId immutable at type level + addForce runtime guard; layering doctrine: editor guards = user-actionable structural only, codec = value boundary). ForcesPanel/ContactsPanel/g/warnings live. 142/142 tests. |
| T7 | done | READ PASS both milestones (M1 iter 2, M2 iter 2; 2 REJECTs fixed). Playback: pure scheduler (fractional accumulator), carryOver rebuild policy, transactional replaceScene, commit-on-success rebuild flags in App, live routing classifier (forces/g live; mu/membership/geometry/particleMode structural), particle mode w/ post-carry relock, viewport-exit verified. 242/242 tests, playback coverage 100% st/fn/lines. |
| T8 | done | READ PASS iter 3 (2 REJECTs: accel divisor at multi-step speeds -> pure AccelTracker consumer owning elapsed, App delegates 4 lifecycle points, revert-failing regression; local->world fallback conversion). readContacts seam (flipped-normal corrected, deduped), fixed-length normals ratified, WEIGHT_SCALE .08 m/N, global overlay toggle, 100ms ref poll. 261/261 tests. Tier 2 CLOSED. |
| T9 | done | READ PASS iter 6 (5 REJECTs fixed: flush-on-explicit-transition chokepoint switchToScene, dirty-compare updatedAt, payload-first+rollback w/ amber surfacing, discriminated loadIndex ok/missing/corrupt w/ composed deduped notices, makeAppLike seed/hydration adapters over shared DEMO_SCENE module). DebouncedSaver 400ms, single codec path, pt-BR import reasons. 301/301 tests. |
| T10 | done | READ PASS iter 3 (2 REJECTs: sim pin settle-masking -> doc-level 1e-9 placement + tick-1 <=2mm guards; gallery length===1 heuristic -> persisted physics-sim:galleryAck). Flagship verified in-simulator by READ SSR replay (drift .022mm @1s). 4 presets codec-built, createPresetScene payload-first w/ rollback. 308/308 tests. |
| T11 | done | READ PASS iter 3 (2 REJECTs: hollow fallback pin -> fixture-deleted EN key; EN-mode pt-BR leaks -> doc-op reasons keyed via t(); terminology bypass -> muS/muK/particleMode labels compose terms render-pinned; stale-language warning -> corruptWarningKey structured translated at render). Catalogs 81 keys each. 329/329 tests. Tier 3 CLOSED. |
| T12 | pending USER | Checklist posted by PLAN (10 mobile-touch + 8 desktop items). User deferred execution at T11 closure. On results: PASS items close v1; FAIL items route to MAKE as fix loops. |
| T13 | done | FINAL_REPORT.md written at repo root 19:40 host. Executive summary, scope table T0-T11 w/ test counts, gate-outcome table (22 REJECTs resolved), team/ops record, honest time caveat (mixed clocks, overnight outage), 10 known limitations, next-steps list incl. formalizing mutate-verify rule. |
