# Plano — sino global, pendências e tela de notificações (backend + web + Expo)

> Estado: **apenas planejamento, 13 de outubro de 2026**. Nenhum código foi alterado.

## Contexto

Hoje as notificações funcionam, mas ficam escondidas:

- **O sino só existe no Início.** O cabeçalho de [HomePage.tsx](../web/src/pages/HomePage.tsx) mostra o sino com o contador de `GET /me/notifications/unread-count`. Fora dele, o acesso é a linha "Notificações" do [MenuPage.tsx](../web/src/pages/MenuPage.tsx). Ranking, Jogar, Comunidade e Perfil não mostram nada. O Expo repete esse desenho em [HomeScreen.tsx](../mobile/src/screens/HomeScreen.tsx).
- **O contador só é lido quando o Início monta.** Nenhuma outra tela atualiza o número, e os pedidos para seguir não entram na contagem.
- **A tela é uma subtela clara genérica.** [NotificationsPage.tsx](../web/src/pages/NotificationsPage.tsx) usa o cabeçalho padrão (voltar e título) de [ArenaPage.tsx](../web/src/pages/ArenaPage.tsx) e mostra "Solicitações para seguir" e "Atividades" numa única lista, sem filtro. Um convite ou uma proposta com prazo aparece igual a um aviso informativo.
- **O backend não sabe o que ainda pede resposta.** O modelo `Notification` ([notifications.py](../backend/app/models/notifications.py)) só tem `read_at`. Ao abrir uma proposta, a notificação vira "lida", mesmo que a proposta continue sem resposta. O contrato está em [0003-times-campeonatos.md](decisoes/0003-times-campeonatos.md), seção 7, e cobre 43 tipos ([services/notifications.py](../backend/app/services/notifications.py)).

## Decisões da sessão de protótipos

As decisões saíram da sessão de protótipos de 13 de outubro de 2026, em quatro rodadas. O protótipo está no artefato privado do usuário https://claude.ai/artifact/2DoUnfQyAaJE97ivzeHLk5 (a versão 4 mostra o desenho final). A fonte local fica em `artifacts/prototipos-notificacoes/notificacoes.src.html`, fora do versionamento.

| Parte | Decisão |
| --- | --- |
| Onde fica o sino | **Na barra de cada aba raiz**: Início, Ranking, Jogar, Comunidade e Perfil. Na barra clara, é um `IconButton`. Nas barras escuras (placa do Jogar e barra da Comunidade), um círculo de vidro. No Perfil, um botão de vidro sobre a capa, ao lado do Menu. |
| Subtelas | **Sem sino.** Partida, Evento, Meus times, Menu, formulários e o assistente de evento mantêm voltar e título. |
| Contador | **Número** de não lidas **mais** pedidos para seguir, com "9+" acima de 9. Verde (`brand`) com anel `app` na barra clara; menta com anel `forest` na escura. Nenhum contador na navegação inferior. |
| Tela | **Placa e filtros**: placa `forest` com o Coliseu ao fundo, voltar, título e "Ler todas"; uma linha de resumo ("4 não lidas · 3 pedem sua resposta"); chips *Tudo · Para responder · Partidas · Times · Eventos*. |
| Lista | **Pendências fixadas**: o bloco "Para responder" vem sempre primeiro, com cartões maiores (rótulo da pendência, texto, tempo, barra do prazo, "faltam 1 h 52" e o botão de ação). Depois vêm as linhas atuais, agrupadas em Hoje, Ontem e Esta semana. |
| Botão de ação | **Leva à tela do aviso** (mesmo destino de hoje: placa do Jogar, Meus times, partida, evento…). A decisão acontece lá, com o contexto completo. Nada se resolve dentro da notificação. |
| Pedidos para seguir | Uma linha-resumo com avatares ("2 pedidos para seguir · Bruna Alves e Diego Souza") no topo de *Tudo*, que abre a subtela **Pedidos para seguir**, com aprovar, recusar e "Aprovar todas". |
| Início | **Placa compacta "Para responder"** abaixo do cumprimento e antes de "Seu elo". Mostra as 2 pendências mais urgentes, com prazo, e "Ver as N pendências", que abre a tela no chip *Para responder*. Sem pendência, a placa some. |
| Pendências | **Calculadas pelo backend.** A notificação passa a ter uma chave de ação, um prazo e uma data de resolução. |
| Filtros | **No servidor**, com paginação correta e contagens vindas do backend. |
| Atualização | O resumo é recarregado na troca de aba raiz, quando o app volta ao primeiro plano e a cada 60 s com o app visível. Sem tempo real. |
| Escopo | **Backend, web e Expo** na mesma entrega. |

