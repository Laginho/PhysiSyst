# PHY-41: Cordas ligadas por um corpo dinâmico resolvidas juntas
Stage: to-implement
Status: ready-for-agent
Blocked by: none
Review: agent

- Primary files:
  - `src/sim/simulator.ts` (o laço de cordas do `step`: `pullRope`/`pullPieces`, `correctRope`/`correctPieces`, `tautTensions`)
  - `src/sim/acceptance.test.ts` (bloco da corda geral, PHY-24)
  - `docs/adr/0004-rope-as-own-constraint-around-world-step.md` (a consequência "ropes on shared bodies are solved one after another")

#### What to build

Cordas diferentes que puxam o mesmo corpo são resolvidas uma depois da outra, com uma passada por passo (Gauss–Seidel de uma iteração). A corda seguinte muda o movimento que a anterior tinha assumido, e as duas tensões nunca são resolvidas juntas. O ADR-0004 aceitou isso e deixou um plano B: iterar a correção antes de mudar o mecanismo. O Sol mostrou que 20 iterações da correção ainda erram 33,6 mm, então o plano B não basta.

O caso é clássico de livro-texto, um corpo pendurado por dois fios. O Sol reproduziu, e eu confirmei com probe no motor real. O cenário é uma partícula de 1 kg parada em (0, 0), duas cordas retas até âncoras fixas em (−1; 0,1) e (1; 0,1), e `g = 9,81`. O equilíbrio exige 49,29 N em cada corda. Ao longo de 300 passos a partícula se afasta até **32,99 mm**. As tensões oscilam, e no passo 300 elas mostram 0,00 e 0,29 N.

As cordas que compartilham um corpo dinâmico formam um grupo, e cada grupo resolve suas tensões num único sistema, na predição e na correção. Cada corda sem polia com massa entra como uma peça; as peças de uma corda com polias com massa entram como já entram hoje. É o `K` matricial com active set que o `tautTensions` já usa para as peças de uma corda (PHY-25), estendido ao grupo. Uma corda sozinha, ou cordas ligadas só por corpos fixos, resolvem exatamente como hoje.

#### Acceptance criteria

1. No cenário acima, ao longo de 300 passos, a partícula fica a menos de 1 mm de (0, 0). Do passo 10 em diante, cada corda mostra `T` a menos de 1% de 49,29 N, e nenhuma aparece como `slack`
2. Os testes de aceitação existentes de corda e polia (PHY-23, PHY-24, PHY-25) continuam verdes sem mudar tolerância
3. O ADR-0004 descreve o solve por grupo e retira o plano B de iterar a correção
4. Os testes de regressão são mutate-verified conforme o `AGENTS.md`
5. Gate verde

#### Verification

    npx vitest run src/sim/acceptance.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, bloco PHY-24: o cenário do critério 1. Vermelho porque o solve sequencial deixa a partícula oscilar 33 mm.

## Comments

- 2026-09-30 Aberto a partir do F2 do Sol no review de benchmark do PR 9. Números reproduzidos por probe descartável no motor real. A decisão de juntar as cordas num solve e emendar o ADR, em vez de documentar como limitação, é do grilling de 2026-09-30.

- 2026-09-30 Attempt 1 stopped to ask: Implementação salva em `9b76293`; gate verde com 720 testes. PHY-41 ficou `blocked`: o teste não detecta a volta da correção sequencial. /  / A [skill ticket-flow](/C:/Users/bruno/.agents/skills/ticket-flow/SKILL.md) exige parar quando “a test proves wrong after being committed”. Evidências registradas no ticket; sem merge.

- 2026-09-30 Proxy decided: manter o teste PHY-41 como está e retomar de `refs/foreman/phy-41-attempt1` (`43724f9` vermelho, `9b76293` verde) até `to-review`, sem novo teste vermelho — a mutação "correção sequencial, predição por grupo" é equivalente frente aos critérios (partícula totalmente restrita: a correção faz trabalho ~0 e nenhuma tolerância mais apertada que a atual a separa do solve conjunto); o teste mata a regressão que mira (solve sequencial, 33 mm), e o mutate-verify da tentativa, com o sobrevivente registrado como equivalente, cumpre o critério de mutate-verify. Contrato inalterado.
