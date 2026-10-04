# Interventions

| When | Ticket | Kind | Evidence |
|---|---|---|---|
| 2026-10-03T17:44 | PHY-70 | automatic-recovery | Attempt 1 failed on the Codex sandbox (`CreateProcessWithLogonW failed: 1909`); the driver saved `refs/sweatshop-recovery/ad1efb89c9854f53be7304aa1a0d24c5` (7a594f9) and retried by itself. `run-log/foreman-notes.md` 17:44 |
| 2026-10-03T19:27 | PHY-69 | proxy-decision | `src/App.test.ts` added to Primary files, limited to the gallery expectation for `Mecânica / Dinâmica / Colisões`. Commit 233fb02. Asked branch renamed to `asked/phy69-*` to work around the driver's lookup bug |
| 2026-10-03T19:27 | PHY-70 | proxy-decision | Approved the `readPulleys: () => []` edit to the fake in `src/App.test.ts`, with the file kept in Primary files. Commit f86e802 (on the ticket branch, merged in e344daf) |
| 2026-10-03T19:28 | - | automatic-recovery | The driver was killed at 18:18 by Claude Code's 2 h limit on background tasks, during the PHY-70 review. Nothing to restore (the branch still read `to-review`). Relaunched detached with `Start-Process` after Bruno's explicit authorization. `run-log/foreman-notes.md` 18:18 and 19:28 |
| 2026-10-03T20:24 | CLEAN-30 | proxy-decision | Energy and momentum come from a state derived from the document, not from `readout.noData`. Commit f847b12. The ticket stays `blocked` until stage 1 writes its criteria |
| 2026-10-03T20:26 | PHY-72 | proxy-decision | Body energy has 3 curves without `E_el`; the system adds `E_el` only when there are springs; the browser test joins Primary files. Commit 221000f. The foreman's note "retomar da branch asked" pointed at a branch with no code whose ticket still read `blocked`, which wasted one stage ($0.457). Fixed in 8c7bfea |
| 2026-10-03T21:38 | PHY-74 | proxy-decision | Stage 2 runs the 8-item desktop pass itself in headless Chromium through `src/test/browser.ts`, following the PHY-33 precedent. Commit 29a13ae. Asked branch renamed to `phy/PHY-74-closeout-v6` (it held the code) and the session merged into it (dcd8e22) |
