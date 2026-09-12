# PHY-19: Recarregar a página volta para a cena em que eu estava
Stage: to-implement
Status: ready-for-agent
Blocked by: none

- Primary files:
  - `src/persistence/index.ts` (nova chave da cena atual, ao lado de `INDEX_KEY`/`SCENE_KEY_PREFIX`/`GALLERY_ACK_KEY`)
  - `src/persistence/persistence.test.ts`
  - `src/App.tsx` (inicialização de `currentId`, ~426–434, e o handler que troca de cena, ~511)
  - `src/App.test.ts`

#### What to build

Recarregar a página reabre a cena em que o estudante estava, não sempre a
primeira da lista.

Hoje o conteúdo de toda cena sobrevive ao reload (uma chave
`physics-sim:scene:<id>` por cena) e a lista sobrevive (`physics-sim:scenes`),
mas **qual** cena estava aberta nunca é persistida: `currentId` inicializa com
`res.index[0]?.id ?? 'cena-1'`. Verificado no site publicado (PHY-17, passe
manual D7) — cinco cenas na lista, trabalhando na Cena 5, F5 abre a Cena 1. O
trabalho não se perde, mas o estudante perde o lugar toda vez, e numa aula isso
parece perda de dado.

Uma chave a mais no `localStorage`, escrita na troca de cena e lida na
inicialização. Id que não existe mais (cena excluída, storage de outra máquina,
valor corrompido) cai na primeira da lista, que é o comportamento de hoje.

#### Acceptance criteria

1. Trocar de cena persiste o id da cena atual no `localStorage`, sob uma chave própria com o mesmo prefixo `physics-sim:` das outras
2. Na inicialização, a cena aberta é a persistida; sem chave persistida, a primeira do índice (comportamento atual, para quem já tem storage)
3. Id persistido que não está no índice (cena excluída, chave corrompida, valor não-string) cai na primeira do índice sem lançar
4. Excluir a cena atual deixa a chave em um estado que o critério 3 cobre — reload depois de excluir não abre tela quebrada
5. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
6. Gate verde

#### Verification

    npx vitest run src/persistence/persistence.test.ts src/App.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/persistence/persistence.test.ts`, nas funções puras de storage: grava e lê a cena atual; ausente → null; id fora do índice → null; valor corrompido → null, sem lançar (critérios 1–3). Vermelho porque as funções não existem.
- `src/App.test.ts`, na inicialização: storage com índice de três cenas e a terceira marcada como atual abre a terceira; sem a marca, abre a primeira (critério 2). Vermelho porque hoje é sempre `index[0]`.
- `src/App.test.ts`, exclusão: excluir a cena atual e reinicializar abre a primeira do índice (critério 4). Vermelho pela mesma razão.

## Comments

Aberto pelo passe manual desktop do PHY-17 (D7), no site publicado.
