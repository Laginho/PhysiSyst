# PHY-28: Editor II — ferramentas Polia e Corda
Stage: implementing
Status: ready-for-agent
Blocked by: PHY-25, PHY-27
Review: agent

- Primary files:
  - `src/editor/doc.ts`, `src/editor/doc.test.ts` (adicionar, editar e remover polia e corda)
  - `src/editor/hitTest.ts`, `src/editor/hitTest.test.ts` (acertar polia e corda)
  - `src/App.tsx`, `src/App.test.ts`
  - `src/render/draw.ts` (destaque de seleção)
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts`

#### What to build

O aluno monta Atwood, polia móvel e talha à mão. **Polia**: um clique num corpo monta uma polia na âncora do snap, com raio padrão. **Corda**: clique na âncora A, depois nas polias na ordem por onde a corda passa, depois na âncora B (um corpo, não uma polia, termina a corda); Esc cancela. Clicar numa polia ou corda seleciona. Inspetor da polia: raio e massa. Inspetor da corda: o caminho e `L` somente leitura. Delete remove o selecionado com dependentes (remover polia leva as cordas que passam por ela). Tudo desfazível. Com a corda selecionada durante o playback, o painel mostra `T` — ou `T₁`, `T₂`… por segmento quando alguma polia do caminho tem massa — e "frouxa" quando `T = 0` por folga.

#### Acceptance criteria

1. Ferramenta Polia: um clique num corpo cria uma polia na âncora do Anchor snap; clique fora de corpo é ignorado
2. Ferramenta Corda: A → polias → B cria uma corda com `via` na ordem clicada; clicar na mesma polia duas vezes seguidas é ignorado; Esc cancela sem mexer no doc; sem polia e com B = A, nada é criado
3. Inspetor da polia edita raio e massa; inspetor da corda mostra o caminho e `L` (de `ropePath`) sem campo editável
4. Remover polia remove as cordas que passam por ela; remover corpo remove polias montadas, cordas e molas presas e cordas pelas polias removidas; Ctrl+Z restaura tudo de uma vez
5. Clicar em polia ou corda seleciona; Delete remove o selecionado
6. Leitura com corda selecionada: `T`; `T₁`, `T₂`… com polia de massa no caminho; "frouxa" quando for o caso
7. Strings novas nos dois catálogos
8. Verificação live em browser: montar Atwood à mão (teto fixo, polia, dois blocos, corda), play, `T` no painel bate com `2m₁m₂g/(m₁+m₂)`
9. Testes novos no `App.test.ts` com mutação aplicada e saída vermelha registradas em `## Comments` (AGENTS.md)
10. Gate verde

#### Verification

    npx vitest run src/editor src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/editor/doc.test.ts`: operações de polia e corda e a cascata de dependentes (4).
- `src/editor/hitTest.test.ts`: acerto em polia e em segmento de corda (5).
- `src/App.test.ts`, nos espelhos: as duas ferramentas, cancelamento, seleção, Delete, undo, leitura (1, 2, 4, 5, 6). Vermelho porque as ferramentas não existem.

## Comments

- 2026-09-24 (review do PHY-27, stage 3) A seleção no `App.tsx` são duas strings anuláveis (`selectedId`, `selectedSpringId`) com "uma limpa a outra" à mão em seis lugares; polia e corda vão repetir o padrão. CLEAN-06 (bloqueado por este) unifica depois; aqui, seguir o padrão do PHY-27 e limpar as outras seleções em cada ponto que seleciona, inclusive o drop na lixeira em `onPointerUp`, que hoje limpa só o corpo.