Decisões tomadas pelo plano (podem ser revistas antes de implementar):

- **Contagem dos chips.** *Para responder* mostra o total de pendências abertas. *Partidas*, *Times* e *Eventos* mostram as não lidas da categoria, só quando houver. *Tudo* não mostra número. Assim, os chips não exibem totais históricos crescentes.
- **Pendência lida continua pendente.** Tocar marca como lida, mas o cartão só sai do bloco quando a ação é resolvida ou o prazo vence. Com tudo lido e pendências abertas, o resumo diz "Tudo lido · 3 ainda pedem sua resposta".
- **Sem preenchimento retroativo.** Notificações anteriores à migração ficam sem chave de ação e nunca aparecem como pendentes. As filas da administração e as telas de origem continuam mostrando o que estiver aberto.
- **Linha "Notificações" do Menu permanece**, agora com o contador como `value`, como acesso alternativo.

## Contrato do backend

### Migração

Nova migração Alembic em `backend/migrations/versions/`, sem alterar o histórico:

| Coluna | Tipo | Uso |
| --- | --- | --- |
| `action_key` | `String(80)`, nula | Identifica o objeto que pede resposta (ex.: `invite:42`, `proposal:17:user:9`). Nula para avisos informativos. |
| `action_until` | `DateTime(timezone=True)`, nula | Prazo para responder. Nulo quando não há prazo. |
| `resolved_at` | `DateTime(timezone=True)`, nula | Quando a ação foi resolvida (por quem recebeu ou por outro papel). |

Índices: `ix_notifications_action_open` em `(action_key)` com `WHERE resolved_at IS NULL AND action_key IS NOT NULL`, para resolver por chave, e `ix_notifications_user_pending` em `(user_id)` com a mesma condição, para contar e listar as pendências. A categoria **não** vira coluna: é derivada do tipo no serviço (`NOTIFICATION_CATEGORY`), como o resto do catálogo de tipos.

Uma notificação está **pendente** quando `action_key IS NOT NULL AND resolved_at IS NULL AND (action_until IS NULL OR action_until > now())`.

### Serviço (`app/services/notifications.py`)

- `notify(...)` e `notify_many(...)` ganham `action_key: str | None` e `action_until: datetime | None`, ambos opcionais. Os tipos com ação ficam num conjunto `ACTION_TYPES`, e `_check` exige `action_key` neles. Quando o mesmo tipo vai a vários papéis (ex.: `devolucao_contestada` para o organizador e a administração), só a chamada do papel que decide recebe a chave.
- `resolve_actions(db, key, *, user_ids=None)` faz o `UPDATE ... SET resolved_at = now()` nas notificações abertas com essa chave, de todos os destinatários ou só de `user_ids`. Assim como `notify`, não faz commit; quem chama comita na mesma transação da mudança.
- `NOTIFICATION_CATEGORY: dict[str, Literal['partidas', 'times', 'eventos', 'conta']]` é preenchido para todos os tipos de `NOTIFICATION_TYPES`, e um teste garante que nenhum tipo fica de fora.
- `summary(db, user)` devolve as não lidas, os pedidos para seguir pendentes, as pendências abertas e as não lidas por categoria, em consultas agregadas (sem N+1).

Categorias: **partidas** reúne propostas, vagas, ofertas, condições, partida agendada ou cancelada, W.O., resultados, estatísticas, remoção da partida, adversário, divergência e decisão. **times** reúne convites, pedidos de entrada, remoção e encerramento de time. **eventos** reúne evento, aviso, inscrição, comprovantes, reserva, devoluções, tabela e encerramento. **conta** reúne pedido de organizador, revogação e quadra decidida, e só aparece em *Tudo*.

### Tipos com ação

