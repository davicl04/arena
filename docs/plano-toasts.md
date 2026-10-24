# Plano — toasts, aviso de conexão e erros de carregamento (web + Expo)

> Estado: **apenas planejamento, 13 de outubro de 2026**. Nenhum código foi alterado.

## Contexto

Hoje as mensagens de retorno não formam um sistema:

- **Toast de verdade só existe em três lugares, cada um com a própria implementação.** A pílula `forest` de [ResultToast.tsx](../web/src/components/results/ResultToast.tsx) e [useToast.ts](../web/src/components/results/useToast.ts) aparece só no cartão de resultado. [MatchPage.tsx](../web/src/pages/MatchPage.tsx) e [EventPage.tsx](../web/src/pages/EventPage.tsx) têm cada uma um `notify()` próprio, de 6 s. O Expo repete a pílula em [ResultToast.tsx](../mobile/src/components/results/ResultToast.tsx).
- **O restante são blocos parados na página.** A web usa [`feedbackVariants`](../web/src/components/ui/feedback.ts) em 65 arquivos, [`glassMessageVariants`](../web/src/components/ui/glass-variants.ts) em 9, além de parágrafos soltos com `role="alert"`. O Expo usa `Notice`, `LiveNotice` e `ErrorText` de [controls.tsx](../mobile/src/components/arena/controls.tsx). Uma confirmação ("Perfil salvo.") fica na tela até a próxima ação. Um erro de ação aparece no mesmo lugar que um erro de carregamento.
- **Não existe tom de aviso.** Os blocos só têm erro e sucesso, e o toast só tem `ok` e `info`.
- **Falha de conexão não se distingue de erro comum.** [client.ts:121-125](../web/src/api/client.ts#L121-L125) transforma qualquer falha de rede em `ApiError` com status 0 e a mensagem "Não foi possível conectar ao Arena…". Nenhum código compara esse status, e cada tela repete o texto. O backend já devolve **503** com `detail` quando o banco falha (handler de `SQLAlchemyError` em [main.py](../backend/app/main.py)) e tem `GET /health/ready`, que consulta o banco. Os clientes ainda não aproveitam nenhum dos dois.

Inventário (contagens aproximadas, por ponto de exibição):

| Nível | Web | Expo |
| --- | --- | --- |
| Confirmação passageira | ~30 pontos (~55 textos), 3 já em toast | 15 `LiveNotice` e 2 `Notice tone="success"` |
| Erro de ação | ~75 | ~45 `ErrorText` e os `Notice` de `action.error` |
| Erro de carregamento da tela ou seção | ~55 com "Tentar novamente" e 28 `moreError` | ~25 |
| Erro de campo | ~30 | 16 `FieldError`, além da prop `error` dos campos |
| Fica onde está (estado, instrução, "Carregando…") | ~70 | `Situation`, `BusyStatus` e afins |

## Decisões da sessão de protótipos

As decisões saíram da sessão de protótipos de 13 de outubro de 2026. O protótipo está no artefato privado do usuário https://claude.ai/artifact/XkvHQFZskCwxmsR3HuH1Qe. A fonte local fica em `artifacts/prototipos-toasts/toasts.src.html`, fora do versionamento. A rodada 2 mostra o sistema completo e a rodada 3 mostra o cartão **Anel**.

| Parte | Decisão |
| --- | --- |
| Direção visual | **Vidro do Coliseu**: cartão de vidro escuro (`forest`/`night` translúcido, com desfoque), o Coliseu ao fundo na cor do tom e uma linha fina do tom no topo. |
| Cartão | **Anel**: o glifo do tom fica dentro de um anel que esvazia durante o tempo de exibição. O título vem em Sora e a descrição em Inter. A ação é uma pílula cheia na cor do tom, abaixo do texto. O **X fica sempre visível**. |
| Posição e pilha | **Base em baralho**: o toast aparece na base do painel, acima da navegação inferior. Vários toasts se empilham como baralho (o mais novo na frente, os de trás menores e sem texto). O baralho se abre em lista ao passar o mouse ou ao receber foco. |
| Duração | Sucesso **4 s**, informação **5 s**, aviso **7 s**. Erro **fica até ser fechado**. O tempo pausa com o ponteiro, com o foco e com a aba em segundo plano. |
| Quatro níveis | **Toast** para o resultado passageiro de uma ação, inclusive o erro de uma ação que pode ser repetida. **Aviso de conexão** para a situação que afeta o app inteiro. **Erro de tela** para quando o conteúdo não carregou. **Junto ao campo** para a validação de formulário. |
| Sem conexão | **Folha da Gaveta**: folha escura que bloqueia o painel, com o título "Sem conexão com a ARENA", a contagem da nova tentativa, "Tentar agora" e "Continuar sem conexão". |
| Quando a folha abre | **Só ao tentar uma ação.** Enquanto o usuário só navega, aparece apenas a faixa presa à navegação. A folha abre quando ele tenta salvar, enviar ou responder algo. |
| Depois de "Continuar sem conexão" | A folha vira a faixa presa à navegação. Uma nova ação sem conexão **não é enviada e a faixa treme**; a folha não volta. |
| Base técnica (web) | **Toast do `@base-ui/react`** (já instalado, versão 1.8.0): `Toast.Provider`, `Viewport`, `Root`, `Title`, `Description`, `Action`, `Close` e `createToastManager`. Nenhuma dependência nova. |
| Escopo | **Web e Expo**, a web primeiro. |

## Decisões assumidas (podem ser revistas antes da implementação)

- **Erro de tela com o Coliseu.** Ele veio junto com o "Base em baralho" e não foi confirmado à parte. O Coliseu fica grande ao centro, com título, texto e "Tentar novamente", e vale para telas inteiras. Em seções dentro de uma tela (comentários, histórico, elenco), usa-se uma variante **compacta**: sem o Coliseu grande, com o mesmo título, texto e botão.
- **"Carregar mais" (`moreError`) continua no rodapé da lista.** A rolagem infinita usa esse estado como trava.
- **Sessão expirada continua na tela de entrada**, como hoje ([App.tsx](../web/src/App.tsx), `expired`). O texto "Sua sessão expirou" e a falha de conexão do `/me` passam a ser estados separados nessa tela.
- **Erros de login, cadastro e recuperação** continuam no formulário: bloqueiam o fluxo e se referem aos campos. Só a confirmação de sucesso do cadastro ou da recuperação vira toast.
- **Falha ao copiar** ("Não foi possível copiar. Selecione o link…") vira toast de **aviso**, e o campo de cópia manual continua visível.
- **Instruções em passos** (troca de lugares no chaveamento, conflito de agenda em `ScheduleSheet`, estado da inscrição, "O representante marcou que você não jogou") continuam na tela. Só os resultados ("Sorteio feito", "Troca concluída") viram toast.
- **Uso do tom de aviso:** "Placar enviado. Os placares não bateram.", a resposta 404/409 de algo que outra pessoa já decidiu (`isStale`), a falha ao copiar e as confirmações que exigem um próximo passo ("Vaga reservada. Envie o comprovante…").
- **"Tentar agora" consulta `GET /health/ready`**, que verifica o banco e passa pelo CORS do app. Fora isso, a reconexão automática tenta de novo em 5, 10, 20 e depois a cada 30 s, enquanto o aviso estiver ativo.
- **Ao voltar a conexão**, a faixa mostra "Conexão restabelecida" em menta por cerca de 2,5 s e sai. As seções que falharam **por conexão** recarregam sozinhas, uma única vez. As outras continuam esperando o "Tentar novamente".
- **No Expo o vidro é sólido** (`rgba(8, 20, 14, 0.94)`, sem desfoque). `expo-blur` não está instalado e o ganho visual não justifica uma dependência nova.
- **A folha de conexão não aparece na tela de entrada.** Lá o erro de conexão já tem o próprio "Tentar conexão novamente".

## Regras de classificação

O cliente decide o nível pelo **tipo da falha**, e o componente decide pelo **momento** dela.

| Situação | Nível | Quem mostra |
| --- | --- | --- |
| Ação concluída | Toast de sucesso, informação ou aviso | O componente, chamando `toast.*` |
| Ação falhou com 400, 403, 404, 409, 413, 422 sem campo ou 500 | Toast de erro com a mensagem do servidor | `useSubmit`, por meio de `reportActionError` |
| Ação falhou com 422 e `fields` | Junto ao campo, como hoje | O formulário |
| Ação falhou com 401 | Fluxo atual de sessão expirada | `onExpired` |
| Qualquer requisição falhou com status 0 (rede ou timeout), 502, 503 ou 504 | Aviso de conexão. O componente **não** mostra toast | O cliente da API, pela loja de conexão |
| Carregamento da tela ou seção falhou | Erro de tela ou seção com "Tentar novamente" | `useResource`, `usePagedList` e o componente `LoadError` |
| Validação local antes de enviar | Junto ao campo | O formulário |

Uma requisição que **altera dados** (método diferente de GET) e falha por conexão abre a folha, se ela ainda não foi dispensada. Uma leitura que falha por conexão só liga a faixa. Requisições de leitura em segundo plano (contadores, sondagem do chat) **nunca** abrem a folha.

## Especificação visual

Os valores partem do protótipo e devem virar tokens, sem cores soltas nos componentes.

| Elemento | Valor |
| --- | --- |
| Superfície | `rgba(8, 20, 14, 0.86)` com `backdrop-filter: blur(16px) saturate(1.3)`, borda `#ffffff17`, raio 18 px e sombra `0 18px 40px rgb(0 0 0 / 0.35)`. Mesma aparência sobre a tela clara e sobre a placa escura. |
| Linha do tom | 1 px no topo, gradiente transparente → tom → transparente, recuada 16 px de cada lado. |
| Coliseu | `coliseum.svg` como máscara, 150 × 84 px, deslocado para baixo e para a direita, na cor do tom com opacidade 0,09. |
| Ícone | 36 px. Glifo lucide de 15 px (`Check`, `X`, um ponto de exclamação, `Info`), traço 2,6. O anel tem r = 16 e traço 2,4: a trilha fica com o tom a 18% e o anel cheio esvazia ao longo da duração. No erro, que não tem tempo, o anel fica cheio e parado. |
| Texto | Título em Sora 13,5 px/600. Descrição em Inter 12 px, branco a 69%, altura de linha 1,45. |
| Ação | Pílula cheia na cor do tom, texto `night` 11,5 px/700, padding 6 × 12, abaixo do texto. No máximo uma ação. |
| Fechar | X de 28 px, sempre visível, com `aria-label="Fechar aviso"`. |
| Tons | Sucesso `--color-mint` (#8fe0b4). Erro `--color-danger-soft` (#ff8a9a). Aviso: novo token `--color-warning-soft` (#f4c56a). Informação: novo token `--color-info-soft` (#c9d6cf). |
| Pilha | Até 4 toasts. Fechados, os de trás deslocam 10 px e reduzem 5% de escala a cada nível, com o conteúdo oculto e a altura igual à do toast da frente. Abertos, ficam em lista com 8 px de intervalo. |
| Posição | Dentro de `app-frame`, a 86 px da base (acima da navegação inferior) e 12 px das laterais. Em telas sem navegação inferior, a 16 px da base. Fica acima de folhas e diálogos abertos. |
| Movimento | Entrada de baixo para cima (28 px e escala 0,96), 380 ms. Saída no sentido inverso. Arrastar para baixo dispensa o toast. Com `prefers-reduced-motion`, só opacidade. |

**Folha de conexão:** reutiliza o `Sheet` `tone="dark"` ([sheet.tsx](../web/src/components/ui/sheet.tsx)). O ponto âmbar pulsa ao lado do título. O texto é "Suas ações não chegam ao servidor agora. Nova tentativa em N s.". O Coliseu grande aparece em âmbar a 8%. Os botões são "Tentar agora" (primário, menta) e "Continuar sem conexão" (texto).

**Faixa presa à navegação:** vidro escuro com 52 px de altura, cantos superiores de 16 px e borda superior âmbar a 33%. Tem o ponto pulsante, "Sem conexão com a ARENA" e a contagem, além de "Tentar agora" em pílula contornada. O toast sobe junto com ela. Quando a conexão volta, o ponto e a borda ficam menta e o texto muda para "Conexão restabelecida".

**Erro de tela:** o Coliseu fica em `ink` a 15% (a 12% de branco na placa escura), com 150 × 86 px. Título em Sora 16 px, texto em `ink-muted` com até 30 caracteres por linha e o `Button` primário "Tentar novamente". Na variante compacta, o título fica em 14 px, sem o Coliseu, e o botão é `variant="text"`.

## Acessibilidade

- O `Toast.Viewport` do Base UI é a região viva única. O erro usa `priority: 'high'` (anúncio imediato) e os demais tons usam `low`. Os blocos `<div aria-live="polite">` que hoje envolvem as mensagens migradas são removidos.
- O Base UI já leva o foco à viewport com F6. A ação e o X entram na ordem de tabulação, e Esc fecha o toast em foco.
- O tempo pausa com foco, com ponteiro e com a janela oculta. O erro não some sozinho.
- A folha de conexão é `role="dialog"` modal, com o foco preso (`useDialogFocus`). A faixa é `role="status"`.
- O `LoadError` usa `role="alert"`, como os blocos atuais.
- As mensagens de campo e os `sr-only` de "Enviando…" continuam com a região viva local.
- No Expo, o `announce` (iOS) e o `accessibilityLiveRegion` (Android) continuam anunciando cada toast.

---

## Parte A — Web (`web/`)

### A1. Tokens e primitivos

- Em [ui.css](../web/src/ui.css), acrescentar `--color-warning-soft`, `--color-info-soft`, `--color-toast` (superfície) e `--color-toast-line` (borda).
- Em `components/ui/toast.tsx`, criar:
  - `toastManager = Toast.createToastManager()`, para chamar o toast fora do React (cliente da API, hooks).
  - A API tipada `toast.success | info | warning | error(title, { description?, action?: { label, onClick } })`. Ela devolve o id, para o caso de troca de texto.
  - `<Toaster container={frame} />`, que monta `Toast.Provider` (com `toastManager`, `limit={4}` e o tempo de cada tom), `Toast.Portal` e `Toast.Viewport` dentro do `app-frame`.
  - `<ToastCard>`, a anatomia Anel com `Toast.Root`, `Title`, `Description`, `Action` e `Close`. O anel é SVG, e a pausa vem do estado do Base UI.
- O `Toaster` é montado em [ArenaPage.tsx](../web/src/pages/ArenaPage.tsx), na referência do frame (`setFrame`) que já existe, e também na `AuthPage`, para as confirmações de cadastro e recuperação.
- Tipos explícitos para `ToastTone` e `ToastOptions`. O mapa de durações fica num único lugar.

### A2. Loja de conexão e cliente da API

- Criar `api/connection.ts`, uma loja pequena (`useSyncExternalStore`) com os estados `online`, `offline` e `restored`, e os campos `sheetDismissed`, `nextRetryAt` e `nudge` (contador para o tremor).
- Em [client.ts](../web/src/api/client.ts):
  - Status 0, 502, 503 e 504 chamam `connection.lost({ mutating })`. O `ApiError` passa a ter `isConnection = true`.
  - Qualquer resposta HTTP (mesmo 4xx) chama `connection.reached()`.
  - Também ouvir os eventos `online` e `offline` da janela, só como dica: a confirmação vem do `/health/ready`.
- A reconexão consulta `GET /health/ready` (fora de `/api/v1`, com `credentials: 'omit'`) no intervalo definido nas decisões. Também consulta no "Tentar agora".
- Em `restored`, a loja avisa os assinantes. `useResource` e `usePagedList` recarregam uma única vez quando o erro atual era de conexão.

### A3. Folha e faixa de conexão

- Em `components/ConnectionNotice.tsx`, a folha (sobre `Sheet tone="dark"`) e a faixa (posicionada sobre a navegação inferior, dentro do frame).
- Montado ao lado do `Toaster` em `ArenaPage`. Ele define a variável CSS `--connection-dock` para o toast subir junto com a faixa.
- Comportamento:
  - Uma leitura falha: só a faixa aparece.
  - Uma ação falha com a folha ainda não dispensada: a folha abre.
  - Uma ação falha com a folha já dispensada: a faixa treme.
  - A conexão volta: "Conexão restabelecida" por cerca de 2,5 s e depois o `sheetDismissed` volta a falso.

### A4. Ponto único para erros de ação

- Em [useSubmit.ts](../web/src/hooks/useSubmit.ts):
  - Erro de conexão: `connection.attempted()`, sem mensagem local.
  - 401: `onExpired()`, como hoje.
  - 422 com `fields`: continua em `error`, para o formulário distribuir pelos campos.
  - Qualquer outro erro: `toast.error(mensagem do servidor ou fallback)`.
- O `error` devolvido pelo hook fica restrito à validação. Os chamadores que só exibiam `error` em bloco passam a não exibir nada.
- `isStale` (404/409) passa a mostrar `toast.warning` com a mensagem do servidor antes de `onFailure` reler os dados.
- Para os `catch` manuais que não usam `useSubmit` (por exemplo [PostItem.tsx](../web/src/components/PostItem.tsx), [NotificationsPage.tsx](../web/src/pages/NotificationsPage.tsx) `failed()`, [UserProfilePage.tsx](../web/src/pages/UserProfilePage.tsx) `fail()` e [AdminReports.tsx](../web/src/components/AdminReports.tsx)), criar o auxiliar `reportActionError(cause, fallback, onExpired)`, que aplica a mesma regra.

### A5. Erro de carregamento

- Em `components/ui/load-error.tsx`, criar `LoadError({ title, text, onRetry, size: 'screen' | 'section', tone })`.
- Ele substitui o bloco `feedbackVariants` com "Tentar novamente" nos ~55 pontos de carregamento.
- Quando a falha é de conexão, o texto passa a ser "Sem conexão com a ARENA. Vamos tentar de novo assim que voltar." e o botão continua disponível.
- O `CommunityFeed` (estado "Feed indisponível") e o `EmptyState` existentes continuam coerentes com o novo componente.

### A6. Migração por área

Cada etapa troca `setNotice` / `setStatus` / `setMessage` por `toast.*` e remove o bloco de sucesso e o `aria-live` que o envolvia. Também separa as variáveis que misturam níveis.

| Etapa | Arquivos | Cuidados |
| --- | --- | --- |
| 1. Já são toasts | `results/MatchResultCard.tsx`, `pages/MatchPage.tsx`, `pages/EventPage.tsx` | Apagar `useToast`, `ResultToast` e os dois `notify()`. "Os placares não bateram" vira aviso. |
| 2. Perfil e conta | `EditProfilePage`, `EditSheets`, `SportCard`, `ImageCropSheet`, `AccountActions`, `BlockedAccountsPage`, `ConnectionsPage`, `UserProfilePage`, `ArenaPage` | Em `ArenaPage`, o `error` mistura a carga de perfis e cidades com o salvamento do perfil: separar. |
| 3. Comunidade | `PostComposer`, `PostItem`, `PostActions`, `PostComments`, `ReportForm`, `SocialCommunity`, `CommunityPeople`, `NotificationsPage` | `PostComposer` mantém a validação da legenda e da imagem junto ao campo. |
| 4. Jogar e partida | `PlayPage`, `CancelSearchDialog`, `ProposalDialog`, `SlotOfferDialog`, `SlotSteppers`, `PrepareSearchSheet`, `RunHistorySheet`, `RunStopwatchDialog`, `MatchSheets`, `SlotsSheet`, `TermsSheet`, `ConditionsCard`, `CourtPicker`, `LineupRow`, `MyStatsCard`, `RosterSheet`, `ScoreEntry`, `ResultDecisionPage` | Separar em `PlayPage` (`feedback` mistura a placa com a ação), `ScoreEntry` e `TermsSheet` (`error \|\| problem`). O erro de envio do `MatchChat` continua junto ao campo de texto, porque a mensagem digitada precisa ser reenviada. |
| 5. Times | `TeamsPage`, `TeamFormPage`, `InviteFlow`, `InviteSheet`, `MemberSheet`, `TeamLinkPanel`, `JoinPage` | Em `TeamsPage`, o `listError` mistura a carga com a resposta a pedidos: separar. Em `TeamLinkPanel`, a falha ao copiar vira aviso. O estado de membro do `JoinPage` continua na tela. |
| 6. Eventos e organizador | `EventManagePage`, `EventMatchesPage`, `BracketPage`, `EventWizard`, `ReceiptsPage`, `OrganizerRequestPage`, `EntrySheets`, `EntryStatus`, `PixBlock`, `PaymentInfoSheet`, `EventNotices` (organizador), `EventSheets`, `OrganizerCard`, `OrganizerRequestForm`, `ReceiptSheet`, `RefundList`, `DecisionForm`, `ScheduleSheet` | Em `BracketPage`, as instruções ficam na tela e os resultados viram toast. Em `EventWizard`, separar o `general`. Em `RefundList` e `EventNotices`, a validação fica junto ao campo. O conflito de agenda continua na tela. |
| 7. Administração | `AdminReports`, `AdminCourtSuggestions`, `AdminOrganizerRequests`, `AdminPaidEvents`, `AdminRefundDisputes`, `AdminRevokedEvents`, `AdminWalkoverDisputes`, `OrganizerRequestSheet`, `AdminEventParts` | `AdminReports` mistura carga, decisão, reativação e validação numa só variável: separar nos quatro níveis. |
| 8. Entrada | `AuthPage`, `App.tsx` | A confirmação de cadastro ou recuperação vira toast. Os erros continuam no formulário. "Sessão expirou" e a falha do `/me` passam a ser estados separados. |
| 9. Limpeza | `ui/feedback.ts`, `ui/glass-variants.ts` | Remover o tom `success` e a variante `notice` que ficarem sem uso. Manter `error` para os blocos que continuam na tela (resumo "Revise os campos destacados"). |

### A7. Testes (web)

- **Unidade:**
  - A loja de conexão: transições, reconexão e `sheetDismissed`.
  - A classificação de `ApiError` no cliente (0, 502, 503 e 504 contra 4xx).
  - `useSubmit` e `reportActionError`: toast, campo, 401 e conexão.
  - As durações por tom.
- **Componentes:**
  - `ToastCard`: tons, ação, X, região viva e prioridade do erro.
  - `ConnectionNotice`: leitura liga a faixa, ação abre a folha, folha dispensada faz a faixa tremer, a conexão volta.
  - `LoadError`.
- **Fluxos (atualizar os testes que hoje procuram o bloco de sucesso):** os testes passam a procurar o texto na região do toast. Os testes de Pix já aguardam o retorno assíncrono e precisam continuar assim.
- Não criar testes que só repitam CSS.

## Parte B — Backend (`backend/`)

Não muda contrato. Apenas um teste para confirmar o que os clientes passam a assumir:

- Um teste de integração em que a dependência de sessão levanta `OperationalError` deve devolver **503** com `detail` em JSON. O inventário não confirmou se uma falha dentro do `with SessionLocal()` chega ao handler em todas as rotas.
- Um teste de `GET /health/ready` com o banco indisponível também deve devolver 503.
- Se algum caminho devolver o 500 em texto do Starlette, acrescentar o handler correspondente e registrar a mudança em [decisoes/0001-fundacao.md](decisoes/0001-fundacao.md).

## Parte C — Expo (`mobile/`)

### C1. Primitivos

- Em `components/toast/`, criar:
  - `toastStore` (mesma API: `toast.success | info | warning | error`).
  - `ToastCard`: vidro sólido, Coliseu via `ArenaMark`, anel em `react-native-svg` (já instalado) e animação de entrada, saída e pilha com `react-native-reanimated` 4.5 (já instalado).
  - `ToastViewport`.
- Dispensar arrastando para baixo com `PanResponder` (o projeto não tem `react-native-gesture-handler`; não instalar).
- **As folhas do Expo usam `Modal` nativo.** Um viewport montado só na raiz ficaria atrás delas. Por isso, montar um `ToastViewport` dentro de cada `Modal`: `Sheet.tsx`, `arena/ActionSheet.tsx`, `PostComposer`, `PostViewer`, `RunEntrySheet`, `QrScanner`, `VisitedProfile`, `CommunityScreen` e `EventWizardScreen`. Um contador de profundidade faz só o viewport mais interno exibir os toasts.
- Manter `announce` (iOS) e `accessibilityLiveRegion` (Android) em cada toast novo.

### C2. Conexão

- No Expo não há NetInfo, e o plano não o instala. A loja usa as mesmas regras da web, a partir de [client.ts](../mobile/src/api/client.ts): status 0, 502, 503 e 504, timeout de 15 s e de 120 s no upload.
- A reconexão consulta `/health/ready`.
- A folha reutiliza o `Sheet` escuro. A faixa fica acima da barra inferior, respeitando `safe-area`.

### C3. Migração

- **Confirmações:** os 15 `LiveNotice` e os 2 `Notice tone="success"` viram toast. O `LiveNotice` absoluto de `MatchScreen.tsx` também.
- **Erros de ação:** os ~45 `ErrorText` e os `Notice` de `action.error` passam pelo equivalente a `reportActionError`.
- **Carregamento:** os ~25 casos passam para o `LoadError` nativo.
- **Continuam como estão:** `FieldError`, a prop `error` dos campos, `BusyStatus`, `Situation` e o estado do `JoinScreen`.
- **Remover** `results/useToast.ts` e `results/ResultToast.tsx`.

### C4. Testes (Expo)

São os mesmos casos de unidade da web: loja, classificação e durações. Além deles:
- `ToastCard` e o viewport dentro de `Modal`;
- os testes de tela que procuravam o `LiveNotice`.

O build do Expo não comprova o comportamento no aparelho: a sobreposição sobre `Modal` precisa ser conferida em Android e iOS reais.

---

## Sequência e validação

| Etapa | Entrega | Verificações |
| --- | --- | --- |
| 1 | A1 a A5 (primitivos, conexão, `useSubmit`, `LoadError`) e migração da etapa 1 | Em `web/`: `npm run lint`, `npm run build`, `npm run test:coverage`. No navegador: os quatro tons, a pilha, a pausa, o X, F6 e Esc; derrubar a API e o banco para ver a faixa, a folha, o tremor e a volta. |
| 2 | A6, etapas 2 a 5 | As mesmas, com o fluxo real de cada área (ação, resposta da API, recarregar e conferir a persistência). Conferir 320, 390 e 1440 px, a navegação inferior e as folhas abertas. |
| 3 | A6, etapas 6 a 9 | As mesmas. Conferir o organizador e a administração com contas próprias. |
| 4 | Parte B | Em `backend/`: `ruff check app migrations tests` e `pytest -q` com `TEST_DATABASE_URL`. |
| 5 | Parte C | Em `mobile/`: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run export:android`. A validação em aparelho fica registrada como pendente, se não for feita. |

Cada etapa atualiza [situacao-fundacao.md](situacao-fundacao.md). O README não muda. [fidelidade-figma.md](fidelidade-figma.md) registra o novo padrão de mensagens como ajuste posterior pedido pelo usuário.

## Riscos e pontos de atenção

- **O volume da migração é grande** (cerca de 110 arquivos na web e 60 no Expo). O tratamento central em `useSubmit` e no cliente cobre a maior parte, mas cada arquivo precisa perder o bloco antigo e o `aria-live` que o envolvia. Fazer por área e com testes evita deixar mensagens duplicadas.
- **Mensagens que hoje ficam na tela e passam a sumir.** Confirmações longas com próximo passo ("Vaga reservada. Envie o comprovante…") são aviso de 7 s. Se o passo for crítico, a tela também precisa mostrar o estado, como o `EntryStatus` já faz.
- **Toast sobre folha aberta.** Na web, o viewport fica acima do `z-scrim`. No Expo, depende do viewport dentro de cada `Modal`.
- **Falso positivo de conexão.** Um 503 de outra origem, como um proxy, também liga o aviso. Isso é aceitável, porque o efeito é igual para o usuário, e a volta é confirmada pelo `/health/ready`.
- **`backdrop-filter`** tem custo em aparelhos fracos. Se o desempenho cair, a superfície usa a mesma cor sólida do Expo.
