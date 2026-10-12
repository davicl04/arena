# Decisões e contratos — Jogar

Data: 12 de outubro de 2026. Contrato da **fase 1 do [plano do Jogar](../plano-jogar.md)** (elos: `rank_cuts` e `standings` vazios e a linha de classificação), executada na etapa 1 junto das fases 1 a 3 de [Times e campeonatos](0003-times-campeonatos.md). A **fase 7** (campeonatos e provas: lista, detalhe, inscrição, reserva, comprovante e devolução, lado do atleta) entra na etapa 2 e está na seção 6. As demais fases ficam **a definir na fase correspondente** (seção 7).

> **Estado (fase 1 implementada e integrada em 12 de outubro de 2026):** backend (migração `0005`, `app/services/rankings.py` e `GET /api/v1/me/standings`) e web (placa do Jogar com a linha do elo, `web/src/pages/PlayPage.tsx` e `web/src/components/play/`; grade C5 das carteirinhas de Meus times). Nenhuma partida, resultado ou marca é registrada nesta fase, então `standings` está vazio e toda linha sai em classificação ("0/3", sem elo). O botão redondo nunca simula busca: prepara o perfil, leva a Meus times ou fica desabilitado com o aviso da próxima etapa. O Expo ainda não tem a placa (última etapa). Convenções gerais (sessão, JSON, erros, paginação) estão na seção 1 de [0003](0003-times-campeonatos.md#1-convenções).

## 1. Elos e rankings

- **Elos**, do menor para o maior: `bronze`, `prata`, `ouro`, `diamante`, `lendario`. O cliente só mapeia o nome para a imagem (`web/public/images/brand/`, `rankingTiers` em `web/src/data/arena.ts`; `lendario` → "Lendário").
- **Rankings gerais**, sem cidade (a cidade serve só ao pareamento). Cada ranking tem uma chave:

| Chave | Sujeito e categoria | Métrica | Classificação |
| --- | --- | --- | --- |
| `futebol_time` | time × formato (`futsal`, `society`, `campo`) | pontos 3/1/0 (`pontos`) | 3 partidas confirmadas |
| `futebol_individual` | atleta × posição × formato (12 rankings) | média por partida (`media`) | 3 partidas confirmadas |
| `tenis` | atleta | pontos (`pontos`) | 3 partidas confirmadas |
| `corrida_3`, `corrida_5`, `corrida_10`, `corrida_21`, `corrida_42` | atleta × distância | melhor tempo em segundos (`tempo`) | a primeira marca |

- **Janela:** 52 semanas, aplicada pelas fases que calculam resultados e marcas (fases 5 e 6).

### Cortes (`rank_cuts`, `calc_version = 1`)

Uma linha por ranking e versão, com `metric`, `direction` (`maior`: valor ≥ corte; `menor`: tempo ≤ corte), `prata`, `ouro`, `diamante`, `placement_matches`, `legend_share` (0,15) e `window_weeks` (52). Bronze é tudo o que não alcança Prata. Valores iniciais, **a calibrar com dados reais antes de publicar**:

| Ranking | Prata | Ouro | Diamante |
| --- | --- | --- | --- |
| `futebol_time` | ≥ 10 | ≥ 30 | ≥ 60 |
| `futebol_individual` | ≥ 2,5 | ≥ 4,0 | ≥ 5,5 |
| `tenis` | ≥ 30 | ≥ 80 | ≥ 150 |
| `corrida_3` | ≤ 1200 s (20:00) | ≤ 900 s (15:00) | ≤ 720 s (12:00) |
| `corrida_5` | ≤ 2100 s (35:00) | ≤ 1620 s (27:00) | ≤ 1320 s (22:00) |
| `corrida_10` | ≤ 4500 s (1:15:00) | ≤ 3420 s (57:00) | ≤ 2820 s (47:00) |
| `corrida_21` | ≤ 9900 s (2:45:00) | ≤ 7500 s (2:05:00) | ≤ 6300 s (1:45:00) |
| `corrida_42` | ≤ 20700 s (5:45:00) | ≤ 15600 s (4:20:00) | ≤ 13200 s (3:40:00) |

Uma nova calibragem entra como `calc_version = 2` numa migração, sem alterar as linhas da versão 1. Os cortes não são expostos aos clientes nesta fase.

### Regras (`app/services/rankings.py`)

- `base_tier(valor, cortes)`: cortes fixos até Diamante.
- `legend_slots(classificados, 0,15) = ⌊classificados × 0,15⌋`, em decimal exato: com menos de 7 classificados, ninguém é Lendário.
- `tier_for(valor, cortes, rank_position=, classified_count=)`: Lendário exige os pontos de Diamante **e** posição ≤ `legend_slots` naquele ranking.
- **Nunca** se atribui elo a quem está em classificação: `standings.tier` é nulo até a classificação, e `rank_position` só existe com elo (restrição `ck_standings_ranked`).
- `faced_tiers(elo)`: o mesmo elo e os vizinhos (Bronze → Bronze e Prata; Prata → Bronze, Prata e Ouro; Lendário → Diamante e Lendário). Sem elo, enfrenta qualquer nível. `can_face(a, b)` aceita vizinhos e qualquer par em que um lado esteja sem elo (base do pareamento da fase 2).
- `ranking_key(sport, team=, distance_km=)` e `load_cuts(db, calc_version)` completam o módulo.

### `standings`

Ranking materializado: `team_id` **ou** `user_id` (nunca ambos), `sport`, `format`, `position`, `distance_km`, `metric_value`, `matches_played`, `rank_position`, `tier`, `calc_version` e `updated_at`. A combinação de categoria é validada por `ck_standings_category` (time só no futebol, com formato; atleta de futebol com formato e posição; tênis sem categoria; corrida com distância), com unicidade por sujeito e categoria em índices parciais. A linha guarda a `calc_version` usada. As fases 5 e 6 gravam e recalculam; esta fase só lê.

## 2. `GET /api/v1/me/standings`

Titular da sessão; `401` sem sessão. Sem parâmetros.

```ts
type Tier = 'bronze' | 'prata' | 'ouro' | 'diamante' | 'lendario'
type FootballFormat = 'futsal' | 'society' | 'campo'
type Position = 'goleiro' | 'defesa' | 'meio_campo' | 'atacante'

interface StandingLine {
  state: 'sem_jogos' | 'classificacao' | 'ranqueado' | 'sem_marca'
  tier: Tier | null            // só em 'ranqueado'
  played: number               // partidas confirmadas (corrida: marcas); em classificação, no máximo `required`
  required: number             // 3 no futebol e no tênis; 1 na corrida
  rank_position: number | null // só em 'ranqueado'
  metric_value: number | null  // pontos, média ou segundos; null sem jogos ou sem marca
  faces: Tier[]                // elos enfrentados; todos quando faces_any_level
  faces_any_level: boolean     // true sem elo
}
interface FormatStanding extends StandingLine { format: FootballFormat }
interface PositionStanding extends StandingLine { position: Position; format: FootballFormat }
interface RunStanding extends StandingLine { distance_km: 3 | 5 | 10 | 21 | 42 }

interface MeStandings {
  calc_version: number
  futebol: {
    teams: {
      team: { id: number; name: string; initials: string; crest_url: string | null }
      my_role: 'representante' | 'membro'
      formats: FormatStanding[]      // futsal, society, campo
    }[]                              // times ativos do titular; representante primeiro, depois pela entrada
    individual: PositionStanding[]   // 12: goleiro, defesa, meio_campo, atacante × futsal, society, campo
  }
  tenis: StandingLine
  corrida: RunStanding[]             // 3, 5, 10, 21, 42
}
```

**Estados:** `ranqueado` quando há elo; senão `sem_jogos` (futebol e tênis) ou `sem_marca` (corrida) com zero partidas; senão `classificacao`. Com `standings` vazio, tudo sai `sem_jogos`/`sem_marca`, `played: 0`, `faces_any_level: true`.

A mesma `FormatStanding` alimenta a grade C5 da carteirinha (`rankings.team_format_grid`, contrato em [0003](0003-times-campeonatos.md#3-times-fase-1--frente-a)).

## 3. Linha do elo (H1) na placa do Jogar

| Situação | Brasão | Título | Linha de baixo |
| --- | --- | --- | --- |
| `ranqueado` | imagem do elo | nome do elo ("Prata") | "Enfrenta Bronze, Prata ou Ouro" (de `faces`) |
| `sem_jogos` ou `classificacao` | "n/3" em círculo tracejado e três barrinhas | "Em classificação" | "n de 3 partidas · enfrenta qualquer nível" (com `played`, inclusive 0) |
| corrida `ranqueado` | imagem do elo | "Ouro nos 5 km" | "Melhor 24:12 · treino" (origem da marca: fase 6) |
| corrida `sem_marca` | Coliseu sem elo | "Sem marca nos 5 km" | "Registre um treino ou prova para entrar no ranking" |

- **Com meu time:** a linha do formato escolhido no time que o titular representa (`futebol.teams` com `my_role = 'representante'`). Sem time representado, a placa mostra o caminho para criar um time.
- **Avulso:** as três entradas de `futebol.individual` da posição escolhida. Recomendação (interpretação, já que o avulso aceita qualquer formato): sem nenhum formato ranqueado, "Em classificação como {posição}" com o maior `played` entre os formatos; com algum ranqueado, o maior elo, com o formato no texto ("Ouro no society como atacante").
- **Tênis:** `tenis`. **Corrida:** `corrida` da distância do chip.
- Em "Suas modalidades" (tela Ranking), o texto fixo "Sem classificação" pode passar a ler esta rota com as mesmas regras.

**Implementação na web (fase 1):**
- **Abas** Futebol | Tênis | Corrida (setas do teclado), a cidade do perfil da modalidade no topo e, no futebol, a chave "Com meu time | Avulso". O formato inicial é Society.
- **Com meu time:** com mais de um time representado, chips para escolher o time; sem time representado, a linha "Você ainda não representa um time." e o botão "MEU TIME · crie ou represente", que abre Meus times. A linha "Meu time" de "Outras formas de jogar" também abre Meus times.
- **Avulso "Qualquer posição":** sem formato ranqueado, "Em classificação" com o maior `played`; com algum, o maior elo entre as posições e os formatos.
- **Botão:** sem perfil da modalidade, "PREPARAR seu perfil" leva a Suas modalidades; com perfil, "ENCONTRAR partida/vaga" ou "REGISTRAR treino ou prova" fica desabilitado, com o aviso de que a busca ou o registro chega numa próxima etapa.
- **Elo:** só aparece em `ranqueado` com a classificação completa (`shownTier`); a corrida sem marca mostra "Sem marca nos N km".

## 4. Decisões de 12 de outubro de 2026 que afetam fases seguintes

Registradas em [próximos passos](../proximos-passos-jogar.md#decisões-fechadas-em-12-de-outubro-de-2026-execução):

- **W.O.:** placar 3×0 no futebol e 6-0 6-0 no tênis; sem restrição automática por W.O. repetido no MVP (fica no histórico). Fase 3.
- **Moderação do chat:** denúncia de mensagem pelo `ContentReport` existente, com `target_type = 'match_message'`, na fila de Denúncias. Fase 3.
- **Varredura de cada minuto:** `python -m app.admin_cli sweep [--loop 60]`, rodado num terminal em desenvolvimento e documentado no README; as leituras continuam tratando os vencimentos. Fase 2.
- **Expo:** última etapa, com todas as telas.

## 5. Notificações

A infraestrutura (`notifications`, rotas de leitura e o serviço `notify`) é a de [0003, seção 7](0003-times-campeonatos.md#7-notificações). Os tipos do Jogar (proposta, aceite, condições, partida agendada, cancelamento, W.O., resultado, divergência, contestação, vaga preenchida, reserva expirando e comprovante decidido) entram nas fases correspondentes. Os da fase 7 (comprovante decidido, reserva expirada, devolução e avisos do evento) estão em [0003, seção 17](0003-times-campeonatos.md#17-notificações-da-etapa-2).

## 6. Fase 7 — Campeonatos e provas (lado do atleta)

Etapa 2, junto das fases 4 e 5 de Times e campeonatos. O lado do organizador e da administração, o esquema (`0008`), os tipos comuns (`EventPoster`, `EventPix`, `EntrySubject`, `Receipt`, `TennisBonus`), as decisões de interpretação, as notificações e a auditoria estão em [0003, seções 10 a 19](0003-times-campeonatos.md#10-etapa-2--eventos-inscrições-e-comprovantes-fases-4-e-5).

> **Estado (backend e web implementados e integrados em 12 de outubro de 2026):** as rotas desta seção estão em `app/routers/entries.py`, `app/services/entries.py` e `app/schemas/entries.py`, sobre as peças compartilhadas de `app/services/events.py` (vagas, cartazes, canal de avisos e a linha de inscrição do organizador) e na ordem global de travas de [0003, seção 19.1](0003-times-campeonatos.md#191-ordem-global-das-travas). A web está implementada e integrada: a placa do Jogar leva a Campeonatos ou Provas (E2, `web/src/pages/EventsPage.tsx`), com Minhas inscrições, e ao detalhe D2 (`web/src/pages/EventPage.tsx`), com a inscrição, o Pix, o comprovante e a resposta à devolução (`web/src/components/events/`, cliente em `web/src/api/entries.ts`); a notificação de cada tipo da etapa 2 abre a tela certa. O fluxo foi conferido no navegador contra a API real. O Expo fica para a última etapa. Os desvios do backend, já incorporados abaixo, estão na seção 6.6 e os da web, na 6.7.

### 6.1 Regras do produto

- **Quem se inscreve:** no futebol, o **time**, por um representante ativo; no tênis e na corrida, o **atleta**. O organizador não se inscreve no próprio evento.
- **Elegibilidade (RN18):** o futebol usa o elo do time no formato do evento; o tênis, o do atleta; a corrida, o da distância da prova (`rankings.subject_tier`). Evento aberto (`accepted_tiers = null`) aceita todos; restrito aceita só os elos escolhidos, e **quem está em classificação só entra em evento aberto** (`event_rules.eligibility`). Fora da faixa, o cartaz aparece apagado, com cadeado.
- **Inscrição gratuita:** confirmada na hora.
- **Inscrição paga:** reserva a vaga (`reservada`) até `reserved_until` = **48 h ou 12 h antes do início, o que vier primeiro**; o atleta paga fora do Arena pelo Pix do organizador e envia o comprovante (imagem ou PDF, até 5 MiB, privado) → `em_analise` → `confirmada`, ou `rejeitada` com motivo e **reenvio até o fim da reserva**, com os envios anteriores preservados. Sem comprovante aprovado no prazo, a vaga é liberada (`expirada`). Inscrições pagas fecham 12 h antes do início.
- **Tênis:** o detalhe informa o bônus no ranking (campeão +40, vice +20, 3º e 4º +10, com 4 ou mais inscritos; RN16), em `tennis_bonus`; `applies` conta as inscrições **confirmadas** (`confirmed_count`), a mesma regra do G3.
- **Corrida:** prova sem tipo, com distância de 3, 5, 10, 21 ou 42 km; a aba **Percurso** mostra `venue` e `course_notes`.
- **Cancelamento do evento:** inscrições pagas confirmadas ou em análise viram `devolucao_pendente`; o organizador anexa o comprovante da devolução e o participante **confirma ou contesta**; sem resposta em 7 dias, conta como recebida; a contestação vai à administração ([0003, seção 16](0003-times-campeonatos.md#16-devolução-por-pix-fase-5--frente-do-atleta-comprovantes-e-devoluções)).
- **Pix e dados de pagamento** só para quem está logado (toda rota exige sessão). O **comprovante** só para o inscrito (atleta ou representantes do time), o organizador do evento e a administração.

### 6.2 Objetos

```ts
type EligibilityReason = 'em_classificacao' | 'fora_da_faixa' | 'sem_time'

interface TeamEligibility {
  team: TeamRef
  tier: Tier | null                   // elo do time no formato do evento; null em classificação
  eligible: boolean
  reason: 'em_classificacao' | 'fora_da_faixa' | null
  entry_id: number | null             // inscrição que ocupa vaga, se houver
}

interface EventEligibility {
  eligible: boolean                   // futebol: algum time representado elegível e sem inscrição
  reason: EligibilityReason | null
  message: string | null              // "Este evento aceita só Prata e Ouro." etc.
  tier: Tier | null                   // tênis e corrida: elo do titular na categoria
  teams: TeamEligibility[] | null     // futebol: times ativos que o titular representa
}

interface MyEntrySummary { id: number; state: EntryState; team: TeamRef | null; reserved_until: string | null }

/** Cartaz do E2. */
interface EventCard extends EventPoster {
  organizer_name: string
  eligibility: EventEligibility
  my_entry: MyEntrySummary | null     // do titular ou de um time dele: a que ocupa vaga; senão a devolução; senão a expirada
}

/** Detalhe D2 (aba Informações e o botão fixo). */
interface EventDetail extends EventCard {
  course_notes: string | null
  contact: string | null
  organizer: { display_name: string; person: Person | null }
  pix: EventPix | null                // pagos
  registration_open: boolean          // event_rules.registration_open
  spots_left: number
  tennis_bonus: TennisBonus | null
  cancelled_at: string | null
  cancel_reason: string | null
  is_organizer: boolean               // o organizador vê o evento, mas não se inscreve
  can_read_messages: boolean          // leitor do canal de avisos (events.can_read_channel, a regra de 0003, 10.1)
}

/** Aba Inscritos: só as confirmadas, na ordem da confirmação (`confirmed_at` crescente). */
interface PublicEntry { id: number; subject: EntrySubject; confirmed_at: string }

/** Cartão S1 da inscrição e a folha "Enviar comprovante". */
interface MyEntry {
  id: number
  event: EventPoster
  subject: EntrySubject
  my_role: 'atleta' | 'representante' | 'membro' | 'organizador' | 'administracao'
  state: EntryState                   // efetivo (reserva vencida aparece 'expirada')
  price_cents: number
  reserved_until: string | null
  created_at: string
  confirmed_at: string | null
  expired_at: string | null
  cancelled_at: string | null
  refunded_at: string | null
  latest_payment: Receipt | null      // null para 'membro'
  refund: Receipt | null              // devolução em aberto ou a última; null para 'membro'
  can_send_receipt: boolean           // reservada ou rejeitada, antes de reserved_until, e quem age
  can_cancel: boolean
  can_respond_refund: boolean
}
```

### 6.3 Rotas

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /events?sport=&city_id=&cursor=&limit=` | qualquer atleta logado | — | `Page<EventCard>` |
| `GET /events/{id}` | qualquer atleta logado | — | `EventDetail` |
| `GET /events/{id}/entries?cursor=&limit=` | qualquer atleta logado | — | `Page<PublicEntry>` |
| `POST /events/{id}/entries` | atleta (tênis, corrida) ou representante (futebol) | `{ team_id?: number }` | `201 MyEntry` |
| `GET /me/entries?scope=ativas\|historico&cursor=&limit=` | titular | — | `Page<MyEntry>` |
| `GET /entries/{id}` | atleta, membros do time, organizador do evento, administração | — | `MyEntry` |
| `DELETE /entries/{id}` | atleta ou representante | — | `204` |
| `PUT /entries/{id}/receipt` | atleta ou representante | multipart `file` (imagem ou PDF) | `201 MyEntry` |
| `GET /entries/{id}/receipts` | atleta, representantes, organizador do evento, administração | — | `{ items: Receipt[] }` (mais recentes primeiro) |
| `GET /receipts/{id}/file` | idem | — | arquivo (`private_file_response`) |
| `POST /entries/{id}/refund-response` | atleta ou representante | `{ response: 'confirmar' \| 'contestar'; reason?: string }` | `MyEntry` |

As rotas de devolução do organizador e da administração estão em [0003, seções 15.3 e 16](0003-times-campeonatos.md#16-devolução-por-pix-fase-5--frente-do-atleta-comprovantes-e-devoluções).

### 6.4 Regras das rotas

- **Lista (E2):** eventos `em_andamento` e `publicado` que **ainda não começaram** (`starts_at` no futuro), filtráveis por `sport` e `city_id`, por `starts_at` crescente (`paginate(…, ascending=True)`). Um publicado cujo início passou sai da lista sem mudar de estado (só a fase 6 leva a `em_andamento`); continua no detalhe, em Minhas inscrições e no O3 do organizador. Eventos com revogação pendente aparecem com `revocation_pending` e inscrições suspensas. A elegibilidade é calculada em lote para a página (`rankings.team_format_grid` dá o elo dos times; `subject_tier` serve ao detalhe).
- **Detalhe (D2):** visível em `publicado`, `em_andamento`, `encerrado` e `cancelado`; nos demais estados, `404 Evento não encontrado.` (o organizador usa a gestão). Abas: **Informações** (`EventDetail`), **Tabela** (fase 6; até lá, estado vazio "A tabela sai depois das inscrições") ou **Percurso** (corrida), **Inscritos** (`GET /events/{id}/entries`, só confirmadas). Os avisos (`GET /events/{id}/messages`, [0003, seção 14](0003-times-campeonatos.md#14-organizador-eventos-fase-4--frente-do-organizador-e-da-administração)) aparecem para quem tem `can_read_messages`.
- **Inscrever (`POST /events/{id}/entries`):** trava o evento (`FOR UPDATE`), o time (`FOR SHARE`, no futebol) e as inscrições do mesmo time ou atleta, nessa ordem. Erros, nesta ordem:
  - inscrições fechadas (estado, prazo ou revogação pendente): `409 As inscrições deste evento estão fechadas.`;
  - organizador: `409 Você não se inscreve no próprio evento.`;
  - futebol sem `team_id`: `422 Escolha o time que vai se inscrever.`; `team_id` no tênis ou na corrida: `422 Inscrição por time só no futebol.`;
  - time inexistente, encerrado ou do qual o titular não é membro ativo: `404 Time não encontrado.`; membro sem braçadeira: `403 Só representantes inscrevem o time.`;
  - elegibilidade: `403` com a mensagem de `event_rules.eligibility` ("Quem está em classificação só se inscreve em evento aberto a todos." ou "Este evento aceita só Prata e Ouro.");
  - já ocupa vaga: `409 Este time já está inscrito.` / `409 Você já está inscrito.` (uma reserva vencida do mesmo time ou atleta é expirada antes, com `sweep.expire_entries`);
  - sem vaga (contagem efetiva): `409 As vagas deste evento acabaram.`
  
  Gratuita: `confirmada` com `confirmed_at`. Paga: `reservada` com `reserved_until = event_rules.reservation_deadline(now, starts_at)` e `price_cents` copiado do evento. Um `IntegrityError` dos únicos parciais vira `409`. Notificação `time_inscrito` aos outros membros ativos do time. Auditoria `inscricao.criada`.
- **Minhas inscrições:** inscrições do titular e dos times ativos de que é membro; `ativas` = as que ocupam vaga (estado efetivo) num evento `publicado` ou `em_andamento` e as de devolução em curso (`devolucao_pendente`, `devolucao_contestada`), por `starts_at` crescente; `historico` = as demais, por `created_at` decrescente. A mesma regra de "ativa" vale para o `409` de encerrar o time.
- **Desistir (`DELETE /entries/{id}`):** só o atleta ou um representante (`403 Só representantes cancelam a inscrição do time.`; em inscrição de atleta, para o organizador ou a administração, `403 Só o atleta inscrito cancela a inscrição.`); gratuita confirmada antes do início, ou paga `reservada`/`rejeitada` (`event_rules.next_entry_state(…, 'cancelar', paid=…)`: `409 Para desistir de uma inscrição paga, fale com o organizador.` ou `409 Esta inscrição já foi encerrada.`); depois do início, `409 O evento já começou.` Grava `cancel_origin = 'participante'`. Auditoria `inscricao.cancelada`. Sem notificação.
- **Enviar comprovante (`PUT /entries/{id}/receipt`):** só o atleta ou um representante (`403 Só representantes enviam o comprovante do time.` ou `403 Só o atleta inscrito envia o comprovante.`); trava o evento (`FOR SHARE`) e depois a inscrição, a ordem de [0003, 19.1](0003-times-campeonatos.md#191-ordem-global-das-travas): com o evento sendo cancelado, espera e responde `409` sem gravar arquivo; `event_rules.next_entry_state(…, 'enviar_comprovante', now=, reserved_until=)` (`409 Esta inscrição não aguarda comprovante.` ou `409 O prazo da reserva acabou.`). Arquivo com `media.read_receipt_upload`, `media.prepare_receipt` e `media.store_receipt`; a linha `entry_receipts` (`kind = 'pagamento'`) e o estado `em_analise` vão no mesmo commit, e a falha do commit chama `media.discard_object`. Erros de arquivo como em [0003, seção 19](0003-times-campeonatos.md#19-varredura-mídia-e-serviços-compartilhados). Notificação `comprovante_recebido` ao organizador. Auditoria `comprovante.enviado`.
- **Histórico e arquivo:** `GET /entries/{id}/receipts` e `GET /receipts/{id}/file` só para o atleta, os representantes ativos do time, o organizador do evento e a administração; os demais membros recebem `404` (como quem não tem relação com a inscrição). O arquivo sai com `private_file_response(media, filename=f'comprovante-{id}')`.
- **Responder à devolução:** [0003, seção 16](0003-times-campeonatos.md#16-devolução-por-pix-fase-5--frente-do-atleta-comprovantes-e-devoluções). Só o atleta ou um representante (`403 Só representantes respondem à devolução do time.` ou `403 Só o atleta inscrito responde à devolução.`); depois dos 7 dias do envio, mesmo antes da varredura, `409 Nenhuma devolução aguarda a sua resposta.` e `can_respond_refund: false`.
- **Encerrar time com inscrição:** `ensure_closable` ([0003, seção 3](0003-times-campeonatos.md#3-times-fase-1--frente-a)) passa a responder `409 Encerre ou cancele as partidas agendadas e as inscrições ativas antes de encerrar o time.` quando o time tem inscrição que ocupa vaga ou devolução em curso.

### 6.5 Estados na web (S1 e botão fixo)

| Estado efetivo | Cartão | Botão fixo |
| --- | --- | --- |
| sem inscrição, elegível | — | Futebol: "Inscrever {time} · R$ 240" ("Inscrever time · …" com mais de um time elegível, que abre a escolha); tênis e corrida: "Inscrever-se · R$ 240" ou "Inscrever-se · Grátis". A folha confirma a gratuita ("Confirmar inscrição") ou, nos pagos, mostra o Pix e "Reservar vaga" |
| sem inscrição, fora da faixa | "Fora da faixa", com cadeado e `eligibility.message` | desabilitado |
| `reservada` | "Vaga reservada": anel com as horas até `reserved_until`, "Pague R$ 240 direto ao organizador e envie o comprovante até …", "Copiar chave Pix" e "Pagamento" (ⓘ); "Desistir da inscrição" enquanto `can_cancel` | "Enviar comprovante" |
| `em_analise` | "Comprovante em análise" ("{organizador} confirma o pagamento; você recebe um aviso") e "Ver comprovante" | — |
| `rejeitada` | "Comprovante recusado", com "Motivo: {motivo}. Envie outro até {reserved_until}" | "Enviar outro" |
| `confirmada` | "Inscrição confirmada", com o selo "Você" (atleta) ou o nome do time; "Desistir da inscrição" enquanto `can_cancel` | — |
| `expirada` | "A vaga foi liberada" ("A reserva expirou sem comprovante aprovado no prazo. Se quiser, inscreva-se de novo enquanto houver vaga.") | o mesmo botão de inscrição, se houver vaga |
| `devolucao_pendente` | "Evento cancelado · devolução por Pix" ("O organizador vai devolver R$ … por Pix"; com `refund.resolution = pendente`, "A administração pediu a ele outro comprovante"); com `refund`, "Devolução enviada pelo organizador", o comprovante, "Confirmar recebimento" e "Contestar", e o prazo `auto_confirm_at` | — |
| `devolucao_contestada` | "Contestação em análise pela administração", com o motivo do participante | — |
| `devolvida` | "Devolução recebida" (confirmada, automática em 7 dias ou considerada feita pela administração) | — |
| `cancelada` | "Inscrição cancelada": a inscrição não ocupa mais vaga | — |

### 6.6 Desvios registrados na conciliação dos backends

Já incorporados às seções 6.1 a 6.4 (os do organizador e da administração estão em [0003, seção 20.1](0003-times-campeonatos.md#201-desvios-registrados-na-conciliação-dos-backends-da-etapa-2)):

| Seção | Desvio | Motivo |
| --- | --- | --- |
| 6.4 | `GET /events` deixa de fora os eventos `publicado` cujo início já passou; os `em_andamento` continuam. O evento não muda de estado (nada o leva a `em_andamento` antes da fase 6). | Decisão conservadora: o contrato não diz como tratar o início sem chaveamento, e um evento iniciado no topo da lista (ordem crescente) pareceria aberto. O detalhe, Minhas inscrições e o O3 continuam mostrando o evento. |
| 6.1, 6.2 | `tennis_bonus.applies` com 4 ou mais inscrições **confirmadas**, a mesma regra do G3. | RN16 ("com 4 ou mais inscritos"): inscritos são as confirmadas (aba Inscritos). |
| 6.2 | `my_entry` mostra também a inscrição de devolução e, sem outra, a expirada (prioridade: ocupa vaga → devolução → expirada; a mais recente em cada nível). | O cartaz e o botão fixo precisam do estado S1 de devolução e de "A reserva expirou" (6.5). |
| 6.4 | Inscrição "ativa" = ocupa vaga num evento `publicado` ou `em_andamento`, ou tem devolução em curso. Vale para `scope=ativas` e para o `409` de encerrar o time. | Uma confirmada de evento encerrado não está mais em jogo. Pendência: até a fase 6 encerrar eventos, uma inscrição confirmada de evento publicado que já aconteceu continua impedindo encerrar o time. |
| 6.2 | Aba Inscritos (`GET /events/{id}/entries`) por `confirmed_at` crescente. | A ordem de confirmação; o contrato não definia a ordem. |
| 6.4, 0003 16 | Depois dos 7 dias do envio da devolução, mesmo antes da varredura, responder dá `409 Nenhuma devolução aguarda a sua resposta.` (`can_respond_refund: false`). | A devolução já conta como recebida; a varredura só registra. |
| 6.4 | Mensagens `403` por ação, com o par do atleta: `Só o atleta inscrito cancela a inscrição.`, `… envia o comprovante.`, `… responde à devolução.` e `Só representantes respondem à devolução do time.` | O contrato só trazia as mensagens do time. |
| 6.2 | `can_read_messages` usa `events.can_read_channel`, a mesma regra do `GET /events/{id}/messages`. | Antes, a frente do atleta tinha uma cópia (`reads_channel`); agora há uma regra só. |
| 6.4 | As rotas de uma inscrição (comprovante, desistência, devolução e resposta) travam o evento `FOR SHARE` antes da inscrição ([0003, 19.1](0003-times-campeonatos.md#191-ordem-global-das-travas)). | Ordem global de travas, sem impasse com o cancelamento ou a revogação. |

### 6.7 Desvios registrados na integração da web

Os do organizador e da administração estão em [0003, seção 20.2](0003-times-campeonatos.md#202-desvios-registrados-na-integração-da-web-da-etapa-2):

| Seção | Desvio | Motivo |
| --- | --- | --- |
| 6.5 | Rótulos do botão fixo: "Inscrever-se · R$ 240" ou "Inscrever-se · Grátis" (tênis e corrida) e "Inscrever {time} · R$ 240" (futebol), no lugar de "Inscrever-me · Grátis". | Verbo no infinitivo, como os demais botões de ação do app ("Pedir para entrar", "Enviar comprovante"); no futebol o time aparece no rótulo, para a pessoa saber quem está inscrevendo. |
| 6.3 | Campeonatos e Provas (E2) lista só `GET /me/entries?scope=ativas` em "Minhas inscrições"; não há tela do histórico (`scope=historico`). Uma inscrição devolvida, expirada ou cancelada sai dali. | Não há protótipo do histórico. Pendência. |
| 6.3 | Sem cidade no perfil da modalidade, a lista mostra os eventos de todas as cidades com "Definir cidade"; a inscrição não exige perfil da modalidade na corrida. | `GET /events` filtra por cidade só quando `city_id` vem; a elegibilidade (RN18) vem do servidor. |
| 6.2 | A aba **Tabela** (ou **Percurso**, na corrida) mostra "Tabela ainda não definida" até a fase 6; **Inscritos** lista só as confirmadas, na ordem da confirmação. | Não há chaveamento nesta etapa; a aba preserva a estrutura do protótipo. |
| 6.5 | O limite do comprovante aparece como "5 MiB" (a mesma regra do organizador), com a ordem de validação do servidor. | Uma regra e um texto só (`web/src/api/receipts.ts`). |
| 6.5 | O motivo da contestação não repete o ponto final depois das aspas ("Motivo: “…” A administração confere…"). | Achado da conferência no navegador: o motivo digitado já termina em ponto. |

## 7. Fases 2 a 6 e 8 (a definir na fase correspondente)

- **Fase 2 — Pareamento de amistosos:** `match_searches`, `matches`, `match_sides`, trava por balde, varredura (acrescenta tarefas a `services/sweep.py:TASKS`) e notificações. A definir.
- **Fase 3 — Partida:** condições, quadras, reserva, chat, cancelamento e W.O. A definir.
- **Fase 4 — Avulso.** A definir.
- **Fase 5 — Resultado e ranking:** cálculo de `standings` com `tier_for`, janela de 52 semanas e tela Ranking real. A definir.
- **Fase 6 — Corrida:** registro, tolerância de ±2% e marcas. A definir.
- **Fase 7 — Campeonatos e provas:** seção 6.
- **Fase 8 — Expo.** A definir.