| Tipo | Quem recebe | Chave | Prazo | Resolve quando | Onde chamar |
| --- | --- | --- | --- | --- | --- |
| `convite_time` | Convidado | `invite:{invite_id}` | Validade do convite, se houver | Convite aceito, recusado, cancelado ou expirado; time encerrado | `team_invites.py` |
| `pedido_entrada` | Representantes | `join_request:{request_id}` | — | Pedido decidido ou cancelado (para todos os representantes) | `team_invites.py` |
| `proposta_partida` | Cada lado | `proposal:{match_id}:user:{user_id}` | `expires_at` | O próprio lado responde; a proposta é encerrada (para todos) | `matchmaking_queue.py` |
| `vaga_encontrada` | Avulso | `slot:{slot_id}:user:{user_id}` | `expires_at` | Resposta; vaga preenchida ou retirada | `matchmaking_queue.py` |
| `condicoes_propostas` | Outro lado | `terms:{terms_id}` | — | Condições aceitas, recusadas ou substituídas; partida cancelada | `matches.py`, `match_events.py` |
| `wo_registrado` | Lado acusado | `wo:{match_id}` | `contest_until` | W.O. contestado ou decidido | `matches.py`, `match_rules.py` |
| `resultado_divergente` | Os dois lados | `result:{match_id}` | `deadline` | Placares batem, o organizador decide ou o prazo encerra | `results.py`, `match_events.py` |
| `comprovante_decidido` (recusado) | Inscrito | `entry_receipt:{entry_id}` | `reserved_until` | Novo comprovante enviado; reserva expirada | `events.py`, `entries.py` |
| `devolucao_enviada` | Participante | `refund:{receipt_id}` | 7 dias (confirmação automática) | Confirmada, contestada ou confirmada automaticamente | `entries.py` |
| `comprovante_recebido` | Organizador | `receipt:{receipt_id}` | — | Comprovante decidido | `entries.py`, `events.py` |
| `divergencia_para_decidir` | Organizador | `decision:{match_id}` | `deadline` | Decisão registrada | `championship_lifecycle.py` |
| `evento_para_aprovar` | Administração | `event_review:{event_id}` | — | Evento decidido por qualquer conta administrativa | `events.py` |
| `devolucao_contestada` | Administração | `refund_dispute:{receipt_id}` | — | Devolução decidida | `entries.py`, `events.py` |
| `wo_contestado` | Administração | `wo_dispute:{match_id}` | — | W.O. decidido | `matches.py`, `match_rules.py` |

Antes de implementar, confira em cada serviço o nome real dos estados e das funções de decisão. Os nomes de arquivo acima vêm de uma busca pelos tipos.

### Endpoints (`app/routers/notifications.py`)

O titular sempre vem da sessão.

| Método e rota | Mudança |
| --- | --- |
| `GET /me/notifications?categoria=&pendente=` | Ganha filtros opcionais: `categoria` ∈ `partidas`, `times`, `eventos` e `pendente` ∈ `true`, `false`. Mantém a paginação por cursor (`created_at`, `id`). *Tudo* usa `pendente=false` abaixo do bloco fixado. |
| `GET /me/notifications/pending?categoria=&limit=` | **Nova.** Lista as pendências abertas sem cursor, ordenadas por urgência (`COALESCE(action_until, 'infinity')` crescente, depois `created_at` decrescente). `limit` vai de 1 a 50, com padrão 20. O Início usa `limit=2`. |
| `GET /me/notifications/summary` | **Nova.** Devolve `{ unread_count, follow_requests_count, pending_count, unread_by_category: { partidas, times, eventos } }`. |
| `GET /me/notifications/unread-count` | Permanece, por compatibilidade. |
| `PUT /me/notifications/{id}/read` e `PUT /me/notifications/read-all` | Passam a devolver o resumo. Ele contém `unread_count`, então os clientes atuais continuam funcionando. |

`NotificationOut` ganha `category`, `pending: bool` e `action_until: datetime | None`. `read_at` não muda.

## Web

### Estado compartilhado do resumo

- **`web/src/hooks/useNotificationSummary.ts`** (novo) lê `GET /me/notifications/summary` com `useResource`. Recarrega quando `ArenaPage` troca de aba raiz, em `visibilitychange`/`focus` e a cada 60 s com `document.visibilityState === 'visible'`. Expõe `data`, `reload` e `setData`, e trata 401 com `onExpired`.
- É instanciado **uma vez** em `ArenaPage`, como `usePlayBoard`, e repassado às telas raiz e à tela de notificações. Ler, ler todas, aprovar ou recusar um pedido chama `setData` com a resposta (ou `reload`).
- **`web/src/api/notifications.ts`**: tipos `NotificationSummary`, `NotificationCategory` e os campos novos de `ArenaNotification`; funções `getNotificationSummary`, `listPendingNotifications(params)` e `notificationsPath(params)`.

### Sino

- **`web/src/components/notifications/NotificationBell.tsx`** (novo) recebe `count`, `tone: 'light' | 'dark' | 'cover'` e `onOpen`. O `aria-label` diz "Notificações, 5 novas" ou só "Notificações", e o contador fica `aria-hidden`. Usa `IconButton` (claro), o círculo de vidro das placas (escuro) e `IconButton tone="cover"` (Perfil), com foco visível em cada tom.
- Pontos de uso, só nas abas raiz:
  - Início: substitui o botão inline de `HomePage.tsx`, que deixa de chamar `getUnreadCount`.
  - Ranking: lado direito do cabeçalho padrão em `ArenaPage.tsx` quando `screen === 'ranking'` (hoje é um espaçador `w-11`).
  - Jogar: barra da placa em `PlayPage.tsx`, depois do chip da cidade. Confira a 320 px se a cidade continua legível (o chip já trunca).
  - Comunidade: barra de `SocialCommunity.tsx`, antes do botão "+".
  - Perfil: `trailing` da `ProfileTopbar` no perfil próprio, antes do Menu. Não aparece no perfil de outra pessoa.
