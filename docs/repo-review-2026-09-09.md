# Leitura geral do repo — physics-sim

**Data:** 2026-09-09 · **HEAD:** `26b2106` · **Working tree:** ticket 10 aplicado, não commitado
(`M src/App.tsx`, `M src/App.test.ts`, `M src/i18n/{en,pt-BR}.ts`, `?? src/editor/trash.{ts,test.ts}`)

Insumo para formular o PRD do v3. Não é um plano: é o estado verificado + os furos.

**Portões medidos nesta leitura:** `test` 400/400 (23 arquivos) · `lint` limpo · `typecheck` limpo · `build` ok (2.368 kB / 883 kB gzip)

> Durante a leitura o `App.tsx` mudou entre duas execuções de `tsc` (erro `pointInTrash unused` → `drag possibly null` → limpo). Havia outra sessão/agente escrevendo no repo. Nada foi alterado por esta revisão.

---

## 1. O que já funciona

Núcleo maduro, verificado contra forma fechada — não contra "parece certo".

| Camada | Estado |
|---|---|
| **Codec de cena** | Versionado, um único caminho parse/serialize, validação *soft* (`collectWarnings` avisa, nunca bloqueia), estabilidade byte-a-byte no round-trip |
| **Simulador** | Rapier2D, timestep fixo 1/60 determinístico, solver de atrito estruturado exato por par declarado (ADR-0003) |
| **Aceitação** | Rampa `a=g(sinα−μk·cosα)`, parábola/alcance por `v₀`, colisão perfeitamente inelástica, e a cunha-carro-chefe `F=(M+m)g·tanα` fixada **dentro** do simulador com guardas de tangência |
| **Render** | Canvas2D zero-dep, transform mundo↔tela puro, corpos estilo livro (branco/preto), rótulos de massa derivados (`m`, `M`, `m_a`…), chão hachurado, setas com regra de escala única (√magnitude + clamps min/max) |
| **Edição** | Drag/rotate/resize/α, hit-test topmost-wins, **contact snap** (encosta liso na face, alinha rotação, círculo tangente), painel enxuto (massa/fixo/`v₀`) com o resto sob "ver mais" |
| **Playback** | Scheduler fracionário puro, classificador live-vs-estrutural, rebuild transacional com carry, particle mode |
| **Leitura** | `\|v\|`/`\|a\|` em destaque, aceleração sobrevive à pausa, estimativa analítica em corpo nunca simulado com marcador `≈` honesto quando há contato declarado |
| **Persistência** | Autosave debounced 400 ms, CRUD multi-cena, recuperação de índice corrompido, export/import pelo codec |
| **i18n** | 93 chaves pt-BR + EN com paridade testada |
| **Presets** | 4 cenas, todas com chão; projétil lança por `v₀` de verdade (sem força fake) |

**Board v2:** tickets 01–09 fechados. O **10 (drag-to-trash) está pronto na working tree mas não commitado** e o ticket ainda marca `ready-for-agent`. Resta o **11 (acceptance sweep + closeout)**.

---

## 2. O que falta para um release digno

### 2.1 Bloqueadores de produto (o estudante bate nisso no primeiro uso)

1. **Contact snap não cria o Contact.** `resolveContactSnap` sabe exatamente em qual superfície encostou e descarta essa informação — o par com μ ainda tem que ser criado à mão no painel. Resultado: aluno encosta bloco na rampa, dá play, e o bloco desliza sem atrito. Maior furo de UX do app hoje, e barato: o resolver já elege o vizinho vencedor.
2. **Sem corda / mola / polia.** Estão no glossário do `CONTEXT.md` como vocabulário oficial e não existem em uma linha de código. Sem elas, Atwood, bloco-puxado-por-fio e massa-mola — metade dos exercícios de livro — são inatingíveis.
3. **Sem restituição.** O chão em todas as cenas antecipa o quique que o schema não sabe expressar. Queda livre termina em pouso morto.
4. **Sem undo, sem tecla Delete.** Com autosave de 400 ms, um arraste errado é gravado e irreversível.

### 2.2 Bloqueadores de entrega (não existe caminho do repo até o aluno)

5. **Nada de release:** sem `README`, sem `LICENSE`, sem CI (`.github` ausente), `version: 0.0.0`, sem alvo de deploy nem `base` configurada. Os quatro portões só existem na mão de quem lembra de rodar.
6. **Bundle de 2,37 MB / 883 kB gzip em chunk único** (wasm do Rapier inline em base64), e `RAPIER.init()` é lazy sem estado de carregamento. Em 4G ruim isso é tela branca por vários segundos — para um público de estudante brasileiro no celular, isso *é* o release.
7. **Canvas travado em 900×600**, layout centralizado sem responsividade, backing store medido só no mount (limitação #3 do v1). Não cabe em tela de celular. E o **T12 (passe manual de dispositivo) segue pendente desde o v1** — 18 itens nunca executados.

### 2.3 Dívida já catalogada (não bloqueia; ver FINAL_REPORT §4)

- Atrito aproximado em contatos **não** declarados (resíduo aceito no adendo do ADR-0003).
- Setas de normal só com direção, sem magnitude (exigiria EventQueue do Rapier).
- Peso desenhado na origem do corpo, não no centroide do triângulo.
- Gallery-ack é via de mão única (sem reset na UI).
- Adapter rAF/React sem automação (política do spec v1), pinado por espelhos puros.

---

## 3. Próximos passos quando os tickets se esgotarem

Ordem por retorno/esforço, do mais barato ao mais caro:

1. **Fechar o 10 e o 11.** Commitar a trash, marcar o ticket, rodar o sweep. É o que separa "v2 pronto" de "v2 na working tree".
2. **Snap declara o contato** (~1 ticket). O dado já existe; é propagar o vizinho vencedor e chamar `addContact` com μ default. Melhor razão valor/diff do repo inteiro.
3. **Undo/redo + tecla Delete** (~1 ticket). O doc já é imutável e toda op passa por `setDoc` — é uma pilha de `Scene`, não uma arquitetura de comandos.
4. **Release mecânico** (~1 ticket): README, LICENSE, CI com os quatro portões, `version`, deploy estático. Sem isso, "release" é uma pasta `dist/`.
5. **Responsivo + T12** (~1–2 tickets). Medir o canvas pelo container em vez de constantes, e executar o checklist de dispositivo. Antes de qualquer divulgação, não depois.
6. **Code-split do wasm + tela de carregamento** (~1 ticket). Corta o first paint sem tocar em física.
7. **Restituição** (v3; schema aditivo-opcional como `vx`/`vy`): knob por corpo + família de aceitação elástica. Barato porque o padrão do schema já está estabelecido.
8. **Constraints — corda → polia → mola** (v3, o épico). Um ticket por tipo, corda primeiro: desbloqueia Atwood. A questão de design não é o solver (Rapier tem joints) e sim como preservar a *idealização padrão* (corda inextensível sem massa) sobre um solver que só conhece molas rígidas.

**Se fosse escolher três para chamar de "digno":** item 2 (o atrito que não acontece), item 5 (não abre no celular do público-alvo) e item 8/corda (o vocabulário promete algo que o app não faz).
