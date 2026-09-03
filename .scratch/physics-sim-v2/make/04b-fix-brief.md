# MAKE fix brief — ticket 04b (fechar o buraco do REJECT do READ)

O READ rejeitou o T04 com veredito em `.scratch/physics-sim-v2/reviews/04-verdict.md`. Implementação aprovada; o problema é **cobertura de regressão**, não comportamento:

## Root causes (do READ)

1. A suíte não afirma `JSON.stringify(serialize(parse(doc)))` byte-equality quando `vx`/`vy` estão presentes.
2. Deep-equality ignora ordem de inserção → mutação "serializar `vx`/`vy` antes das chaves canônicas" passa nos 365.

## O que fazer

1. Adicione teste(s) comprometido(s) em `src/scene/codec.test.ts` que fixem a ordem canônica de serialização com Initial velocity presente:
   - `serialize(parse(doc))` byte-igual ao doc canônico para uma cena contendo corpo com `vx`/`vy`;
   - as chaves `vx`/`vy` aparecem por último no objeto serializado do Body (assertion explícita de ordem/bytes, não deep-equal);
   - estabilidade de `isDirty`: doc parseado → serialize → comparar bytes sem marcar dirty.
2. **Mutate-verify contra a mutação exata do READ**: mova `vx`/`vy` para ANTES das chaves canônicas no serializador → seu teste novo DEVE falhar → restaure → verde.
3. Quatro gates verdes (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`).
4. Máximo 3 ciclos de correção; se estourar, `BLOCKED` no LOGS e pare.
5. Marcos no LOGS (`MAKE: ticket 04b red/green/done-awaiting-READ`) + heartbeat. Não mude checkboxes nem Status do ticket 04 (seguem como estão); quem fecha é o PLAN.
