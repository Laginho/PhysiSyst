# The chats

**The build loop itself is the `ticket-flow` skill — the only copy. This file
does not restate it.** What lives here is repo-local: which chat runs which
stage, and the boundaries between the roles.

Each chat is a role you reset with `/clear`; nothing is handed off in
conversation, only through the ticket file under `.scratch/<board>/issues/`.
The ticket is the contract, the commit is the handoff.

| Chat | Model / effort | Opens with | Stage of `ticket-flow` |
| --- | --- | --- | --- |
| standup | sonnet / medium | `/standup` | none — board + git state, names the next ticket |
| planner | fable / high | "let's build a new feature" | stage 1 (`grill-me` → `to-spec` → `to-tickets`) |
| executor | sonnet / high | `PHY-NN` | stage 2 (`tdd`) |
| reviewer | opus / high | `PHY-NN` | stage 3 (`code-review`) |
| debug | opus / high | a symptom | none — `/diagnosing-bugs`, files tickets |

Agent cards in `.claude/agents/` pin the model and effort for each — pick the
role when you open the chat. The gate command, base branch and model per stage
are the `## Bindings do fluxo` block in `AGENTS.md`.

## Two axes, two lines

`Stage:` is the loop position and belongs to `ticket-flow`; `Status:` is triage
and belongs to `docs/agents/triage-labels.md`. A ticket carries both, never
folded into one field. Opening a chat with a `PHY-NN` key dispatches on
`Stage:` — the skill's table says how.

## Boundaries

- The executor never designs. A decision the ticket doesn't settle goes back to me, or to the planner chat — never into the implementer's judgement.
- The reviewer never designs either. A spec gap is a reopen, not a rewrite.
- Refactoring outside what the ticket touched is nobody's stage: it becomes its own `CLEAN-*` ticket.
- Grilling happens only when I ask for it in the planner chat. No chat starts an interview off its own bat.
- The debug chat writes tickets (`needs-triage`), never production fixes for work that has a ticket.
