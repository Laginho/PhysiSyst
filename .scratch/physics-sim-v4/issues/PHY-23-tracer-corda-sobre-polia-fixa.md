# PHY-23: Tracer — corda sobre uma polia fixa
Stage: blocked
Status: ready-for-agent
Blocked by: none
Review: human

- Primary files:
  - `src/scene/types.ts` (`Pulley`, `Constraint` com o ramo `rope`, coleções `pulleys` e `constraints` na Scene)
  - `src/scene/codec.ts`, `src/scene/codec.test.ts`
  - New: `src/scene/ropePath.ts`, `src/scene/ropePath.test.ts` (caminho tangente + comprimento, puro)
  - `src/scene/index.ts` (reexports)
  - `src/sim/simulator.ts`, `src/sim/index.ts`
  - `src/sim/acceptance.test.ts`
  - `src/playback/routing.ts`, `src/playback/routing.test.ts`
  - `src/editor/doc.ts` (`removeBodyAndDependents`), `src/editor/doc.test.ts`
  - `src/render/draw.ts` (desenho mínimo de corda e polia)
  - New: `docs/adr/0004-<slug>.md`

#### What to build

Uma cena importada por JSON com dois corpos ligados por uma corda que passa por uma polia fixa roda com a física certa: a máquina de Atwood e o bloco na mesa puxado por um bloco pendurado (com μₖ na mesa) aceleram como no livro, e a tração lida do simulador bate com a analítica. A corda e a polia aparecem no canvas (segmentos retos tangentes + círculo). Não há ferramenta de editor ainda.

Este ticket decide a arquitetura do vínculo. A corda é código nosso rodando em volta do `world.step()` (o Rapier 0.20 não tem polia nem devolve força de junta). O risco é o vínculo não convergir junto com contato e atrito. Se as famílias abaixo não passarem na tolerância, **não force**: `Stage: blocked` com as medições em `## Comments` — a decisão de reabrir o ADR-0001 é humana.

Schema (spec, seção Schema): `pulleys: { id, bodyId, anchor, radius, mass? }[]`, `constraints: ({ id, kind: 'rope', a: End, b: End, via: pulleyId[] } | …)[]`, `End = { bodyId, anchor }`. A corda não guarda comprimento: `L` sai do caminho nas posições do documento. Neste ticket o codec aceita apenas corda com exatamente uma polia montada em Corpo fixo; o resto é rejeitado com mensagem clara até PHY-24.

#### Acceptance criteria

1. `parse`/`serialize` fazem round-trip de `pulleys` e `constraints` (corda); documentos sem essas chaves parseiam com coleções vazias
2. O codec rejeita: polia em corpo inexistente, ponta de corda em corpo inexistente, `via` com polia inexistente, `radius ≤ 0`, e (temporário, até PHY-24) corda com `via.length ≠ 1` ou com polia em Corpo não fixo
3. `ropePath` devolve o caminho (segmentos tangentes às polias + arcos) e o comprimento; o lado do contorno sai da geometria entrada→saída; casos: simétrico, assimétrico, polia com raio grande
4. Atwood (m₁ ≠ m₂, pendurados de uma polia fixa): `a = (m₁−m₂)g/(m₁+m₂)` e `T = 2m₁m₂g/(m₁+m₂)` dentro de 2%, medidos em 1 s
5. Bloco na mesa (μₖ declarado no Contact) puxado por bloco pendurado: `a = (m₂ − μₖm₁)g/(m₁+m₂)` e `T = m₂(g − a)` dentro de 5%
6. O comprimento do caminho fica a menos de 1 mm de `L` enquanto a corda está esticada, durante todo o teste
7. O Simulator expõe uma leitura dos vínculos com `T` por corda; é ela que os critérios 4 e 5 verificam
8. `replaceScene` com carry no meio do movimento mantém o `L` do documento (t=0), não o das posições carregadas
9. Toda mudança em `pulleys` ou `constraints` roteia como estrutural
10. `removeBodyAndDependents` remove as polias montadas no corpo, as cordas presas a ele e as cordas que passam por essas polias
11. Verificação live em browser: importar a cena de Atwood por JSON, play, corda e polia desenhadas, massas se movem no sentido certo
12. `docs/adr/0004-*.md` registra o mecanismo escolhido, por que não a junta de corda do Rapier, e os erros medidos nos critérios 4–6
13. Testes de regressão mutate-verified conforme o `AGENTS.md`
14. Gate verde

#### Verification

    npx vitest run src/scene src/sim src/playback/routing.test.ts src/editor/doc.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/scene/codec.test.ts`: round-trip e rejeições (critérios 1–2). Vermelho porque a Scene não tem `pulleys`/`constraints`.
- `src/scene/ropePath.test.ts`: caminho e comprimento (3). Vermelho porque o módulo não existe.
- `src/sim/acceptance.test.ts`: Atwood, mesa + pendurado, conservação de `L`, `L` sob carry (4–8). Vermelho porque o simulador ignora cordas.
- `src/playback/routing.test.ts`: vínculo → estrutural (9). Vermelho porque o roteador não olha as coleções novas.
- `src/editor/doc.test.ts`: dependentes (10). Vermelho porque a remoção não conhece polias nem cordas.

## Comments

- 2026-09-24 Review ended at to-review (exit 0); branch phy/PHY-23-tracer-corda-sobre-polia-fixa holds the review; left for a human
