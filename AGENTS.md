# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Build protocol

### Mutate-verify

Every regression test must be verified by mutating the production code it targets (break it on purpose, watch the test fail) before trusting green. A test that passes beside broken or mutated production code is hollow — fix the test, not just the code.

## The loop

Work runs through five chats — standup, planner, executor, reviewer, debug — each reset with `/clear`, handing off only through the ticket's `Status:` line. The protocol is `docs/agents/loop.md`; the per-chat model and effort are the agent cards in `.claude/agents/`.

**A message that opens with a `PHY-NN` key is a work order.** Read that ticket and act on its `Status:` without asking: `ready-for-agent` → implement it with `/tdd` on branch `phy/PHY-NN-<slug>`; `ready-for-review` → `/code-review` it, then merge, fix-and-ask, or bounce it per the table in `docs/agents/loop.md`; anything else → say who owns it and stop.

Grilling happens only when I ask for it, in the planner chat.
