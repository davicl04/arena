# Decisões e contratos — Times e campeonatos

Data: 12 de outubro de 2026. Contrato da **etapa 1** da execução (fases 1 a 3 do [plano de Times e campeonatos](../plano-times-campeonatos.md)): times, papéis, convites, link do time com pedido de entrada, encerrar time, pedido de organizador com fila e decisão da administração, e revogação pela administração. A **etapa 2** (fases 4 e 5: eventos, inscrições, comprovantes, devoluções e canal de avisos) está nas seções 10 e 12 a 20; o lado do atleta fica em [0002, seção 6](0002-jogar.md#6-fase-7--campeonatos-e-provas-lado-do-atleta). A **etapa 4** (fases 6 e 7: chaveamento, agenda das partidas e divergência decidida pelo organizador) está na seção 21; o uso das partidas de campeonato está em [0002, seção 17](0002-jogar.md#17-uso-nas-partidas-de-campeonato-etapa-4). O contrato da linha do elo e de `GET /me/standings` está em [0002-jogar.md](0002-jogar.md).

> **Estado (etapa 1 implementada e integrada em 12 de outubro de 2026):** as seções 1 a 9 estão implementadas no backend (migração `0005`, `app/routers/teams.py`, `app/routers/organizers.py`, `app/routers/notifications.py` e os serviços da seção 9) e na web (Meus times, convites, link do time, organizador, filas da administração e Notificações). O Expo passou a consumir este contrato na etapa 6. Os desvios das frentes, já incorporados abaixo, estão resumidos na seção 9.1. As fases 4 a 7 seguem na seção 10.
>
> **Etapa 2 (backend e web implementados e integrados em 12 de outubro de 2026):** as seções 10 a 19 estão implementadas no backend: o esquema (migração `0008`), as regras puras (`app/services/event_rules.py`), a mídia privada de comprovante (imagem ou PDF), a varredura (`python -m app.admin_cli sweep [--loop 60]`, no README), o lado do organizador e da administração (`app/routers/events.py`, `app/services/events.py`, `app/schemas/organizer_events.py`) e o lado do atleta, dos comprovantes e das devoluções (`app/routers/entries.py`, `app/services/entries.py`, `app/schemas/entries.py`, com o contrato na [seção 6 de 0002](0002-jogar.md#6-fase-7--campeonatos-e-provas-lado-do-atleta)). A conciliação dos dois backends unificou as peças duplicadas, fixou a ordem global das travas (seção 19.1) e conferiu o fluxo ponta a ponta só pela API. A web da etapa 2 está implementada e integrada: Criar evento (V4), Meus eventos (O3), gestão (G3, com Inscritos, Dados do evento e Pagamento e Pix dentro dela), Comprovantes e devoluções (A2), as filas "Eventos pagos", "Eventos de organizador revogado" e "Devoluções contestadas" no Menu da administração, Campeonatos e Provas do atleta (E2 e D2, [0002, seção 6](0002-jogar.md#6-fase-7--campeonatos-e-provas-lado-do-atleta)) e as notificações dos tipos novos, conferidos num fluxo real no navegador. O Expo passou a consumir este contrato na etapa 6. Os desvios das frentes e da conciliação do backend, já incorporados às seções abaixo, estão na seção 20.1; os da web, na seção 20.2.

> **Etapas 4 e 5 (backend e web implementados e integrados em 12 de outubro de 2026; Expo na etapa 6):** a seção 21 (etapa 4: campeonatos) e a [seção 18 de 0002](0002-jogar.md#18-fase-6--corrida-marcas-e-elo-por-distância) (etapa 5: corrida) estão implementadas no backend e conciliadas com o backend integrado da etapa 3 (migrações `0010` e `0011`; `app/services/bracket_rules.py`, `app/services/championship.py`, `app/services/championship_lifecycle.py`, `app/routers/brackets.py`, `app/services/runs.py` e `app/routers/runs.py`). A conciliação corrigiu a ordem de travas do avanço do vencedor, fez a janela de 52 semanas olhar também o bônus do tênis e ampliou o `FakeDb` dos testes de unidade para as consultas novas (seção 21.10). A web consome os dois contratos (`api/brackets.ts`, `api/runs.ts`, as telas `event-bracket`, `event-matches` e `result-decision` e a corrida na placa do Jogar); os desvios da web estão na seção 21.11 e, para a corrida, na [seção 18.9 de 0002](0002-jogar.md#189-desvios-da-web-etapa-5). O Expo consome estes contratos desde a etapa 6.

> **Estado do Expo (etapa 6, 12 de outubro de 2026):** o Expo consome as seções 1 a 21 e o [0002](0002-jogar.md) sem alterar o contrato (`mobile/src/api/`). Os desvios do Expo (folhas no lugar de diálogos, PDF e salvar arquivo só na web, Pix e link por texto selecionável e `Share`, câmera para o QR no link do time) e o que não foi verificado (aparelho, leitor de tela, API real e paridade visual) estão em [situação da fundação](../situacao-fundacao.md).

Este documento é a fonte da verdade entre o backend e os clientes. Desvios exigem atualizar este arquivo.

## 1. Convenções

- **Prefixo** `/api/v1`. Toda rota exige sessão (cookie HttpOnly na web, Bearer no Expo); sem sessão, `401 Entre na sua conta para continuar.` O titular vem sempre da sessão, nunca de um ID enviado pelo cliente.
- **Corpo:** ações recebem JSON, mesmo quando vazio (`{}`); campos desconhecidos são recusados (`422`). `DELETE` não tem corpo. Uploads são `multipart/form-data` com o campo `file` e entram nos padrões de upload de `app/main.py`. O middleware de `Origin` e a exigência de JSON não mudam.
- **Listas paginadas:** `{ items, next_cursor }`, parâmetros `cursor` e `limit` (padrão 20, máximo 50), do mais recente para o mais antigo, como em `GET /users`. Listas curtas por natureza (meus times, elenco, convites e pedidos de um time) não são paginadas e respondem `{ items }`.
- **Datas** em ISO 8601 com fuso (UTC).
- **Erros:** `{ "detail": "mensagem em português" }`. Validação de campos: `422` com `{ "detail": "Revise os campos informados.", "fields": [{ "field", "message" }] }`. `404` vale tanto para o que não existe quanto para o que o titular não pode ver (não revela existência). `403` só para quem pode ver o recurso, mas não tem o papel exigido. `409` para conflito de estado. Imagens: `413`, `415`, `422` e `503` como no avatar.
- **Concorrência:** toda mudança de elenco, papel, convite, pedido ou estado do time trava a linha do time (`SELECT … FOR UPDATE`) antes de ler o elenco; decisões travam também a linha do convite ou do pedido. A autorização vem antes da trava: a visibilidade (`404`) e o papel (`403`) são conferidos sem travar, e só então o time e o elenco são travados e conferidos de novo (`teams.lock_context`), de modo que quem não pode agir nunca segura nem espera a linha do time; ler um link que já existe não trava. Os índices únicos parciais são a última barreira: um `IntegrityError` de corrida é tratado como reenvio (devolve o existente) ou `409`. Eventos, inscrições e comprovantes seguem a ordem global da seção 19.1.
- **Efeitos colaterais:** a transição, as notificações (`services/notifications.py`) e o registro de auditoria (`services/audit.py`) são gravados **no mesmo commit**.

### Tipos comuns (TypeScript)

```ts
type Sport = 'futebol' | 'tenis' | 'corrida'
type Position = 'goleiro' | 'defesa' | 'meio_campo' | 'atacante'
type FootballFormat = 'futsal' | 'society' | 'campo'
type Tier = 'bronze' | 'prata' | 'ouro' | 'diamante' | 'lendario'
type TeamRole = 'representante' | 'membro'
interface Page<T> { items: T[]; next_cursor: string | null }
interface City { id: number; name: string; state: string }

/** Pessoa resumida. Nome e @ são visíveis a membros autenticados; avatar_url é null se houver bloqueio. */
interface Person { id: number; name: string; username: string; avatar_url: string | null }

/** Célula da grade Futsal | Society | Campo (C5). Definida em 0002-jogar.md. */
interface FormatStanding {
  format: FootballFormat
  state: 'sem_jogos' | 'classificacao' | 'ranqueado'
  tier: Tier | null            // só em 'ranqueado'
  played: number               // partidas confirmadas (n de "n/3")
  required: number             // 3
  rank_position: number | null
  metric_value: number | null
  faces: Tier[]
  faces_any_level: boolean
}
```

## 2. Esquema (migração `0005`)

| Tabela | Conteúdo e restrições |
| --- | --- |
| `teams` | `name` (3–40), `city_id`, `crest_media_id` (opcional), `created_by_id`, `state` (`ativo` \| `encerrado`), `closed_at`/`closed_by_id`, `link_nonce`, `link_token_hash` (único), `link_generated_at`. Checks: estado; `encerrado` ⇔ `closed_at`; link completo ou ausente, e time encerrado sem link. |
| `team_members` | Uma linha por passagem pelo time: `role`, `position` (posição exibida no elenco), `joined_via` (`criacao` \| `convite` \| `pedido`), `joined_at`, `left_at`, `left_reason` (`saiu` \| `removido` \| `time_encerrado`), `removed_by_id`. Único parcial `(team_id, user_id)` com `left_at IS NULL`. Voltar ao time cria nova linha; o histórico fica. |
| `team_invites` | `invitee_id`, `inviter_id`, `message` (até 140), `state` (`pendente` \| `aceito` \| `recusado` \| `cancelado`), `decided_at`, `decided_by_id`. Único parcial `(team_id, invitee_id)` com `state = 'pendente'`; `pendente` ⇔ `decided_at` nulo. |
| `team_join_requests` | Pedido pelo link: `user_id`, `state` (`pendente` \| `aprovado` \| `recusado` \| `cancelado`), `decided_at`, `decided_by_id`. Único parcial `(team_id, user_id)` pendente. |
| `organizer_requests` | `display_name` (até 80), `city_id`, `sports` (1 a 3 de `futebol`/`tenis`/`corrida`), `experience` (até 1000), `contact` (até 120), `link` (até 300), `terms_version` e `terms_accepted_at`, `state` (`em_analise` \| `aprovado` \| `recusado` \| `cancelado`), `reason_code`, `reason_detail` (até 500), `decided_by_id`, `decided_at`. Único parcial por usuário em análise; `recusado` exige `reason_code`. |
| `organizers` | `user_id`, `request_id`, `display_name`, `approved_by_id`, `approved_at`, `revoked_at`, `revoked_by_id`, `revoke_reason`. **A permissão é a linha ativa** (`revoked_at IS NULL`, único parcial por usuário); linhas revogadas ficam como histórico. |
| `notifications` | `user_id`, `actor_id`, `type`, `payload` (JSONB), `created_at`, `read_at`. Índices `(user_id, created_at, id)` e não lidas por usuário. O tipo é validado no serviço (sem `CHECK`), para as fases seguintes acrescentarem tipos sem migração. |
| `audit_log` | `actor_id` (nulo para sistema), `action`, `target_type`, `target_id`, `data` (JSONB), `created_at`. |
| `rank_cuts`, `standings` | Ver [0002-jogar.md](0002-jogar.md). |

A regra **"pelo menos um representante ativo"** não é restrição de banco: é garantida no serviço, na mesma transação que trava o time. Chaves estrangeiras para pessoas que decidem usam `SET NULL`; vínculos do próprio titular usam `CASCADE`. Times nunca são apagados: encerrar preserva elenco, convites, pedidos e (nas fases seguintes) partidas e ranking.

## 3. Times (fase 1) — frente A

### Objetos

```ts
interface RosterPreviewItem {
  user_id: number
  first_name: string           // primeira palavra do nome
  avatar_url: string | null
  position: Position | null
  is_representative: boolean   // braçadeira "C"
}

/** Carteirinha C5. */
interface TeamCard {
  id: number
  name: string
  initials: string             // escudo neutro: "Leões do Cerrado" → "LC", "Ferrugem" → "FE"
  city: City
  crest_url: string | null     // /api/v1/teams/{id}/crest?v={media_id}
  my_role: TeamRole | null     // null para quem não é do elenco (convidado, link)
  member_count: number
  representative_count: number
  roster_preview: RosterPreviewItem[]  // até 11 (E1); o "+N" usa member_count
  formats: FormatStanding[]    // sempre 3, na ordem futsal, society, campo
  pending_join_requests: number | null // só para representantes; null para os demais
  pending_invites: number | null       // idem
  created_at: string
}

interface TeamMember {
  user_id: number
  name: string
  first_name: string
  username: string
  avatar_url: string | null
  position: Position | null
  role: TeamRole
  joined_at: string
  is_me: boolean
}
```

- **Ordem do elenco** (prévia e lista completa): representantes primeiro, depois pela data de entrada (mais antiga primeiro) e pelo id.
- **Iniciais:** primeira letra da primeira e da última palavra, ignorando `de`, `da`, `do`, `das`, `dos` e `e`; com uma palavra só, as duas primeiras letras; em maiúsculas (`Team.initials`).
- **Grade de formatos:** `rankings.team_format_grid(db, team_ids)` monta a grade de vários times numa consulta. Sem partidas, as três células saem `sem_jogos`.
- **Visibilidade de um time** (`GET /teams/{id}`, `GET /teams/{id}/members`): membro ativo, quem tem convite pendente do time e quem tem pedido de entrada pendente. Para os demais, `404 Time não encontrado.` Time encerrado responde `404` a todos. Quem escaneia o link vê o time por `GET /join/{token}`.
- **Bloqueios:** o elenco aparece completo; o avatar de quem tem bloqueio com o visitante (em qualquer sentido) ou de conta inativa sai `null`.
- **Posição no elenco:** ao entrar no time (criar, aceitar convite ou ter o pedido aprovado), `position` recebe a posição preferida do **próprio** perfil de futebol naquele momento (ou `null`). O perfil esportivo continua privado; só essa cópia, criada por uma ação do próprio atleta, aparece a quem vê o time. O atleta troca a própria posição em `PATCH /teams/{id}/members/{user_id}`. Recomenda-se que a web informe "Sua posição preferida aparece no elenco" ao aceitar e ao pedir para entrar.

### Rotas

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /teams` | qualquer atleta | `{ name: string; city_id: number }` | `201 TeamCard` (`my_role: 'representante'`) |
| `GET /me/teams` | titular | — | `{ items: TeamCard[] }` |
| `GET /teams/{id}` | visibilidade acima | — | `TeamCard` |
| `PATCH /teams/{id}` | representante | `{ name?: string; city_id?: number }` (ao menos um) | `TeamCard` |
| `PUT /teams/{id}/crest` | representante | multipart `file` | `TeamCard` |
| `DELETE /teams/{id}/crest` | representante | — | `204` (idempotente) |
| `GET /teams/{id}/crest?v={media_id}` | qualquer atleta logado | — | imagem WebP, `Cache-Control: no-store` (o middleware global vale para todas as respostas) |
| `GET /teams/{id}/members` | visibilidade acima | — | `{ items: TeamMember[] }` |
| `PATCH /teams/{id}/members/{user_id}` | ver abaixo | `{ role?: TeamRole; position?: Position \| null }` (ao menos um) | `TeamMember` |
| `DELETE /teams/{id}/members/{user_id}` | ver abaixo | — | `204` |
| `POST /teams/{id}/close` | representante | `{}` | `204` |

**`POST /teams`:** o nome é aparado e espaços internos repetidos viram um; 3 a 40 caracteres. A cidade precisa existir no catálogo (`422 Selecione uma cidade do catálogo.`); a web sugere a cidade do perfil de futebol, com "Trocar". Cria o time `ativo`, o vínculo `representante` (`joined_via = 'criacao'`) e o link (`team_links.issue`). Auditoria `time.criado`. O brasão é enviado depois, por `PUT /teams/{id}/crest`. Não há unicidade de nome.

**`GET /me/teams`:** times ativos em que o titular é membro ativo; representante primeiro, depois pela data de entrada.

**`PATCH /teams/{id}`:** `403 Só representantes podem editar o time.` para membros. Auditoria `time.editado` com os campos alterados.

**Brasão:** mesma validação e normalização do avatar (JPEG, PNG ou WebP estático, até 5 MiB e 25 megapixels; WebP quadrado de até 512 px, sem metadados), **preservando a transparência** (WebP com alfa; o avatar continua achatado em RGB), objeto privado `crests/{media_id}.webp`, `media_objects.user_id` = quem enviou. O brasão anterior é removido depois do commit. A reconciliação de órfãos (`app.media_admin reconcile`) já preserva brasões vinculados. A leitura confere que `v` é o brasão atual do time ativo (`404 Brasão não encontrado.`). `403 Só representantes podem trocar o brasão.`

**`PATCH /teams/{id}/members/{user_id}`:**
- `role` só por representante (`403 Só representantes podem mudar a braçadeira.`). Tirar a braçadeira do último representante: `409 O time precisa de pelo menos um representante. Passe a braçadeira a outro atleta antes.` Promover quem já é representante é idempotente. Auditoria `membro.papel_alterado` (`{ team_id, user_id, role }`).
- `position` só pelo próprio atleta (`403 Cada atleta escolhe a própria posição no time.`). Sem auditoria. A web da etapa 1 ainda não tem tela para trocar a própria posição: o elenco mostra a cópia feita ao entrar.
- Alvo que não está no elenco ativo: `404 Atleta não está no elenco.`

**`DELETE /teams/{id}/members/{user_id}`:**
- **Sair** (`user_id` = titular): qualquer membro. O último representante recebe `409 Você é o último representante. Passe a braçadeira a outro atleta ou encerre o time.` Grava `left_reason = 'saiu'`. Auditoria `membro.saiu`. Sem notificação.
- **Remover** (outro atleta): só representante (`403 Só representantes podem remover atletas.`); pode remover outro representante, desde que reste ao menos um. Grava `left_reason = 'removido'` e `removed_by_id`. Notificação `removido_do_time` ao removido. Auditoria `membro.removido`.
- O histórico continua registrado; para voltar, é preciso novo convite ou pedido.

**`POST /teams/{id}/close` (encerrar):** só representante (`403 Só representantes podem encerrar o time.`). Pré-condição `ensure_closable(db, team)`: na etapa 1 não há partidas nem inscrições, então sempre passa; as fases de partidas e inscrições acrescentam `409 Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.` (inscrições: [seção 6.4 de 0002](0002-jogar.md#64-regras-das-rotas)). Efeitos, numa transação: `state = 'encerrado'`, `closed_at`/`closed_by_id`, link apagado (nonce e hash nulos), todos os membros ativos com `left_reason = 'time_encerrado'`, convites e pedidos pendentes `cancelado`. Notificação `time_encerrado` aos membros ativos no momento, exceto quem encerrou. Auditoria `time.encerrado`. O time some de Meus times, da busca e do link.

## 4. Convites (fase 1) — frente A

```ts
type TeamStatus = 'membro' | 'convite_pendente' | 'pedido_pendente' | 'disponivel'
// Rótulos na web: membro → "No elenco"; convite_pendente e pedido_pendente → "Pendente"; disponivel → "Escolher".

interface InviteCandidate { person: Person; team_status: TeamStatus }

interface TeamInviteSent {
  id: number
  invitee: Person
  inviter: Person | null
  message: string | null
  state: 'pendente' | 'aceito' | 'recusado' | 'cancelado'
  created_at: string
}

/** Cartão K1 do convite recebido. */
interface TeamInviteReceived {
  id: number
  team: TeamCard               // como o convidado vê (my_role: null)
  inviter: Person | null       // null se a conta estiver inativa ou houver bloqueio
  message: string | null
  created_at: string
}

interface InviteDecisionResult { state: 'aceito' | 'recusado'; team: TeamCard | null }
```

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /teams/{id}/invite-candidates?q=&cursor=&limit=` | representante | — | `Page<InviteCandidate>` |
| `POST /teams/{id}/invites` | representante | `{ user_id: number; message?: string \| null }` | `201 TeamInviteSent` (ou `200` com o pendente existente) |
| `GET /teams/{id}/invites` | representante | — | `{ items: TeamInviteSent[] }` (pendentes, mais recentes primeiro) |
| `DELETE /team-invites/{id}` | representante do time | — | `204` |
| `GET /me/team-invites` | titular | — | `{ items: TeamInviteReceived[] }` (pendentes de times ativos, mais recentes primeiro) |
| `PUT /team-invites/{id}` | convidado | `{ decision: 'aceitar' \| 'recusar' }` | `InviteDecisionResult` |

**Candidatos (aba "Escolher atleta"):** a pessoa vem sem posição (o perfil esportivo é privado), então a web mostra nome e @. Sem `q`, as pessoas que o representante segue (seguimento aprovado), da mais recente para a mais antiga (cursor por data do seguimento). Com `q` (1 a 100 caracteres, `@` inicial ignorado), a mesma busca de `GET /users`: `people.user_search_statement(viewer_id, q)`, paginada por `(created_at, id)`. Excluem-se o titular, contas inativas e bloqueios nos dois sentidos. O `team_status` é calculado em lote para a página. `403 Só representantes podem convidar atletas.`

**Criar convite:** mensagem aparada, vazia vira `null`, até 140 caracteres. Erros: convidado inexistente, inativo ou com bloqueio com quem convida: `404 Atleta não encontrado.`; já é membro: `409 Este atleta já está no elenco.`; tem pedido de entrada pendente: `409 Este atleta já pediu para entrar. Responda em Pedidos para entrar.`; convite pendente existente: `200` com ele, sem trocar a mensagem. Notificação `convite_time` ao convidado. Auditoria `convite.criado`.

**Cancelar:** só representante do time (`403 Só representantes podem cancelar convites.`); só pendente (`409 Este convite não está mais pendente.`); `state = 'cancelado'`, `decided_by_id` = representante. Auditoria `convite.cancelado`. Sem notificação.

**Decidir (convidado):** `404 Convite não encontrado.` para quem não é o convidado; `409 Este convite não está mais pendente.` fora de `pendente`.
- **Aceitar:** cria o vínculo `membro` (`joined_via = 'convite'`, posição do perfil), `state = 'aceito'`, e cancela o pedido de entrada pendente da mesma pessoa no time. Se a pessoa já estiver no elenco (corrida), o convite fica `aceito` sem novo vínculo. Notificação `convite_aceito` aos representantes ativos. Auditoria `convite.aceito`. Resposta com `team` (agora `my_role: 'membro'`).
- **Recusar:** `state = 'recusado'`. Auditoria `convite.recusado`. Sem notificação. `team: null`.

## 5. Link do time e pedidos de entrada (fase 2) — frente A

### Token do link (decisão)

- O representante vê o link e o QR **a qualquer momento**, mas o banco **não guarda o token**. Guarda-se um `link_nonce` aleatório (`secrets.token_urlsafe(32)`) e `link_token_hash = SHA-256(token)` (hex), usado na busca.
- `token = base64url(HMAC-SHA256(TEAM_LINK_SECRET, "arena-team-link:v1:{team_id}:{nonce}"))`, sem `=`: 43 caracteres `[A-Za-z0-9_-]`. Assim, um vazamento só do banco não revela links válidos, e o servidor recalcula o link para exibi-lo.
- **"Gerar outro link"** troca o nonce: o token anterior deixa de valer na hora. O link **não expira**; também morre quando o time é encerrado.
- A busca (`team_links.find_team`) recusa formatos inválidos sem consultar o banco, procura pelo hash num time `ativo` e confere o HMAC do nonce atual em tempo constante.
- **Configuração:** `TEAM_LINK_SECRET` tem valor padrão só em `ENVIRONMENT=development`; fora dele é obrigatório, com pelo menos 32 caracteres e diferente do padrão de desenvolvimento. Trocar o segredo invalida todos os links; o próximo `GET /teams/{id}/invite-link` sincroniza o hash.
- **URL:** `{PUBLIC_WEB_URL}/entrar/{token}`. `PUBLIC_WEB_URL` tem padrão `http://localhost:5173`, sem barra final, e exige `https` fora do desenvolvimento. A web lê `/entrar/{token}` de `window.location.pathname` ao abrir (não há roteador), guarda o token só em memória e limpa o endereço na hora (`history.replaceState`); a hospedagem de produção precisa servir o `index.html` nesse caminho (o Vite já faz isso em desenvolvimento). Quem não está logado entra primeiro e depois segue para o pedido; o token também sobrevive ao cadastro seguido de login na mesma aba.
- Implementado em `app/services/team_links.py` (`issue`, `current_token`, `find_team`, `join_url`).

```ts
interface TeamLink { url: string; token: string; generated_at: string }

interface JoinPreview {
  team: TeamCard               // my_role: null, a menos que já seja membro
  my_status: TeamStatus
  invite_id: number | null     // convite pendente do time para o titular
  request_id: number | null    // pedido pendente do titular
}

interface JoinRequest {
  id: number
  team_id: number
  requester: Person
  state: 'pendente' | 'aprovado' | 'recusado' | 'cancelado'
  created_at: string
  decided_at: string | null
}
```

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /teams/{id}/invite-link` | representante | — | `TeamLink` |
| `POST /teams/{id}/invite-link` | representante | `{}` | `TeamLink` (novo) |
| `GET /join/{token}` | qualquer atleta logado | — | `JoinPreview` |
| `POST /join/{token}` | qualquer atleta logado | `{}` | `201 JoinRequest` (ou `200` com o pendente) |
| `DELETE /team-join-requests/{id}` | quem pediu | — | `204` |
| `GET /teams/{id}/join-requests` | representante | — | `{ items: JoinRequest[] }` (pendentes, mais recentes primeiro) |
| `PUT /team-join-requests/{id}` | representante do time | `{ decision: 'aprovar' \| 'recusar' }` | `JoinRequest` |

- **Link:** `403 Só representantes podem ver ou gerar o link do time.` Gerar outro registra a auditoria `time.link_gerado` (sem o token). Um time ativo sem link ganha um na primeira leitura de `GET /invite-link`, sem auditoria; com o segredo trocado, a mesma leitura sincroniza o hash.
- **Token inválido, trocado ou de time encerrado:** `404 Este link não vale mais.` em `GET` e `POST /join/{token}`.
- **Token nos logs:** o token é uma credencial. O log de acesso da API mostra `/join/***` (filtro em `app/core/access_log.py`, instalado por `app.main` no logger `uvicorn.access`); o proxy de produção deve fazer o mesmo com `/entrar/*` (README, "Link do time").
- **Pedir para entrar:** bloqueio, em qualquer sentido, entre quem pede e algum representante ativo do time: `404 Atleta não encontrado.` (a mesma resposta do convite com bloqueio; o pedido não é criado e ninguém é notificado); já membro: `409 Você já está no elenco.`; com convite pendente do time: `409 Você já tem um convite deste time. Responda em Meus times.`; pedido pendente existente: `200` com ele. Quem foi recusado pode pedir de novo. Notificação `pedido_entrada` aos representantes ativos. Auditoria `pedido_entrada.criado`. Pedidos pendentes continuam válidos depois de "Gerar outro link".
- **Cancelar o próprio pedido:** só pendente (`409 Este pedido não está mais pendente.`); `404 Pedido não encontrado.` para outra pessoa. Auditoria `pedido_entrada.cancelado`.
- **Decidir:** `403 Só representantes podem decidir pedidos para entrar.`; `409 Este pedido não está mais pendente.`
  - **aprovar:** cria o vínculo `membro` (`joined_via = 'pedido'`, posição do perfil), `state = 'aprovado'`, e cancela o convite pendente da pessoa no time. Se ela já estiver no elenco, só marca `aprovado`.
  - **recusar:** `state = 'recusado'`.
  - Nos dois casos, notificação `pedido_entrada_decidido` a quem pediu e auditoria `pedido_entrada.aprovado` ou `pedido_entrada.recusado`.

## 6. Organizador e administração (fase 3) — frente B

```ts
type OrganizerRefusalReason = 'contato_nao_funciona' | 'pouca_informacao' | 'pedido_repetido' | 'outro'
// Rótulos: "Contato não funciona", "Pouca informação", "Pedido repetido", "Outro".

interface OrganizerRequestInput {
  display_name: string          // nome do organizador (pessoa ou entidade), 3–80
  city_id: number
  sports: Sport[]               // 1 a 3, sem repetição
  experience?: string | null    // até 1000
  contact: string               // 5–120 (telefone, e-mail ou perfil)
  link?: string | null          // http(s), até 300
  accept_terms: boolean         // precisa ser true
}

interface OrganizerRequest {
  id: number
  display_name: string
  city: City
  sports: Sport[]
  experience: string | null
  contact: string
  link: string | null
  state: 'em_analise' | 'aprovado' | 'recusado' | 'cancelado'
  reason_code: OrganizerRefusalReason | null
  reason_detail: string | null
  created_at: string
  decided_at: string | null
}

/** Cartão P3 do Menu. */
interface OrganizerStatus {
  state: 'sem_pedido' | 'em_analise' | 'recusado' | 'aprovado' | 'revogado'
  request: OrganizerRequest | null                                       // em_analise, recusado ou aprovado
  organizer: { id: number; display_name: string; approved_at: string } | null  // aprovado
  revocation: { revoked_at: string; reason: string } | null              // revogado
}

interface AdminOrganizerRequest extends OrganizerRequest { requester: Person; decided_by: Person | null }
interface AdminOrganizer {
  id: number
  user: Person
  display_name: string
  approved_at: string
  approved_by: Person | null
  request_id: number | null
}
```

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /me/organizer-request` | titular | — | `OrganizerStatus` |
| `POST /me/organizer-request` | titular | `OrganizerRequestInput` | `201 OrganizerRequest` |
| `DELETE /me/organizer-request` | titular | — | `204` |
| `GET /admin/queue-counts` | administração | — | `{ organizer_requests: number; reports: number }` (pedidos em análise e denúncias pendentes, a mesma contagem de `GET /admin/reports`) |
| `GET /admin/organizer-requests?state=em_analise\|decididos&cursor=&limit=` | administração | — | `Page<AdminOrganizerRequest>` |
| `POST /admin/organizer-requests/{id}/decision` | administração | `{ decision: 'aprovar' \| 'recusar'; reason_code?: OrganizerRefusalReason; reason_detail?: string }` | `AdminOrganizerRequest` |
| `GET /admin/organizers?cursor=&limit=` | administração | — | `Page<AdminOrganizer>` (ativos) |
| `POST /admin/organizers/{id}/revoke` | administração | `{ reason: string }` (5–500) | `204` |

**Estado do cartão (`OrganizerStatus.state`):**
1. permissão ativa → `aprovado`;
2. senão, pedido em análise → `em_analise`;
3. senão, vale o fato mais recente entre o último pedido decidido (`decided_at`) e a última revogação (`revoked_at`): pedido `recusado` → `recusado`; pedido `cancelado` → `sem_pedido`; revogação → `revogado`;
4. sem nada disso → `sem_pedido`.

Em `recusado` e `revogado`, o cartão oferece "Enviar novo pedido".

**Enviar pedido:** já organizador: `409 Você já é organizador.`; pedido em análise: `409 Você já tem um pedido em análise.`; `accept_terms` falso: `422 Aceite as responsabilidades do organizador para enviar o pedido.`; cidade fora do catálogo: `422 Selecione uma cidade do catálogo.`. Textos aparados; vazios opcionais viram `null`. Grava `terms_version = 1` e `terms_accepted_at`. Quem foi recusado ou revogado pode pedir de novo. Auditoria `pedido_organizador.criado`.

**Cancelar:** `404 Nenhum pedido em análise.` sem pendente. `state = 'cancelado'`, `decided_by_id` = titular. Auditoria `pedido_organizador.cancelado`.

**Administração:** `403 Acesso administrativo necessário.` (dependência `current_admin` de `app/core/security.py`).
- Fila `em_analise` ordenada por `created_at` e `decididos` (aprovado, recusado, cancelado) por `decided_at`, as duas do mais recente para o mais antigo; os organizadores ativos também.
- **Decidir:** `404 Pedido não encontrado.`; `409 Este pedido já foi decidido.` fora de `em_analise`. Recusar exige `reason_code` (`422 Escolha o motivo da recusa.`), e `outro` exige `reason_detail` com pelo menos 5 caracteres (`422 Descreva o motivo da recusa.`); qualquer detalhe acima de 500 caracteres recebe `422 Descreva o motivo da recusa em até 500 caracteres.` Aprovar cria `organizers` com o `display_name` do pedido; ignora `reason_*`. Aprovar quem já tem permissão ativa (concedida fora deste fluxo) responde `409 Este atleta já é organizador.` e mantém o pedido em análise. Notificação `pedido_organizador_decidido` e auditoria `pedido_organizador.aprovado` ou `pedido_organizador.recusado`. A administração pode decidir o próprio pedido; a decisão fica auditada.
- **Revogar:** `404 Organizador não encontrado.` se não houver permissão ativa com esse id. Grava `revoked_at`, `revoked_by_id` e `revoke_reason`. Notificação `organizador_revogado` e auditoria `organizador.revogado`. O destino dos eventos abertos do organizador revogado (seguem ou são cancelados com devolução) entra na fase 4 (seção 15.2).
- **Permissão para as fases seguintes:** `organizers.get_active_organizer(db, user_id) -> Organizer | None` e a dependência `current_organizer` (`403 Você precisa ser organizador para criar eventos.`), usadas a partir da fase 4.

**Menu:** a seção "Organizador · Meus eventos" aparece com `state = 'aprovado'`; até a fase 4, mostra estado vazio, sem eventos fictícios. A seção Administração mostra "Pedidos de organizador" com o contador de `GET /admin/queue-counts`, ao lado de "Denúncias". Na web, a ordem do Menu é Conta, Organizador (cartão P3 ou seção), Administração, App (Notificações e Sobre) e Sair.

## 7. Notificações

Infraestrutura comum (implementada). As fases seguintes acrescentam tipos ao registro `NOTIFICATION_TYPES` de `app/services/notifications.py`: a etapa 2 está na seção 17, a etapa 4 na seção 21 e os tipos das partidas do Jogar em [0002, seção 13](0002-jogar.md). O registro tem 43 tipos, todos classificados em `NOTIFICATION_CATEGORY` (um teste garante isso).

```ts
type NotificationCategory = 'partidas' | 'times' | 'eventos' | 'conta'

interface ArenaNotification {
  id: number
  type: NotificationType
  category: NotificationCategory     // derivada do tipo (não é coluna)
  payload: Record<string, unknown>   // por tipo, abaixo
  actor: Person | null               // null: administração, sistema, conta inativa ou bloqueada
  created_at: string
  read_at: string | null
  pending: boolean                   // ação aberta e prazo não vencido (7.1)
  action_until: string | null        // prazo para responder; null quando não há
}

interface NotificationSummary {
  unread_count: number
  follow_requests_count: number
  pending_count: number
  unread_by_category: { partidas: number; times: number; eventos: number }
}
```

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /me/notifications?cursor=&limit=&categoria=&pendente=` | — | `Page<ArenaNotification>` (mais recentes primeiro). `categoria` ∈ `partidas`, `times`, `eventos`; `pendente` ∈ `true`, `false`. Valor inválido, inclusive `categoria=conta`: `422` |
| `GET /me/notifications/pending?categoria=&limit=` | — | `{ items: ArenaNotification[] }`, sem cursor: as pendências (7.1) por urgência, prazo mais próximo primeiro, sem prazo por último e, depois, as mais recentes. `categoria` como acima; `limit` de 1 a 50, padrão 20 |
| `GET /me/notifications/summary` | — | `NotificationSummary` |
| `GET /me/notifications/unread-count` | — | `{ unread_count: number }`, mantida por compatibilidade |
| `PUT /me/notifications/{id}/read` | `{}` | `NotificationSummary`; `404 Notificação não encontrada.` para notificação de outra pessoa; idempotente (mantém o primeiro `read_at`). Ler não resolve a pendência |
| `PUT /me/notifications/read-all` | `{}` | `NotificationSummary` (com `unread_count: 0`) |

O titular de todas as rotas vem da sessão. Os clientes antigos continuam lendo `unread_count`, que as respostas de leitura também devolvem.

Os pedidos para seguir continuam em `GET /me/follow-requests`. O resumo os conta em `follow_requests_count` (solicitantes ativos, sem bloqueio entre as duas pessoas), e o sino mostra `unread_count + follow_requests_count`.

### 7.1 Pendências

A migração `0012` (`backend/migrations/versions/0012_notification_actions.py`) adiciona à tabela `notifications`:

| Coluna | Tipo | Uso |
| --- | --- | --- |
| `action_key` | `String(80)`, nula | Identifica o objeto que pede resposta (ex.: `invite:42`). Nula para avisos informativos |
| `action_until` | `DateTime(timezone=True)`, nula | Prazo para responder. Nulo quando não há prazo |
| `resolved_at` | `DateTime(timezone=True)`, nula | Quando a ação foi resolvida, por quem recebeu ou por outro papel |

Os índices parciais, válidos para `resolved_at IS NULL AND action_key IS NOT NULL`, são `ix_notifications_action_open` (em `action_key`, para resolver por chave) e `ix_notifications_user_pending` (em `user_id`, para contar e listar as pendências).

Uma notificação é **pendente** quando `action_key IS NOT NULL AND resolved_at IS NULL AND (action_until IS NULL OR action_until > now())`. O serviço usa a mesma regra em `pending_clause` (consulta) e `is_pending` (objeto).

- **Ler não resolve.** Marcar como lida ou ler todas não muda a pendência: ela deixa de ser pendente só quando a ação é resolvida ou o prazo passa.
- **Sem preenchimento retroativo.** Notificações anteriores à migração não têm chave e nunca ficam pendentes.
- **Categoria derivada.** `NOTIFICATION_CATEGORY` define a categoria de cada tipo: **partidas** (propostas, vagas, ofertas, condições, partida agendada ou cancelada, W.O., resultados, estatísticas, remoção da partida, adversário, divergência e decisão); **times** (convites, pedidos de entrada, remoção e encerramento de time); **eventos** (evento, aviso, inscrição, comprovantes, reserva, devoluções, tabela e encerramento); **conta** (pedido de organizador, revogação e quadra decidida). O resumo conta as não lidas só em partidas, times e eventos. `conta` não é filtro da API e só aparece na listagem sem filtro.

**Regras do serviço:** `notify(db, user_id, type_, payload, *, actor_id=None, action_key=None, action_until=None, informative=False)` e `notify_many(...)`, com os mesmos parâmetros e uma notificação por pessoa, só adicionam linhas; quem chama faz o commit, junto da mudança. Recusam tipo desconhecido, payload sem os campos obrigatórios e chave inválida. Ninguém é notificado da própria ação (`notify` devolve `None`).

- Os 14 tipos de `ACTION_TYPES` (7.2) exigem `action_key`. Quem não decide recebe o mesmo tipo com `informative=True`, sem chave.
- `comprovante_decidido` só exige chave na recusa (`decision == 'recusado'`). Uma recusa com a reserva já vencida é informativa.
- Erro (`ValueError`): chave em tipo informativo; chave junto com `informative=True`; chave em tipo que não pede ação; chave vazia ou com mais de 80 caracteres.
- `resolve_actions(db, key, *, user_ids=None)`, `resolve_actions_many(db, keys, *, user_ids=None)` e `resolve_actions_prefix(db, prefix)` gravam `resolved_at` nas ações abertas, de todos os destinatários ou só de `user_ids`. Não fazem commit: rodam na transação da mudança que as resolve. O prefixo fecha de uma vez todas as chaves que começam com ele (ex.: `proposal:{match_id}:` fecha os dois lados de uma proposta).
- `summary(db, user)` calcula os quatro contadores em consultas agregadas, sem laço por notificação.

**Tipos da etapa 1:**

| Tipo | Destinatário | `actor` | `payload` | Texto sugerido | Ao tocar |
| --- | --- | --- | --- | --- | --- |
| `convite_time` | convidado | quem convidou | `{ team_id, team_name, invite_id }` | "{ator} convidou você para o {time}" | Meus times, folha de convites |
| `convite_aceito` | representantes ativos | novo membro | `{ team_id, team_name, invite_id }` | "{ator} aceitou o convite e entrou no {time}" | Meus times, no time |
| `pedido_entrada` | representantes ativos | quem pediu | `{ team_id, team_name, request_id }` | "{ator} pediu para entrar no {time}" | Meus times, Pedidos para entrar |
| `pedido_entrada_decidido` | quem pediu | representante | `{ team_id, team_name, request_id, decision: 'aprovado' \| 'recusado' }` | "Seu pedido para entrar no {time} foi aprovado/recusado" | aprovado: Meus times, no time |
| `removido_do_time` | removido | representante | `{ team_id, team_name }` | "Você foi removido do {time}" | — |
| `time_encerrado` | membros ativos no momento | representante | `{ team_id, team_name }` | "O {time} foi encerrado" | — |
| `pedido_organizador_decidido` | autor do pedido | `null` | `{ request_id, decision: 'aprovado' \| 'recusado', reason_code: OrganizerRefusalReason \| null, reason_detail: string \| null }` | "Seu pedido de organizador foi aprovado" / "…foi recusado: {motivo}" | Menu, cartão do organizador |
| `organizador_revogado` | organizador | `null` | `{ reason }` | "Sua permissão de organizador foi revogada: {motivo}" | Menu |

Categoria: `times`, exceto `pedido_organizador_decidido` e `organizador_revogado`, que são `conta`.

`team_name` é uma cópia do nome no momento do aviso; a navegação usa `team_id` e mostra os dados atuais. Sem `actor`, o texto usa "Um representante", "Um atleta" ou "A administração". Notificações de times encerrados ou de convites já decididos continuam na lista; ao tocar, a web confere o estado atual.

### 7.2 Tipos com ação

Chaves e prazos conferidos com os construtores `*_key` de `app/services/notifications.py` e com as chamadas dos serviços. Cada linha fica aberta até a resolução indicada; as resoluções rodam na mesma transação da mudança.

| Tipo | Quem recebe a chave | Chave | Prazo (`action_until`) | Resolve quando |
| --- | --- | --- | --- | --- |
| `convite_time` | convidado | `invite:{invite_id}` | — | convite aceito, recusado ou cancelado; pedido de entrada do mesmo usuário aprovado; time encerrado |
| `pedido_entrada` | representantes ativos | `join_request:{request_id}` | — | pedido aprovado, recusado ou cancelado (para todos os representantes); convite do mesmo usuário aceito; time encerrado |
| `proposta_partida` | representantes de cada lado (ou o atleta de tênis) | `proposal:{match_id}:user:{user_id}` | `proposal_expires_at` | o próprio lado aceita (resolve só os usuários desse lado); os dois lados aceitam, a proposta é recusada ou expira (resolve todos) |
| `vaga_encontrada` | atleta avulso | `slot:{slot_id}:user:{user_id}` | `offer_expires_at` | oferta aceita, recusada, sem resposta ou devolvida (vaga reduzida ou partida cancelada) |
| `condicoes_propostas` | representantes do outro lado | `terms:{terms_id}` | horário proposto (`starts_at`) | condições aceitas, substituídas por outra proposta ou canceladas (partida cancelada ou quadra rejeitada) |
| `wo_registrado` | lado acusado | `wo:{match_id}` | `result_deadline` (fim do prazo para contestar) | W.O. contestado ou retirado; decidido pela administração; no prazo, vira resultado |
| `resultado_divergente` | os dois lados | `result:{match_id}` | `result_deadline` | placares batem; novo envio divergente substitui o anterior (só o mais recente fica aberto); o prazo encerra a partida amistosa; decisão do organizador; cancelamento das partidas do evento |
| `comprovante_decidido` (só na recusa) | atleta ou representantes da inscrição | `entry_receipt:{entry_id}` | `reserved_until` | novo comprovante enviado; reserva expirada (varredura ou outra expiração); inscrição cancelada pelo participante; evento cancelado |
| `devolucao_enviada` | atleta ou representantes do time | `refund:{receipt_id}` | envio + 7 dias (`REFUND_AUTO_CONFIRM_AFTER`) | devolução confirmada, contestada ou confirmada automaticamente |
| `comprovante_recebido` | organizador do evento | `receipt:{receipt_id}` | — | comprovante decidido; evento cancelado com o comprovante em análise |
| `divergencia_para_decidir` | organizador do evento | `decision:{match_id}` | `result_deadline` | decisão registrada; placares passam a bater; cancelamento das partidas do evento |
| `evento_para_aprovar` | administração | `event_review:{event_id}` | — | evento decidido por qualquer conta administrativa (uma decisão recusada com `409`, como aprovar com datas passadas, deixa a ação aberta); evento retirado; organizador revogado |
| `devolucao_contestada` | administração (o organizador recebe `informative`, uma única vez se também for administrador) | `refund_dispute:{receipt_id}` | — | devolução decidida pela administração (manter ou reabrir) |
| `wo_contestado` | administração (representantes do lado que registrou recebem `informative`) | `wo_dispute:{match_id}` | — | W.O. decidido pela administração |

**Desvios do plano:**

- `condicoes_propostas` tem prazo: o plano previa sem prazo. Depois do horário proposto, as condições não podem mais ser aceitas (`accept_terms`), e a ação expira junto. Não existe "recusar condições": a proposta só é aceita, substituída ou cancelada.
- `convite_time` não tem prazo: convites não têm validade no código, e a ação fica aberta até a decisão ou o encerramento do time.
- `devolucao_enviada` vai ao atleta ou aos representantes do time, como na seção 17, e não a todos os membros.

**Na web (etapa 1):** tocar marca como lida (`PUT /me/notifications/{id}/read`) e navega pela pilha do `ArenaPage`:
- `convite_time` → Meus times com a folha de convites recebidos (`{ teamId, invites: true }`); um convite já decidido mostra "Nenhum convite pendente".
- `pedido_entrada` → Meus times no time, rolando até "Pedidos para entrar" (`{ teamId, requests: true }`).
- `convite_aceito` e `pedido_entrada_decidido` aprovado → Meus times com o cartão do time centralizado (`{ teamId }`); sem esse time em Meus times, o primeiro cartão.
- `removido_do_time`, `time_encerrado` e `pedido_entrada_decidido` recusado → só marcam como lida.
- `pedido_organizador_decidido` e `organizador_revogado` → Menu, com o cartão do organizador.
- Tipos desconhecidos (fases seguintes) → texto genérico, sem destino.

A tela Notificações abre pelo sino presente nas cinco abas raiz (Início, Ranking, Jogar, Comunidade e Perfil próprio), pela placa "Para responder" do Início (no chip *Para responder*) e pela linha "Notificações" do Menu, com o contador. Os filtros por chip são feitos no servidor (`categoria` e `pendente`). O resumo é recarregado na troca de aba raiz, ao voltar ao primeiro plano e a cada 60 s.

## 8. Auditoria

`audit.record(db, *, actor_id, action, target_type, target_id, data=None)` adiciona a linha sem commit. `data` guarda ids e valores alterados; nunca tokens, nonces ou textos privados além do necessário. As ações da etapa 2 estão na seção 18.

| Ação | `target_type` | Gerada por |
| --- | --- | --- |
| `time.criado`, `time.editado`, `time.encerrado`, `time.link_gerado` | `team` | seção 3 e 5 |
| `membro.papel_alterado`, `membro.removido`, `membro.saiu` | `team_member` | seção 3 |
| `convite.criado`, `convite.cancelado`, `convite.aceito`, `convite.recusado` | `team_invite` | seção 4 |
| `pedido_entrada.criado`, `pedido_entrada.cancelado`, `pedido_entrada.aprovado`, `pedido_entrada.recusado` | `team_join_request` | seção 5 |
| `pedido_organizador.criado`, `pedido_organizador.cancelado`, `pedido_organizador.aprovado`, `pedido_organizador.recusado` | `organizer_request` | seção 6 |
| `organizador.revogado` | `organizer` | seção 6 |

Cancelamentos automáticos (convite cancelado ao aprovar o pedido, pendências canceladas ao encerrar o time) entram na mesma transação, com `actor_id` de quem fez a ação principal e `data.automatico = true`.

## 9. Infraestrutura e serviços compartilhados

| Função | Uso |
| --- | --- |
| `services.notifications.notify` / `notify_many` | notificações da seção 7 |
| `services.audit.record` | auditoria da seção 8 |
| `services.rankings.team_format_grid(db, team_ids, *, cuts=None) -> dict[int, list[FormatStandingOut]]` | grade C5 de vários times numa consulta |
| `services.team_links.issue(team) -> str`, `current_token(team) -> (str \| None, bool)`, `find_team(db, token, *, for_update=False)`, `join_url(token)` | link do time |
| `services.people.person_out(user, *, blocked=False)`, `blocked_ids(db, viewer_id, ids)`, `blocked_between(db, a, b)`, `block_exists(viewer_id, coluna)`, `user_search_statement(viewer_id, q)` | pessoas, bloqueios e busca |
| `core.pagination.paginate(statement, cursor, limit, campo_data, campo_id, db)` | listas `{ items, next_cursor }` |
| `core.security.current_admin` | rotas da administração |
| `models.teams.Team.initials`, `Team.crest_url` | carteirinha |
| `schemas.common.EmptyInput`, `StrictInput`, `PersonOut` | corpos `{}`, entradas sem campos extras e pessoa resumida |

Configurações novas: `PUBLIC_WEB_URL` e `TEAM_LINK_SECRET` (seção 5), validadas em `app/core/config.py`.

### 9.1 Desvios registrados na integração da etapa 1

Já incorporados às seções acima:

| Seção | Desvio | Motivo |
| --- | --- | --- |
| 3 | Brasão com `Cache-Control: no-store`, e não `private, no-store`. | O middleware global define `no-store` em todas as respostas; o efeito é igual ou mais restritivo. |
| 3 | Avatar `null` também para conta inativa. | Mesma regra de `PersonOut`. |
| 3, 8 | `membro.papel_alterado` grava também `team_id`. | Permite consultar a auditoria por time. |
| 4 | `403 Só representantes podem cancelar convites.` | A tabela só dizia "representante do time". |
| 5 | Time sem link ganha um na primeira leitura de `GET /invite-link`, sem auditoria. | Times sem link (por exemplo, com o segredo trocado); a geração explícita continua auditada. |
| 6 | `GET /admin/queue-counts` responde também `reports`. | O Menu da administração pode mostrar as duas filas com uma leitura. |
| 6 | `422 Descreva o motivo da recusa em até 500 caracteres.` e `409 Este atleta já é organizador.` | Mensagens específicas para o limite do detalhe e para a permissão concedida fora do fluxo. |
| 6 | Filas do mais recente para o mais antigo. | Convenção geral das listas (seção 1). |
| 3, 4 (web) | Candidatos sem posição; o cartão do link mostra "cidade · N atletas"; o elenco em miniatura usa a inicial do primeiro nome; sem tela para trocar a própria posição. | O contrato não traz esses dados (perfil esportivo privado) ou a tela ficou para depois. |
| 7 (web) | `pedido_entrada` rola até "Pedidos para entrar"; `removido_do_time`, `time_encerrado` e pedido recusado só marcam como lida. | Ligação entre as frentes de Meus times e de Notificações, feita na integração. |
| 5 | Pedido pelo link de quem tem bloqueio (nos dois sentidos) com algum representante ativo: `404 Atleta não encontrado.`, sem criar o pedido. | Revisão da etapa 1 (decisão conservadora): simetria com o convite, que já recusava o bloqueio com a mesma resposta; o representante bloqueado receberia e decidiria o pedido. Um bloqueio só com um membro comum não impede o pedido. |
| 1, 3 a 5 | Autorização antes da trava em `PATCH /teams/{id}`, `GET` e `POST /teams/{id}/invite-link`, `DELETE /team-invites/{id}`, `PUT /team-join-requests/{id}`, convites, brasão e encerramento (`teams.representative_context` e `lock_context`); `GET /invite-link` não trava quando o link já existe e o hash confere. | Revisão da etapa 1: quem recebia `404`/`403` travava (e esperava) a linha do time antes da resposta. A regra do representante mínimo continua decidida sobre o elenco travado (teste de concorrência em `tests/integration/test_team_locks_concurrency.py`). |
| 5 | O log de acesso mostra `/api/v1/join/***` em vez do token; o README orienta o mesmo no proxy para `/entrar/*`. | Revisão da etapa 1: o token aparecia em claro no log do uvicorn. |

## 10. Etapa 2 — eventos, inscrições e comprovantes (fases 4 e 5)

Escopo: criar evento (V4) com rascunho e checklist, publicar, aprovação de pagos pela administração (AD1, fila "Eventos pagos"), cartazes do organizador (O3), gestão (G3) com o cartão "Agora", análise de comprovantes (A2), cancelamento com devolução por Pix, canal de avisos, revogação de organizador com eventos abertos e devoluções contestadas. O lado do atleta (lista E2, detalhe D2, elegibilidade RN18, reserva, comprovante, resposta à devolução) está em [0002, seção 6](0002-jogar.md#6-fase-7--campeonatos-e-provas-lado-do-atleta). Convenções da seção 1 valem aqui.

### 10.1 Decisões desta fundação (interpretações dos planos)

- **Recusa da administração** volta o evento a `rascunho` com `review_reason_code` e `review_reason_detail` (plano A2 e AD1); não existe um estado `recusado`. O motivo aparece no rascunho até o novo envio.
- **Data do evento:** `starts_at` com data **e hora** (o D2 mostra o horário; o prazo de 12 h precisa de um instante). No V4, "Quando e onde?" usa o Date Picker e o campo de hora; "Inscrições até" usa o Date Picker e, sem hora escolhida, a web envia 23:59 no fuso do aparelho.
- **Modalidades:** futebol tem formato (`futsal`, `society`, `campo`) e tipo; tênis tem só o tipo (simples); corrida tem só a distância e nenhum tipo. **Distâncias da corrida: 3, 5, 10, 21 ou 42 km**, as do ranking, porque a elegibilidade (RN18) e o elo usam a distância; uma distância livre não vira prova do Arena.
- **Vagas:** eliminação simples 4, 8 ou 16; todos contra todos de 3 a 20; corrida de 2 a 5000. **Preço** em centavos: 0 é gratuito; pago vai de R$ 1,00 a R$ 10.000,00.
- **Prazo de inscrição:** fecha em `registration_closes_at` (que não pode passar de `starts_at`). Em evento pago, fecha também **12 h antes do início**, quando nenhuma reserva caberia mais (`registration_deadline`, calculado pela API).
- **Vaga ocupada:** inscrições `reservada`, `em_analise`, `confirmada` e `rejeitada` (esta até o fim da reserva, para o reenvio) ocupam vaga e valem uma por time ou atleta e evento.
- **Cancelamento do evento:** inscrições pagas `confirmada` ou `em_analise` (o participante declarou o pagamento) viram `devolucao_pendente`; reservas sem pagamento, recusadas e inscrições gratuitas viram `cancelada`; as já encerradas não mudam.
- **Administração:** lê tudo dos eventos (detalhes, inscrições, comprovantes e avisos), decide a aprovação dos pagos, o destino dos eventos de organizador revogado e as devoluções contestadas. **Os comprovantes de pagamento são decididos só pelo organizador do evento.**
- **Organizador revogado:** não cria nem envia eventos. Ao revogar, os eventos `em_aprovacao` voltam a `rascunho` e os publicados ou em andamento ficam com `revocation_decision = 'pendente'`: inscrições suspensas e gestão só de leitura até a administração decidir. Se a decisão for **seguir**, o organizador continua gerindo aquele evento; se for **cancelar**, o fluxo de devolução é o normal, e é o organizador quem envia as devoluções (o dinheiro está com ele).
- **Comprovante de time:** o arquivo é visível aos representantes ativos do time (que agem na inscrição), ao organizador do evento e à administração. Os demais membros veem só o estado da inscrição.
- **Arquivo do comprovante:** imagem (JPEG, PNG ou WebP estático) ou PDF, até **5 MiB** (o mesmo limite das imagens). Imagens viram WebP sem metadados, com até 2400 px no maior lado; PDFs são guardados como enviados, sem renderizar, e servidos inline com o próprio tipo.
- **Desistência do participante:** gratuita, a qualquer momento antes do início; paga, só enquanto `reservada` ou `rejeitada` (sem pagamento aprovado). Depois disso, é com o organizador, fora do Arena.
- **Canal de avisos:** o organizador escreve; leem o organizador, a administração e os participantes (atleta inscrito ou membros ativos do time inscrito), exceto inscrições expiradas ou canceladas pelo próprio participante. O cancelamento entra como aviso automático (`kind = 'evento_cancelado'`).
- **Notificação à administração:** cada evento pago enviado gera `evento_para_aprovar` às contas administrativas ativas (o AD1 diz "aparece aqui e nas notificações").

## 11. Divisão por frente na etapa 1

- **Frente A (backend de times e link):** seções 3, 4 e 5, em `app/routers/teams.py`, `app/services/teams.py`, `app/schemas/teams.py` e funções de brasão em `app/services/media.py`.
- **Frente B (backend de organizador e administração):** seção 6, em `app/routers/organizers.py`, `app/services/organizers.py` e `app/schemas/organizers.py`.
- **Frentes C e D (web):** consomem este contrato e o de [0002-jogar.md](0002-jogar.md).
- Nenhuma frente cria migração na etapa 1: o esquema está completo na `0005`. Uma necessidade nova é relatada ao orquestrador.

## 12. Esquema da etapa 2 (migração `0008`)

A `0008` tem `down_revision = '0005'`; o integrador a reencadeia depois das migrações das frentes da etapa 1. Modelos em `app/models/events.py`; constantes (estados, motivos, tipos) no mesmo módulo.

| Tabela | Conteúdo e restrições |
| --- | --- |
| `events` | `organizer_user_id` (dono, usado na autorização; `RESTRICT`), `organizer_id` (permissão vigente na criação, histórico), `name` (3–60), `sport`, `format` (só futebol), `distance_km` (só corrida: 3, 5, 10, 21, 42), `competition_type` (futebol e tênis), `capacity` (2–5000; 4, 8 ou 16 na eliminação), `accepted_tiers` (`NULL` = aberto; senão 1 a 5 elos), `city_id`, `venue` (até 120), `course_notes` (só corrida, até 500), `starts_at`, `registration_closes_at` (≤ `starts_at`), `price_cents` (0 ou 100–1.000.000), Pix (`pix_beneficiary` até 80, `pix_key_type`, `pix_key` até 100, `pix_copy_paste` até 1000, `pix_instructions` até 500), `contact` (até 120), `state`, `submitted_at`, `published_at`, revisão (`reviewed_by_id`, `reviewed_at`, `review_reason_code`, `review_reason_detail`), cancelamento (`cancelled_at`, `cancelled_by_id`, `cancel_reason`), revogação (`revocation_decision` = `pendente` \| `seguir` \| `cancelado`, `revocation_decided_by_id`, `revocation_decided_at`). **Checks:** fora de `rascunho`, todos os campos do checklist presentes (e o Pix nos pagos); `em_aprovacao` só pago e com `submitted_at`; `published_at` existe exatamente fora de `rascunho`/`em_aprovacao`; motivo de recusa só em `rascunho`; `cancelado` ⇔ `cancelled_at` e motivo; `revocation_decision = 'cancelado'` só em evento cancelado. Índices: `(state, starts_at, id)`, fila de aprovação e fila de revogação. |
| `event_entries` | `event_id`, `team_id` **ou** `user_id` (nunca ambos), `registered_by_id`, `state`, `price_cents` (cópia do preço; 0 = gratuita), `reserved_until` (só pagas; existe sempre nelas), `confirmed_at`, `expired_at`, `cancelled_at`, `cancelled_by_id`, `cancel_origin` (`participante` \| `evento`), `refunded_at`. **Checks:** gratuita só `confirmada` ou `cancelada`; `confirmada` com `confirmed_at`; `expirada` ⇔ `expired_at`; `cancelada` ⇔ `cancelled_at` e origem; `devolvida` ⇔ `refunded_at`. **Únicos parciais** `(event_id, team_id)` e `(event_id, user_id)` nos estados que ocupam vaga (`reservada`, `em_analise`, `confirmada`, `rejeitada`). Índice parcial de reservas para a varredura. |
| `entry_receipts` | Cada envio é uma linha, nunca substituída: `entry_id`, `kind` (`pagamento` \| `devolucao`), `media_id` (privado, único, `RESTRICT`), `uploaded_by_id`, `created_at`; decisão do pagamento (`decision` `aprovado` \| `recusado`, `reason_code`, `reason_detail` até 300, `decided_by_id`, `decided_at`); resposta à devolução (`participant_response` `confirmada` \| `contestada` \| `automatica`, `responded_at`, `responded_by_id` — nulo na automática —, `contest_reason` até 500); decisão da contestação (`resolution` `devolvida` \| `pendente`, `resolution_reason`, `resolved_by_id`, `resolved_at`). **Checks:** decisão só em pagamento e recusa com motivo; resposta só em devolução, contestação com texto; resolução só de devolução contestada e com motivo. **Únicos parciais:** um pagamento em análise (`decision IS NULL`) e uma devolução em aberto (sem resposta, ou contestada sem resolução) por inscrição. |
| `event_messages` | Canal de avisos: `event_id`, `author_id` (nulo se a conta sumir), `kind` (`aviso` ou automático, como `evento_cancelado`; validado no serviço, sem `CHECK`, para as fases seguintes acrescentarem tipos), `body` (1–1000), `created_at`. Índice `(event_id, created_at, id)`. |
| `media_objects` | `width` e `height` passam a aceitar nulo (PDF não é renderizado). O downgrade grava 0 nas linhas de PDF antes de voltar a `NOT NULL`. |

**Fase 6 (chaveamento):** as partidas virão na etapa 3 (`matches` com `event_id`, rodada, posição e `next_match_id`). Esta migração não antecipa colunas de chave; os estados `em_andamento` e `encerrado` já existem, e os gatilhos chegam com a fase 6 (campeonatos) e com os resultados da corrida.

## 13. Tipos e objetos comuns da etapa 2 (TypeScript)

Espelho de `app/schemas/events.py`, usado pelos dois lados (organizador e atleta). `Sport`, `FootballFormat`, `Tier`, `Person`, `City` e `Page` estão na seção 1; `TeamRef` é o `team` de `MeStandings` ([0002](0002-jogar.md#2-get-apiv1mestandings)).

```ts
type EventState = 'rascunho' | 'em_aprovacao' | 'publicado' | 'em_andamento' | 'encerrado' | 'cancelado'
/** Rótulo do cartaz: Rascunho, Em aprovação, Inscrições abertas, Inscrições encerradas, Em andamento, Encerrado, Cancelado. */
type EventPhase = 'rascunho' | 'em_aprovacao' | 'inscricoes_abertas' | 'inscricoes_encerradas' | 'em_andamento'
  | 'encerrado' | 'cancelado'
type CompetitionType = 'todos_contra_todos' | 'eliminacao_simples'   // "Todos contra todos", "Eliminação simples"
type RunDistance = 3 | 5 | 10 | 21 | 42
type PixKeyType = 'cpf' | 'email' | 'telefone' | 'aleatoria'          // CPF, E-mail, Telefone, Aleatória
type EventRefusalReason = 'pix_incompleto' | 'preco_ou_datas' | 'conteudo_inadequado' | 'outro'
// "Dados do Pix incompletos", "Preço ou datas inconsistentes", "Conteúdo inadequado", "Outro".
type EntryState = 'reservada' | 'em_analise' | 'confirmada' | 'rejeitada' | 'expirada' | 'cancelada'
  | 'devolucao_pendente' | 'devolucao_contestada' | 'devolvida'
// Reservada, Em análise, Confirmada ("Inscrito"), Recusado, Expirada, Cancelada, Devolução pendente,
// Devolução contestada, Devolvida.
type ReceiptRefusalReason = 'valor_diferente' | 'favorecido_errado' | 'comprovante_ilegivel' | 'fora_do_prazo' | 'outro'
// "Valor diferente", "Favorecido errado", "Comprovante ilegível", "Data fora do prazo", "Outro".
type ChecklistKey = 'nome_modalidade' | 'formato_tipo' | 'vagas_elos' | 'datas' | 'local' | 'inscricao'
type NextActionKind = 'aguardar_revogacao' | 'corrigir_recusa' | 'completar_rascunho' | 'publicar'
  | 'aguardar_aprovacao' | 'analisar_comprovantes' | 'enviar_devolucoes' | 'aguardar_devolucoes'
  | 'acompanhar_inscricoes' | 'aguardar_inicio' | 'nenhuma'

interface TeamRef { id: number; name: string; initials: string; crest_url: string | null }

/** Cartaz (O3, E2, AD1 e topo de G3 e D2). */
interface EventPoster {
  id: number
  name: string
  sport: Sport | null                 // null só em rascunho
  format: FootballFormat | null
  distance_km: RunDistance | null
  competition_type: CompetitionType | null
  capacity: number | null
  entries_count: number               // vagas ocupadas (reservada, em_analise, confirmada, rejeitada)
  confirmed_count: number
  starts_at: string | null
  registration_closes_at: string | null
  registration_deadline: string | null  // pago: min(fim das inscrições, início − 12 h)
  city: City | null
  venue: string | null
  price_cents: number | null          // 0 = gratuito
  accepted_tiers: Tier[] | null       // null = aberto a todos (globo)
  state: EventState
  phase: EventPhase
  revocation_pending: boolean         // inscrições suspensas: a administração decide
}

/** "Pix para receber" (organizador) e "Pix do organizador" (atleta). Só eventos pagos; toda rota exige sessão. */
interface EventPix {
  beneficiary: string | null
  key_type: PixKeyType | null
  key: string | null                  // normalizada: CPF só dígitos, e-mail minúsculo, telefone +55…, aleatória minúscula
  copy_paste: string | null
  instructions: string | null
}

interface EntrySubject { kind: 'time' | 'atleta'; team: TeamRef | null; athlete: Person | null }

/** Envio de comprovante (pagamento, pelo participante; devolução, pelo organizador). */
interface Receipt {
  id: number
  kind: 'pagamento' | 'devolucao'
  file_url: string                    // /api/v1/receipts/{id}/file (rota autorizada)
  file_type: 'imagem' | 'pdf'
  size_bytes: number
  uploaded_by: Person | null
  created_at: string
  decision: 'aprovado' | 'recusado' | null
  reason_code: ReceiptRefusalReason | null
  reason_detail: string | null
  decided_at: string | null
  participant_response: 'confirmada' | 'contestada' | 'automatica' | null
  responded_at: string | null
  contest_reason: string | null
  auto_confirm_at: string | null      // devolução sem resposta: created_at + 7 dias
  resolution: 'devolvida' | 'pendente' | null
  resolution_reason: string | null
  resolved_at: string | null
}

interface EventMessage { id: number; kind: 'aviso' | 'evento_cancelado'; body: string; author: Person | null; created_at: string }
interface ChecklistItem { key: ChecklistKey; label: string; done: boolean; message: string | null }
interface PendingCounts {
  receipts: number                    // inscrições em_analise (comprovante para analisar)
  refunds_to_send: number             // devolucao_pendente sem comprovante de devolução em aberto
  refunds_awaiting: number            // devolução enviada, aguardando o participante (ou os 7 dias)
  refund_disputes: number             // devolucao_contestada (decide a administração)
  total: number                       // receipts + refunds_to_send: o alerta do cartaz
}
interface NextAction { kind: NextActionKind; count: number | null; deadline: string | null }
/** RN16, só no tênis: `applies` com 4 ou mais inscrições confirmadas (o mesmo no G3 e no D2). */
interface TennisBonus { champion: 40; runner_up: 20; semifinalist: 10; min_entries: 4; applies: boolean }
```

**Estado efetivo:** toda leitura mostra `expirada` para uma reserva (ou recusa) com o prazo vencido, mesmo antes da varredura (`event_rules.effective_entry_state`), e a contagem de vagas não a inclui.

## 14. Organizador: eventos (fase 4) — frente do organizador e da administração

### Objetos

```ts
/** Corpo de POST (com `name`) e PATCH (ao menos um campo). Ausente: não muda; null: limpa. */
interface EventDraftInput {
  name?: string
  sport?: Sport | null
  format?: FootballFormat | null
  distance_km?: RunDistance | null
  competition_type?: CompetitionType | null
  capacity?: number | null
  accepted_tiers?: Tier[] | null      // null = aberto a todos
  city_id?: number | null
  venue?: string | null
  course_notes?: string | null
  starts_at?: string | null
  registration_closes_at?: string | null
  price_cents?: number | null         // 0 = gratuita
  pix_beneficiary?: string | null
  pix_key_type?: PixKeyType | null
  pix_key?: string | null
  pix_copy_paste?: string | null
  pix_instructions?: string | null
  contact?: string | null
}

/** Cartaz do O3. */
interface OrganizerEventCard extends EventPoster { pending: PendingCounts; next_action: NextAction }

/** Gestão G3 (e a base das telas de seção). */
interface OrganizerEventDetail extends OrganizerEventCard {
  course_notes: string | null
  contact: string | null
  pix: EventPix | null                // pagos, inclusive rascunho com valor > 0
  checklist: ChecklistItem[]          // só em rascunho; [] nos demais
  can_submit: boolean                 // rascunho com checklist completo e permissão ativa
  refusal: { reason_code: EventRefusalReason; reason_detail: string | null; reviewed_at: string } | null
  submitted_at: string | null
  published_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  revocation_decision: 'pendente' | 'seguir' | 'cancelado' | null
  entries_by_state: Partial<Record<EntryState, number>>
  editable_fields: (keyof EventDraftInput)[]
  tennis_bonus: TennisBonus | null
}

/** Linha de "Times inscritos" / "Inscritos". */
interface OrganizerEntry {
  id: number
  subject: EntrySubject
  state: EntryState                   // efetivo
  price_cents: number
  reserved_until: string | null
  created_at: string
  confirmed_at: string | null
  registered_by: Person | null
  latest_payment: Receipt | null      // último comprovante de pagamento
  refund: Receipt | null              // comprovante de devolução em aberto ou o último
}

/** Linha e folha do A2. */
interface ReceiptReview {
  receipt: Receipt
  entry: OrganizerEntry
  attempt: number                     // 1 = primeiro envio; 2 = "2ª tentativa"…
  previous: Receipt[]                 // envios anteriores da inscrição, do mais recente ao mais antigo
}
```

### Rotas

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /organizer/events?scope=abertos\|encerrados&cursor=&limit=` | dono (sessão) | — | `Page<OrganizerEventCard>` |
| `POST /organizer/events` | organizador ativo | `EventDraftInput` com `name` | `201 OrganizerEventDetail` |
| `GET /organizer/events/{id}` | dono | — | `OrganizerEventDetail` |
| `PATCH /organizer/events/{id}` | dono (em rascunho, com permissão ativa) | `EventDraftInput` | `OrganizerEventDetail` |
| `DELETE /organizer/events/{id}` | dono | — | `204` |
| `POST /organizer/events/{id}/submit` | dono com permissão ativa | `{}` | `OrganizerEventDetail` |
| `POST /organizer/events/{id}/withdraw` | dono | `{}` | `OrganizerEventDetail` |
| `POST /organizer/events/{id}/cancel` | dono | `{ reason: string }` (5–500) | `OrganizerEventDetail` |
| `GET /organizer/events/{id}/entries?state=&cursor=&limit=` | dono, administração | — | `Page<OrganizerEntry>` |
| `GET /organizer/events/{id}/receipts?tab=para_analisar\|decididos&cursor=&limit=` | dono, administração | — | `Page<ReceiptReview>` |
| `POST /receipts/{id}/decision` | dono do evento | `{ decision: 'aprovar' \| 'recusar'; reason_code?: ReceiptRefusalReason; reason_detail?: string }` | `ReceiptReview` |
| `GET /events/{id}/messages?cursor=&limit=` | leitores do canal (10.1) | — | `Page<EventMessage>` |
| `POST /events/{id}/messages` | dono | `{ body: string }` (1–1000) | `201 EventMessage` |

**Quem é o dono:** `events.organizer_user_id` = titular; para os demais, `404 Evento não encontrado.` (não revela existência). Listar, ver, cancelar, decidir comprovantes e escrever avisos **não** exigem a permissão ativa (o organizador revogado continua com os eventos que a administração manteve e com as devoluções). Criar, editar rascunho e enviar exigem `current_organizer` (`403 Você precisa ser organizador para criar eventos.`). Com `revocation_decision = 'pendente'`, toda ação de escrita responde `409 A administração está decidindo sobre este evento.`

**Lista (O3):** `abertos` traz todos os eventos `rascunho`, `em_aprovacao`, `publicado` e `em_andamento` numa página só (`next_cursor: null`), por `starts_at` crescente com os sem data por último; `encerrados` (`encerrado` e `cancelado`) é paginada por `(starts_at, id)` decrescente. `pending` sai de uma consulta para a página toda (`pending_counts`, seção 19). A web mostra a seção "Organizador · Meus eventos" com `OrganizerStatus.state = 'aprovado'` **ou** quando esta lista não estiver vazia.

**Rascunho (POST e PATCH):** textos aparados (vazios opcionais viram `null`); `name` 3–60. A cidade precisa existir (`422 Selecione uma cidade do catálogo.`). `pix_key` é normalizada por `event_rules.normalize_pix_key` quando há tipo e chave (`422` com a mensagem no campo `pix_key`). Datas com fuso; com as duas, `registration_closes_at ≤ starts_at` (`422 As inscrições precisam fechar antes do início do evento.`). Depois de juntar os valores, `event_rules.normalize_category` limpa o que não se aplica à modalidade (formato, distância, tipo, percurso) e a capacidade inválida da eliminação. Depois de publicado, o local continua obrigatório: apagá-lo ou deixá-lo com menos de 2 caracteres responde `422 Informe o local com 2 a 120 caracteres.` Campos fora de `event_rules.editable_fields(state)`: em `publicado`/`em_andamento`, `409 Depois de publicado, só local, percurso, instruções e contato podem mudar.`; em `em_aprovacao`, `409 Retire o evento da aprovação para editar.`; em `encerrado`/`cancelado`, `409 Este evento não pode mais ser editado.` Auditoria `evento.criado` e `evento.editado` (nomes dos campos).

**Checklist e "Publicar" (G3):** `event_rules.draft_checklist(event, now)` dá os seis itens (Nome e modalidade; Formato e tipo — "Tipo" no tênis e "Distância" na corrida —; Vagas e elos aceitos; Datas; Local; Inscrição e Pix), cada um com a mensagem do que falta. O botão diz **"Publicar"** em evento gratuito e **"Enviar para aprovação"** em pago (`price_cents > 0`), e fica desabilitado até `can_submit`.

**Enviar (`submit`):** só `rascunho` (`409 Só rascunhos podem ser enviados.`); checklist incompleto: `422 { detail: 'Complete o rascunho para publicar.', fields: [{ field: ChecklistKey, message }] }`. Gratuito → `publicado` (`published_at`; os campos de Pix são limpos). Pago → `em_aprovacao` (`submitted_at`; a recusa anterior é limpa) e notificação `evento_para_aprovar` às contas administrativas ativas. Auditoria `evento.publicado` ou `evento.enviado`.

**Retirar (`withdraw`):** `em_aprovacao` → `rascunho` (`409 Este evento não está em aprovação.`), para editar; `submitted_at` é limpo (como na recusa e na revogação), e o envio seguinte grava a nova data. Auditoria `evento.retirado`.

**Excluir:** só `rascunho` (`409 Só rascunhos podem ser excluídos.`); rascunhos nunca têm inscrições. Auditoria `evento.rascunho_excluido`.

**Cancelar:** só `publicado` ou `em_andamento` (`409 Só eventos publicados ou em andamento podem ser cancelados.`); motivo de 5 a 500 caracteres (`422 Descreva o motivo do cancelamento.`). Numa transação: trava o evento e as inscrições (`FOR UPDATE`, seção 19.1); as reservas e recusas já vencidas, ainda não varridas, expiram antes (`sweep.expire_entries`: `expirada`, notificação `reserva_expirada` e auditoria `inscricao.expirada`, como a varredura faria); às demais aplica `event_rules.entry_state_on_event_cancel` (as `cancelada` recebem `cancel_origin = 'evento'`), grava `cancelled_at`, `cancelled_by_id` e `cancel_reason`, cria o aviso automático `evento_cancelado` com o motivo e notifica `evento_cancelado` aos participantes (membros ativos dos times) com `refund` = a inscrição virou `devolucao_pendente`. Auditoria `evento.cancelado` (`{ reason, refunds, cancelled, expired, message_id }`). A devolução segue a seção 16.

**Gestão (G3) e "Agora":** `next_action` vem de `event_rules.next_action(event, pending=…, checklist_done=…, now=…)`, nesta prioridade:

| `kind` | Quando | Texto sugerido | Ação |
| --- | --- | --- | --- |
| `aguardar_revogacao` | revogação pendente | "A administração decide se o evento segue" | — |
| `corrigir_recusa` | rascunho recusado | "Recusado pela administração: {motivo}" | Corrigir dados |
| `completar_rascunho` | rascunho incompleto | "Complete o rascunho" + itens que faltam | Preencher |
| `publicar` | rascunho completo | "Pronto para publicar" / "Pronto para enviar à aprovação" | Publicar / Enviar para aprovação |
| `aguardar_aprovacao` | `em_aprovacao` | "Em aprovação pela administração" | — |
| `analisar_comprovantes` | `count` > 0 | "{n} comprovantes para analisar" (+ fim das inscrições) | Analisar |
| `enviar_devolucoes` | `count` > 0 | "{n} devoluções para enviar" | Enviar devoluções |
| `aguardar_devolucoes` | cancelado com devoluções em curso | "{n} devoluções aguardando os participantes" | — |
| `acompanhar_inscricoes` | inscrições abertas | "Inscrições abertas até {deadline}" | Ver inscritos |
| `aguardar_inicio` | inscrições encerradas | "Inscrições encerradas · começa {deadline}" | — |
| `nenhuma` | em andamento (até a fase 6), encerrado ou cancelado sem pendências | "Nada pendente" | — |

A fase 6 acrescenta os tipos do chaveamento e das partidas antes de `aguardar_inicio`. As seções do G3 nesta etapa: times inscritos (ou inscritos), comprovantes, dados do evento e pagamento/Pix; chaveamento e partidas aparecem desabilitados ("Depois das inscrições") até a fase 6.

**Inscrições (`entries`):** do evento, em ordem de inscrição (`created_at` crescente), filtráveis por `state` (estado efetivo).

**Comprovantes (A2):** `para_analisar` = comprovantes de pagamento sem decisão de inscrições `em_analise`, do mais antigo ao mais recente; `decididos` = com decisão, por `decided_at` decrescente. **Decidir:** só o dono (`403 Só o organizador do evento decide os comprovantes.` para quem vê o comprovante sem decidir: a administração, o atleta e os representantes; `404 Comprovante não encontrado.` para os demais); trava o evento (`FOR SHARE`), a inscrição e o comprovante, nessa ordem; `404 Comprovante não encontrado.`; `409 Este comprovante já foi decidido.`; `409 Esta inscrição não está em análise.`. Recusar exige `reason_code` (`422 Escolha o motivo da recusa.`) e `outro` exige `reason_detail` de 5 a 300 caracteres (`422 Descreva o motivo da recusa.`); o detalhe é opcional nos demais. Aprovar: inscrição `confirmada` (`confirmed_at`). Recusar: `event_rules.next_entry_state(…, 'recusar_comprovante', now=, reserved_until=)` → `rejeitada` (reenvio até o fim da reserva) ou `expirada` se a reserva já acabou. Notificação `comprovante_decidido` ao atleta ou aos representantes. Auditoria `comprovante.aprovado` ou `comprovante.recusado`.

**Avisos:** `GET` por leitores do canal (organizador, administração e participantes, seção 10.1); quem vê o evento publicado sem ser leitor recebe `403 Os avisos são só para os inscritos do evento.` Do mais recente ao mais antigo. `POST` só pelo dono (`403 Só o organizador publica avisos.`), em `publicado`, `em_andamento`, `encerrado` ou `cancelado` (`409 Publique o evento antes de enviar avisos.`); texto aparado de 1 a 1000 caracteres (`422 Escreva o aviso (até 1000 caracteres).`). Notificação `aviso_evento` aos participantes. Sem auditoria (é conteúdo, não decisão).

## 15. Administração: eventos pagos, revogação e devoluções contestadas

```ts
interface AdminEvent extends EventPoster {
  organizer: { organizer_id: number | null; display_name: string; user: Person; active: boolean }
  pix: EventPix | null
  contact: string | null
  course_notes: string | null
  submitted_at: string | null
  published_at: string | null
  revocation_decision: 'pendente' | 'seguir' | 'cancelado' | null
  pending: PendingCounts              // o que está em jogo na decisão da revogação
  entries_by_state: Partial<Record<EntryState, number>>  // a folha da revogação mostra as inscrições por estado
}

interface RefundDispute {
  entry: OrganizerEntry               // `refund` = o comprovante contestado
  event: EventPoster
  organizer: Person
  contested_at: string
}
```

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /admin/queue-counts` | administração | — | `{ organizer_requests, paid_events, revoked_events, refund_disputes }` (amplia a seção 6) |
| `GET /admin/events?queue=em_aprovacao\|revogacao&cursor=&limit=` | administração | — | `Page<AdminEvent>` (padrão `em_aprovacao`) |
| `GET /admin/events/{id}` | administração | — | `AdminEvent` |
| `POST /admin/events/{id}/decision` | administração | `{ decision: 'aprovar' \| 'recusar'; reason_code?: EventRefusalReason; reason_detail?: string }` | `AdminEvent` |
| `POST /admin/events/{id}/revocation-decision` | administração | `{ decision: 'seguir' \| 'cancelar'; reason?: string }` | `AdminEvent` |
| `GET /admin/refund-disputes?cursor=&limit=` | administração | — | `Page<RefundDispute>` |
| `POST /admin/entries/{id}/refund-decision` | administração | `{ decision: 'devolvida' \| 'pendente'; reason: string }` (5–500) | `RefundDispute` |

Todas usam `current_admin` (`403 Acesso administrativo necessário.`).

### 15.1 Eventos pagos (AD1)

- **Fila `em_aprovacao`** por `submitted_at` crescente (o mais antigo primeiro). No Menu, "Eventos pagos" com o contador `paid_events`, ao lado de "Pedidos de organizador" e "Denúncias". A folha mostra o cartaz, os dados e o Pix informado.
- **Decidir:** `404 Evento não encontrado.`; `409 Este evento já foi decidido.` fora de `em_aprovacao`. **Aprovar** ("Aprovar e publicar"): `publicado` com `published_at`, `reviewed_*`; se o prazo de inscrição já passou, `409 As datas deste evento já passaram. Recuse para o organizador corrigir.` **Recusar:** exige `reason_code` (`422 Escolha o motivo da recusa.`) e `outro` exige `reason_detail` de 5 a 500 (`422 Descreva o motivo da recusa.`); volta a `rascunho` com o motivo e `submitted_at` limpo. Notificação `evento_decidido` ao organizador e auditoria `evento.aprovado` ou `evento.recusado`.

### 15.2 Revogação de organizador com eventos abertos

- A revogação (`POST /admin/organizers/{id}/revoke`, seção 6) passa a chamar, na mesma transação, `events.on_organizer_revoked(db, organizer, *, actor_id)`: eventos do organizador em `em_aprovacao` voltam a `rascunho` (auditoria `evento.retirado`, `data.automatico = true`); `publicado` e `em_andamento` ficam com `revocation_decision = 'pendente'` (auditoria `evento.revogacao_pendente`); rascunhos não mudam (ele não pode mais enviá-los).
- **Fila `revogacao`:** eventos com decisão pendente, por `starts_at` crescente; contador `revoked_events`. A folha mostra o evento, as inscrições por estado e `pending`.
- **Decidir:** `409 Este evento não aguarda decisão da administração.` sem pendência. **Seguir:** `revocation_decision = 'seguir'`; as inscrições reabrem se o prazo permitir, e o organizador continua gerindo o evento. **Cancelar:** exige `reason` de 5 a 500 (`422 Descreva o motivo do cancelamento.`) e executa o mesmo cancelamento da seção 14 (aviso automático, devoluções e notificações), com `cancelled_by_id` = administração e `revocation_decision = 'cancelado'`; para os participantes, o aviso automático sai com `author: null` e a notificação `evento_cancelado` com `actor: null` ("A administração"). Notificação `evento_revogacao_decidida` ao organizador. Auditoria `evento.revogacao_decidida` (`{ decision }`) e, no cancelamento, `evento.cancelado`.

### 15.3 Devoluções contestadas

- **Fila** de inscrições `devolucao_contestada`, pela data da contestação (mais antiga primeiro); contador `refund_disputes`. A folha mostra o comprovante de devolução (`GET /receipts/{id}/file`), o motivo do participante e o histórico.
- **Decidir:** `409 Esta devolução não está contestada.`; `reason` de 5 a 500 (`422 Descreva a decisão.`). **`devolvida`**: a devolução vale (inscrição `devolvida`, `refunded_at`). **`pendente`**: volta ao organizador (`devolucao_pendente`), que envia outro comprovante; o contestado fica no histórico com a resolução. Notificação `devolucao_decidida` ao organizador e aos participantes. Auditoria `devolucao.decidida`.

## 16. Devolução por Pix (fase 5) — frente do atleta, comprovantes e devoluções

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `PUT /entries/{id}/refund-receipt` | dono do evento | multipart `file` (imagem ou PDF) | `201 OrganizerEntry` |
| `POST /entries/{id}/refund-response` | atleta ou representante | `{ response: 'confirmar' \| 'contestar'; reason?: string }` | `MyEntry` ([0002](0002-jogar.md#6-fase-7--campeonatos-e-provas-lado-do-atleta)) |

- **Enviar a devolução (organizador):** só o dono do evento (`403 Só o organizador do evento envia a devolução.` para quem vê a inscrição sem ser o dono; `404` aos demais); inscrição `devolucao_pendente` (`409 Esta inscrição não aguarda devolução.`) sem devolução em aberto (`409 A devolução já foi enviada; aguarde a resposta do participante.`). Arquivo com `media.prepare_receipt` e `media.store_receipt` (mesmas mensagens do comprovante de pagamento); a linha `entry_receipts` (`kind = 'devolucao'`) e o objeto entram no mesmo commit, e uma falha no commit chama `media.discard_object`. Notificação `devolucao_enviada` ao atleta ou aos representantes. Auditoria `devolucao.enviada`. Com revogação pendente, o envio continua permitido (o dinheiro precisa voltar).
- **Responder (participante):** só com a devolução em aberto, sem resposta e dentro dos 7 dias (`409 Nenhuma devolução aguarda a sua resposta.`; depois dos 7 dias, a devolução conta como recebida mesmo antes da varredura). **Confirmar:** comprovante `confirmada`, inscrição `devolvida` (`refunded_at`); notificação `devolucao_confirmada` (`automatic: false`) ao organizador; auditoria `devolucao.confirmada`. **Contestar:** `reason` de 5 a 500 (`422 Conte o que aconteceu com a devolução.`); comprovante `contestada`, inscrição `devolucao_contestada`; notificação `devolucao_contestada` ao organizador e às contas administrativas ativas; auditoria `devolucao.contestada`.
- **Sem resposta em 7 dias** (contados do envio do comprovante de devolução): a varredura marca `participant_response = 'automatica'` e a inscrição `devolvida`, com `devolucao_confirmada` (`automatic: true`) ao organizador e aos participantes e auditoria `devolucao.confirmada_automaticamente`. O cartão mostra `auto_confirm_at`.
- O Arena **não** movimenta dinheiro: só registra os comprovantes e as respostas.

## 17. Notificações da etapa 2

Tipos registrados em `NOTIFICATION_TYPES` (campos obrigatórios abaixo; outros campos do `payload` são opcionais). `event_name` é uma cópia do nome no momento do aviso; a navegação usa os ids. Sem `actor`, o texto usa "O organizador", "A administração" ou "O Arena".

| Tipo | Destinatário | `actor` | `payload` | Texto sugerido | Ao tocar |
| --- | --- | --- | --- | --- | --- |
| `evento_para_aprovar` | administração | organizador | `{ event_id, event_name }` | "{ator} enviou {evento} para aprovação" | Menu, Eventos pagos |
| `evento_decidido` | organizador | `null` | `{ event_id, event_name, decision: 'aprovado' \| 'recusado', reason_code?, reason_detail? }` | "{evento} foi aprovado e publicado" / "…foi recusado: {motivo}" | Gestão do evento |
| `evento_cancelado` | participantes | quem cancelou | `{ event_id, event_name, entry_id, reason, refund: boolean }` | "{evento} foi cancelado: {motivo}" (+ "o organizador vai devolver o valor por Pix") | Inscrição |
| `evento_revogacao_decidida` | organizador | `null` | `{ event_id, event_name, decision: 'seguir' \| 'cancelado' }` | "A administração manteve {evento}" / "…cancelou {evento}" | Gestão do evento |
| `aviso_evento` | participantes | organizador | `{ event_id, event_name, message_id }` | "Novo aviso em {evento}" | Detalhe, avisos |
| `time_inscrito` | membros ativos do time | representante | `{ event_id, event_name, entry_id, team_id, team_name }` | "{ator} inscreveu o {time} em {evento}" | Inscrição |
| `comprovante_recebido` | organizador | quem enviou | `{ event_id, event_name, entry_id, receipt_id }` | "Novo comprovante em {evento}" | Comprovantes (A2) |
| `comprovante_decidido` | atleta ou representantes | organizador | `{ event_id, event_name, entry_id, receipt_id, decision: 'aprovado' \| 'recusado', reason_code?, reason_detail?, reserved_until?, entry_state? }` (`entry_state`: `rejeitada`, ou `expirada` quando a recusa chega depois do fim da reserva) | "Inscrição confirmada em {evento}" / "Comprovante recusado: {motivo}. Envie outro até {prazo}" | Inscrição |
| `reserva_expirada` | atleta ou representantes | `null` | `{ event_id, event_name, entry_id }` | "Sua reserva em {evento} expirou e a vaga foi liberada" | Detalhe do evento |
| `devolucao_enviada` | atleta ou representantes | organizador | `{ event_id, event_name, entry_id, receipt_id }` | "O organizador enviou a devolução de {evento}. Confirme o recebimento" | Inscrição |
| `devolucao_confirmada` | organizador (+ participantes na automática) | participante ou `null` | `{ event_id, event_name, entry_id, receipt_id, automatic: boolean }` | "Devolução confirmada em {evento}" / "…considerada recebida após 7 dias" | Inscrições do evento |
| `devolucao_contestada` | organizador e administração | participante | `{ event_id, event_name, entry_id, receipt_id }` | "{ator} contestou a devolução de {evento}" | Gestão / fila de devoluções |
| `devolucao_decidida` | organizador e participantes | `null` | `{ event_id, event_name, entry_id, receipt_id, decision: 'devolvida' \| 'pendente' }` | "A administração considerou a devolução feita" / "…pediu outro comprovante" | Inscrição |

"Participantes" = o atleta inscrito ou os membros ativos do time (`participants.entry_recipients(…, scope='membros')`); "atleta ou representantes" = `scope='representantes'`. Ninguém é notificado da própria ação. "Reserva expirando" (lembrete antes do prazo) fica fora desta etapa: exigiria um registro de lembrete enviado para a varredura continuar idempotente.

## 18. Auditoria da etapa 2

| Ação | `target_type` | Gerada por |
| --- | --- | --- |
| `evento.criado`, `evento.editado`, `evento.rascunho_excluido`, `evento.enviado`, `evento.publicado`, `evento.retirado`, `evento.cancelado` | `event` | seção 14 |
| `evento.aprovado`, `evento.recusado`, `evento.revogacao_pendente`, `evento.revogacao_decidida` | `event` | seção 15 |
| `inscricao.criada`, `inscricao.cancelada` | `event_entry` | [0002, seção 6](0002-jogar.md#6-fase-7--campeonatos-e-provas-lado-do-atleta) |
| `inscricao.expirada` | `event_entry` | varredura (`actor_id` nulo, `data.automatico = true`) ou criação de inscrição |
| `comprovante.enviado`, `comprovante.aprovado`, `comprovante.recusado` | `entry_receipt` | seções 14 e 0002 |
| `devolucao.enviada`, `devolucao.confirmada`, `devolucao.contestada`, `devolucao.decidida` | `entry_receipt` | seções 15 e 16 |
| `devolucao.confirmada_automaticamente` | `event_entry` | varredura |

`data` guarda ids, estados e motivos; nunca chaves Pix, Copia e Cola ou o conteúdo dos arquivos.

## 19. Varredura, mídia e serviços compartilhados

**Implementados nesta fundação:**

| Função | Uso |
| --- | --- |
| `services.event_rules.reservation_deadline(entered_at, starts_at)` | fim da reserva: min(entrada + 48 h, início − 12 h) |
| `services.event_rules.registration_deadline(closes_at, starts_at, *, paid)`, `event_registration_deadline(event)`, `registration_open(event, now)` | prazo e abertura das inscrições |
| `services.event_rules.eligibility(accepted_tiers, tier) -> Eligibility`, `NO_TEAM`, `entry_subject(sport)`, `tiers_text(tiers)` | RN18 e quem se inscreve |
| `services.rankings.subject_tier(db, sport, *, team_id=, user_id=, format=, distance_km=) -> Tier \| None` | elo do time no formato, do atleta no tênis ou na distância |
| `services.event_rules.normalize_category(values)`, `capacity_error(sport, type, capacity)`, `normalize_pix_key(type, key)`, `editable_fields(state)`, `DRAFT_FIELDS` | rascunho |
| `services.event_rules.draft_checklist(event, now) -> list[ChecklistItem]`, `checklist_complete(items)` | checklist do G3 |
| `services.event_rules.next_event_state(state, action, *, paid=False)` (ações `enviar`, `retirar`, `aprovar`, `recusar`, `revogar`, `cancelar`, `iniciar`, `encerrar`), `event_phase(state, *, registration_deadline, now)` | transições do evento (`TransitionError` → `409` com a mensagem) |
| `services.event_rules.initial_entry_state(*, paid)`, `next_entry_state(state, action, *, paid=False, now=None, reserved_until=None)`, `entry_state_on_event_cancel(state, *, paid)`, `effective_entry_state(state, reserved_until, now)`, `reservation_lapsed(…)` | transições da inscrição |
| `services.event_rules.next_action(event, *, pending: PendingCounts, checklist_done, now) -> NextAction`, `PendingCounts` | "Agora" e alerta do cartaz |
| `services.event_rules.tennis_bonus(sport, confirmed_count)`, `spots_left(capacity, holding)`, `refund_auto_confirm_at(sent_at)`, `is_open_refund(receipt)` | RN16 (inscrições confirmadas), vagas, prazo da devolução e devolução em aberto |
| `services.participants.entry_recipients(db, entries, *, scope='representantes' \| 'membros') -> dict[entry_id, list[user_id]]`, `entry_role(db, entry, user_id) -> 'atleta' \| 'representante' \| 'membro' \| None` | destinatários e papel na inscrição |
| `services.media.prepare_receipt(raw) -> ReceiptFile`, `read_receipt_upload(file)`, `store_receipt(db, uploader_id, receipt) -> MediaObject` (sem commit), `discard_object(media)`, `read_object(media)`, `private_file_response(media, *, filename)` | comprovantes privados (imagem ou PDF) |
| `services.sweep.run_sweep(db, now=None, tasks=TASKS)`, `expire_entries(db, entries, now)`, `expire_reservations`, `auto_confirm_refunds`, `TASKS` | varredura |
| `schemas.events.poster_out(event, city, *, entries_count, confirmed_count, now)`, `pix_out(event)`, `receipt_out(receipt, media, uploaded_by)`, `receipt_file_url(id)`, `checklist_out`, `pending_out`, `next_action_out` e os modelos `EventPosterOut`, `EventPixOut`, `ReceiptOut`, `EntrySubjectOut`, `EventMessageOut`… | formas da seção 13 |
| `core.pagination.paginate(…, ascending=True)` | listas por data crescente (próximos eventos, filas FIFO) |

**Implementados pelas frentes e conciliados (assinaturas atuais).** Cada regra tem uma implementação só, usada pelos dois lados:

| Função | Módulo | Uso |
| --- | --- | --- |
| `load_owned_event(db, event_id, user, *, for_update=False) -> Event` (404 a quem não é dono) e `ensure_writable(event)` (409 da revogação pendente) | `services/events.py` | gestão do organizador |
| `pending_counts(db, event_ids) -> dict[int, PendingCounts]` | `services/events.py` | O3, G3 e AD1 |
| `holding_counts(db, event_ids, *, now=None) -> dict[int, tuple[int, int]]` (ocupadas, confirmadas; estado efetivo; um par para cada id) e `holding_clause(now)` (o SQL de "vaga ocupada") | `services/events.py` | cartazes dos dois lados, vagas da inscrição nova, Minhas inscrições e o `409` de `ensure_closable` |
| `posters_out(db, events, now) -> dict[int, EventPosterOut]` | `services/events.py` | todo cartaz (O3, E2, D2, AD1, S1 e a fila de contestações) |
| `organizer_entries_out(db, viewer, entries, now) -> dict[int, OrganizerEntryOut]` (forma em `schemas/events.py`) | `services/events.py` | G3, A2, resposta do envio da devolução e `RefundDispute` |
| `open_refund_clause()` (SQL de `event_rules.is_open_refund`) | `services/events.py` | devolução em aberto: contagens, envio e resposta |
| `cancel_event(db, event, *, actor_id, reason, now, by_admin=False) -> dict` (inscrições, aviso, notificações e auditoria; sem commit) | `services/events.py` | cancelamento pelo organizador e pela administração (`by_admin=True`: aviso e notificação sem ator) |
| `on_organizer_revoked(db, organizer, *, actor_id) -> list[Event]` (chamada dentro do `revoke` da seção 6) | `services/events.py` | revogação |
| `channel_readers(db, event, *, now=None) -> list[int]` e `can_read_channel(db, event, user, *, now=None) -> bool` | `services/events.py` | avisos (`GET /events/{id}/messages`) e `EventDetail.can_read_messages` |
| `lock_event(db, event_id, *, share=False)` e `admin_ids(db)` | `services/events.py` | ordem das travas (19.1) e destinatários administrativos |
| `load_entry_for(db, entry_id, user, *, for_update=False) -> tuple[EventEntry, Event, str]` (papel: `atleta`, `representante`, `membro`, `organizador`, `administracao`; 404 aos demais; com `for_update`, o evento `FOR SHARE` e depois a inscrição) | `services/entries.py` | rotas de uma inscrição |
| `can_view_receipt(role) -> bool` (atleta, representante, organizador, administração) | `services/entries.py` | histórico e arquivo do comprovante |
| `team_ensure_no_active_entry(db, team)` (o `409` de `ensure_closable`, seção 3) | `services/entries.py`, chamada em `services/teams.py` | encerrar time |

**Varredura (`python -m app.admin_cli sweep [--loop 60]`):** cada tarefa trava as linhas vencidas com `FOR UPDATE SKIP LOCKED`, aplica a transição, a notificação e a auditoria e faz o commit; uma falha é registrada e não impede as outras; rodar de novo não muda nada. Tarefas desta etapa: `reservas_expiradas` (reservas e recusas com o prazo vencido) e `devolucoes_recebidas` (7 dias sem resposta). A etapa 3 acrescenta as suas em `services/sweep.py:TASKS` (buscas de 24 h, propostas de 2 h, prazos de resultado de 48 h). As leituras continuam tratando os prazos (estado efetivo), e a criação de inscrição expira na hora (`expire_entries`) a reserva vencida do mesmo time ou atleta antes de inserir a nova. O comando está documentado no README (um terminal em desenvolvimento, com `--loop 60`).

**Mídia:** uploads novos nos padrões de `app/main.py` com o tipo `arquivo` (`PUT /api/v1/entries/{id}/receipt` e `PUT /api/v1/entries/{id}/refund-receipt`): `413 O arquivo excede o limite de 5 MiB.` e `415 Envie o arquivo (imagem ou PDF) em multipart/form-data.`; as rotas de imagem mantêm as mensagens. Validação: `415 Envie o comprovante como imagem (JPEG, PNG ou WebP) ou PDF.`, `422 O PDF está incompleto ou corrompido.`, `422 O arquivo enviado está vazio.`, `415 Imagens animadas não são aceitas.`, `413 A imagem excede o limite de 25 megapixels.` e `503` do armazenamento. Objetos em `receipts/{media_id}.webp|pdf`, privados; `app.media_admin reconcile` preserva os vinculados a `entry_receipts`. A leitura (`GET /receipts/{id}/file`) responde com `private_file_response(media, filename=f'comprovante-{id}')`: PDF inline com nome fixo, `Cache-Control: private, no-store` e `nosniff`.

### 19.1 Ordem global das travas

Todas as transições de eventos, inscrições e comprovantes (das duas frentes e da varredura) pedem as travas nesta ordem, e nenhuma pede uma de nível acima depois de segurar uma de nível abaixo; assim não há ciclo de espera (impasse). A mesma ordem está na docstring de `app/services/events.py`.

| Nível | Linha | Modo | Quem trava |
| --- | --- | --- | --- |
| 1 | conta do organizador (`users`) | `FOR NO KEY UPDATE` | pedido, decisão e revogação de organizador (seção 6) |
| 2 | permissão (`organizers`) | `FOR UPDATE` | criar, editar rascunho e enviar evento; revogar |
| 3 | evento (`events`) | `FOR UPDATE` | transições do evento: editar, enviar, retirar, excluir, decidir (AD1), cancelar, revogar (os eventos abertos, por id) e decidir a revogação; e a inscrição nova (a vaga) |
| 3 | evento (`events`) | `FOR SHARE` | transições de uma inscrição: enviar e reenviar comprovante, decidir comprovante, desistir, enviar devolução, confirmar ou contestar e decidir a contestação |
| 4 | time (`teams`) | `FOR SHARE` | só a inscrição nova (contra encerrar o time ou mudar papéis, que travam o time `FOR UPDATE`) |
| 5 | inscrições (`event_entries`) | `FOR UPDATE`, por id | cancelamento do evento (todas), inscrição nova (as do mesmo time ou atleta) e as transições de uma inscrição |
| 6 | comprovantes (`entry_receipts`) | `FOR UPDATE` | decisão do comprovante, devolução em aberto, resposta e contestação |

- O `FOR SHARE` deixa transições de inscrições diferentes do mesmo evento correrem em paralelo, mas qualquer mudança do evento (cancelamento, revogação, decisão da administração) espera por elas, e elas esperam por ela. Nenhuma transação passa de `FOR SHARE` a `FOR UPDATE` no mesmo evento.
- O envio de comprovante trava o evento antes da inscrição: com o cancelamento em curso, ele espera e responde `409 Esta inscrição não aguarda comprovante.` sem gravar arquivo; se o comprovante chegou antes, o cancelamento encontra a inscrição `em_analise` e a leva a `devolucao_pendente`. Testado com conexões reais em `tests/integration/test_lock_order_concurrency.py`.
- **Varredura:** trava só inscrições e comprovantes, com `SKIP LOCKED`, e nunca espera por outra trava; o que estiver travado fica para a rodada seguinte.
- Encerrar o time trava o time e só **lê** as inscrições (o `409` de `ensure_closable`); nunca espera por evento.

## 20. Divisão por frente na etapa 2

- **Backend do organizador e da administração:** seções 14 e 15 (exceto 15.3), a ampliação de `GET /admin/queue-counts` e a chamada de `on_organizer_revoked` no `revoke`; em `app/routers/events.py`, `app/services/events.py` e `app/schemas/organizer_events.py`.
- **Backend do atleta, comprovantes e devoluções:** [0002, seção 6](0002-jogar.md#6-fase-7--campeonatos-e-provas-lado-do-atleta), seção 16, seção 15.3 e o `409` de `ensure_closable`; em `app/routers/entries.py`, `app/services/entries.py` e `app/schemas/entries.py`.
- **Web do organizador e da administração:** V4, O3, G3 (com o "Agora" e as seções), A2, avisos do organizador, cancelamento com devoluções, filas "Eventos pagos", "Eventos de organizador revogado" e "Devoluções contestadas" no AD1.
- **Web do atleta:** E2, D2 (Informações \| Tabela ou Percurso \| Inscritos), elegibilidade, reserva com Pix, envio e reenvio do comprovante, estados S1, resposta à devolução e leitura dos avisos.
- Nenhuma frente cria migração: o esquema está completo na `0008`. Necessidades novas são relatadas ao orquestrador.
- **Estado:** as quatro frentes estão implementadas e integradas; os desvios da web estão na seção 20.2.

### 20.1 Desvios registrados na conciliação dos backends da etapa 2

Já incorporados às seções 10 a 19 (os do lado do atleta estão na [seção 6.6 de 0002](0002-jogar.md#66-desvios-registrados-na-conciliação-dos-backends)):

| Seção | Desvio | Motivo |
| --- | --- | --- |
| 13, 14 | Bônus do tênis (RN16): `applies` com 4 ou mais inscrições **confirmadas** (`confirmed_count`), no G3 e no D2. A frente do organizador usava `entries_count` (vagas ocupadas). | O plano diz "com 4 ou mais inscritos"; inscritos são as confirmadas (aba Inscritos), e a fase 6 segue com os confirmados. Reservas e comprovantes em análise ainda podem expirar ou ser recusados. |
| 15 | `GET /admin/events` usa `?queue=em_aprovacao\|revogacao` (padrão `em_aprovacao`), e não `?state=` como a fila de pedidos de organizador. | As duas filas não são estados do evento: a de revogação é a decisão pendente da administração. |
| 14, 15.2, 19 | `cancel_event(…, by_admin=False)`: no cancelamento pela administração (revogação), o aviso automático sai com `author: null` e `evento_cancelado` com `actor: null`; `cancelled_by_id` continua sendo a conta administrativa. | A administração aparece como "A administração" (seção 17), como nas demais decisões dela. |
| 15 | `AdminEvent.entries_by_state`. | A folha da revogação mostra as inscrições por estado (15.2). |
| 17 | `comprovante_decidido` ganha `entry_state` opcional (`rejeitada` ou `expirada`). | Uma recusa depois do fim da reserva expira a inscrição na hora; o cliente não oferece "Envie outro até". |
| 19 | `holding_counts(db, event_ids, *, now=None)`. | A leitura e a inscrição usam o mesmo instante. |
| 14 | No cancelamento, reservas e recusas vencidas ainda não varridas viram `expirada` (`sweep.expire_entries`, com `reserva_expirada` e `inscricao.expirada`), e não `cancelada`; `evento.cancelado` grava também `expired` e `message_id`. | O estado efetivo delas já era `expirada`; é o que a varredura faria. |
| 14, 15 | `submitted_at` é limpo quando o evento volta a rascunho (retirar, recusa da administração e revogação). | O próximo envio grava a nova data, e a fila usa a data do envio atual. |
| 14 | Depois de publicado, apagar o local ou deixá-lo com menos de 2 caracteres: `422 Informe o local com 2 a 120 caracteres.` | O local é obrigatório fora do rascunho (`ck_events_complete`); sem a checagem, o banco recusaria com erro interno. |
| 14 | Decidir comprovante: `403` também para o atleta e os representantes (quem vê o comprovante); `404 Comprovante não encontrado.` para os demais. | Regra 403/404 da seção 1. |
| 16 | Enviar devolução: `403 Só o organizador do evento envia a devolução.` para quem vê a inscrição sem ser o dono. Responder depois dos 7 dias (antes da varredura): `409 Nenhuma devolução aguarda a sua resposta.` | Mensagem para o 403 que o contrato não trazia; depois dos 7 dias a devolução já conta como recebida. |
| 17 | `devolucao_confirmada` automática (varredura) vai a todos os membros ativos do time, e não só aos representantes. | **Correção** achada na conciliação: a seção 17 diz "participantes" (`scope='membros'`); a varredura usava o escopo padrão (`representantes`). |
| 9.1, 19 | Pessoas nas listas do organizador e da administração (inscritos, comprovantes, contestações) saem com avatar `null` também para conta inativa. | Mesma regra de 9.1; a frente do atleta já fazia assim. |
| 19 | Peças unificadas em `services/events.py` (`holding_counts`/`holding_clause`, `can_read_channel`, `posters_out`, `organizer_entries_out`, `open_refund_clause`, `admin_ids`) e `OrganizerEntryOut` em `schemas/events.py`; as cópias da frente do atleta (`_holding_counts`, `reads_channel`, o `OrganizerEntryOut` de `schemas/entries.py` e `build_organizer_entries`) foram removidas. | Uma regra só para vagas, canal, cartaz e linha de inscrição: os dois lados respondem os mesmos números. |
| 1, 19 | Ordem global das travas (19.1): as transições de uma inscrição travam o evento `FOR SHARE` antes da inscrição. | Antes, o envio de comprovante e as devoluções travavam só a inscrição; agora a ordem é a mesma do cancelamento e da decisão, conferida por teste de concorrência real. |

### 20.2 Desvios registrados na integração da web da etapa 2

Já incorporados às seções 13 a 17 (os do lado do atleta que mudam o contrato de [0002, seção 6](0002-jogar.md#67-desvios-registrados-na-integração-da-web) estão lá):

| Seção | Desvio | Motivo |
| --- | --- | --- |
| 1 | `ApiError.fields` (`web/src/api/client.ts`): a lista `fields` do `422` fica no erro do cliente. | O Criar evento (V4) leva cada erro do servidor ao passo e ao campo certos (`apiFormErrors` em `eventForm.ts`), e não só mostra a mensagem. |
| 14 | Na G3, **Inscritos**, **Dados do evento** e **Pagamento e Pix** são seções que abrem dentro da própria gestão (recolhíveis); só **Comprovantes** e **Devoluções** levam a uma tela própria (A2). | Cada seção é curta e lê do mesmo `GET /organizer/events/{id}` (e da lista paginada de inscritos); uma tela por seção só duplicaria a navegação. |
| 14, 16 | A2 num evento cancelado: a primeira aba vira **Devoluções** (a enviar, aguardando, contestadas e concluídas, com "Anexar comprovante") e a segunda segue **Decididos**; nos demais, **Para analisar \| Decididos**. As contagens da placa e das abas vêm de `pending` do mesmo `GET /organizer/events/{id}`. | Não há protótipo da lista de devoluções; usa o visual dos cartões S1 e da A2. A tela de comprovantes e a de devoluções são a mesma, aberta pela seção "Comprovantes" ou "Devoluções" da G3 e pela notificação `comprovante_recebido`. |
| 14 | O Menu mostra, para quem é organizador (ou tem evento em aberto), a seção **Organizador** com até dois cartazes e a linha "Meus eventos"; a linha "Criar evento" só aparece quando não há evento em aberto (o O3 tem "Novo evento" e o botão "+"). | Evita duas entradas para o mesmo destino quando já há cartazes; sem eventos, o Menu continua levando direto ao assistente. |
| 14 | O V4 usa o Date Picker do shadcn (`react-day-picker`) e o campo de hora nativo (`input type=time`, hora do fim das inscrições opcional, 23:59 por padrão). Enter avança o passo, a seta volta e "Salvar rascunho" grava a qualquer momento. | Decisão do usuário (Date Picker oficial do shadcn Base UI) e teclado completo conferido no navegador. |
| 15 | Os cartazes da administração (`AdminPoster`) mostram "Inscrições suspensas" enquanto `revocation_pending` é verdadeiro. | Mesmo texto do O3 e do E2; antes, a folha da revogação mostrava "Inscrições abertas". |
| 17 | `comprovante_recebido` abre a A2 do evento; `evento_decidido` e `evento_revogacao_decidida`, a G3; `evento_para_aprovar`, a fila "Eventos pagos"; `devolucao_contestada` abre a fila "Devoluções contestadas" para a administração e a G3 para o organizador. `devolucao_decidida` e a `devolucao_confirmada` automática abrem o detalhe do atleta (D2), que serve ao organizador (atalho "Abrir gestão") e aos participantes. | A notificação não diz quem a recebe como organizador ou participante nesses dois tipos; o D2 serve aos dois. |
| 16, 19 | O limite de arquivo do comprovante aparece como "5 MiB" no organizador e no atleta; a validação no cliente segue a ordem do servidor (tamanho, arquivo vazio, tipo) e, sem tipo informado pelo navegador, vale a extensão. | Uma regra e um texto só (`api/receipts.ts`). |
| 13 | Os tipos comuns da seção 13 têm uma definição só em `web/src/api/events.ts` (cartaz, Pix, inscrição, comprovante, aviso, pendências); `api/receipts.ts` guarda as rotas e as regras de comprovante e `api/entries.ts`, as formas do atleta. | Antes da integração, três módulos repetiam os mesmos tipos. |

## 21. Etapa 4 — chaveamento, agenda e decisão do organizador (fases 6 e 7)

> **Estado (backend e web implementados e integrados em 12 de outubro de 2026; Expo na etapa 6):** esta seção está implementada no backend e na web: o esquema (migração `0010`), as regras puras (`app/services/bracket_rules.py`), os ganchos do campeonato (`app/services/championship_lifecycle.py`), as rotas do organizador (`app/routers/brackets.py`, `app/services/championship.py`, `app/schemas/brackets.py`) e a ligação com o cartão de resultado da etapa 3. A web consome este contrato com `web/src/api/brackets.ts` (os tipos da 21.3 e as sete rotas; `scheduleConflict()` lê o `conflict` do `409`), as telas `event-bracket` (`BracketPage`: árvore espelhada em SVG ou tabela cruzada), `event-matches` (`EventMatchesPage`, a S1, com a folha de agenda) e `result-decision` (`ResultDecisionPage`, a D3), a aba Tabela do detalhe do evento e as seções Chaveamento, Tabela e Partidas da gestão (G3). Os desvios da web estão na seção 21.11. O uso das partidas de campeonato (papéis, chat, resultado e W.O.) está em [0002, seção 17](0002-jogar.md#17-uso-nas-partidas-de-campeonato-etapa-4).

Escopo: sortear o chaveamento (eliminação simples com folgas, ou todos contra todos pelo método do círculo), trocar dois times de lugar, confirmar (gera as partidas e leva o evento a `em_andamento`), ler a árvore ou a tabela, listar e agendar as partidas (S1), decidir a divergência, o prazo vencido e o W.O. (D3), avançar o vencedor na chave e encerrar o evento com a classificação final e o bônus do tênis (RN16). Convenções da [seção 1](#1-convenções) valem aqui.

### 21.1 Decisões desta etapa (interpretações dos planos)

- **Tamanho da chave.** A eliminação simples usa a **menor potência de 2 que comporta os confirmados** (de 2 a 16, nunca acima da capacidade). Os lugares que sobram são **folgas**: quem fica sem adversário na primeira fase passa direto. Com 6 confirmados numa chave de 8, são 2 folgas (nas posições 1 e 3 da primeira fase); com 5 confirmados numa chave de 16, a chave é de 8 com 3 folgas, e não de 16 com 11. É o mesmo efeito da decisão de 12 de outubro ("segue com os confirmados"), sem fases inteiras de folga. **Confirmados mínimos: 2**, nos dois tipos.
- **Sorteio.** Os confirmados são embaralhados por `SHA-256("arena:sorteio:{semente}:{id da inscrição}")` e entram na chave padrão por cabeças de chave (1 contra o último, 2 contra o penúltimo…), de modo que as folgas ficam com as primeiras posições do sorteio, espalhadas pelas duas metades da chave. A **semente** (63 bits) é gravada em `event_brackets.seed`; as trocas ficam em `swaps`. Com a semente e as trocas, o plano é reproduzível. "Sortear de novo" troca a semente e zera as trocas.
- **Quem lê.** O organizador, a administração e os **inscritos** (a mesma regra do canal de avisos, [10.1](#101-decisões-desta-fundação-interpretações-dos-planos): atleta ou membros ativos do time inscrito, exceto inscrição expirada ou cancelada pelo participante). Os demais atletas recebem `403` com o evento visível e `404` sem ele. **Antes de confirmar**, só o organizador e a administração veem o sorteio; para os inscritos a resposta é `state: 'sem_chaveamento'`, sem rodadas.
- **Jogos e folgas.** Folga **não** vira partida: o time que passa direto já entra na partida seguinte quando o chaveamento é confirmado, e a árvore mostra o jogo da primeira fase como `bye` ("Folga"). Os jogos reais têm número sequencial **J1, J2…** por fase e posição (os de folga não têm número); as fases seguintes mostram "Vencedor J1 × Vencedor J2" até o resultado chegar.
- **Agenda.** O organizador escolhe data e hora **livres** (ao minuto, sem passos de 15 min), até 12 meses à frente, e a quadra do catálogo ou uma sugestão. **Só se agenda uma partida com os dois lados definidos.** Partida de campeonato **não** usa `match_terms` nem "quem reserva": `terms.current` e `terms.pending` saem `null`, `booking` sai `null`, e a data e a quadra estão em `starts_at` e `court` do cartão. A reserva é com o local; o Arena só registra (RN08).
- **Conflito.** A mesma quadra com outra partida do evento a **menos de 2 h** (exatamente 2 h está livre) responde `409`. Acrescentei, como extensão da regra: **um mesmo time ou atleta não joga duas partidas a menos de 2 h** uma da outra (`conflict.kind = 'time'`). Contam as partidas agendadas, realizadas ou encerradas do evento.
- **Decisão do organizador.** Vale em três situações: **divergência** (os dois lados informaram placares diferentes, a qualquer momento depois do início), **prazo** (passaram as 48 h sem placar confirmado, inclusive com um só placar informado) e **W.O.** (depois do início, informando o lado ausente). Num jogo da eliminação **não há empate**: o placar do futebol soma os pênaltis (`422`). A decisão encerra a partida (`encerrada`, `result_source = 'organizador'`).
- **Encerramento do evento.** Quando todas as partidas têm resultado final (`realizada` ou `encerrada`), o evento vai a `encerrado`, grava a classificação final (`event_placements`) e, no tênis com **4 ou mais inscrições confirmadas**, o bônus de RN16 entra no ranking: campeão +40, vice +20, semifinalistas (eliminação) ou 3º e 4º (todos contra todos) +10.
- **Inscrições depois do sorteio.** Confirmar o chaveamento **exige que nenhum comprovante esteja em análise** e **libera** as reservas e recusas ainda abertas (`expirada`, com `reserva_expirada`). Depois de confirmado, a inscrição **não pode ser cancelada** pelo participante (`409 O evento já começou.`; `can_cancel: false`).

### 21.2 Esquema (migração `0010`)

`down_revision = '0009'`. Modelos em `app/models/brackets.py`. As partidas usam as colunas já criadas na `0009` (`origin = 'campeonato'`, `event_id`, `round_number`, `bracket_position`, `next_match_id`, `next_match_side`).

| Tabela | Conteúdo e restrições |
| --- | --- |
| `event_brackets` | Um por evento (único): `kind` (`eliminacao_simples` \| `todos_contra_todos`), `state` (`sorteado` \| `confirmado`), `seed`, `size` (lugares da chave, ou número de competidores), `slots` (JSONB: ids das inscrições na ordem do plano; `null` é folga; na eliminação os lugares `2i` e `2i+1` se enfrentam na primeira fase), `swaps` (pares de lugares trocados), `draw_count`, quem sorteou e quando, quem confirmou e quando. Checks: tipo, estado, `size` de 2 a 32, `confirmado` ⇔ `confirmed_at`. |
| `result_decisions` | Uma por partida (único): `match_id`, `event_id`, `decided_by_id`, `kind` (`divergencia` \| `prazo` \| `wo`), `score_a`, `score_b`, `sets`, `winner_side`, `walkover_absent_side` (⇔ `wo`), `justification` (5 a 500), `reports` (os placares informados por cada lado no momento da decisão) e `created_at`. |
| `event_placements` | Classificação final: `event_id`, `entry_id` (único por evento), `team_id` ou `user_id`, `placement` (1 campeão, 2 vice, 3 semifinalistas ou a posição na tabela), `bonus_points` (RN16, 0 se não vale) e `awarded_at`. O ranking do tênis soma `bonus_points` dos eventos encerrados dentro da janela de 52 semanas. |

### 21.3 Tipos (TypeScript)

Espelho de `app/schemas/brackets.py` e de `ChampionshipOut`/`NextActionKind` em `app/schemas/events.py`. `Person`, `TeamRef`, `Side`, `ScoreOut`, `MatchCard`, `MatchDetail`, `MatchState`, `MatchPhase`, `EventState`, `Sport`, `FootballFormat` e `CompetitionType` estão nas seções 1, 13 e [0002, 7.4](0002-jogar.md#74-tipos-comuns-typescript).

```ts
type BracketState = 'sem_chaveamento' | 'sorteado' | 'confirmado'
type SlotKind = 'competidor' | 'vencedor' | 'folga'

/** Quem disputa: um time (futebol) ou um atleta (tênis). */
interface Competitor {
  entry_id: number
  kind: 'time' | 'atleta'
  team: TeamRef | null
  athlete: Person | null
  place: number | null          // lugar (0, 1, 2…) no plano do sorteio: o valor das trocas
}

interface BracketSlot {
  kind: SlotKind                // 'folga' ("Folga"), 'vencedor' ("Vencedor J1") ou 'competidor'
  competitor: Competitor | null
  placeholder: string | null    // "Folga" ou "Vencedor J1"
  from_match: number | null     // número (J) do jogo cujo vencedor chega aqui
  advanced_by_bye: boolean      // o competidor está aqui porque o jogo da primeira fase foi folga
  place: number | null          // lugar da primeira fase da eliminação (também para "Folga")
  winner: boolean               // venceu este jogo
}

interface BracketMatch {
  id: number
  state: MatchState
  phase: MatchPhase
  starts_at: string | null
  court_name: string | null
  score: ScoreOut | null
  awaiting_decision: boolean    // placar divergente, ou 48 h sem resultado: o organizador decide
}

interface BracketNode {
  position: number              // 1 a n dentro da fase
  number: number | null         // J do jogo; null no jogo de folga
  label: string | null          // "J1"
  bye: boolean                  // jogo de folga: não há partida
  slots: [BracketSlot, BracketSlot]   // [lado a, lado b]
  match: BracketMatch | null    // null antes de confirmar e nas folgas
  next: { round: number; position: number; side: Side } | null   // para onde vai o vencedor
}

interface BracketRound {
  number: number
  name: string                  // "Oitavas de final" | "Quartas de final" | "Semifinal" | "Final" | "Rodada 3"
  nodes: BracketNode[]
  rest: Competitor | null       // todos contra todos com número ímpar: quem folga na rodada
}

interface TableRow {
  position: number
  competitor: Competitor
  played: number; wins: number; draws: number; losses: number
  goals_for: number; goals_against: number; goal_difference: number   // gols (futebol) ou sets (tênis)
  points: number                // 3 / 1 / 0
}

interface Placement { placement: number; competitor: Competitor; bonus_points: number }

interface Bracket {
  event_id: number
  event_name: string
  event_state: EventState
  sport: Sport
  format: FootballFormat | null
  kind: CompetitionType
  state: BracketState
  is_organizer: boolean
  size: number | null           // lugares da chave (eliminação) ou número de competidores
  byes: number                  // folgas da eliminação
  seed: number | null           // só para o organizador e a administração
  draw_count: number | null     // idem
  drawn_at: string | null       // idem
  confirmed_at: string | null
  rounds: BracketRound[]        // a árvore (eliminação) ou as rodadas (todos contra todos)
  table: TableRow[] | null      // todos contra todos: a classificação (pontos, saldo, gols pró)
  placements: Placement[] | null  // só com o evento `encerrado`
  champion: Competitor | null
  permissions: { can_draw: boolean; can_swap: boolean; can_confirm: boolean; draw_blocker: string | null }
}

/** Linha da lista S1 e resposta do agendamento. */
interface EventMatchRow {
  card: MatchCard               // my_role: 'organizador'; sides com 0, 1 ou 2 lados
  label: string                 // "J1"
  stage: string                 // "Quartas de final" | "Rodada 3"
  round_number: number
  position: number
  placeholders: [string | null, string | null]   // "Vencedor J1" enquanto o lado não está definido
  can_schedule: boolean         // evento em andamento, dois lados, antes do início
  awaiting_decision: boolean    // divergente, ou 48 h sem resultado
}
interface EventMatchList {
  items: EventMatchRow[]
  counts: { total: number; to_schedule: number; waiting: number; scheduled: number; to_decide: number; finished: number }
}

interface ScheduleInput {
  starts_at: string             // ISO 8601 com fuso, ao minuto
  court_id?: number | null      // uma quadra do catálogo da cidade do evento…
  court_suggestion?: { name: string; address?: string | null } | null   // …ou uma sugestão (exatamente uma das duas)
}

interface ResultDecisionInput {
  score?: { goals_a: number; goals_b: number } | { sets: TennisSetInput[] } | null   // o placar do jogo
  walkover_absent_side?: Side | null    // W.O.: o lado que não compareceu (sem `score`)
  justification: string         // 5 a 500 caracteres
}

interface ScheduleConflict {    // corpo do 409 de agenda: { detail, conflict }
  kind: 'quadra' | 'time'
  match_id: number
  label: string                 // "J3"
  stage: string
  starts_at: string
  court_name: string | null
}

/** Extensão de OrganizerEventCard/OrganizerEventDetail (seções 13 e 14); null fora dos campeonatos de futebol e tênis. */
interface Championship {
  bracket: BracketState
  confirmed: number             // inscrições confirmadas (o que o sorteio usa)
  matches_total: number
  to_schedule: number           // dois lados definidos e sem data
  waiting: number               // um lado ainda espera o vencedor de um jogo anterior
  scheduled: number             // agendadas e sem resultado final
  to_decide: number             // divergentes ou com 48 h sem resultado
  finished: number
  attention: number             // to_schedule + to_decide: o alerta do cartaz
}
```

`NextActionKind` (seção 13) ganha `sortear_chaveamento`, `confirmar_chaveamento`, `decidir_divergencias`, `agendar_partidas` e `acompanhar_partidas`, na prioridade: comprovantes e devoluções → (publicado, inscrições encerradas) `confirmar_chaveamento` (sorteio feito) ou `sortear_chaveamento` (2 ou mais confirmadas) → (em andamento) `decidir_divergencias` (count = `to_decide`) → `agendar_partidas` (count = `to_schedule`) → `acompanhar_partidas` (count = `scheduled`). Sem o sorteio possível, continua `aguardar_inicio`. `MatchPermissions` ([0002, 10.1](0002-jogar.md#101-objetos)) ganha `schedule_match` e `decide_result`.

### 21.4 Rotas

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /organizer/events/{id}/bracket` | dono | `{}` | `200 Bracket` (`state: 'sorteado'`) |
| `PATCH /organizer/events/{id}/bracket` | dono | `{ a: number; b: number }` (lugares, 0 a 63) | `200 Bracket` |
| `POST /organizer/events/{id}/bracket/confirm` | dono | `{}` | `200 Bracket` (`state: 'confirmado'`, evento `em_andamento`) |
| `GET /events/{id}/bracket` | dono, administração e inscritos | — | `Bracket` |
| `GET /organizer/events/{id}/matches` | dono, administração | — | `EventMatchList` (sem paginação: até 190 jogos) |
| `PUT /organizer/matches/{id}/schedule` | dono do evento | `ScheduleInput` | `200 EventMatchRow`; `409 { detail, conflict }` |
| `POST /organizer/matches/{id}/result-decision` | dono do evento | `ResultDecisionInput` | `201 MatchDetail` |

Todas exigem sessão; o dono vem da sessão. As ações são JSON (`{}` quando não têm parâmetros) e campos desconhecidos dão `422`. Para o chat da partida, o organizador usa as rotas existentes de [0002, 11.1](0002-jogar.md#111-mensagens) (`GET` e `POST /matches/{id}/messages`).

### 21.5 Regras das rotas

- **Dono.** `404 Evento não encontrado.` para quem não é o dono (não revela existência). Com a revogação pendente, sortear, trocar, confirmar, agendar e decidir respondem `409 A administração está decidindo sobre este evento.` Trava o evento `FOR UPDATE` (seção 21.8).
- **Sortear.** Só em evento `publicado` de futebol ou tênis, depois do fim das inscrições (`registration_deadline`), com 2 ou mais inscrições `confirmada`. Erros `409`, nesta ordem: `Este evento não tem chaveamento.` (corrida); `O chaveamento já foi confirmado.`; `Este evento não aceita mais sorteio.` (encerrado ou cancelado); `Publique o evento antes de sortear.`; `As inscrições ainda estão abertas. Sorteie depois do fim das inscrições.`; `Confirme pelo menos 2 inscrições para sortear o campeonato.` Grava a semente, o plano e `draw_count` (sortear de novo substitui o sorteio e zera as trocas). Auditoria `chaveamento.sorteado` (`{ seed, kind, entries, size, byes, draw_count }`). `Bracket.permissions.draw_blocker` traz a mensagem do que impede agora (só o organizador).
- **Trocar.** Dois lugares trocam as inscrições (um time pode ocupar o lugar de uma folga, e a folga vai para onde o time estava). `409 Sorteie o chaveamento antes.` sem sorteio; `409 Este evento não aceita mais troca de posições no chaveamento.` com o evento cancelado ou encerrado; `409 O chaveamento já foi confirmado.` depois da confirmação (evento em andamento). `422`: `Escolha lugares que existem na chave.` (campo `a`), `Escolha dois lugares diferentes para trocar.` e `Escolha pelo menos um time para trocar de lugar.` (campo `b`) e `Essa troca deixaria um jogo sem nenhum time. Escolha outros lugares.` (sem campo). Auditoria `chaveamento.trocado` (`{ a, b, entry_a, entry_b }`).
- **Confirmar.** `409 Sorteie o chaveamento antes.`; `409 Este evento não aceita mais confirmação do chaveamento.` (evento cancelado ou encerrado); `409 O chaveamento já foi confirmado.`; `409 As inscrições ainda estão abertas. Confirme depois do fim das inscrições.`; `409 Analise N comprovante(s) pendente(s) antes de confirmar o chaveamento.`; `409 As inscrições confirmadas mudaram desde o sorteio. Sorteie de novo.` Numa transação: trava o evento e as inscrições, **libera** as reservas e recusas abertas (`expirada`, `reserva_expirada`), cria as partidas rodada a rodada (`combinando`, sem data; a eliminação só cria os jogos reais, e quem tem folga já entra na partida seguinte), liga os vencedores (`next_match_id`, `next_match_side`; os jogos que alimentam uma partida têm `id` menor que ela), posta a faixa `partida_combinando` no chat de cada partida, leva o evento a `em_andamento` e notifica `tabela_publicada` aos membros dos times inscritos (ou ao atleta). Auditoria `chaveamento.confirmado` (`{ matches, entries, kind, released }`).
- **Ler.** Eliminação: `rounds` da primeira fase à final, com `bye`, "Vencedor J1" e, depois do resultado, o time que avançou. Todos contra todos: `rounds` com os jogos e quem folga, e a `table` (3/1/0; saldo, gols pró e vitórias desempatam; a ordem do sorteio decide o resto), inclusive zerada antes do primeiro jogo. `404 Este evento não tem chaveamento.` na corrida. `placements` e `champion` só com o evento `encerrado`. A tabela cruzada do todos contra todos sai de `rounds`: a célula (A, B) é o jogo que reúne os dois, com o número da rodada e o placar.
- **Lista S1.** Sem data primeiro (os que podem ser agendados e, depois, os que esperam um vencedor, por fase e posição); em seguida os agendados por início; por fim os finalizados, o mais recente primeiro. `counts` vem dos contadores do cartaz. Fora do dono e da administração, `404`.
- **Agendar.** `404 Partida não encontrada.` para quem não vê a partida (e para amistosos); `403 Só o organizador do evento agenda as partidas.` para quem vê a partida sem ser o dono (elencos e administração). Erros `409`: `Confirme o chaveamento antes de agendar as partidas.`; `Este evento não aceita mais agendamento.`; `Esta partida foi cancelada.`; `O resultado desta partida já foi definido.`; `A partida já começou: depois do início só o resultado pode mudar.`; `Esta partida ainda espera o resultado dos jogos anteriores.`; `Esta partida já tem 3 sugestões de quadra em revisão.`; e o **conflito**, com o corpo `{ detail, conflict }`: `A quadra {nome} já tem o {J} a menos de 2 h desse horário. Escolha outro horário ou outra quadra.` (`kind: 'quadra'`) ou `{time} já joga o {J} a menos de 2 h desse horário. Escolha outro horário.` (`kind: 'time'`). `422` (campo `starts_at`): `Informe a data e a hora com o fuso horário.`, `Escolha uma data e um horário que ainda não passaram.`, `Escolha uma data nos próximos 12 meses.`; (campo `court_id`): `Escolha uma quadra do catálogo ou sugira uma.` (nenhuma ou as duas), `Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.`, `Escolha uma quadra de {formato}.`. A quadra sugerida nasce `em_revisao` com `origin_match_id` desta partida (como em [0002, 10.4](0002-jogar.md#104-quadras-rn07)), e uma equivalente publicada, ou já sugerida por **qualquer partida do mesmo evento**, é reaproveitada: a fila da administração recebe uma linha por lugar, e o conflito de 2 h enxerga a quadra. O conflito de quadra compara o `court_id` e também o nome normalizado (todas as quadras de um evento são da mesma cidade e do mesmo tipo), de modo que uma sugestão ainda não criada, ou uma publicada e outra em revisão com o mesmo nome, contam como o mesmo lugar. Reagendar (antes do início) vale a mesma regra, ignorando a própria partida. Efeitos: `combinando` → `agendada` (a primeira vez), `result_deadline = início + 48 h`, notificação `partida_agendada` aos membros dos dois elencos (`changed` no reagendamento; `terms_id: null`), faixa `partida_agendada` com o organizador como autor e auditoria `partida.agendada` ou `partida.reagendada` (`{ event_id, starts_at, court_id, previous }`); uma sugestão de quadra grava ainda `quadra.sugerida`.
- **Decidir.** `404` para quem não vê a partida; `403 Só o organizador do evento decide o resultado.` para quem a vê sem ser o dono. Erros `409`: `O resultado desta partida já foi definido.`; `Esta partida foi cancelada.`; `Agende a partida antes de decidir o resultado.`; `A partida ainda não começou.`; e, sem divergência, sem W.O. e dentro das 48 h, `Os times ainda podem informar o placar. O organizador decide quando os placares divergem, depois do prazo de 48 h ou em caso de W.O.` `422`: `Escreva a justificativa da decisão, de 5 a 500 caracteres.` (campo `justification`), `Informe o placar ou o lado ausente (W.O.), não os dois.` (campo `score`), as validações do placar do cartão de resultado ([0002, 12.3](0002-jogar.md#123-placar-rn09-rn15)) e `Na eliminação simples não há empate. Informe o placar final com o vencedor (some os pênaltis, se houver).` O W.O. grava 3 × 0 (futebol) ou 6-0 6-0 (tênis) para o lado presente e marca `walkover_absent_side`. Numa transação, a decisão grava o placar final (`result_source = 'organizador'`, motivo e quem decidiu na partida), a linha de `result_decisions` (com os placares que cada lado informou), leva a partida a `encerrada`, recalcula os rankings (`standings.recalculate_for_match`), avança o vencedor, encerra o evento se era a última partida, posta a faixa `resultado_decidido` (com a justificativa) e notifica `decisao_registrada` aos membros dos dois elencos. Auditoria `resultado.decidido` (`{ event_id, kind, score_a, score_b, winner, absent_side, justification, reports }`). A justificativa fica visível aos dois times em `MatchDetail.result.decision_reason`.
- **Avançar o vencedor.** Quando uma partida de eliminação tem placar final (placares iguais, ou decisão do organizador), o vencedor ocupa o lado `next_match_side` da partida `next_match_id` (auditoria `chaveamento.avancou`, sem ator). Quando os dois lados da partida seguinte estão definidos, o chat recebe a faixa `partida_combinando` ("A × B: adversários definidos…") e os dois elencos recebem `adversario_definido`.
- **Encerrar o evento.** Quando nenhuma partida está em `combinando` ou `agendada`, o evento vai a `encerrado` na mesma transação que deu o último placar; a varredura (`campeonatos_encerrados`) cobre o caso em que a linha do evento estava ocupada. Grava `event_placements` (eliminação: campeão 1º, vice 2º, quem perdeu as semifinais 3º; todos contra todos: a posição na tabela), notifica `evento_encerrado` ao organizador e aos inscritos, audita `evento.encerrado` e, se o bônus vale, recalcula o ranking do tênis.

### 21.6 Notificações

Registradas em `NOTIFICATION_TYPES`; a `partida_agendada` da [seção 13 de 0002](0002-jogar.md#13-notificações-da-etapa-3) é reaproveitada.

| Tipo | Destinatário | `actor` | `payload` | Texto sugerido | Ao tocar |
| --- | --- | --- | --- | --- | --- |
| `tabela_publicada` | membros dos times inscritos (ou o atleta) | organizador | `{ event_id, event_name }` | "A tabela de {evento} saiu" | Evento, aba Tabela |
| `partida_agendada` | membros dos dois elencos | organizador | `{ match_id, terms_id: null, starts_at, court_name, changed, event_id, event_name }` | "Partida agendada: {data} em {quadra}" / "Partida alterada…" | Partida |
| `adversario_definido` | membros do elenco de cada lado | `null` | `{ match_id, event_id, event_name, opponent_name }` | "Seu próximo jogo: {adversário}" | Partida |
| `divergencia_para_decidir` | organizador | `null` | `{ match_id, event_id, event_name, deadline }` | "Os placares de {jogo} não batem. Decida" | Partida (D3) |
| `decisao_registrada` | membros dos dois elencos | organizador | `{ match_id, event_id, event_name, kind: 'divergencia' \| 'prazo' \| 'wo', score_a, score_b, justification, absent_side }` | "O organizador decidiu o resultado: {placar}" | Partida |
| `evento_encerrado` | organizador e membros dos times inscritos (ou o atleta) | `null` | `{ event_id, event_name, champion }` | "{evento} terminou: campeão {champion}" | Evento, aba Tabela |

No campeonato, o organizador recebe `divergencia_para_decidir` (e não `resultado_divergente`) **uma vez por divergência**, quando os placares passam a diferir; as correções que continuam divergentes não avisam de novo. Os dois elencos continuam recebendo `resultado_divergente`.

### 21.7 Auditoria

| Ação | `target_type` | Gerada por |
| --- | --- | --- |
| `chaveamento.sorteado`, `chaveamento.trocado`, `chaveamento.confirmado` | `event` | seção 21.5 |
| `chaveamento.avancou` | `match` (a partida seguinte; `actor_id` nulo, `data.automatico = true`) | resultado final de uma partida da eliminação |
| `partida.agendada`, `partida.reagendada` | `match` | agendamento |
| `quadra.sugerida` | `court` | agendamento com `court_suggestion` |
| `resultado.decidido` | `match` | decisão do organizador |
| `partida.cancelada` | `match` (`data.automatico = true`, `data.motivo = 'evento_cancelado'`) | cancelamento do evento |
| `evento.encerrado` | `event` (`actor_id` nulo) | último resultado ou varredura |

### 21.8 Serviços, ganchos e ordem de travas

| Função | Módulo | Uso |
| --- | --- | --- |
| `draw_order`, `elimination_size`, `seed_order`, `elimination_slots`, `elimination_layout`, `swap_slots`, `circle_rounds`, `table_standings`, `find_conflict`, `validate_schedule_start`, `decision_kind`, `clean_justification`, `ensure_decisive`, `elimination_placements`, `table_placements`, `placement_bonus` | `services/bracket_rules.py` (puro, com testes de unidade) | sorteio, folgas, rodadas, tabela, conflito de 2 h, decisão e bônus |
| `status_for(db, events, now)`, `cancel_event_matches`, `lock_following`, `after_score`, `advance_winner`, `on_divergence`, `try_finish`, `finish_event`, `finish_due_events` | `services/championship_lifecycle.py` | contadores do cartaz, cancelamento do evento, avanço do vencedor, encerramento e varredura |
| `draw_bracket`, `swap_bracket`, `confirm_bracket`, `get_bracket`, `list_event_matches`, `schedule_match`, `decide_result`, `draw_blocker` | `services/championship.py` | as rotas da seção 21.4 |
| `event_rules.next_action(…, championship=ChampionshipCounts)` | `services/event_rules.py` | "Agora" com os tipos novos |

**Ganchos em código das etapas anteriores** (cada um é uma chamada): `events._cards` (contadores) e `events.cancel_event` (cancela as partidas abertas do campeonato); `results.report_score` (empate recusado na eliminação), `results._store_report` (avisa o organizador da divergência) e `results._confirm` (avança o vencedor e tenta encerrar o evento); `standings._tennis_records` (soma o bônus); `entries.start_for_cancel` (o evento em andamento conta como iniciado para desistir); `sweep.TASKS` (`campeonatos_encerrados`, antes de `rankings_janela`); `matchmaking.play_board` (partida de campeonato em `combinando` não acende o ponto menta).

**Ordem das travas** (extensão da seção 19.1 e da [seção 15.5 de 0002](0002-jogar.md#155-ordem-global-de-travas-da-etapa-3), que traz o quadro completo por rota): evento `FOR UPDATE` (nível 3) → inscrições do evento (nível 5, só ao confirmar o chaveamento) → partidas do evento, por `id` (as que alimentam outra têm `id` menor) → rankings → balde → busca. Sortear, trocar, confirmar, agendar e decidir travam o evento primeiro, o que serializa o conflito de agenda. Quem começa por uma partida (`results.report_score`) segura a partida, trava a partida seguinte para avançar o vencedor **antes de recalcular o ranking** (`championship_lifecycle.lock_following`, chamada por `results._confirm` e `championship.decide_result`) e só **tenta** a linha do evento (`SKIP LOCKED`) para encerrá-lo, então nunca espera pelo evento enquanto um fluxo do organizador espera pela partida. Testado com conexões reais em `tests/integration/test_championship_concurrency.py` (o agendamento simultâneo, as duas semifinais ao mesmo tempo e a ordem do SQL de cada placar).

### 21.9 Desvios do rascunho do plano e pendências

| Tema | Decisão |
| --- | --- |
| Folga | Chave do tamanho dos confirmados (21.1), e não da capacidade; a folga não é partida. |
| Condições da partida | Partida de campeonato não tem `match_terms` nem reserva (`terms` e `booking` nulos): o organizador agenda direto na partida. |
| Conflito | Além da quadra, o mesmo competidor (extensão). |
| Decisão | Vale também para o prazo vencido e para o W.O. (a M2 mandava o W.O. do campeonato ao organizador); a divergência pode ser decidida antes das 48 h. |
| Leitura da tabela | Só inscritos, organizador e administração (como pedido); abrir a todo atleta logado é trocar `championship._reader_event`. |
| Pendências | Cancelar uma partida de campeonato isolada (hoje só o cancelamento do evento as cancela); presença e estatísticas nas partidas decididas pelo organizador (a janela fecha com a decisão); notificar o organizador quando o prazo de 48 h vence sem divergência (hoje aparece em `to_decide` e no "Agora"); aviso da tabela aos que entraram e saíram do evento; revogação do organizador com o campeonato em andamento segue a [seção 15.2](#152-revogação-de-organizador-com-eventos-abertos). |

### 21.10 Conciliação com o backend integrado da etapa 3 (etapas 4 e 5)

As frentes S4 (campeonatos) e S5 (corrida) nasceram sobre a fundação da etapa 3 e foram conciliadas com o backend já integrado (12 de outubro de 2026). Resultado:

| Tema | Decisão |
| --- | --- |
| Erros de regra | `brackets.py` e `runs.py` não têm mais rota própria de erros (`RuleRoute` saiu): `RuleError` responde `422 { detail, fields }` e `TransitionError`, `409 { detail }` pelos handlers globais de `app/main.py`. Os demais `409` e `404` dos serviços seguem como `HTTPException`. |
| Conflito de agenda | Continua `409 { detail, conflict }`: `ScheduleConflict` não é `RuleError` nem `TransitionError`, então os handlers globais não passam por ele; a rota o converte em `JSONResponse` com o corpo `{ detail, conflict: { kind, match_id, label, stage, starts_at, court_name } }` (testado em `test_championship_schedule_flow.py` e em `test_championship_service.py`). |
| Ordem de travas | O avanço do vencedor travava a partida seguinte depois do ranking: agora `lock_following` a trava antes (ver o quadro da [seção 15.5 de 0002](0002-jogar.md#155-ordem-global-de-travas-da-etapa-3)). Agendar, decidir, confirmar o chaveamento, encerrar o campeonato e registrar ou remover marca de corrida seguem a ordem global; testado pela ordem do SQL. |
| Janela de 52 semanas | `rankings_janela` também recalcula o ranking do tênis quando um bônus de campeonato saiu da janela, mesmo sem partida que tenha saído (antes o bônus ficaria nos pontos guardados até outro recálculo). |
| Painel da Jogar | A partida de campeonato em `combinando` não acende o ponto menta (`play_board`); o teste de unidade da etapa 3, que supunha qualquer `combinando`, passou a distinguir `origin`. |
| Testes de unidade da etapa 3 | Cinco testes com `FakeDb` falhavam porque as consultas novas (bônus em `event_placements`, ranking real da corrida, janela da corrida, `origin` do cartão) não tinham resposta registrada: o defeito era do **teste**, não de uma regra da etapa 3 quebrada. O `FakeDb` e os cenários foram ampliados, sem enfraquecer asserções, e ganharam testes do bônus, do ranking da corrida e da janela. |

### 21.11 Desvios registrados na integração da web (etapa 4)

A web da etapa 4 (frente W4) foi integrada sobre a da etapa 5 em 12 de outubro de 2026 e conferida no navegador contra a API real (16 times em eliminação simples, três de quatro vagas com folga num evento pago, todos contra todos no tênis). Onde o contrato era omisso ou a tela precisou de algo a mais:

| Tema | Decisão | Motivo |
| --- | --- | --- |
| `TableRow.position` | A web trata como **1 a n** (o backend entrega assim); o contrato não dizia a base. | O número é o da classificação ("1º"), não um índice. |
| `divergencia_para_decidir` | O texto é "Os placares de **uma partida** de {evento} não batem. Decida", sem o rótulo do jogo (J1…). | O payload da 21.6 não traz o rótulo (`{ match_id, event_id, event_name, deadline }`); incluí-lo pede um campo novo no backend. Pendência pequena: com `label` no payload, o texto diria "{J2}". |
| `decisao_registrada` | "O organizador decidiu o resultado: {placar}", sem o nome de quem decidiu. | O `actor` da notificação já é o organizador, e o texto fica igual à faixa do chat. |
| Opções do D3 | "Como decidir o resultado" e "Lado ausente" são **botões de opção** (`role="radiogroup"` e `role="radio"`, `aria-checked`, foco só na opção escolhida, setas movem a escolha), no padrão do `Segmented`. | A primeira versão usava botões com `aria-pressed`; escolha única pede o grupo de opções (teclado e leitores de tela). |
| Sugestão de quadra do organizador | Só dentro do agendamento (`court_suggestion`), sem chamar `POST /courts/suggestions`. | Essa rota responde `403` a quem não é representante; o organizador não é. A folha de agenda mostra "Sugerir outra quadra" e a quadra entra em revisão ligada à partida. |
| Campos que a web leu como opcionais | `MatchPermissions.schedule_match` e `decide_result` e `OrganizerEventCard.championship` (`Championship \| null`) passaram a **obrigatórios** nos tipos da web; o backend sempre os envia. | A primeira versão os deixou opcionais para não quebrar fixtures; as fixtures foram ajustadas. |
| `ApiError.body` | `request` guarda o corpo JSON do erro em `ApiError.body`. | O `409 { detail, conflict }` da agenda carrega o jogo em conflito. |
| Notificações da tabela | `NotificationTarget.section: 'tabela'` abre o detalhe do evento já na aba Tabela (`tabela_publicada` e `evento_encerrado`). | A 21.6 diz "Evento, aba Tabela". |
| Texto com atletas | No tênis, as mensagens do sorteio e da confirmação falam em **atletas**, não em times. | Corrigido ao conferir o todos contra todos no navegador. |
| Confirmar depois de uma troca nas inscrições | Se uma inscrição foi aprovada depois do sorteio, o `409 As inscrições confirmadas mudaram desde o sorteio. Sorteie de novo.` aparece na folha de confirmação; a pessoa fecha a folha e usa "Sortear de novo". | É a regra da 21.5, vista na web; a tela não refaz o sorteio sozinha. |
| Estado velho depois de um erro | Um `404`/`409` ao sortear, trocar, confirmar (`BracketPage`), agendar (`EventMatchesPage`, exceto o conflito de agenda), decidir (`ResultDecisionPage`) ou remover uma marca (`RunHistorySheet`) faz a tela reler o recurso e mostrar o estado atual, mantendo a mensagem do servidor; a decisão que não cabe mais perde o formulário. "Fechar" do registro de corrida fica parado enquanto salva. | Antes, um `409` de outra aba deixava ações habilitadas sobre um estado velho (revisão das etapas 4 e 5). |

**Limitações conhecidas, não implementadas (revisão das etapas 4 e 5):**

- A trava do conflito de agenda é **por evento** (a trava do evento serializa o agendamento): não há verificação entre eventos do mesmo organizador nem contra amistosos na mesma quadra, e o mesmo time em dois eventos pode ter jogos sobrepostos.
- O evento cujas **duas últimas partidas fecham ao mesmo tempo** (dois placares finais em transações concorrentes, cada uma sem ver a outra) só é encerrado pela varredura (`campeonatos_encerrados`), não na transação do último placar.

**Não conferido no navegador:** a recusa do sorteio pelo `draw_blocker` com as inscrições abertas (a gestão deixa "Chaveamento" apagado até o fim das inscrições, então só dá para chegar à tela por outro caminho; coberta por teste) e a prova paga (a corrida conferida foi gratuita).
