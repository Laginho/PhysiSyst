# PHY-71: Leituras de energia e momento no painel
Stage: implementing
Status: ready-for-agent
Blocked by: PHY-70
Review: agent
Difficulty: normal

- Primary files:
  - src/i18n/index.ts (`fmtNum` novo), src/i18n/i18n.test.ts
  - src/i18n/pt-BR.ts, src/i18n/en.ts (`readout.*` :132-146)
  - src/App.tsx (fieldset de leitura ~:2056-2120; `toFixed` em :575, :1836, :2062-2109; `displayedScene`/quadro exibido ~:836-839)
  - src/App.test.ts
  - src/sim/energy.ts (consumido)

#### What to build

O painel de leitura (220 px) ganha energia e momento, calculados pelo módulo do PHY-70 a partir do quadro exibido (o do cursor do slider ou o vivo), nunca de um cálculo próprio no `App`.

Formatação: `fmtNum(n: number, digits: number, lang: Lang): string` em `src/i18n/index.ts`, sobre `toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits })`. Toda leitura nova usa `fmtNum`, e os `toFixed` existentes do painel (posição, |v|, |a|, componentes, F_el, Δx, T, velocidade de reprodução, L da corda) trocam para `fmtNum` com as mesmas casas, para o painel inteiro usar vírgula em pt-BR como o `t = 1,23 s` do slider. Avisos do simulador não mudam.

Bloco do corpo selecionado: dentro do `<details>` "ver mais" existente, três linhas novas depois das componentes: `E_c`, `E_pg`, `|p|` (J, J, kg·m/s).

Bloco "sistema", fieldset novo abaixo do de leitura, sempre visível (legenda `t('readout.system')` 'sistema' / 'system'): `E_c`, `E_pg`, `E_el` (só quando a cena tem molas), `E_mec` em negrito, `|p|`; um `<details>` com `p_x`, `p_y`. Sem corpos não fixos, mostra `t('readout.noData')`.

Chaves novas: `readout.system`, `readout.kinetic` ('E_c'), `readout.potential` ('E_pg'), `readout.elastic` ('E_el'), `readout.mechanical` ('E_mec'), `readout.momentum` ('|p|'), `readout.momentumX`, `readout.momentumY`. Símbolos como texto plano, como `F_el` hoje.

#### Acceptance criteria

1. `fmtNum(1.5, 2, 'pt-BR')` é `'1,50'`; `fmtNum(1.5, 2, 'en')` é `'1.50'`; `fmtNum(-0.004, 2, 'pt-BR')` é `'-0,00'` ou `'0,00'` (sem lançar).
2. Em pt-BR, nenhuma leitura do painel (posição, |v|, |a|, F_el, Δx, T, velocidade) contém `.` como separador decimal; em en, nenhuma contém `,`.
3. Com um corpo selecionado e um quadro com estado, o "ver mais" mostra `E_c`, `E_pg` e `|p|` com os valores de `bodyEnergy` daquele quadro, duas casas.
4. O bloco "sistema" existe sem corpo selecionado e mostra `E_c`, `E_pg`, `E_mec` e `|p|` de `systemEnergy`; `E_el` aparece só quando `scene.constraints` tem mola; `E_mec` é a linha em negrito.
5. Com o slider num registro anterior, os valores do sistema são os daquele registro (mudam ao mover o slider com a simulação pausada).
6. Chaves novas em pt-BR e en; paridade verde.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/i18n/i18n.test.ts`: critério 1 chamando `fmtNum` direto; vermelho hoje porque não existe.
- `src/App.test.ts`, com o simulador falso e o `requestAnimationFrame` controlado que o arquivo já usa: critérios 2 a 5; vermelhos hoje (não há bloco sistema, e o painel usa ponto). Costura de DOM: registrar no ticket, por teste novo, a mutação aplicada e a saída vermelha. Testes existentes que fixam `'1.00'` e afins em pt-BR são ajustados no mesmo commit.

## Comments

- 2026-10-03 Stage 1 (planner, grilling com proxy).
- Proxy decided: linhas do corpo no "ver mais" e bloco "sistema" sempre visível com E_mec em negrito (220 px obrigam a divisão); `fmtNum` substitui também os `toFixed` existentes — um painel, uma convenção; símbolos em texto plano como F_el.

- Stage 2: inspected the polling readout, recorded/live frame selection, RopePanel and all toFixed consumers. Tests use the approved fmtNum and App DOM seams; edge cases include frame zero, no selection, empty and fixed-only scenes. Existing decimal expectations migrate with the tests. Initial focused red: fmtNum is not a function; body position received (6.10, 4.00), expected (6,10, 4,00); system fieldset absent; spring system reading empty.
