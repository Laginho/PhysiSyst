# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/PHY-<NN>-<slug>.md`, never a single combined tickets file
- **The ticket key is `PHY-<NN>`: repo-global, immutable, zero-padded to two digits.** The counter never restarts per feature and a number is never reused, so `PHY-07` names exactly one ticket in the whole repo. To pick the next key, take the highest `PHY-NN` anywhere under `.scratch/` and add one
- The feature/board is the directory, never part of the key — a ticket that moves boards keeps its key, so every commit and PR that cites it stays true
- The first line of the file is `# PHY-<NN>: <Title>`; commits, PRs and comments refer to tickets as `PHY-<NN>`
- Two state lines sit near the top of each issue file, and they are never merged into one:
  - `Stage:` — the position in the build loop (`to-implement`, `implementing`, `to-review`, `reviewing`, `to-merge`, `done`, `blocked`). Owned by the `ticket-flow` skill, which also owns the ticket body shape: `Primary files`, `#### What to build`, numbered `#### Acceptance criteria`, `#### Verification`, `## Tests stage 2 writes`
  - `Status:` — triage state (see `triage-labels.md` for the role strings)
- The key doubles as the filename's positional prefix: the `PHY-NN` counter is repo-global and issued in dependency order when a board opens, so `PHY-<NN>-<slug>.md` already sorts the board. No separate `<NN>-` prefix
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- Closed tickets get one line each in `.scratch/<feature-slug>/ledger.md`, a `| Data | ID | Commit |` table, written in the same commit that sets `Stage: done`

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the key directly. Given nothing but a key, find it with `grep -rl 'PHY-14' .scratch/`; the next free key is one past `grep -rhoE 'PHY-[0-9]+' .scratch/ | sort -t- -k2 -n | tail -1`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/PHY-<NN>-<slug>.md`, keyed off the same repo-global counter, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: PHY-NN, PHY-NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by key wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
