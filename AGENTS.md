# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/`. See `docs/adr/` and `docs/agents/domain.md`.

## Build protocol

### Mutate-verify

Every regression test must be verified by mutating the production code it targets (break it on purpose, watch the test fail) before trusting green. A test that passes beside broken or mutated production code is hollow — fix the test, not just the code.

At a DOM or integration seam the check leaves evidence: the ticket records, per new test, the mutation applied and the red output it produced. Green beside unmutated code is not evidence, and a promise that the check ran is not either — a harness can quietly stop touching the thing under test while every assertion still passes. A test that calls the changed function directly needs no record; the red commit already pins it.

## The loop

The build loop is the `ticket-flow` skill, and that skill is its only copy — nothing in this repo restates it. Three stages, one ticket at a time, each fired by hand in a clean session: stage 1 specifies, stage 2 implements test-first, stage 3 reviews and merges.

**A message that opens with a `PHY-NN` key is a work order.** Call `ticket-flow` and dispatch on the ticket's `Stage:` line. Do not ask, and do not dispatch on `Status:` — that is the triage axis, not the loop position.

Which chat runs which stage is `docs/agents/loop.md`; the per-chat model and effort are the agent cards in `.claude/agents/`. Grilling happens only when I ask for it, in the planner chat.

## Bindings do fluxo (skill `ticket-flow`)

- Gate: `npm test && npm run lint && npm run typecheck && npm run build`
- Base branch: `main`
- Models: stage 1 fable, stage 2 sonnet, stage 3 opus

Branches are named `phy/PHY-NN-<slug>` off the base branch.
