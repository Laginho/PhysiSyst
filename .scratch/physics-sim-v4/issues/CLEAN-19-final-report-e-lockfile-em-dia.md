# CLEAN-19: `FINAL_REPORT.md` e `package-lock.json` em dia com o que o PR 9 entrega
Stage: implementing
Status: ready-for-agent
Blocked by: PHY-39, PHY-40, PHY-41, PHY-42, PHY-43, PHY-44, CLEAN-16, CLEAN-17, CLEAN-18
Review: agent

- Primary files:
  - `FINAL_REPORT.md` (seção v4)
  - `package-lock.json` (as duas linhas de `version`)

#### What to build

A seção v4 do `FINAL_REPORT.md` foi escrita no closeout (PHY-33), antes de o PR 9 fechar PHY-34 a PHY-38, CLEAN-13 a CLEAN-15 e os tickets abertos pelo review de benchmark:
- ela ainda fala em 703 testes;
- lista PHY-34 a PHY-38 e o CLEAN-13 como abertos ou próximos passos;
- diz que "v4 itself has not been through CI yet";
- trata o chute da mola com massa num arrasto (PHY-30) como adiado para o CLEAN-09, quando o CLEAN-09 já o corrigiu.

O `package-lock.json` também ainda registra `0.3.0`, enquanto o `package.json` está em `0.4.0`. O próprio report cita isso como ponta solta.

Este ticket roda por último na sessão, para os números valerem para o que realmente vai ao `main`.

#### Acceptance criteria

1. A seção v4 do `FINAL_REPORT.md` traz a contagem de testes e os portões do último gate da sessão, a lista de tickets entregues (incluindo os deste review), os itens ainda abertos (o que restar do CLEAN-13) e o PHY-30 como corrigido pelo CLEAN-09
2. `package-lock.json` registra `0.4.0` nas duas linhas de `version`, e nada mais muda nele (`npm install --package-lock-only`)
3. Gate verde

#### Verification

    grep '"version"' package.json package-lock.json
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- Nenhum. É um ticket só de documentação; a prova são o `grep` e o gate.

## Comments

- 2026-09-30 Aberto a partir do F5 do Opus e do F5 do Sonnet no review de benchmark do PR 9. A frase "deferred to CLEAN-09" do corpo do PR 9 também está velha; esse texto é do driver da sessão e fica fora deste ticket.
- 2026-09-30 Stage 2: dependências conferidas em `done` na sessão `sweatshop/2026-09-24-1853`, base `0f85552`. Nenhum teste novo, conforme o contrato de documentação. A verificação direta das versões falhou antes da mudança: `AssertionError: '0.3.0' !== '0.4.0'` no `lock.version`; a versão do pacote raiz no lockfile também era `0.3.0`.
