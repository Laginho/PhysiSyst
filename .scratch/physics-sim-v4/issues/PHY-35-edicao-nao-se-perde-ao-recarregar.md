# PHY-35: Edição feita logo antes de recarregar ou fechar a aba não se perde
Stage: done
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/App.tsx` (o efeito do autosave: gravar o pendente no `pagehide`)
  - `src/App.test.ts`
  - `src/test/browser.ts` (`reset()`: storage must be cleared after the app's pagehide flush)

#### What to build

O autosave espera `AUTOSAVE_DELAY_MS` (400 ms) depois de cada edição. O pendente só é gravado explicitamente na troca e na remoção de cena. Se a página for embora antes do timer (F5, fechar a aba ou o reload automático que o CLEAN-01 faz depois de uma falha de chunk), a última edição some sem aviso.

Ao sair da página, o autosave pendente é gravado de forma síncrona. `DebouncedSaver.flush()` já faz isso, e só falta chamá-lo no `pagehide`. O listener sai junto com o componente.

#### Acceptance criteria

1. Editar a cena e disparar `pagehide` antes de 400 ms deixa a cena editada gravada no storage
2. Sem edição pendente, `pagehide` não grava nada, e o payload repetido continua deduplicado como hoje
3. O listener é removido no unmount (um `pagehide` depois do unmount não grava)
4. Teste de regressão mutate-verified conforme o `AGENTS.md` (sem o listener, o teste do critério 1 fica vermelho)
5. Gate verde

#### Verification

    npx vitest run src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: edita a cena, dispara `pagehide` em `window` antes de avançar 400 ms e confere a cena gravada no storage (critérios 1–3). Vermelho porque nada escuta `pagehide`.

## Comments

- 2026-09-24 Aberto a partir do achado 3 que o review do PHY-23 deixou no CLEAN-01, mais amplo do que o review descreveu: não existe flush no `pagehide`, então o F5 e o fechar da aba também perdem a última edição, não só o reload do CLEAN-01.
- 2026-09-25 Proxy decided: add `src/test/browser.ts` to Primary files and fix `reset()` in its own test-only commit before the code commit — the PHY-35 fix invalidates the harness's "clear storage after load = fresh app" assumption (navigating away now flushes the last drag), so this is a Primary-files blank, not a new seam, and it's reversible. Evidence: with the fix and without the harness change, `src/App.browser.test.ts` is 8/10 (PHY-18 "drops at the same world position…" at 1280 and 1920: `missing caixa panel`); with it, 10/10. A CDP `Storage.clearDataForOrigin` from about:blank raced the flushed write and stayed red.
- 2026-09-25 Mutate-verify (stage 2), each run `npx vitest run src/App.test.ts -t PHY-35` against the fix with one mutation applied:
  - No `window.addEventListener('pagehide', flush)`: "uma edição feita antes dos 400 ms…" red, `expected [ 'chao' ] to include 'retangulo'`; "depois do unmount…" red, `expected 0 to be greater than 0`.
  - Cleanup returns `() => {}` (listener never removed): "depois do unmount…" red, `expected [] to deeply equal ArrayContaining [[Function flush]]`. The behaviour half of that test cannot see a leaked listener (unmount cancels the pending save), so it also checks the add/remove pairing on `window`.
  - Dedupe line `if (lastSavedRef.current.get(id) === payload) return` removed: "sem edição pendente o pagehide não grava nada" red, `expected "setItem" to not be called at all, but actually been called 2 times`.

#### Resolution (2026-09-25)

Verdict: Approve

Findings:

- Critério 1 ✅ — o teste clica em `retângulo` com fake timers parados, dispara `pagehide` em `window` e lê a cena de volta com `loadScene` de produção.
- Critério 2 ✅ — as duas metades estão lá: a primeira `pagehide` logo após o mount é o caso deduplicado (o schedule do mount está pendente e `lastSavedRef` corta), a segunda depois de avançar 400 ms é o caso sem pendente. Nenhum `setItem` nas duas.
- Critério 3 ✅ — o `pagehide` depois do unmount não grava; como o unmount cancela o pendente e isso sozinho não vê listener vazado, o teste também confere o par add/remove em `window`. Documentado no teste e no ticket.
- Critério 4 ✅ — as três mutações do ticket reproduzidas nesta revisão com o mesmo vermelho: sem `addEventListener` → 2 failed (`expected [ 'chao' ] to include 'retangulo'`, `expected 0 to be greater than 0`); cleanup `() => {}` → 1 failed (`expected [] to deeply equal ArrayContaining [[Function flush]]`); sem a linha de dedupe → 1 failed (`setItem … called 2 times`).
- Critério 5 ✅ — gate verde (abaixo).
- Test-first ✅ — `67d8785` (só `src/App.test.ts` + ticket) e `3d27133` (só `src/test/browser.ts` + ticket) antes do fix; o commit de código `e5894f0` toca só `src/App.tsx` e o ticket. Tudo dentro dos Primary files.
- Regressão: nenhuma. `flush()` é síncrono e mantém o dedupe; o `[]` do efeito é correto porque `saverRef` é um ref estável. Com bfcache (`pagehide` persisted + `pageshow`) nada se perde: o pendente foi gravado e o doc não mudou.
- Proxy decided (1): `src/test/browser.ts` nos Primary files e `reset()` corrigido em commit só de teste antes do código. Consistente: sem isso, o `pagehide` da navegação gravava o último drag e o load seguinte o lia (PHY-18 8/10). O listener do harness é registado no início do `reset()` seguinte, numa página já carregada e settled, por isso corre depois do da app.
- Standards: sem violações. Um tidy opcional pré-existente (`storage()` cast repetido seis vezes em `src/App.test.ts`) fica fora do ticket; não justifica CLEAN.

Files: `src/App.tsx` (efeito `pagehide` → `saverRef.current?.flush()`, removido no unmount), `src/App.test.ts`, `src/test/browser.ts`.

Red-green: mutação 1 acima é o estado sem o fix: `npx vitest run src/App.test.ts -t PHY-35` → 2 failed | 1 passed. Com o fix: 3 passed.

Gate: `npm test` 30 files, 707 passed; `npm run lint` limpo; `npm run typecheck` limpo; `npm run build` ok (aviso de chunk > 500 kB pré-existente).

Merged into `sweatshop/2026-09-24-1853` at `9b902f0`.
