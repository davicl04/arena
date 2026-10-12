# Decisões e contratos — Times e campeonatos

Data: 12 de outubro de 2026. Contrato da **etapa 1** da execução (fases 1 a 3 do [plano de Times e campeonatos](../plano-times-campeonatos.md)): times, papéis, convites, link do time com pedido de entrada, encerrar time, pedido de organizador com fila e decisão da administração, e revogação pela administração. As fases 4 a 7 ficam **a definir na etapa correspondente** (seção 10). O contrato da linha do elo e de `GET /me/standings` está em [0002-jogar.md](0002-jogar.md).

> **Estado (etapa 1 implementada e integrada em 12 de outubro de 2026):** as seções 1 a 9 estão implementadas no backend (migração `0005`, `app/routers/teams.py`, `app/routers/organizers.py`, `app/routers/notifications.py` e os serviços da seção 9) e na web (Meus times, convites, link do time, organizador, filas da administração e Notificações). O Expo ainda não consome este contrato (última etapa). Os desvios das frentes, já incorporados abaixo, estão resumidos na seção 9.1. As fases 4 a 7 seguem na seção 10.

Este documento é a fonte da verdade entre o backend e os clientes. Desvios exigem atualizar este arquivo.

## 1. Convenções

- **Prefixo** `/api/v1`. Toda rota exige sessão (cookie HttpOnly na web, Bearer no Expo); sem sessão, `401 Entre na sua conta para continuar.` O titular vem sempre da sessão, nunca de um ID enviado pelo cliente.
- **Corpo:** ações recebem JSON, mesmo quando vazio (`{}`); campos desconhecidos são recusados (`422`). `DELETE` não tem corpo. Uploads são `multipart/form-data` com o campo `file` e entram nos padrões de upload de `app/main.py`. O middleware de `Origin` e a exigência de JSON não mudam.
- **Listas paginadas:** `{ items, next_cursor }`, parâmetros `cursor` e `limit` (padrão 20, máximo 50), do mais recente para o mais antigo, como em `GET /users`. Listas curtas por natureza (meus times, elenco, convites e pedidos de um time) não são paginadas e respondem `{ items }`.
- **Datas** em ISO 8601 com fuso (UTC).
- **Erros:** `{ "detail": "mensagem em português" }`. Validação de campos: `422` com `{ "detail": "Revise os campos informados.", "fields": [{ "field", "message" }] }`. `404` vale tanto para o que não existe quanto para o que o titular não pode ver (não revela existência). `403` só para quem pode ver o recurso, mas não tem o papel exigido. `409` para conflito de estado. Imagens: `413`, `415`, `422` e `503` como no avatar.
- **Concorrência:** toda mudança de elenco, papel, convite, pedido ou estado do time trava a linha do time (`SELECT … FOR UPDATE`) antes de ler o elenco; decisões travam também a linha do convite ou do pedido. Os índices únicos parciais são a última barreira: um `IntegrityError` de corrida é tratado como reenvio (devolve o existente) ou `409`.
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

**`POST /teams/{id}/close` (encerrar):** só representante (`403 Só representantes podem encerrar o time.`). Pré-condição `ensure_closable(db, team)`: na etapa 1 não há partidas nem inscrições, então sempre passa; as fases de partidas e inscrições acrescentam `409 Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.` Efeitos, numa transação: `state = 'encerrado'`, `closed_at`/`closed_by_id`, link apagado (nonce e hash nulos), todos os membros ativos com `left_reason = 'time_encerrado'`, convites e pedidos pendentes `cancelado`. Notificação `time_encerrado` aos membros ativos no momento, exceto quem encerrou. Auditoria `time.encerrado`. O time some de Meus times, da busca e do link.

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
- **Pedir para entrar:** já membro: `409 Você já está no elenco.`; com convite pendente do time: `409 Você já tem um convite deste time. Responda em Meus times.`; pedido pendente existente: `200` com ele. Quem foi recusado pode pedir de novo. Notificação `pedido_entrada` aos representantes ativos. Auditoria `pedido_entrada.criado`. Pedidos pendentes continuam válidos depois de "Gerar outro link".
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
- **Revogar:** `404 Organizador não encontrado.` se não houver permissão ativa com esse id. Grava `revoked_at`, `revoked_by_id` e `revoke_reason`. Notificação `organizador_revogado` e auditoria `organizador.revogado`. O destino dos eventos abertos do organizador revogado (seguem ou são cancelados com devolução) entra na fase 4.
- **Permissão para as fases seguintes:** `organizers.get_active_organizer(db, user_id) -> Organizer | None` e a dependência `current_organizer` (`403 Você precisa ser organizador para criar eventos.`), usadas a partir da fase 4.

