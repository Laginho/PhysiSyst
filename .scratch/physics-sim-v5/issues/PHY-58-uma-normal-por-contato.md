# PHY-58: Uma normal por contato
Stage: implementing
Status: ready-for-agent
Review: agent
Difficulty: normal

- Primary files:
  - src/render/overlay.ts (`normalArrows`)
  - src/render/overlay.test.ts

#### What to build

Um bloco apoiado na mesa mostra duas setas N, uma em cada quina (preset "Bloco na mesa com bloco pendurado"). `Simulator.readContacts()` devolve um `ContactPoint` por ponto do manifold, e `normalArrows` faz uma seta por ponto; a chave do par já é a mesma, então as duas levam o mesmo rótulo, mas são desenhadas as duas.

`normalArrows` passa a devolver uma seta por par de corpos (a chave `normal:<a>|<b>` que já existe): origem na média dos pontos daquele par, direção a normal do primeiro ponto do par, comprimento `NORMAL_LEN` como hoje. A ordem de saída é a ordem em que cada par aparece pela primeira vez.

#### Acceptance criteria

1. Dois `ContactPoint` do mesmo par em (0, 0) e (1, 0), normal (0, 1), dão uma seta só, com origem (0.5, 0) e vetor (0, `NORMAL_LEN`).
2. O par é o mesmo com `aId`/`bId` trocados: os pontos de `a|b` e `b|a` caem na mesma seta.
3. Dois pares diferentes dão duas setas, com chaves diferentes, na ordem em que aparecem.
4. Um par com um ponto só sai como hoje.

#### Verification

    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/overlay.test.ts`: critérios 1 a 3, vermelhos hoje porque `normalArrows` devolve uma seta por ponto. O 4 passa hoje e vai junto. Chama a função direto; não é costura de DOM.

## Comments

- 2026-10-02 Aberto do feedback do Bruno vendo a v4 (item 1, print do bloco na mesa com duas N).
