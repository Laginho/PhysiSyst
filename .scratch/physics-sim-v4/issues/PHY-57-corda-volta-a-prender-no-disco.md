# PHY-57: A corda volta a prender no disco da polia com massa
Stage: reviewing
Status: ready-for-agent
Blocked by: PHY-55
Review: agent
Difficulty: normal

- Primary files:
  - src/sim/simulator.ts (`pullPieces` e o que o PHY-55 criar para soltar o grip: o reengate; os comentários de `Grip.loose` e `Piece.length` que o PHY-55 escreve, com `stays loose for the world's life`)
  - src/sim/acceptance.test.ts (bloco `rope over a fixed pulley (PHY-23)`, ao lado dos testes do PHY-55)
  - docs/adr/0004-rope-as-own-constraint-around-world-step.md (seção `Pulleys with mass (PHY-25)`, item `Grips and pieces`)

#### What to build

Depois do PHY-55, um grip que se soltou fica solto para sempre: quando a corda volta a passar pelo disco, ela desliza sobre ele como numa polia ideal, sem girá-lo. Este ticket faz a corda voltar a prender no disco, sem ganho de energia.

**Caminho.**

- **Quando.** Na leitura das poses reais em `pullPieces`, um grip solto volta a prender quando duas coisas valem ao mesmo tempo:
  - a varredura dele é ≥ 0;
  - a peça que o contém não está frouxa: o comprimento dela no caminho é ≥ o comprimento dela.

  Uma corda frouxa não aperta o disco, então não o segura. Enquanto ela está frouxa, o grip fica solto e a folga pode correr de um lado para o outro. A previsão continua só soltando, nunca prende.
- **Como.** A peça se divide em duas numa marca no meio do arco (`share = sweep/2`, `start` do arco), como em `buildWorld`. Cada peça nova fica com o seu comprimento no caminho, menos metade do estiramento da peça juntada. Assim as duas somam exatamente o comprimento dela, e a soma das peças segue sendo `L`. Tensão, residual, `predicted` e `target` das duas começam em 0.
- **O impacto.** O aro e a corda chegam com velocidades diferentes, mas isso não pede código próprio. As duas peças começam no próprio comprimento. A previsão e a correção seguintes absorvem a diferença de velocidade como numa corda frouxa que estica, de forma inelástica. No protótipo, os critérios de energia do PHY-55 seguem ≤ +0,08 J.

Medido com um protótipo descartável sobre `7590eec`, com o do PHY-55 e a regra de junções do CLEAN-25; são cerca de 12 linhas a mais. Na cena 5/0,5 com μ = 0 e `vx = 9` de `b`, a corda sai do disco no passo 22 e volta a prender no 111. A variante rejeitada divide a peça já no passo 92, quando a varredura volta a 0 com a corda 0,51 m frouxa, e deixa folga nas peças: depois, com a corda puxando, o caminho fica até 0,28 m mais curto que `L` (critério 2).

#### Acceptance criteria

1. **A corda volta a girar o disco.**
   - **Cena.** A cena da mesa do critério 3 do PHY-55, com 5/0,5, μ = 0, `vx = 7` de `b` e `mass: M` na polia, para `M = 2` e `M = 5`, 600 passos.
   - **Medido no protótipo.** A corda sai do disco perto do passo 30 e volta a ele antes do passo 90 (passos 71 e 75).
   - **A física.** Do passo 90 ao 200, `a` está na mesa (y = 0,2), a perna dele é horizontal e não escorrega no disco. A borda do disco acelera junto com `a`, então `(T_b − T_a)·R = ½MR²·aₓ/R`.
   - **O critério.** Em cada passo desse intervalo em que os dois segmentos leem mais de 0,5 N, `|segments[1] − segments[0] − (M/2)·aₓ| ≤ 0,05 N`. Aqui `aₓ = (vₓ − vₓ do passo anterior)/Δt`, com `vₓ` de `a`. Há pelo menos 100 desses passos.
   - **Números.** Depois do PHY-55, com o grip solto para sempre, o pior caso é 124,65 N com `M = 2` e 10,69 N com `M = 5`. No protótipo, 0,0038 N e 0,0054 N, em 111 passos cada.
2. **A corda que prende de volta não fica curta.**
   - **Cena.** A mesma cena, com `vx = 9` de `b`, `M = 2` e `M = 5`, 600 passos.
   - **O critério.** Do passo 95 ao 195, em cada passo em que a corda lê `T` > 0,5 N, `|RopeState.path.length − L| ≤ 0,1 m`. `RopeState.path` é o do PHY-56, na última leitura das poses reais. `L` é o comprimento nas poses do documento: 6 + (π/2)·0,2 + 1,35.
   - **Números.** No protótipo, 0,046 m e 0,038 m. A variante rejeitada, que divide a peça assim que a varredura volta a 0 e reparte a folga ao meio, dá 0,28 m e 0,35 m. O protótipo mediu com `ropePath` e o mesmo histórico, nas mesmas poses.