- `MenuPage.tsx`: a linha "Notificações" ganha `value` com o mesmo número.

### Tela de notificações

- Em `ArenaPage.tsx`, `notifications` passa a usar layout de placa própria (`px-0 pt-0`, sem o cabeçalho padrão), como `event-receipts`. A entrada da pilha ganha `filter?: NotificationFilter` para abrir já num chip (usado pela placa do Início).
- **`NotificationsPage.tsx`** fica como orquestradora e passa a usar componentes novos em `web/src/components/notifications/`:
  - `NotificationsPlate`: placa `forest` (raio inferior de 26 px, Coliseu a ~5% de opacidade), voltar, título, "Ler todas" (só com não lidas), linha de resumo e chips. Os chips formam um grupo de opção única acessível, com setas e seleção, e são reaproveitados de um componente existente se algum servir (`PlateChips`, `ToggleGroup`) antes de criar outro.
  - `PendingCard`: cartão branco com borda `brand` a 13%. Rótulo curto em mono maiúsculo ("PARTIDA ENCONTRADA"), texto em negrito, tempo relativo, barra do prazo (verde; âmbar com menos de 25% do tempo ou menos de 3 h) e rodapé com "faltam 1 h 52" (ou "sem prazo") e o botão primário. O botão marca como lida e navega para o mesmo destino de `notificationView`. A contagem usa `useNow(60_000)`, e a barra vai de `created_at` até `action_until`.
  - `FollowRequestsLine`: avatares empilhados, "N pedidos para seguir" e os nomes. Abre a nova subtela.
  - A lista agrupada por dia reaproveita `NotificationItem`. O agrupamento (`groupByDay`) e os textos curtos ficam em `data/notifications.ts`.
- `data/notifications.ts` ganha `pendingView(notification)`, com rótulo curto, linha secundária e texto do botão ("Responder proposta", "Ver convite", "Contestar W.O.", "Enviar comprovante", "Confirmar devolução", "Decidir resultado"…) para cada tipo da tabela acima. O destino continua vindo de `notificationView`.
- Consultas por chip: *Tudo* faz `pending` mais a lista com `pendente=false`. *Para responder* faz só `pending`. *Partidas*, *Times* e *Eventos* fazem `pending?categoria=` mais a lista com `categoria=&pendente=false`. Trocar de chip não recarrega o resumo.
- Estados: carregando ("Carregando notificações…"); erro da seção com "Tentar novamente"; tela vazia com o Coliseu e o texto atual do `EmptyState`; chip vazio ("Nada neste filtro."); "Carregar mais" mantido. A confirmação de "Ler todas" segue o [plano dos toasts](plano-toasts.md) se ele já estiver implementado; senão, usa o bloco atual de sucesso.

### Pedidos para seguir

- Nova subtela `follow-requests` ("Pedidos para seguir") em `data/arena.ts` (`Screen`, títulos e `activeNavFor` acendendo "Início"). A lista, "Aprovar todas" e os botões de aprovar e recusar saem de `NotificationsPage.tsx` para `FollowRequestsPage.tsx`, sem mudar o comportamento.

### Placa do Início

- **`web/src/components/notifications/PendingPlate.tsx`** (novo): placa `forest` com raio de 20 px e Coliseu ao fundo. Título "Para responder" com o sino menta e a pílula menta com o total; até 2 linhas (escudo do time ou ícone menta, rótulo curto, linha secundária truncada, etiqueta de prazo menta, âmbar ou neutra, chevron); e o link menta "Ver as N pendências" (ou "Ver notificações" quando N ≤ 2). Tocar numa linha leva ao destino do aviso. O link abre a tela no chip *Para responder*.
- `HomePage.tsx` lê `listPendingNotifications({ limit: 2 })` e usa `summary.pending_count`. Sem pendências, a placa não é renderizada. Erro na leitura também não mostra a placa nem bloqueia o Início.

## Expo

Mesma estrutura, com os componentes nativos já existentes:

