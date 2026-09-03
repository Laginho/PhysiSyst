# 10: Drag-to-trash

**What to build:** While a Body drag is active, a trash target renders in a canvas corner; dropping the dragged Body on it deletes it — its applied forces and Contacts go with it (the existing remove-with-dependents behavior). The trash target is invisible when not dragging. Panel buttons stay.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Dragging a Body reveals the trash target in a canvas corner; it is hidden when no drag is active
- [ ] Dropping the dragged Body on the target removes the Body, its applied forces, and its Contacts
- [ ] Dropping anywhere else places the Body normally (contact snap rules still apply)
- [ ] The panel's duplicate/excluir buttons continue to work
- [ ] Deletion during paused playback routes through the structural rebuild with carry-over (no trajectory reset beyond the removal)
- [ ] New UI strings exist in both the pt-BR and EN catalogs (parity tests green)
- [ ] Regression tests are mutate-verified per the AGENTS.md build protocol
- [ ] All four gates green (`test`, `lint`, `typecheck`, `build`)