**Menu:** a seção "Organizador · Meus eventos" aparece com `state = 'aprovado'`; até a fase 4, mostra estado vazio, sem eventos fictícios. A seção Administração mostra "Pedidos de organizador" com o contador de `GET /admin/queue-counts`, ao lado de "Denúncias". Na web, a ordem do Menu é Conta, Organizador (cartão P3 ou seção), Administração, App (Notificações e Sobre) e Sair.

## 7. Notificações

Infraestrutura comum (implementada). As fases seguintes acrescentam tipos ao registro `NOTIFICATION_TYPES` de `app/services/notifications.py`.

```ts
interface ArenaNotification {
  id: number
  type: NotificationType
  payload: Record<string, unknown>   // por tipo, abaixo
  actor: Person | null               // null: administração, sistema, conta inativa ou bloqueada
  created_at: string
  read_at: string | null
}
```

| Rota | Corpo | Resposta |
| --- | --- | --- |
| `GET /me/notifications?cursor=&limit=` | — | `Page<ArenaNotification>` (mais recentes primeiro) |
| `GET /me/notifications/unread-count` | — | `{ unread_count: number }` |
| `PUT /me/notifications/{id}/read` | `{}` | `{ unread_count: number }`; `404 Notificação não encontrada.` para notificação de outra pessoa; idempotente (mantém o primeiro `read_at`) |
| `PUT /me/notifications/read-all` | `{}` | `{ unread_count: 0 }` |

Os pedidos para seguir continuam em `GET /me/follow-requests` e **não** entram nessa contagem; a tela Notificações mostra as duas fontes.

**Regras do serviço:** `notify(db, user_id, type_, payload, *, actor_id=None)` e `notify_many(...)` só adicionam linhas (quem chama faz o commit, junto da mudança); recusam tipo desconhecido ou payload sem os campos obrigatórios; ninguém é notificado da própria ação; `notify_many` envia uma vez por pessoa.

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

`team_name` é uma cópia do nome no momento do aviso; a navegação usa `team_id` e mostra os dados atuais. Sem `actor`, o texto usa "Um representante", "Um atleta" ou "A administração". Notificações de times encerrados ou de convites já decididos continuam na lista; ao tocar, a web confere o estado atual.

**Na web (etapa 1):** tocar marca como lida (`PUT /me/notifications/{id}/read`) e navega pela pilha do `ArenaPage`:
- `convite_time` → Meus times com a folha de convites recebidos (`{ teamId, invites: true }`); um convite já decidido mostra "Nenhum convite pendente".
- `pedido_entrada` → Meus times no time, rolando até "Pedidos para entrar" (`{ teamId, requests: true }`).
- `convite_aceito` e `pedido_entrada_decidido` aprovado → Meus times com o cartão do time centralizado (`{ teamId }`); sem esse time em Meus times, o primeiro cartão.
- `removido_do_time`, `time_encerrado` e `pedido_entrada_decidido` recusado → só marcam como lida.
- `pedido_organizador_decidido` e `organizador_revogado` → Menu, com o cartão do organizador.
- Tipos desconhecidos (fases seguintes) → texto genérico, sem destino.

A tela Notificações abre pelo sino do Início (com o contador de não lidas) e pela linha "Notificações" do Menu.

## 8. Auditoria

`audit.record(db, *, actor_id, action, target_type, target_id, data=None)` adiciona a linha sem commit. `data` guarda ids e valores alterados; nunca tokens, nonces ou textos privados além do necessário.

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

## 10. Fases 4 a 7 (a definir na etapa correspondente)

- **Fase 4 — Eventos:** criar (V4), rascunho e checklist, publicar, aprovação de pagos (AD1), cartazes (O3) e gestão (G3); destino dos eventos de organizador revogado. A definir.
- **Fase 5 — Inscrições e comprovantes (A2):** junto da fase 7 do Jogar; inclui a devolução não confirmada (decidida em 12/10: o participante confirma ou contesta; sem resposta em 7 dias, conta como recebida; a contestação vai à administração) e o canal de **avisos** do campeonato (decidido em 12/10: o organizador escreve, os inscritos leem, o cancelamento entra como aviso automático), na fase que implementar o cancelamento com inscritos. A definir.
- **Fase 6 — Tabela e agenda:** chaveamento, rodadas e agendamento (S1). A definir.
- **Fase 7 — Divergência em campeonato (D3).** A definir.

## 11. Divisão por frente na etapa 1

- **Frente A (backend de times e link):** seções 3, 4 e 5, em `app/routers/teams.py`, `app/services/teams.py`, `app/schemas/teams.py` e funções de brasão em `app/services/media.py`.
- **Frente B (backend de organizador e administração):** seção 6, em `app/routers/organizers.py`, `app/services/organizers.py` e `app/schemas/organizers.py`.
- **Frentes C e D (web):** consomem este contrato e o de [0002-jogar.md](0002-jogar.md).
- Nenhuma frente cria migração na etapa 1: o esquema está completo na `0005`. Uma necessidade nova é relatada ao orquestrador.
