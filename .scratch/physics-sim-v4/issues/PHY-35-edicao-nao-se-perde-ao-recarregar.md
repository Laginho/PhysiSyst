# PHY-35: Edição feita logo antes de recarregar ou fechar a aba não se perde
Stage: implementing
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
