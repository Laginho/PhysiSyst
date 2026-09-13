# PHY-16: Tela de carregamento com personalidade
Stage: to-review
Status: ready-for-agent
Blocked by: none

- Primary files:
  - New: `src/render/loadingMessage.ts` + `src/render/loadingMessage.test.ts` (a função pura `messageAt`)
  - `src/App.tsx` (boot no mount, estado `booting`, overlay, timer, retry)
  - `src/App.test.ts`
  - `src/i18n/pt-BR.ts`, `src/i18n/en.ts` (10 piadas + erro + "tentar de novo")

#### What to build

Ao abrir o app, o motor de física (wasm) começa a carregar imediatamente, não no primeiro play. Enquanto carrega, um overlay sobre o canvas mostra uma piada de física que troca a cada 1,5 s (10 mensagens, pt-BR e EN, sorteio inicial, nunca repete a anterior). Sem rodapé "sério": a piada é a mensagem. Quando o motor fica pronto, o overlay some e o primeiro play é instantâneo. Se o carregamento falhar, o overlay mostra uma mensagem de erro fixa e um botão "tentar de novo" que reexecuta o boot.

#### Acceptance criteria

1. O boot do simulador é disparado no mount do App (o boot compartilhado e idempotente já existe; só o gatilho muda)
2. Estado visível "booting" mostra o overlay até o boot resolver; o overlay não bloqueia a edição de cena — o aluno pode montar a cena enquanto a física chega
3. 10 chaves `loading.msg.01`…`loading.msg.10` nos dois catálogos, com o texto da tabela da spec (o dono do produto pode cortar; se cortar, o `count` acompanha)
4. Chaves para a mensagem de erro e o botão "tentar de novo" nos dois catálogos
5. Função pura `messageAt(seed, tick, count)` → índice: determinística, cobre todos os índices ao longo de `count` ticks, nunca devolve o mesmo índice em dois ticks consecutivos
6. Rotação a cada 1,5 s via timer que é limpo quando o overlay some
7. Falha no boot mostra o erro fixo e o botão; clicar reexecuta o boot (o retry já é suportado pelo boot compartilhado)
8. Paridade pt-BR/EN verde em `i18n.test.ts`
9. Verificação live em browser: recarregar a página mostra o overlay com piada, some quando o motor carrega, e o primeiro play não tem atraso perceptível; simular falha (ex.: bloquear o wasm no devtools) mostra erro e "tentar de novo" funciona
10. Testes de regressão mutate-verified conforme o protocolo do `AGENTS.md`
11. Gate verde

#### Verification

    npx vitest run src/render/loadingMessage.test.ts src/App.test.ts src/i18n/i18n.test.ts
    npm test && npm run lint && npm run typecheck && npm run build

## Tests stage 2 writes (own commit, red)

- `src/render/loadingMessage.test.ts`, na função pura: determinismo, cobertura de todos os índices, nunca dois ticks iguais em sequência (critério 5). Vermelho porque a função não existe.
- `src/App.test.ts`, no espelho: boot disparado no mount (1), overlay não bloqueia edição (2), timer limpo quando o overlay some (6), retry refaz a promessa (7). Vermelhos porque o boot hoje só acontece no primeiro play.
- `src/i18n/i18n.test.ts` continua sendo a paridade (8) — não é teste novo.

## Mutate-verify (App.test.ts, seam DOM/integração)

Cada mutação abaixo foi aplicada em `src/App.tsx`, rodada isoladamente (`npx
vitest run src/App.test.ts -t "<nome>"`), confirmado vermelho pelo motivo
certo, depois revertida. `loadingMessage.test.ts` chama a função de produção
direto — sem registro aqui, por protocolo. `i18n.test.ts` é a paridade já
existente (critério 8), verde com as 12 chaves novas.

1. **"dispara o boot do motor no mount…" (critério 1)** — removido o
   `useEffect(() => { void ensureSim() }, [ensureSim])`. Vermelho:
   `expected "vi.fn()" to be called 1 times, but got 0 times`.
2. **"o overlay mostra uma piada… não bloqueia a edição" (critério 2)** —
   `pointerEvents: 'none'` do overlay virou `'auto'`. Vermelho:
   `expected 'auto' to be 'none'`.
3. **"a piada troca a cada 1,5 s e o timer é limpo…" (critério 6)** —
   (a) removido o `return () => clearInterval(id)` do efeito de rotação.
   Vermelho: `expected 2 to be 1` (um timer a mais vivo depois do boot resolver).
   (b) período `1500` → `3000`. Vermelho: `expected 'Procurando a força
   normal…' not to be 'Procurando a força normal…'` (a piada não trocou em 1,5 s).
4. **"falha no boot mostra o erro fixo e 'tentar de novo'…" (critério 7)** —
   removido o `void ensureSim()` do onClick do botão. Vermelho:
   `expected "vi.fn()" to be called 2 times, but got 1 times`.

Nota sobre o mock: `App.test.ts` passa a mockar `./sim` (`vi.mock`) para que
cada teste controle a promessa do boot; por padrão ela nunca resolve. O único
teste que reproduz de verdade (PHY-14, "undo during playback…") recebe o
`createSimulator` real explicitamente. Sem o mock, todo teste do App faria o
init do Rapier no mount.

## Verificação live em browser (critério 9)

Dev server `npm run dev`, pt-BR. O Rapier compat embute o wasm em base64 (não há
request para bloquear no devtools), então a falha foi simulada com um hook
**temporário e revertido** em `ensureSim`: 6 s de atraso artificial antes do
`createSimulator`, e `window.__failBoot = true` faz a promessa rejeitar.
Diff final de `src/App.tsx` em relação ao commit: nenhum (`git status` limpo).

1. Recarregar: overlay `role=status` sobre o canvas com "Refutando a Teoria da
   Relatividade…"; 2 s depois "Considerando a vaca esférica…"; após o boot
   resolver, `role=status` não existe mais no DOM (screenshot antes/depois).
2. Clicar "▶ reproduzir" logo após o overlay sumir: "⏸ pausar" aparece na mesma
   leitura de DOM — sem atraso perceptível.
3. Recarregar com `__failBoot = true`: overlay mostra "o motor de física não
   carregou" em vermelho e o botão "tentar de novo" (screenshot). Durante o
   overlay, clicar "retângulo" na paleta cria o corpo e abre o painel
   "massa (kg)" — a edição não é bloqueada.
4. `__failBoot = false` + clicar "tentar de novo": volta ao `role=status`
   ("Procurando a força normal que ninguém desenhou…"), e 6 s depois nem
   `status` nem `alert` existem. Console sem erros.

Observação: em 9 execuções do suite completo, uma (a primeira, cache do vite
frio) falhou 1 teste que não ficou identificado no grep; as 8 seguintes, 459/459.
Candidato: o teste de playback do PHY-14 (Rapier real, polling de 5 ms, timeout
10 s) sob carga fria. Fica registrado para o review.

## Comments
