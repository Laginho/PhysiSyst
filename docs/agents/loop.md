# The loop

Five chats, one board, one status line. Each chat is a role you reset with `/clear`; nothing is handed off in conversation, only through files under `.scratch/<board>/`.

| Chat | Model / effort | Opens with | Does |
| --- | --- | --- | --- |
| standup | sonnet / medium | `/standup` | Board + git state, names the next ticket |
| planner | fable / high | "let's build a new feature" | `grilling` → `to-spec` → `to-tickets` |
| executor | sonnet / high | `PHY-NN` | `/tdd` the ticket, commit |
| reviewer | opus / high | `PHY-NN` | `/code-review`, then PR / fix / bounce |
| debug | opus / high | a symptom | `/diagnosing-bugs`, files tickets |

Agent cards in `.claude/agents/` pin the model and effort for each — pick the role when you open the chat.

## Status ladder

The `Status:` line in `.scratch/<board>/issues/PHY-NN-*.md` is the only state. It says which chat owns the ticket:

```
ready-for-agent  →  ready-for-review  →  ready-for-human  →  merged
   executor            reviewer            human merges
```

- `ready-for-agent` — specified, nobody has implemented it. Executor's.
- `ready-for-review` — implemented and committed on its branch. Reviewer's.
- `ready-for-human` — PR is open with review fixes applied; a human reads it before merge.
- `merged` — PR squashed into main. Done.
- Bounced tickets go back to `ready-for-agent` with a `Round: 2` line and the findings appended. Same chat as round 1, fresh context.

A round of reviewer-applied fixes is a step inside the reviewer's turn, not a resting state — there is no `ready-to-refactor` for a chat to pick up. `needs-triage` / `needs-info` / `wontfix` from `triage-labels.md` still apply to anything not yet specified.

## Opening a chat with `PHY-NN`

Read the ticket. Its `Status:` decides what happens, and you do it without asking:

- **`ready-for-agent`** → you are the executor. Branch `phy/PHY-NN-<slug>` off main, run `/tdd` against the seams the ticket names, one checkbox at a time, mutate-verifying every regression test (AGENTS.md build protocol). Four gates — `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` — then commit `feat(scope): summary (PHY-NN)`. Tick the boxes, set `Status: ready-for-review`, stop. Do not review your own work.
- **`ready-for-review`** → you are the reviewer. `/code-review` with `main` as the fixed point and the board's `spec.md` as the spec source. Then triage your own findings:

  | Findings | Action |
  | --- | --- |
  | none | push, `gh pr create`, wait for CI, `gh pr merge --squash --delete-branch`, `Status: merged` |
  | few | fix them test-first, push, open the PR, `Status: ready-for-human`, do not merge |
  | many | append findings to the ticket, `Status: ready-for-agent`, `Round: 2`, tell me to take it to the executor chat |

  **few** = fixes you can make inside the existing seams without new behaviour: naming, dead code, a missing edge-case test, a duplicated helper. **many** = anything that needs a new seam, contradicts `spec.md`, or leaves a checkbox honestly unticked. One finding of that kind is "many"; ten cosmetic ones are still "few". Merging with red gates or red CI never happens.
- **`ready-for-human` / `merged`** → say so and stop. Nothing to do.
- **Status missing or contradicted by `git log --grep PHY-NN`** → say what you found and ask. Don't guess.

## Boundaries

- The executor never designs. A decision the ticket doesn't settle goes back to me, or to the planner chat — never into the implementer's judgement.
- The reviewer never designs either. A spec gap is a bounce, not a rewrite.
- Grilling happens only when I ask for it in the planner chat. No chat starts an interview off its own bat.
- The debug chat writes tickets (`needs-triage`), never production fixes for work that has a ticket.
