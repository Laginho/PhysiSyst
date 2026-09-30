# PHY-39: Edição estrutural só com `passos = 0`
Stage: blocked
Status: ready-for-agent
Blocked by: none
Review: human

- Primary files:
  - `src/App.tsx` (os caminhos que mudam o documento: `commitDoc`, os `setDoc` do arrasto, `undo`/`redo`, `deleteSelected`, ferramentas e inspetores; a linha de dica)
  - `src/App.test.ts`
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts` (a mensagem nova)
  - `src/playback/routing.ts` (só se a guarda precisar de um predicado exportado sobre `routeDocChange`)
  - `src/playback/integration.test.ts`, `src/playback/rebuild-retry.test.ts` (só os casos que fazem edição estrutural com `passos > 0` pelo App)

#### What to build

Hoje qualquer edição estrutural pode ser feita no meio de uma corrida, rodando ou pausada. O rebuild então mistura duas referências: o corpo editado vai para a pose do documento, e os outros continuam na pose viva pelo `carryOver`. Os vínculos, por sua vez, são medidos nas poses do documento (ADR-0004: `L` da corda; PHY-27: `x₀` da mola). O resultado é física errada, e o review do PR 9 (2026-09-30) mediu dois casos:

- **Arrastar a ponta de uma corda no meio da simulação** (achado do Opus, confirmado com probe no motor real). O cenário é a Atwood 3/2 depois de 30 passos, com o corpo arrastado 1 cm e retirado do carry.
  - Arrastando o bloco `a`, a corda fica frouxa para sempre (`T = 0`, `slack`).
  - Arrastando o bloco `b`, a tensão vai a `T = 265,1 N` num passo, contra 23,54 N da forma fechada. Depois fica frouxa por 4 passos.
- **Mola ou corda criada depois que a corrida andou** (CLEAN-13 item 1, confirmado no Chromium pelo Sol). A parede está em (2, 4) e o bloco sai de (5, 4) a 2 m/s. Depois de 30 passos, uma mola ligando os dois centros nasce com `x₀ = 3`, embora a separação na tela seja 4 m. No passo seguinte ela mostra `F_el = 20,60 N`.

Decisão do grilling (2026-09-30): **o documento em t = 0 é o enunciado do problema.** Com `passos > 0`, rodando ou pausado, nenhuma edição estrutural passa. A dica diz para reiniciar (⟲). As edições ao vivo continuam liberadas no meio da corrida, porque não têm inconsistência: módulo, direção e ponto de aplicação de força existente, e `g`. Qual edição é "ao vivo" e qual é "estrutural" é exatamente o que `routeDocChange` já classifica; a guarda usa essa classificação e não inventa outra.

A guarda fica num lugar só, por onde passam todos os caminhos que mudam o documento. Isso inclui arrasto de corpo (mover, girar, redimensionar, `alpha`), ferramentas (corpo, força, polia, corda, mola, contato), Delete pelo teclado e pelo botão, campos estruturais dos inspetores (massa, `v₀`, geometria, atrito, `k`, `x₀`, `c`, `mₛ`) e undo/redo de um passo estrutural. Os controles correspondentes aparecem desabilitados enquanto `passos > 0`. Um caminho que só dá para barrar na hora (um arrasto, um atalho) é recusado com a mensagem na linha de dica.

Trocar de cena, importar, nova cena e ⟲ continuam liberados sempre, porque zeram `passos`.

#### Acceptance criteria

1. Com `passos > 0`, rodando ou pausado, nenhuma edição estrutural chega ao documento pelos caminhos listados acima. O documento fica o mesmo objeto, e a linha de dica mostra a mensagem nova (pt-BR: "reinicie (⟲) para editar"; en: "reset (⟲) to edit")
2. Com `passos > 0`, as edições ao vivo continuam aplicando no mundo rodando: módulo e direção de força existente, arrasto do ponto de aplicação de força e `g`
3. Com `passos = 0` (boot, depois de ⟲, depois de uma troca de cena), todas as edições funcionam como hoje
4. Os controles de edição estrutural têm `disabled` enquanto `passos > 0` e voltam depois de ⟲: botões de ferramenta, botão de excluir, campos estruturais dos inspetores. Undo/redo ficam desabilitados quando o passo que eles aplicariam é estrutural
5. Seleção e leituras (painel do corpo, tensões, forças) continuam funcionando com `passos > 0`
6. No preset Atwood, depois de 30 passos, tentar arrastar `bloco-1` deixa o documento intacto, e a tensão da corda no passo seguinte fica a menos de 1% de `2m₁m₂g/(m₁+m₂)`
7. Os testes existentes que fazem edição estrutural com `passos > 0` pelo App são reescritos no commit vermelho para assertar a recusa. O ticket registra cada um
8. Os testes de regressão são mutate-verified conforme o `AGENTS.md` (seam de DOM: mutação e saída vermelha registradas por teste)
9. Gate verde

#### Verification

    npx vitest run src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/App.test.ts`: dar passos, tentar arrastar um corpo, usar a ferramenta de mola e apertar Delete; o documento não muda e a dica aparece. Vermelho porque hoje as três edições passam.
- `src/App.test.ts`: com `passos > 0`, mudar o módulo de uma força e `g` ainda chega ao mundo. Verde hoje, e tem que continuar verde; a mutação que prova o teste é uma guarda que também recuse edições ao vivo.
- `src/App.test.ts`: o cenário do critério 6 (Atwood, 30 passos, tentativa de arrasto, `T` no passo seguinte). Vermelho hoje: 265 N ou `T = 0`.
- Os testes existentes do critério 7, reescritos.

## Comments

- 2026-09-30 Aberto a partir do review de benchmark do PR 9 (Sol, Sonnet, Opus em sessões dedicadas). Junta o F1 do Opus (corda) e o CLEAN-13 item 1 (mola), que eram o mesmo defeito: a edição estrutural no meio da corrida mistura a pose do documento com a pose viva. A trava foi decidida no grilling com o dono. `Review: human` porque é uma mudança de comportamento do editor que ele quer ver. O mecanismo de carry que fica quase morto depois deste ticket sai no CLEAN-16.

- 2026-09-30 Attempt 1 stopped to ask: Implementação salva em `43cab05`; gate verde com 728 testes. PHY-39 ficou `blocked`: o teste novo de força/`g` falha isoladamente, mesmo sem mutação. /  / A [skill ticket-flow](/C:/Users/bruno/.agents/skills/ticket-flow/SKILL.md) exige parar quando “a test proves wrong after being committed”. Diagnóstico e evidências registrados no ticket.