3. Os critérios 1 a 5 do PHY-55 seguem valendo, sem mudar tolerância. O critério 4 dele só olha os passos de varredura negativa, e o reengate só acontece com varredura ≥ 0. No protótipo com reengate, foram 17 148 passos, nenhum fora.
4. **O ADR-0004 e os comentários.**
   - No item `Grips and pieces`, o ADR-0004 diz:
     - quando o grip volta a prender: varredura ≥ 0 e a peça não frouxa;
     - como a peça se divide: marca no meio do arco, estiramento repartido, soma igual;
     - que o impacto do reengate é absorvido pela previsão e pela correção, como numa corda que estica.
   - Os comentários de `Grip.loose` e `Piece.length` dizem o mesmo.
   - A frase `A loose grip stays loose for the world's life: re-engagement is PHY-57.` e o trecho `stays loose for the world's life` não existem mais no ADR nem em `simulator.ts`.

   Conferido pelo `git grep` da Verification.
5. **Mutate-verify** conforme o `AGENTS.md`, com o registro no ticket:
   - nunca prender de volta: o critério 1 fica vermelho (medido: 124,65 N e 10,69 N);
   - prender assim que a varredura volta a 0, sem esperar a corda esticar, com a folga repartida ao meio: o critério 2 fica vermelho (medido: 0,28 m e 0,35 m).

#### Verification

    npx vitest run src/sim/acceptance.test.ts -t "PHY-55|PHY-57"
    git grep -n -e "stays loose for the world's life" -- docs/adr/0004-rope-as-own-constraint-around-world-step.md src/sim/simulator.ts
    git grep -n -e "PHY-57" -- docs/adr/0004-rope-as-own-constraint-around-world-step.md
    npm test && npm run lint && npm run typecheck && npm run build

O primeiro `git grep` não acha nada. O segundo acha o item `Grips and pieces`.

## Tests stage 2 writes (own commit, red)

- `src/sim/acceptance.test.ts`, no bloco `rope over a fixed pulley (PHY-23)`, pelo motor público, sem mocks:
  - o critério 1 num `it.each` com `M = 2` e `M = 5`. Fica vermelho depois do PHY-55 porque o grip não prende de volta e os dois segmentos leem a mesma `T`;
  - o critério 2 num `it.each` com `M = 2` e `M = 5`, lendo `RopeState.path`. Ele passa depois do PHY-55: com o grip solto, a corda é uma peça só e fica em `L`. É a guarda do mutante "prender com folga" e fica registrado como tal.
- O nome de cada teste leva `PHY-57`.

## Comments

- 2026-10-02 Aberto no stage 1 do PHY-55 e cortado dele: a soltura fecha a energia sozinha, e o reengate é um passo a mais, com critérios próprios. Medido com probes e um protótipo descartáveis sobre `7590eec`, já com a regra de junções do CLEAN-25 (os números não mudam em relação à regra de hoje); nada commitado.
- 2026-10-02 Proxy decided: cortar do PHY-55 — com o grip solto para sempre a energia já fecha (≤ +0,08 J), e só os critérios deste ticket separam o reengate.
- 2026-10-02 Proxy decided: prender de volta só com a peça juntada não frouxa — uma corda frouxa não aperta o disco, e repartir a folga deixa a corda puxando até 0,35 m mais curta que `L`; esperar dá ≤ 0,046 m.
- 2026-10-02 Proxy decided: o impacto do reengate sem código próprio — dividir no comprimento atual deixa a diferença de velocidade para a previsão e a correção, que já tratam a corda que estica, de forma inelástica (energia ≤ +0,08 J).
- 2026-10-02 Proxy decided: a marca no meio do arco, como em `buildWorld` — manter a parte antiga dá os mesmos números, porque cada peça fica com o seu comprimento no caminho; não vira critério.
- 2026-10-02 Proxy decided: limiares 0,05 N (medido ≤ 0,0054 N, mutante ≥ 10,69 N) e 0,1 m (medido ≤ 0,046 m, mutante ≥ 0,28 m), janelas depois do reengate e antes de `a` chegar ao disco; `Difficulty: normal`, `Review: agent` — mudança local de uma dúzia de linhas, com o protótipo medido.
- 2026-10-02 Stage 2, mutate-verify (criterion 5), on `regripGrips` in `src/sim/simulator.ts`:
  - never regrip (the state after PHY-55, test-only commit): `PHY-57: M = 2/5: ... (T_b − T_a) = (M/2)·aₓ` red, `expected 124.65303182601929 to be less than or equal to 0.05` and `expected 10.688209533691406 to be less than or equal to 0.05`;
  - regrip as soon as the sweep is back to 0 (dropped `|| stretch < 0`, slack shared in halves): `PHY-57: M = 2/5: ... not short of L once it pulls` red, `expected 0.2816884567964255 to be less than or equal to 0.1` and `expected 0.3508216953498211 to be less than or equal to 0.1`. The criterion 1 tests stay green under this mutant; only criterion 2 separates it, as the ticket says;
  - with the real condition: 82 PHY-55 and PHY-57 tests green, gate green (934 tests).