- `mobile/src/api/notifications.ts`: mesmos tipos e funções da web.
- `mobile/src/hooks/useNotificationSummary.ts`: recarrega na troca de aba, com `AppState` voltando a `active` e a cada 60 s em primeiro plano. Instanciado em [ArenaShell.tsx](../mobile/src/screens/ArenaShell.tsx).
- `mobile/src/components/notifications/NotificationBell.tsx` nos cabeçalhos de `HomeScreen`, `RankingScreen`, `PlayScreen`, `CommunityScreen` e `ProfileScreen` (perfil próprio). Use `accessibilityLabel` com o número e um alvo de 44 pt.
- `NotificationsScreen.tsx` com `NotificationsPlate`, `PendingCard`, `FollowRequestsLine` e a lista agrupada. Nova tela `follow-requests` em `navigation/routes`. `PendingPlate` em `HomeScreen.tsx`.
- Confira se `hasOwnHeader` e `isRootScreen` de `navigation/routes` ainda decidem certo onde a barra própria aparece.

## Ordem de implementação

1. **Backend**: migração, catálogo de categorias e de ações, `resolve_actions`, chaves nos `notify` dos tipos com ação, resolução em cada serviço, endpoints, schemas e testes. Atualizar [0003-times-campeonatos.md](decisoes/0003-times-campeonatos.md), seção 7.
2. **Web**: API e hook do resumo, `NotificationBell` nas cinco abas, tela (placa, chips, pendências e lista), subtela de pedidos, placa do Início e testes.
3. **Expo**: o mesmo conjunto, com testes.
4. **Documentação**: [situacao-fundacao.md](situacao-fundacao.md) com o que mudou, as verificações executadas e as limitações.

Cada etapa pode virar um commit local separado. Push e PR só depois da validação do usuário.

## Testes e validação

Backend (`backend/`):

- Unitários: todo tipo de `NOTIFICATION_TYPES` tem categoria; `_check` exige `action_key` nos tipos de `ACTION_TYPES`; a regra de pendência respeita prazo vencido e resolução.
- Integração com PostgreSQL (`TEST_DATABASE_URL`):
  - o resumo soma não lidas, pedidos para seguir e pendências, isolado por titular;
  - `categoria` e `pendente` filtram com cursor correto;
  - `pending` ordena por urgência e omite as vencidas;
  - para cada tipo da tabela, a ação real resolve a pendência (ex.: aceitar o convite resolve `invite:{id}`; a decisão de uma conta administrativa resolve para todas);
  - ler mantém a pendência aberta;
  - os endpoints de leitura devolvem o resumo.
- Comandos: `.venv/Scripts/python.exe -m ruff check app migrations tests`, `.venv/Scripts/python.exe -m pytest -q` e, após aplicar a migração em banco de desenvolvimento ou teste, `.venv/Scripts/python.exe -m alembic check`.

Web (`web/`):

- Testes de `NotificationBell` (número, "9+", `aria-label`, ausência sem novidades), de `NotificationsPage` (consulta de cada chip, bloco fixado, chip vazio, "Ler todas" atualiza o resumo, botão do cartão marca como lida e navega), de `PendingPlate` (2 itens, link com o total, some sem pendências) e de `useNotificationSummary` (recarga no foco e no intervalo, com timers falsos).
- `npm run lint`, `npm run build` e `npm run test:coverage`. No navegador, a 320, 390 e 1440 px: sino nas cinco abas, sem overflow horizontal, foco visível, rolagem com a navegação inferior, tela aberta pelo sino e pela placa, persistência de lida e pendência após recarregar.

Expo (`mobile/`):

- Testes equivalentes. `npm run lint`, `npm run typecheck`, `npm run test:coverage` e `npm run export:android`. O build não comprova funcionamento em aparelho; registre se houve ou não validação em Android ou iOS.

## Riscos e pontos de atenção

- **Resolução espalhada.** São cerca de 14 tipos em 10 serviços. Um ponto de resolução esquecido deixa a pendência aberta até o prazo, ou para sempre, se não houver prazo. Mitigação: um teste de integração por tipo e uma busca pelos estados finais de cada objeto.
- **Destinatários múltiplos.** Propostas e vagas usam chave por usuário, para que a resposta de um lado não apague a do outro. Filas da administração usam chave compartilhada.
- **Barra do Jogar a 320 px.** O sino divide espaço com o chip da cidade e o título. Pode ser preciso reduzir o chip a ícone abaixo de certa largura.
- **Consultas extras no Início.** O Início passa a ler o resumo (no `ArenaPage`) e as 2 pendências. Ambas são leves, e o resumo deixa de ser lido separadamente pelo Início.
- **Contrato compartilhado.** Web e Expo dependem dos campos novos de `NotificationOut` e do resumo. Atualize os dois clientes e o documento 0003 na mesma entrega.
