# Decisões e contratos — Jogar

Data: 12 de outubro de 2026. Contrato da **fase 1 do [plano do Jogar](../plano-jogar.md)** (elos: `rank_cuts` e `standings` vazios e a linha de classificação), executada na etapa 1 junto das fases 1 a 3 de [Times e campeonatos](0003-times-campeonatos.md). A **fase 7** (campeonatos e provas: lista, detalhe, inscrição, reserva, comprovante e devolução, lado do atleta) entra na etapa 2 e está na seção 6. As **fases 2 a 5** (pareamento, partida e chat, avulso, resultado e ranking) formam a etapa 3 e estão nas seções 7 a 17. A **fase 6** (corrida: registro, marcas e elo por distância) está na seção 18. A fase 8 (Expo) foi feita na etapa 6, sobre os contratos das seções 6 a 18, sem contrato novo.

> **Estado (fase 1 implementada e integrada em 12 de outubro de 2026):** backend (migração `0005`, `app/services/rankings.py` e `GET /api/v1/me/standings`) e web (placa do Jogar com a linha do elo, `web/src/pages/PlayPage.tsx` e `web/src/components/play/`; grade C5 das carteirinhas de Meus times). Nenhuma partida, resultado ou marca é registrada nesta fase, então `standings` está vazio e toda linha sai em classificação ("0/3", sem elo). O botão redondo nunca simula busca: prepara o perfil, leva a Meus times ou fica desabilitado com o aviso da próxima etapa. O Expo tem a placa desde a etapa 6. Convenções gerais (sessão, JSON, erros, paginação) estão na seção 1 de [0003](0003-times-campeonatos.md#1-convenções).
>
> **Estado (etapa 3: backend implementado e integrado em 12 de outubro de 2026):** as seções 9 a 16 estão implementadas e conciliadas no backend. A fundação (esquema `0009`, regras puras `app/services/match_rules.py` e `app/services/scoring.py`, fila `app/services/matchmaking_queue.py`, acessos e transições compartilhadas, varredura, notificações e `app/schemas/matches.py`) recebeu as quatro frentes: pareamento e propostas (`routers/matchmaking.py`, `services/matchmaking.py`), partida, condições, quadras, chat e W.O. (`routers/matches.py`, `routers/courts.py`, `services/matches.py`, `services/courts.py`, `services/match_views.py`), avulso e vagas (`routers/slots.py`, `services/slots.py`) e resultado, estatísticas, contestação e ranking (`routers/results.py`, `services/results.py`, `services/standings.py`). A integração unificou o tratamento dos erros de regra num handler global, fixou a **ordem global de travas** (seção 15.5, com testes de concorrência real), fez o aceite das condições oferecer as vagas aos avulsos que esperam, trocou as ofertas da placa pela implementação única de `slots.slot_offers`, alinhou `permissions.send_stats` à rota, criou o aviso `oferta_retirada` e conferiu o fluxo inteiro só pela API (busca, proposta, condições com quadra sugerida e publicada, avulso, chat e denúncia, placar, presença e estatísticas com contestação, ranking, divergência e varredura, tênis com super tie-break, cancelamento e W.O. decidido). Os desvios das frentes e da integração, já incorporados abaixo, estão na seção 16.1. A web da etapa 3 consome este contrato, e o Expo, desde a etapa 6. Os campeonatos (seção 17) e a corrida (seção 18) foram acrescentados depois, no backend, e estão no bloco seguinte.
>
> **Estado (etapa 3: fases 2 a 5 implementadas e integradas na web em 12 de outubro de 2026):** a web consome as seções 7 a 16 com quatro frentes conciliadas: a **placa** (busca de time, avulso e tênis, folha "Preparar busca" com vagas, proposta e oferta de vaga em tela cheia, "Minhas partidas" e o ponto menta do JOGAR; `PlayPage`, `components/play/`, `hooks/usePlayBoard.ts`), a **tela da partida** (cabeçalho, condições com quadra, reserva, vagas, cancelamento, W.O. e chat; `MatchPage`, `components/match/`), o **resultado e o Ranking** (cartão de resultado, presença, estatísticas, contestação e revisão, Ranking real e "Seu elo" do Início; `components/results/`, `components/ranking/`, `RankingPage`) e as **notificações e filas** (os 17 tipos da seção 13 com destino, "Sugestões de quadra" e "W.O. contestados" na administração, denúncia de mensagem na moderação). Os tipos comuns da partida têm um dono só, `web/src/api/matches.ts`. A integração também **revisou o relato do placar** (cego até o meu lado informar o meu, seção 12.3), expôs as **vagas declaradas** em `MatchSideOut.declared_slots` e fechou `permissions.suggest_court` depois do início (seção 16.1). Os desvios da web estão na seção 16.2. O chaveamento e as partidas de campeonato (seção 17) e a corrida (seção 18) vieram nas etapas 4 e 5, e o Expo, na etapa 6.
>
> **Etapas 4 e 5 (backend e web implementados e integrados em 12 de outubro de 2026; Expo na etapa 6):** os campeonatos (seção 17, com o chaveamento, a agenda e a decisão do organizador de [0003, seção 21](0003-times-campeonatos.md#21-etapa-4--chaveamento-agenda-e-decisão-do-organizador-fases-6-e-7); migração `0010`) e a corrida (seção 18: migração `0011` `runs`, `app/services/run_rules.py`, `app/services/runs.py`, as rotas `/me/runs`, `/me/runs/preview`, `/me/run-bests` e `/me/run-races` e o ranking por distância em `GET /rankings?sport=corrida`) estão implementados no backend e conciliados com o backend integrado da etapa 3: os erros de regra usam os handlers globais, a ordem global de travas da seção 15.5 vale também para o avanço do vencedor e para as marcas (seção 15.5, extensão das etapas 4 e 5), e a janela de 52 semanas olha partidas, marcas e o bônus do tênis. A web consome os dois contratos (campeonatos: [0003, seção 21.11](0003-times-campeonatos.md#2111-desvios-registrados-na-integração-da-web-etapa-4); corrida: seção 18.9). O Expo consome estes contratos desde a etapa 6.
>
> **Estado do Expo (etapa 6, 12 de outubro de 2026):** o Expo consome as seções 6 a 18 e o [0003](0003-times-campeonatos.md) sem alterar o contrato (`mobile/src/api/`). Os desvios do Expo (folhas no lugar de diálogos, PDF e salvar arquivo só na web, Pix e link por texto selecionável e `Share`, câmera para o QR) e o que não foi verificado (aparelho, leitor de tela, API real e paridade visual) estão em [situação da fundação](../situacao-fundacao.md).

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
| corrida `ranqueado` | imagem do elo | "Ouro nos 5 km" | "Melhor 24:12 · treino" (origem e tempo: `GET /me/run-bests`, seção 18) |
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

A infraestrutura (`notifications`, rotas de leitura e o serviço `notify`) é a de [0003, seção 7](0003-times-campeonatos.md#7-notificações). Os tipos das fases 2 a 5 (proposta, aceite, condições, partida agendada, cancelamento, W.O., resultado, divergência, contestação, vaga encontrada e preenchida, remoção da partida e decisão de quadra) estão na seção 13. Os da fase 7 (comprovante decidido, reserva expirada, devolução e avisos do evento) estão em [0003, seção 17](0003-times-campeonatos.md#17-notificações-da-etapa-2). "Reserva expirando" (lembrete) continua fora, como na etapa 2.

## 6. Fase 7 — Campeonatos e provas (lado do atleta)

Etapa 2, junto das fases 4 e 5 de Times e campeonatos. O lado do organizador e da administração, o esquema (`0008`), os tipos comuns (`EventPoster`, `EventPix`, `EntrySubject`, `Receipt`, `TennisBonus`), as decisões de interpretação, as notificações e a auditoria estão em [0003, seções 10 a 19](0003-times-campeonatos.md#10-etapa-2--eventos-inscrições-e-comprovantes-fases-4-e-5).

> **Estado (backend e web implementados e integrados em 12 de outubro de 2026):** as rotas desta seção estão em `app/routers/entries.py`, `app/services/entries.py` e `app/schemas/entries.py`, sobre as peças compartilhadas de `app/services/events.py` (vagas, cartazes, canal de avisos e a linha de inscrição do organizador) e na ordem global de travas de [0003, seção 19.1](0003-times-campeonatos.md#191-ordem-global-das-travas). A web está implementada e integrada: a placa do Jogar leva a Campeonatos ou Provas (E2, `web/src/pages/EventsPage.tsx`), com Minhas inscrições, e ao detalhe D2 (`web/src/pages/EventPage.tsx`), com a inscrição, o Pix, o comprovante e a resposta à devolução (`web/src/components/events/`, cliente em `web/src/api/entries.ts`); a notificação de cada tipo da etapa 2 abre a tela certa. O fluxo foi conferido no navegador contra a API real. O Expo veio na etapa 6. Os desvios do backend, já incorporados abaixo, estão na seção 6.6 e os da web, na 6.7.

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

## 7. Etapa 3 — fases 2 a 5: decisões, esquema, estados e tipos

Escopo: busca de amistoso (time e tênis), proposta de 2 h, avulso (posição específica ou qualquer posição, qualquer formato), partida com condições, quadra, reserva, chat, cancelamento e W.O., resultado bilateral com presença, estatísticas e contestação, rankings reais e a placa do Jogar. Convenções da [seção 1 de 0003](0003-times-campeonatos.md#1-convenções): prefixo `/api/v1`, sessão obrigatória, ações com JSON (mesmo `{}`), `DELETE` sem corpo, `{ detail }` em português, `404` para o que não existe ou não é do titular, `403` só para quem vê o recurso sem o papel exigido, `409` para conflito de estado, `422` com `fields` na validação.

### 7.1 Decisões desta fundação (interpretações dos planos)

- **Fila no PostgreSQL** (plano, A2): a tabela `match_searches` é a fila. O pareamento roda por **balde**, com `pg_advisory_xact_lock` sobre o hash do balde, releitura das linhas com `FOR UPDATE` e criação da proposta na mesma transação. O Redis fica de fora (seção 15.1).
- **Baldes:** time = futebol + cidade + formato; tênis = tênis + cidade; **avulso = futebol + cidade** (a posição e o formato filtram dentro do balde, porque "qualquer posição" e "qualquer formato" atravessam posições e formatos). Desvio do plano A2, que punha a posição no balde do avulso.
- **Ordem do pareamento:** mesmo elo, depois o vizinho, depois a busca mais antiga (`started_at`). Quem está em classificação enfrenta qualquer nível; dois lados em classificação contam como "mesmo elo".
- **Times com um representante em comum nunca se enfrentam** (a mesma pessoa aceitaria os dois lados). Times encerrados e contas inativas ficam de fora.
- **Lado A** é a busca que esperava; **lado B**, a que chegou.
- **Elo da busca:** o do time no formato ou o do tenista (`rankings.subject_tier`) no momento da busca, guardado em `match_searches.tier` e copiado para `match_sides.tier`. O avulso guarda `null`: o elo dele é comparado **por vaga** (posição e formato da vaga) com o elo do time que abriu a vaga.
- **Reenvio de busca:** quem já tem uma busca aberta (esperando ou numa proposta) recebe `200` com ela, sem criar outra (RNF06).
- **Proposta aceita** abre o chat e encerra as duas buscas como `concluida`; os times podem buscar de novo.
- **Recusa:** encerra a busca de quem recusou (`recusada`); o outro lado volta à fila com o prazo original e é pareado de novo na hora. **Proposta expirada:** quem tinha aceitado volta à fila com o prazo original; quem não respondeu termina como `sem_resposta`. Se o prazo de 24 h da busca já passou, ela expira.
- **Oferta de vaga ao avulso:** a vaga fica **reservada** para ele por 2 h (nunca além do início da partida), com a busca `pareada`. "Quero jogar" preenche a vaga; recusa ou falta de resposta encerram a busca e a vaga vai ao próximo avulso. Assim, duas pessoas nunca disputam a mesma oferta, e o preenchimento ainda é atômico (trava da vaga e índice único).
- **Partida agendada:** fica `agendada` com as condições aceitas mesmo durante uma nova proposta de condições; a nova só vale quando os dois aceitam (RN05). A primeira aceitação abre as vagas declaradas para avulsos.
- **Quadra:** o tipo da quadra é o formato da partida (`futsal`, `society`, `campo`) ou `tenis`. A sugestão (`em_revisao`) só vale na partida que a sugeriu (RN07). O catálogo começa **vazio**: quadras entram só por sugestão publicada pela administração.
- **Cancelamento:** `combinando` a qualquer momento; `agendada` até 24 h antes do início. Depois disso, quem não comparece perde por W.O.
- **W.O. (12/10):** 3×0 no futebol e 6-0 6-0 no tênis, sem restrição automática. O lado presente registra entre o início e o fim do prazo de 48 h, desde que o outro lado ainda não tenha informado placar. O W.O. não contestado vira resultado no fim do prazo; o contestado espera a administração. No W.O., contam a presença e a vitória dos atletas do lado presente; não há estatísticas.
- **Resultado:** cada lado informa o placar (`match_results`, um por lado); placares iguais confirmam na hora (`realizada`) e o ranking é recalculado. Enquanto não confirmado, os dois podem corrigir até o prazo. No fim das 48 h: sem placar confirmado, `sem_resultado` (amistoso; em campeonato, decide o organizador na etapa 4); com placar confirmado, `encerrada` e fim da janela de estatísticas.
- **Estatísticas (RN10, RN13):** o atleta envia (`enviada`); o representante do próprio lado revisa (`revisada`), podendo corrigir; o representante adversário contesta itens **uma vez** por estatística (`contestada`); o item contestado só pontua depois de nova revisão, que é final. Só itens revisados pontuam; campo vazio não soma nem tira. Editar uma estatística revisada volta a `enviada`.
- **Presença:** o envio das próprias estatísticas marca o atleta como presente; o representante do lado decide a presença de todos (inclusive avulsos). Só atuações com presença confirmada contam no ranking individual.
- **Ranking:** materializado em `standings` a cada confirmação, decisão ou fechamento de prazo; janela de 52 semanas pelo início previsto da partida; classificação com 3 partidas; desempates na seção 12.6.
- **Moderação do chat (12/10):** `ContentReport` com `target_type = 'match_message'` na fila de Denúncias existente; a remoção esconde o texto para todos e mantém o registro.

### 7.2 Esquema (migração `0009`)

`down_revision = '0008'`. Modelos em `app/models/matches.py`, com os estados e tipos no mesmo módulo.

| Tabela | Conteúdo e restrições |
| --- | --- |
| `match_searches` | A fila. `sport`, `kind` (`time` \| `tenis` \| `avulso`), `city_id`, `format` (só time), `position` (só avulso; nulo = qualquer posição), `team_id` **ou** `user_id`, `created_by_id`, `tier` (elo no momento da busca; nulo no avulso), `open_slots` (JSONB por posição, só time), `state`, `match_id` (proposta em curso ou partida resultante), `slot_id` e `offer_expires_at` (oferta ao avulso), `started_at` (antiguidade, mantida ao voltar à fila), `expires_at` (24 h), `ended_at`. **Checks:** categoria por tipo; `ended_at` ⇔ estado final; `pareada` exige proposta (time, tênis) ou oferta com prazo (avulso). **Únicos parciais:** uma busca aberta (`ativa` ou `pareada`) por time e modalidade e por atleta e modalidade; uma oferta pendente por vaga. Índices da fila (`kind, city_id, format, started_at, id` em `ativa`) e dos vencimentos. |
| `matches` | `sport`, `format` (⇔ futebol), `city_id`, `origin` (`amistoso` \| `campeonato`), `event_id` (⇔ campeonato), `round_number`, `bracket_position`, `next_match_id`/`next_match_side` (só campeonato), `state`, `proposal_expires_at` (proposta), condições aceitas (`starts_at`, `court_id`, `booking_side`, `booking_confirmed_at`/`_by_id`, `super_tiebreak` só tênis), `result_deadline` (início + 48 h, ⇔ `starts_at`), resultado final (`score_a`, `score_b`, `sets`, `winner_side`, `result_source` = `confirmacao` \| `wo` \| `organizador` \| `administracao`, `result_confirmed_at`, `result_decided_by_id`/`_at`/`_reason`), W.O. (`walkover_absent_side`, registro, contestação com motivo, decisão `mantido` \| `anulado` com motivo), cancelamento (`cancelled_at`/`_by_id`, `cancel_reason`) e `closed_at` (⇔ estado final). **Checks:** placar final existe exatamente em `realizada`/`encerrada`; tênis com vencedor e sets; decisão com motivo. |
| `match_sides` | `side` (`a` \| `b`), `team_id` **ou** `user_id`, `search_id`, `tier` (no pareamento), `declared_slots`, `accepted_at`/`_by_id`, `declined_at`/`_by_id`. **Únicos:** `(match_id, side)`; o mesmo time ou atleta não ocupa os dois lados. Uma partida de campeonato pode ter 0, 1 ou 2 lados ("Vencedor J1 × Vencedor J2"). |
| `match_terms` | Propostas de condições: `proposed_by_id`/`_side` (nulo = organizador), `starts_at`, `court_id`, `booking_side`, `super_tiebreak`, `state` (`pendente` \| `aceita` \| `substituida` \| `cancelada`), aceites de cada lado e `decided_at`. **Únicos parciais:** uma proposta `pendente` (a vigente) e um conjunto `aceita` por partida. O lado que propõe aceita ao propor. |
| `courts` | Catálogo: `city_id`, `name` (2–80), `name_key` (nome normalizado), `address`, `kind` (`futsal` \| `society` \| `campo` \| `tenis`), `state` (`publicada` \| `em_revisao` \| `rejeitada`), `suggested_by_id`, `origin_match_id`, revisão (`reviewed_by_id`, `reviewed_at`, `review_reason`, `duplicate_of_id`) e `published_at`. **Único parcial** `(city_id, kind, name_key)` entre publicadas. Começa vazio. |
| `match_slots` | Vaga para avulso: `side`, `position`, `state` (`aberta` \| `oferecida` \| `preenchida` \| `fechada`), `opened_at`, `filled_by_id`/`filled_at`, `removed_at`/`_by_id`, `closed_at`. **Único parcial** `(match_id, filled_by_id)` em `preenchida`: uma vaga preenchida por atleta e partida. |
| `match_lineups` | Atuação (RN03): `side`, `user_id`, `team_id`, `guest`, `slot_id`, `position`, `present` (nulo = não informado), `present_marked_by_id`, `removed_at` (avulso removido). **Único** `(match_id, user_id)` (RN02). |
| `match_messages` | Chat: `author_id`, `side`, `kind` (`texto` \| `evento`), `event_type` (⇔ evento; validado no serviço), `body` (1–1000; o texto do evento é gerado em português), `payload`, `removed_at`/`_by_id` (moderação, só texto). Índice `(match_id, id)`. |
| `match_results` | Placar informado por lado: `side`, `reported_by_id`, `score_a`, `score_b` (gols ou sets vencidos, sempre do ponto de vista da partida), `sets` (tênis). **Único** `(match_id, side)`. |
| `football_stats` | Uma por atuação (`lineup_id` único): `goals`, `assists`, `position_stat` (0–50, nulos = vazio), `state` (`enviada` \| `revisada` \| `contestada`), revisão e contestação (`contested_fields` ⊂ `gols`, `assistencias`, `estatistica_posicao`, com motivo). |
| `standings` | Ganha `wins`, `draws`, `losses`, `goals_for`, `goals_against` (gols do time ou sets do tênis), o check `ck_standings_record` e o índice `ix_standings_ranking` para `GET /rankings`. |

### 7.3 Estados e transições

| Busca | Ação | Próximo |
| --- | --- | --- |
| `ativa` | pareamento (proposta ou oferta) | `pareada` |
| `ativa` | cancelar (titular) | `cancelada` |
| `ativa` | 24 h | `expirada` |
| `pareada` | os dois lados aceitam / avulso aceita | `concluida` |
| `pareada` | o outro lado recusou ou deixou expirar depois do meu aceite; partida cancelada com oferta pendente | `ativa` (prazo original) ou `expirada` |
| `pareada` | recusei | `recusada` |
| `pareada` | não respondi em 2 h | `sem_resposta` |

| Partida | Ação | Próximo |
| --- | --- | --- |
| `proposta` | os dois aceitam | `combinando` |
| `proposta` | um recusa / 2 h | `recusada` / `expirada` |
| `combinando` | condições aceitas pelos dois | `agendada` |
| `combinando`, `agendada` | cancelar (agendada: até 24 h antes) | `cancelada` |
| `agendada` | placares iguais | `realizada` |
| `agendada` | W.O. sem contestação no fim do prazo, W.O. mantido pela administração, decisão do organizador (etapa 4) | `encerrada` |
| `agendada` | fim do prazo sem placar confirmado; W.O. anulado | `sem_resultado` |
| `realizada` | fim do prazo de 48 h | `encerrada` |

`match_rules.next_search_state`, `next_match_state` e `next_stat_state` aplicam essas tabelas e levantam `TransitionError` (`409` com a mensagem). As leituras mostram o **estado efetivo**: busca `ativa` vencida aparece `expirada`, proposta vencida aparece `expirada`, mesmo antes da varredura.

**Fase do cartão S1 (`match_rules.match_phase`):** `proposta`, `recusada`, `expirada`, `combinando`, `agendada` (antes do início), `informar_resultado` (depois do início, sem confirmação), `divergente` (os dois informaram placares diferentes), `wo_registrado`, `wo_contestado`, `confirmado` (`realizada`), `encerrada`, `sem_resultado`, `cancelada`.

### 7.4 Tipos comuns (TypeScript)

Espelho de `app/schemas/matches.py`. `Tier`, `Position`, `FootballFormat`, `Person`, `City`, `Page` e `TeamRef` estão na [seção 1 de 0003](0003-times-campeonatos.md#tipos-comuns-typescript) e na seção 2 deste documento.

```ts
type MatchSport = 'futebol' | 'tenis'
type Side = 'a' | 'b'
type SearchKind = 'time' | 'tenis' | 'avulso'
type SearchState = 'ativa' | 'pareada' | 'concluida' | 'cancelada' | 'expirada' | 'recusada' | 'sem_resposta'
type MatchState = 'proposta' | 'recusada' | 'expirada' | 'combinando' | 'agendada' | 'realizada' | 'encerrada'
  | 'sem_resultado' | 'cancelada'
type MatchPhase = 'proposta' | 'recusada' | 'expirada' | 'combinando' | 'agendada' | 'informar_resultado'
  | 'divergente' | 'wo_registrado' | 'wo_contestado' | 'confirmado' | 'encerrada' | 'sem_resultado' | 'cancelada'
type MatchOrigin = 'amistoso' | 'campeonato'
type MatchRole = 'representante' | 'membro' | 'atleta' | 'avulso' | 'organizador' | 'administracao'
type TermsState = 'pendente' | 'aceita' | 'substituida' | 'cancelada'
type CourtKind = 'futsal' | 'society' | 'campo' | 'tenis'
type CourtState = 'publicada' | 'em_revisao' | 'rejeitada'
type SlotState = 'aberta' | 'oferecida' | 'preenchida'
type StatState = 'enviada' | 'revisada' | 'contestada'
type StatField = 'gols' | 'assistencias' | 'estatistica_posicao'
type ResultSource = 'confirmacao' | 'wo' | 'organizador' | 'administracao'
type OpenSlots = Record<Position, number>        // goleiro, defesa, meio_campo, atacante

interface MatchSideOut {
  side: Side
  kind: 'time' | 'atleta'
  team: TeamRef | null
  athlete: Person | null
  tier: Tier | null            // elo no pareamento; null em classificação (nunca se atribui elo antes)
  accepted_at: string | null   // aceite da proposta
  is_mine: boolean
  declared_slots: OpenSlots | null   // vagas para avulsos declaradas na busca, só em `proposta` e `combinando` (depois, `slots`); null se não declarou
}

interface TennisSetOut { a: number; b: number; tiebreak: { a: number; b: number } | null; super_tiebreak: boolean }
interface ScoreOut {
  a: number                    // gols (futebol) ou sets vencidos (tênis) do lado A
  b: number
  sets: TennisSetOut[] | null
  winner: Side | null          // null: empate no futebol
}

interface CourtOut {
  id: number
  name: string
  address: string | null
  kind: CourtKind
  city: City
  state: CourtState
  provisional: boolean         // em revisão: vale só na partida que a sugeriu (selo "Sugestão em revisão")
}

/** Linha de listas, placa e cabeçalho. */
interface MatchCard {
  id: number
  sport: MatchSport
  format: FootballFormat | null
  origin: MatchOrigin
  state: MatchState            // efetivo
  phase: MatchPhase
  sides: MatchSideOut[]        // [a, b]
  my_side: Side | null
  my_role: MatchRole
  starts_at: string | null
  court: CourtOut | null
  result_deadline: string | null
  score: ScoreOut | null       // placar final, quando houver
  needs_my_action: boolean     // aceitar proposta ou condições, informar placar, enviar estatísticas, contestar W.O.
}
```

## 8. Papéis e acesso na partida

`match_access.match_access(db, match, user) -> MatchAccess | None` (e `load_match_for`, que responde `404 Partida não encontrada.`):

| Papel | Quem | Lado | Age pelo lado |
| --- | --- | --- | --- |
| `atleta` | o tenista de um lado | o dele | sim |
| `representante` | representante ativo do time de um lado | o do time | sim |
| `membro` | membro ativo do time de um lado | o do time | não ("Só os representantes aceitam.") |
| `avulso` | avulso com vaga preenchida, **até o encerramento** | o da vaga | não |
| `organizador` | dono do evento, em partida de campeonato (etapa 4) | — | não |
| `administracao` | conta administrativa | — | não (só lê) |

- Quem está nos dois elencos pertence ao lado da sua atuação; senão ao lado que representa; senão ao lado A.
- "Age pelo lado" (`acts_for_side`): aceitar ou recusar a proposta, propor e aceitar condições, cancelar, informar placar, registrar ou contestar W.O., registrar presença, revisar e contestar estatísticas e ajustar vagas.
- **Chat:** leitura a partir de `combinando` (inclusive depois do fim, só leitura); escrita em `combinando`, `agendada` e `realizada`, por elencos, avulsos e organizador. A administração só lê (denúncias e W.O. contestado). Antes do aceite dos dois lados não há chat.

## 9. Busca, proposta e placa (fase 2) — frente de pareamento

### 9.1 Objetos

```ts
interface MatchSearchOut {
  id: number
  kind: SearchKind
  sport: MatchSport
  city: City
  format: FootballFormat | null      // time; null no avulso (qualquer formato) e no tênis
  position: Position | null          // avulso; null = qualquer posição
  team: TeamRef | null
  tier: Tier | null
  open_slots: OpenSlots | null       // time
  state: SearchState                 // efetivo
  started_at: string                 // tempo decorrido no botão
  expires_at: string
  match_id: number | null            // proposta em curso (pareada) ou partida resultante (concluida)
  slot_id: number | null             // oferta de vaga (avulso)
  offer_expires_at: string | null
  can_cancel: boolean                // 'ativa' e titular (atleta ou representante)
}

interface SearchInput {
  sport: MatchSport
  team_id?: number | null            // futebol "Com meu time"; ausente = avulso
  format?: FootballFormat | null     // obrigatório com team_id
  team_complete?: boolean | null     // "O time está completo?"
  open_slots?: Partial<OpenSlots> | null
  position?: Position | null         // avulso
}

interface ProposalOut {
  match_id: number
  sport: MatchSport
  format: FootballFormat | null
  city: City
  state: 'proposta' | 'combinando' | 'recusada' | 'expirada'   // efetivo
  expires_at: string                 // contagem regressiva
  sides: MatchSideOut[]
  my_side: Side
  my_role: MatchRole
  can_respond: boolean               // quem age pelo lado, sem aceite e dentro do prazo
  created_at: string
}

interface SlotOfferOut {
  slot_id: number
  search_id: number
  position: Position
  side: Side                         // lado que abriu a vaga
  expires_at: string
  match: MatchCard
}

interface SearchCreated { search: MatchSearchOut; proposal: ProposalOut | null; offer: SlotOfferOut | null }

/** Placa do Jogar e ponto menta da navegação. */
interface PlayBoard {
  attention: boolean                 // busca aberta, proposta ou oferta pendente, ou amistoso 'combinando' (campeonato não: 17.3)
  searches: MatchSearchOut[]
  proposals: ProposalOut[]
  offers: SlotOfferOut[]
  matches: MatchCard[]               // combinando, agendada e realizada (prazo aberto) do titular; por starts_at, sem data primeiro
}
```

### 9.2 Rotas

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /matchmaking/searches` | atleta (tênis, avulso) ou representante (time) | `SearchInput` | `201 SearchCreated` (ou `200` com a busca aberta) |
| `GET /me/searches` | titular | — | `{ items: MatchSearchOut[] }` (abertas do titular e dos times ativos dele) |
| `DELETE /matchmaking/searches/{id}` | atleta ou representante | — | `204` |
| `GET /me/proposals` | titular | — | `{ items: ProposalOut[] }` (pendentes, por `expires_at`) |
| `PUT /matches/{id}/accept` | quem age pelo lado | `{}` | `ProposalOut` |
| `PUT /matches/{id}/decline` | quem age pelo lado | `{}` | `ProposalOut` |
| `GET /me/play` | titular | — | `PlayBoard` |
| `GET /me/matches?scope=proximas\|historico&cursor=&limit=` | titular | — | `{ items: MatchCard[]; next_cursor }`: `proximas` sem paginação (até 100, `next_cursor: null`); `historico` paginado (encerrada, sem_resultado, cancelada, por `closed_at` decrescente) |

### 9.3 Regras

- **Criar busca:** o tipo sai do corpo: tênis → `tenis`; futebol com `team_id` → `time`; futebol sem `team_id` → `avulso`. Erros, nesta ordem:
  - tênis com `team_id`, `format`, `position` ou `open_slots`: `422 Busca de tênis não tem time, formato nem posição.`;
  - time sem formato: `422 Escolha o formato da partida.` (campo `format`); time com `position`: `422 A posição é só da busca de avulso.`;
  - avulso com `format` ou `open_slots`: `422 O avulso aceita qualquer formato.`;
  - time inexistente, encerrado ou do qual o titular não é membro ativo: `404 Time não encontrado.`; membro sem braçadeira: `403 Só representantes buscam partida para o time.`;
  - vagas: `match_rules.normalize_open_slots` (`422` no campo `open_slots`: `No máximo uma vaga de goleiro.`, `No society cabem até 6 vagas para avulsos.`…); `team_complete: true` com vagas: `422 Com o time completo, não há vagas para avulsos.`;
  - cidade: time → a do time; tênis → a do perfil de tênis (`409 Complete seu perfil de tênis com a cidade para buscar partidas.`); avulso → a do perfil de futebol (`409 Complete seu perfil de futebol com a cidade para buscar vaga.`);
  - busca aberta do mesmo time ou atleta na modalidade: `200 SearchCreated` com ela (com a proposta ou a oferta, se houver); um `IntegrityError` do índice único é tratado igual.

  Grava `tier` (`rankings.subject_tier`; avulso `null`), `started_at = agora`, `expires_at = agora + 24 h`, auditoria `busca.criada` e chama `queue.enqueue` na mesma transação; o resultado (`Pairing`) preenche `proposal` ou `offer`.
- **Minhas buscas:** abertas (`ativa`, `pareada`) do titular (tênis, avulso) e dos times ativos de que é membro; membros veem a busca do time com `can_cancel: false`.
- **Cancelar busca:** trava a linha (`FOR UPDATE`). `404 Busca não encontrada.` para quem não é o atleta nem membro do time; `403 Só representantes cancelam a busca do time.`; `pareada`: `409 A busca já encontrou uma partida. Responda à proposta.` (avulso: `…Responda à oferta de vaga.`); encerrada: `409 Esta busca já foi encerrada.` Grava `cancelada` e `ended_at`. Auditoria `busca.cancelada`. Sem notificação.
- **Aceitar proposta:** `load_match_for(…, for_update=True)`; membro: `403 Só os representantes aceitam.`; fora de `proposta` ou vencida: `409 Esta proposta não está mais aberta.` Chama `queue.accept_proposal` (idempotente para o lado que já aceitou). O primeiro aceite notifica `proposta_aceita` (`complete: false`) a quem age pelo outro lado; o segundo leva a partida a `combinando`, encerra as buscas (`concluida`), abre o chat com a faixa `partida_combinando` e notifica `proposta_aceita` (`complete: true`) aos membros dos dois lados. Auditoria `partida.proposta_aceita`.
- **Recusar proposta:** mesmas checagens; chama `queue.decline_proposal` (busca de quem recusou `recusada`, a outra volta à fila e é pareada de novo). Notificação `proposta_encerrada` (`reason: 'recusada'`, `requeued`) a quem age pelos lados, exceto quem recusou. Auditoria `partida.proposta_recusada` (`{ side, requeued_search_ids }`).
- **"Responder depois":** não chama a API; a proposta fica na placa e nas notificações até o prazo.
- **Placa (`GET /me/play`):** lê o estado efetivo. `attention` acende o ponto menta da navegação. A web relê a placa ao focar e a cada 15 s durante a busca. `needs_my_action` marca o que o titular pode fazer agora.

## 10. Partida, condições, quadras, reserva, cancelamento e W.O. (fase 3) — frente de partida

### 10.1 Objetos

```ts
interface MatchTermsOut {
  id: number
  starts_at: string
  court: CourtOut
  booking_side: Side             // "Quem reserva com o local"
  super_tiebreak: boolean | null // tênis
  proposed_by: Person | null
  proposed_by_side: Side | null  // null: organizador (etapa 4)
  state: TermsState
  accepted_a_at: string | null   // selos de aceite
  accepted_b_at: string | null
  created_at: string
}

interface TermsInput { starts_at: string; court_id: number; booking_side: Side; super_tiebreak?: boolean | null }

interface WalkoverOut {
  absent_side: Side
  registered_by: Person | null
  registered_at: string
  contest_until: string          // result_deadline
  contested_by: Person | null
  contested_at: string | null
  contest_reason: string | null
  decision: 'mantido' | 'anulado' | null
  decision_reason: string | null
}

interface MatchPermissions {
  read_chat: boolean; write_chat: boolean
  propose_terms: boolean; accept_terms: boolean; suggest_court: boolean; confirm_booking: boolean; cancel: boolean
  report_result: boolean; register_walkover: boolean; withdraw_walkover: boolean; contest_walkover: boolean
  attendance: boolean; send_stats: boolean; manage_slots: boolean
}

/** Tela da partida (P2 + C1): cabeçalho, condições fixas e cartão de resultado. */
interface MatchDetail extends MatchCard {
  city: City
  event: { id: number; name: string } | null
  round_number: number | null
  proposal_expires_at: string | null
  terms: { current: MatchTermsOut | null; pending: MatchTermsOut | null }
  booking: { side: Side; state: 'a_confirmar' | 'confirmada'; confirmed_at: string | null } | null
  super_tiebreak: boolean | null
  cancel_until: string | null    // starts_at − 24 h
  slots: MatchSlotOut[]          // seção 11.2
  result: MatchResultOut | null  // seção 12; a partir do início
  walkover: WalkoverOut | null
  cancellation: { at: string; by: Person | null; reason: string | null } | null
  permissions: MatchPermissions
}
```

As permissões e o cartão seguem `match_views`: o elo de cada lado (`MatchSideOut.tier`) é o gravado em `match_sides.tier` no pareamento, não o atual; `result.points` (a pílula "+3 pts") só vem para o elenco (`representante`, `membro`, `atleta`) com resultado final, e é `null` para avulso, organizador e administração; `suggest_court` e `manage_slots` só valem em partida **amistosa**; `suggest_court` só em `combinando` ou `agendada` **antes do início** (a rota responde `409 Só dá para sugerir quadra antes do início da partida.` depois dele, como as condições).

Web e Expo releem este detalhe ao cruzar `starts_at`, `cancel_until` e `result_deadline`, mesmo sem evento novo no chat. O servidor continua decidindo estado e permissões. Os temporizadores conferem o relógio no máximo a cada 60 s, pausam com a tela oculta e conferem prazos vencidos ao retornar; uma falha de leitura tenta novamente após 15 s.

### 10.2 Rotas

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /matches/{id}` | participantes (seção 8) | — | `MatchDetail` |
| `POST /matches/{id}/terms` | quem age pelo lado | `TermsInput` | `201 MatchDetail` |
| `PUT /matches/{id}/terms/{terms_id}/accept` | quem age pelo outro lado | `{}` | `MatchDetail` |
| `PUT /matches/{id}/booking` | quem age pelo lado que reserva | `{ confirmed: boolean }` | `MatchDetail` |
| `POST /matches/{id}/cancel` | quem age pelo lado | `{ reason?: string \| null }` (até 300) | `MatchDetail` |
| `POST /matches/{id}/walkover` | quem age pelo lado presente | `{}` | `MatchDetail` |
| `DELETE /matches/{id}/walkover` | quem registrou (o lado) | — | `204` |
| `POST /matches/{id}/walkover/contest` | quem age pelo lado ausente | `{ reason: string }` (5–500) | `MatchDetail` |
| `GET /courts?city_id=&kind=&q=&match_id=` | qualquer atleta logado | — | `{ items: CourtOut[] }` |
| `POST /courts/suggestions` | quem age pelo lado | `{ match_id: number; name: string; address?: string \| null; kind?: CourtKind }` | `201 { court: CourtOut; existing: false }` ou `200 { court; existing: true }` |
| `GET /admin/court-suggestions?state=em_revisao\|decididas&cursor=&limit=` | administração | — | `Page<AdminCourtSuggestion>` |
| `POST /admin/court-suggestions/{id}/decision` | administração | `{ decision: 'publicar' \| 'rejeitar'; name?: string; address?: string \| null; reason?: string; duplicate_of_id?: number }` | `AdminCourtSuggestion` |
| `GET /admin/walkover-disputes?cursor=&limit=` | administração | — | `Page<{ match: MatchCard; walkover: WalkoverOut }>` |
| `POST /admin/matches/{id}/walkover-decision` | administração | `{ decision: 'manter' \| 'anular'; reason: string }` (5–500) | `{ match: MatchCard; walkover: WalkoverOut }` |

### 10.3 Condições (RN05)

- **Propor:** quem age pelo lado (`403 Só os representantes propõem as condições.` para membros e avulsos), em `combinando` ou em `agendada` antes do início (`409 As condições só mudam enquanto a partida está sendo combinada ou antes do início.`); campeonato: `409 Num campeonato, o organizador define data, horário e quadra.` Validação: `match_rules.validate_terms_start` (`422` em `starts_at`: data passada, mais de 60 dias, fora do passo de 15 min ou sem fuso); quadra publicada na cidade da partida, ou a sugestão em revisão desta partida (`422 Escolha uma quadra do catálogo da cidade ou a sugerida nesta partida.` em `court_id`), do tipo `match_rules.court_kind_for` (`422 Escolha uma quadra de {formato}.`); `super_tiebreak` só no tênis (`422 Super tie-break só no tênis.`; padrão `false` no tênis). Trava a partida; a proposta pendente anterior vira `substituida`; a nova nasce `pendente` com o aceite do lado que propôs. Igual às condições aceitas: `409 Estas já são as condições combinadas.` Notificação `condicoes_propostas` a quem age pelo outro lado; faixa `condicoes_propostas`; auditoria `condicoes.propostas`.
- **Aceitar:** quem age pelo outro lado. Condições `substituida` ou `cancelada`: `409 Estas condições foram substituídas. Confira a proposta atual.`; já aceitas pelo meu lado: `200` (idempotente); horário já passou: `409 O horário proposto já passou. Proponha outro.` Com os dois aceites: `aceita` (a anterior `aceita` vira `substituida`), e a partida copia `starts_at`, `court_id`, `booking_side`, `super_tiebreak` e `result_deadline = início + 48 h`; a reserva volta a "a confirmar" se a quadra, o horário ou quem reserva mudou. Na primeira vez, `combinando` → `agendada`, `match_lifecycle.open_declared_slots` e `queue.offer_slots` (vagas para avulsos). Notificação `partida_agendada` (`changed`: alteração de partida já agendada) aos membros dos dois lados e aos avulsos; faixa `partida_agendada` ou `condicoes_aceitas`; auditoria `condicoes.aceitas` e, na primeira vez, `partida.agendada`.
- A tela mostra "Só os representantes aceitam" para membros; não há "recusar condições": quem discorda propõe outra.

### 10.4 Quadras (RN07)

- **Catálogo:** `city_id` obrigatório (`422`); só publicadas, por nome, até 50; `q` filtra por `name_key` (sem acento, minúsculas); `kind` filtra o tipo. Com `match_id` de uma partida do titular, as sugestões em revisão dessa partida vêm primeiro, com `provisional: true`.
- **Sugerir:** quem age pelo lado, em `combinando` ou `agendada` antes do início (`409 Só dá para sugerir quadra antes do início da partida.`); nome por `match_rules.clean_court_name` (`422 O nome da quadra precisa ter de 2 a 80 caracteres.`), endereço aparado até 160; `kind` padrão = o da partida (outro tipo: `422 A quadra sugerida precisa ser de {formato}.`). Duplicidade: publicada com a mesma chave na cidade e tipo, ou sugestão em revisão da mesma partida com a mesma chave → `200` com ela (`existing: true`). Até 3 sugestões em revisão por partida (`409 Esta partida já tem 3 sugestões de quadra em revisão.`). Cria `em_revisao` com `origin_match_id`. Faixa `quadra_sugerida`; auditoria `quadra.sugerida`.
- **Fila da administração:** `em_revisao` por `created_at` crescente (`paginate(…, ascending=True)`), com `possible_duplicates` (publicadas na mesma cidade e tipo cuja chave é igual, contém ou está contida na da sugestão); `decididas` por `reviewed_at` decrescente. Contador `court_suggestions` em `GET /admin/queue-counts` (seção 16).
- **Decidir:** `404 Sugestão não encontrada.`; `409 Esta sugestão já foi decidida.` **Publicar**, com correções opcionais de nome e endereço: `publicada`, `published_at`, `reviewed_*`; conflito do único: `409 Já existe uma quadra publicada com este nome nesta cidade. Rejeite como duplicada.` **Rejeitar:** motivo de 5 a 300 (`422 Descreva o motivo da recusa.`), dispensado com `duplicate_of_id` (publicada da mesma cidade e tipo, senão `422 Escolha uma quadra publicada da mesma cidade e tipo.`); com duplicata, as condições pendentes e aceitas e as partidas que usavam a sugestão passam a apontar para a publicada (é o mesmo lugar; sem novo aceite). Sem duplicata, a partida segue com a quadra combinada, que a web mostra como "Sugestão recusada", e as condições **pendentes** que usavam a quadra passam a `cancelada` (quem propôs propõe de novo). Notificação `quadra_decidida` a quem sugeriu; faixa `quadra_sugerida` (sem autor, com `payload.decision`) na partida de origem enquanto o chat aceita escrita; auditoria `quadra.publicada` ou `quadra.rejeitada`.

### 10.5 Reserva (RN08)

Quem age pelo lado que reserva (`403 Só quem reserva confirma a reserva.`), com a partida `agendada` e antes do início (`409 A reserva só muda com a partida agendada e antes do início.`). `confirmed: true` grava `booking_confirmed_at`/`_by_id`; `false` volta a "a confirmar". O Arena só registra o estado. Faixa `reserva_atualizada`; auditoria `partida.reserva_atualizada` (`{ confirmed }`). Sem notificação.

### 10.6 Cancelamento

Quem age pelo lado; `match_rules.cancel_error` (`409 Só partidas combinando ou agendadas podem ser canceladas.` ou `409 Faltam menos de 24 h para a partida. Quem não comparecer perde por W.O.`); campeonato: `409 Partidas de campeonato são canceladas pelo organizador.` Motivo opcional, aparado, até 300. Numa transação, com a partida travada: `cancelada`, `cancelled_*`, `closed_at`; proposta de condições pendente → `cancelada`; `match_lifecycle.close_match_slots` (vagas fechadas, ofertas pendentes devolvidas à fila, escalações encerradas). Notificação `partida_cancelada` aos membros dos dois lados e aos avulsos escalados (calculados antes de fechar); faixa `partida_cancelada`; auditoria `partida.cancelada` (`{ reason, guests }`). Os times podem buscar de novo; a partida não pontua.

### 10.7 W.O.

- **Registrar:** só amistoso (campeonato: etapa 4), `agendada`, entre o início (`409 O W.O. só pode ser registrado depois do horário da partida.`) e o prazo (`409 O prazo de 48 h para registrar o resultado acabou.`); sem W.O. anterior (`409 Já há um W.O. registrado nesta partida.`); o outro lado ainda sem placar informado (`409 O outro lado já informou o placar. Informe o seu ou converse no chat.`). O placar que o meu lado tinha informado é apagado. Grava o lado ausente e o registro. Notificação `wo_registrado` a quem age pelo lado ausente, com `contest_until`; faixa `wo_registrado`; auditoria `partida.wo_registrado`.
- **Retirar:** o lado que registrou, antes da contestação e do prazo (`409 Não há W.O. registrado pelo seu lado.` ou `409 O W.O. já foi contestado; a administração decide.`). Faixa `wo_retirado`; auditoria `partida.wo_retirado`.
- **Contestar:** quem age pelo lado ausente, até o prazo, uma vez; motivo de 5 a 500 (`422 Conte o que aconteceu.`). Notificação `wo_contestado` a quem age pelo lado que registrou e às contas administrativas ativas; faixa `wo_contestado`; auditoria `partida.wo_contestado`. A partida fica sem resultado até a decisão; a varredura não a fecha.
- Com W.O. registrado, o placar não pode ser informado (`409 Há um W.O. registrado nesta partida.`) nem as estatísticas enviadas (`409 Partida decidida por W.O. não tem estatísticas.`); a presença do lado presente pode ser registrada.
- **Sem contestação até o prazo:** a varredura grava 3×0 (ou 6-0 6-0) para o lado presente, `result_source = 'wo'`, `encerrada`, notifica `resultado_partida` (`outcome: 'wo'`) e recalcula o ranking.
- **Decisão da administração** (fila por `walkover_contested_at` crescente; contador `walkover_disputes`): `404 Partida não encontrada.`; `409 Este W.O. não aguarda decisão.`; motivo de 5 a 500 (`422 Descreva a decisão.`). **Manter:** placar do W.O. com `result_source = 'administracao'`, `result_decided_*`, `encerrada`, recálculo. **Anular:** `sem_resultado`. Os dois gravam `walkover_decision`, `walkover_decided_*` e o motivo; notificação `wo_decidido` aos membros dos dois lados; faixa `wo_decidido`; auditoria `partida.wo_decidido`. A administração lê o chat da partida para decidir.

## 11. Chat e vagas (fases 3 e 4)

### 11.1 Mensagens

```ts
type MatchEventType = 'partida_combinando' | 'condicoes_propostas' | 'condicoes_aceitas' | 'partida_agendada'
  | 'reserva_atualizada' | 'vagas_atualizadas' | 'avulso_entrou' | 'avulso_removido' | 'quadra_sugerida'
  | 'partida_cancelada' | 'wo_registrado' | 'wo_retirado' | 'wo_contestado' | 'wo_decidido' | 'placar_enviado'
  | 'resultado_confirmado' | 'resultado_divergente' | 'sem_resultado' | 'presenca_registrada'
  | 'estatisticas_enviadas' | 'estatistica_revisada' | 'estatistica_contestada' | 'mensagem_removida'

interface MatchMessageOut {
  id: number
  kind: 'texto' | 'evento'
  event_type: MatchEventType | null
  body: string | null            // null quando removida pela moderação ("Mensagem removida")
  removed: boolean
  author: Person | null          // null nos eventos; avatar null com bloqueio
  side: Side | null              // lado do autor (lados C1) ou do evento (brasão da faixa)
  author_role: 'representante' | 'membro' | 'atleta' | 'avulso' | 'organizador' | null  // braçadeira "C" = representante
  is_mine: boolean
  payload: Record<string, unknown> | null
  created_at: string
}
interface MessagePage { items: MatchMessageOut[]; has_more: boolean; last_id: number | null }
```

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /matches/{id}/messages?after=&before=&limit=` | leitores (seção 8) | — | `MessagePage` (itens em ordem crescente) |
| `POST /matches/{id}/messages` | escritores (seção 8) | `{ body: string }` (1–1000, aparado) | `201 MatchMessageOut` |
| `POST /reports` (existente) | leitores | `{ target_type: 'match_message'; target_id; reason; description? }` | `201 { id, status }` |

- **Leitura periódica (com a tela visível):** a cada 4 s enquanto o chat aceita escrita; a cada 30 s quando só aceita leitura, para receber moderação. Web e Expo pausam em segundo plano e leem ao voltar. `after={last_id}` devolve as mensagens com `id` maior, em ordem crescente, até `limit` (padrão 50, máximo 100), com `has_more`; sem novidade, `items: []` e `last_id` igual ao `after`. Sem parâmetros, as últimas `limit`. `before={id}` pagina o histórico para trás. `after` e `before` juntos: `422`.
- Antes do aceite dos dois lados: `403 O chat abre quando os dois lados aceitam a proposta.`; partida fechada: `409 O chat desta partida está fechado.`; administração escrevendo: `403 A administração só lê o chat.`
- `author_role` é o papel atual de quem escreveu (a braçadeira "C" aparece para representantes); `side` é o lado gravado ao escrever.
- Mensagens não geram notificação nem auditoria. Eventos são criados pelas frentes com `match_events.post_event`, na transação da mudança; o texto vem em português e não traz datas (a web formata `payload.starts_at` no fuso do aparelho).
- **Denúncia (12/10):** extensão de `POST /reports` e da fila `/admin/reports` em `app/routers/social.py`: `target_type` aceita `match_message` para quem lê a mensagem (só `texto` não removido; senão `404 Conteúdo não encontrado.`); a prévia administrativa mostra o texto, a partida e o autor; a ação `remove` grava `removed_at`/`removed_by_id` (o texto some para todos e o registro fica); `suspend` segue como hoje.
- **Atualização da remoção (correção da revisão, 12/10):** uma nova remoção também grava, na mesma transação, o evento `mensagem_removida`, sem autor, com `payload: { message_id }` e o texto "Uma mensagem foi removida pela administração.". Não replica o conteúdo removido. Os clientes aplicam `body: null` e `removed: true` ao item indicado, inclusive em páginas antigas recebidas depois do evento; a API continua retornando o texto removido como nulo.

### 11.2 Avulso e vagas (fase 4) — frente de avulso

```ts
interface MatchSlotOut {
  id: number
  side: Side
  position: Position
  state: SlotState               // 'oferecida' = reservada para um avulso que ainda vai responder
  guest: Person | null           // preenchida
  filled_at: string | null
}
```

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `GET /me/slot-offers` | titular | — | `{ items: SlotOfferOut[] }` |
| `PUT /match-slots/{id}/accept` | o avulso da oferta | `{}` | `MatchDetail` |
| `PUT /match-slots/{id}/decline` | o avulso da oferta | `{}` | `204` |
| `PUT /matches/{id}/slots` | quem age por um lado de time | `{ open_slots: Partial<OpenSlots> }` | `MatchDetail` |
| `DELETE /matches/{id}/guests/{user_id}` | quem age pelo lado do avulso | — | `204` |

- **Vagas declaradas na busca** (V2): no máximo um goleiro e, somando as preenchidas, até o tamanho do formato menos um (futsal 4, society 6, campo 10). Viram linhas `match_slots` `aberta` quando a partida é agendada.
- **Pareamento do avulso:** vagas `aberta` de partidas `agendada` da cidade, ainda não iniciadas, da posição escolhida (ou de qualquer posição), em qualquer formato; o elo individual do avulso na posição e no formato da vaga (ou "qualquer nível" em classificação) contra o elo do time que abriu a vaga; mesmo elo, vizinho, depois a vaga mais antiga. Ficam de fora os membros ativos dos dois times, quem já atuou na partida e quem foi removido dela.
- **Aceitar ("Quero jogar"):** `queue.accept_offer`: oferta inexistente ou de outra pessoa: `404 Oferta de vaga não encontrada.`; `409 Esta vaga não está mais reservada para você.`, `409 O prazo para aceitar esta vaga acabou.` ou `409 Esta partida não recebe mais avulsos.`; um `IntegrityError` (já atua na partida): `409 Você já está nesta partida.` Efeitos: vaga `preenchida`, busca `concluida` com a partida, atuação de convidado só naquela partida (o ingresso permanente no time continua exigindo convite). Notificação `vaga_preenchida` a quem age pelo lado; faixa `avulso_entrou`; auditoria `vaga.preenchida`. O avulso passa a ler e escrever no chat até o encerramento.
- **Recusar:** `queue.decline_offer` (busca `recusada`, vaga oferecida ao próximo). Auditoria `vaga.oferta_recusada`.
- **Ajustar vagas:** o corpo **substitui** a declaração do lado inteiro (posição ausente vale `0`; `{ "open_slots": {} }` fecha todas); só futebol amistoso, em `combinando` (atualiza `match_sides.declared_slots`) ou `agendada` antes do início (`409 As vagas só mudam antes do início da partida.`); `match_rules.normalize_open_slots(formato, desejadas, filled=preenchidas)`; o número pedido é o de vagas abertas ou oferecidas por posição. Para reduzir, fecha primeiro as `aberta` mais recentes e depois as `oferecida` (`queue.release_offer(…, 'devolvida')`: o avulso volta à fila); para aumentar, abre linhas novas e chama `queue.offer_slots`. Faixa `vagas_atualizadas`; auditoria `vagas.atualizadas`.
- **Remover avulso:** antes do início (`409 Depois do início, o avulso só fica de fora pela presença.`); `404 Avulso não encontrado nesta partida.` Vaga `fechada` com `removed_*`; atuação com `removed_at`; a vaga não reabre sozinha. Notificação `removido_da_partida`; faixa `avulso_removido`; auditoria `avulso.removido`.
- **Cancelamento ou W.O.:** os avulsos escalados recebem `partida_cancelada` ou `resultado_partida`, e a escalação termina com a partida.

## 12. Resultado, estatísticas, contestação e rankings (fase 5) — frente de resultado

### 12.1 Objetos

```ts
interface TennisSetInput { a: number; b: number; tiebreak?: { a: number; b: number } | null }
type ResultInput = { goals_a: number; goals_b: number }            // futebol, 0–99
                 | { sets: TennisSetInput[] }                        // tênis; com super tie-break, o 3º "set" são os pontos

interface ScoreReport { side: Side; score: ScoreOut | null; reported_by: Person | null; updated_at: string }   // score nulo: relato cego (12.3)

interface MatchResultOut {
  state: 'aguardando' | 'divergente' | 'confirmado' | 'wo_registrado' | 'wo_contestado' | 'sem_resultado'
  deadline: string               // anel S1 e "fecha seg, 20 out · 16:00"
  reports: { a: ScoreReport | null; b: ScoreReport | null }   // o meu relato sempre; o do outro lado, com `score`, só depois do meu ou na divergência (12.3)
  final: ScoreOut | null
  source: ResultSource | null
  confirmed_at: string | null
  decision_reason: string | null
  points: number | null          // do meu lado, confirmado: 3/1/0 (time) ou 10/0 (tênis) — pílula "+3 pts"
}

interface PointsPreview {
  presence: number; result: number | null; goals: number; assists: number; position_stat: number; total: number
  counted: StatField[]           // itens que já pontuam (revisados)
  final: boolean                 // placar confirmado e prazo encerrado
}

interface FootballStatOut {
  id: number
  goals: number | null; assists: number | null; position_stat: number | null
  state: StatState
  submitted_at: string
  reviewed_at: string | null; reviewed_by: Person | null
  contested_at: string | null; contested_by: Person | null; contest_reason: string | null
  contested_fields: StatField[] | null
}

interface LineupOut {
  user: Person
  side: Side
  guest: boolean                 // selo "Avulso"
  position: Position | null
  present: boolean | null
  stat: FootballStatOut | null
  points: PointsPreview | null
  can_review: boolean            // representante do lado
  can_contest: boolean           // representante do outro lado, uma vez, no prazo
}
```

### 12.2 Rotas

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `PUT /matches/{id}/result` | quem age pelo lado | `ResultInput` | `MatchDetail` |
| `PUT /matches/{id}/attendance` | quem age por um lado de time | `{ athletes: { user_id: number; present: boolean; position?: Position \| null }[] }` (1–40) | `{ items: LineupOut[] }` |
| `GET /matches/{id}/stats` | participantes | — | `{ items: LineupOut[] }` |
| `PUT /matches/{id}/my-stats` | atleta do elenco ou avulso da partida | `{ position: Position; goals?: number \| null; assists?: number \| null; position_stat?: number \| null }` | `{ lineup: LineupOut; preview: PointsPreview }` |
| `PUT /matches/{id}/stats/{stat_id}/review` | quem age pelo lado do atleta | `{ position?; goals?; assists?; position_stat? }` (correções opcionais) | `LineupOut` |
| `POST /matches/{id}/stats/{stat_id}/contest` | quem age pelo outro lado | `{ fields: StatField[]; reason: string }` (5–300) | `LineupOut` |
| `GET /rankings?sport=&kind=&format=&position=&distance_km=&cursor=&limit=` | qualquer atleta logado | — | `RankingPage` |
| `GET /me/standings` | titular | — | `MeStandings` (seção 2, sem mudança de contrato) |

`GET /matches/{id}/stats` e as respostas de presença listam o **elenco inteiro** dos dois lados: representantes e membros ativos dos times e os avulsos escalados (o removido não aparece), com `present: null` e `stat: null` para quem ainda não foi registrado; a posição é a da atuação, senão a do elenco.

### 12.3 Placar (RN09, RN15)

- Quem age pelo lado, com a partida `agendada` e a janela aberta (`match_rules.result_window_open`; senão `409 O placar é informado depois do horário da partida e até 48 h depois.`); já confirmado: `409 O placar já foi confirmado pelos dois lados.`; W.O. registrado: `409 Há um W.O. registrado nesta partida.`
- Futebol: `validate_football_score` (`422 Informe números inteiros de 0 a 99.`). Tênis: `validate_tennis_sets(sets, super_tiebreak=match.super_tiebreak)`: sets de 6-0 a 6-4, 7-5 ou 7-6 com o tie-break (a 7, com 2 de vantagem, de quem venceu o set); super tie-break a 10 com 2 de vantagem no lugar do 3º set quando combinado; vencedor com 2 sets; 3º set só com os dois primeiros divididos. As mensagens apontam o set (`sets.2`).
- Trava a partida e grava ou substitui a linha do meu lado (`match_results`). Se os dois placares forem iguais (`scores_agree`): `match_lifecycle.apply_final_score(…, source='confirmacao')`, `realizada`, `standings.recalculate_for_match`, notificação `resultado_partida` (`outcome: 'confirmado'`, `score_a`, `score_b`) aos membros e avulsos, faixa `resultado_confirmado`, auditoria `resultado.confirmado`. Se forem diferentes: notificação `resultado_divergente` (`deadline`) a quem age pelos dois lados, faixa `resultado_divergente`, auditoria `resultado.divergente`. Primeiro envio: faixa `placar_enviado`, auditoria `resultado.informado`. Em campeonato, a divergência vai ao organizador ([seção 17](#17-uso-nas-partidas-de-campeonato-etapa-4)).
- **Relato cego (decisão do orquestrador de 12/10, que revê a anterior):** `result.reports` mostra o **meu** relato sempre. O do outro lado só traz o `score` depois que o **meu lado já informou o meu** (o que inclui a divergência, em que os dois informaram) ou quando o resultado já está decidido (partida que deixou de ser `agendada`: `realizada`, `encerrada` ou `sem_resultado`). Antes disso o relato do outro lado existe, com `side`, `reported_by` e `updated_at`, mas com `score: null`: a tela diz que o outro lado já informou, sem o placar. Quem não age por lado (administração e organizador) vê os dois. Vale para todo o meu lado (representantes, membros e avulso). Motivo: copiar o placar do adversário não é conferir o resultado; a confirmação precisa de dois relatos independentes. A faixa `placar_enviado` do chat também não traz o placar.

### 12.4 Presença e estatísticas (RN03, RN10, RN12, RN13)

- **Presença:** quem age por um lado de time, futebol, janela aberta, partida `agendada` ou `realizada`; o lado ausente num W.O. não registra (`409 O seu lado está com W.O. registrado.`). Só membros ativos do time do lado ou avulsos desse lado (`422 Este atleta não está no elenco deste lado.` em `athletes`). Posição de quem jogou: a informada, senão a da atuação, a do elenco (`team_members.position`) ou a da vaga do avulso; sem nenhuma, `422 Informe a posição de quem jogou.` Faixa `presenca_registrada`; auditoria `presenca.registrada` (`{ side, present, absent }`).
- **Minhas estatísticas:** atleta membro ativo de um time da partida ou avulso dela; futebol; janela aberta; `agendada` ou `realizada`; W.O.: `409 Partida decidida por W.O. não tem estatísticas.`; marcado ausente pelo representante: `409 O representante marcou que você não jogou. Fale com ele.`; `validate_stat` (`422 Informe números inteiros de 0 a 50.`). Cria ou atualiza a atuação (presente se ainda não informado) e a estatística: nova → `enviada`; `enviada`/`revisada` → `enviada` (nova revisão); `contestada` → `409 Esta estatística foi contestada; o representante do seu time revisa.`; `revisada` depois de uma contestação (revisão final) → `409 Esta estatística já foi contestada e revisada; a revisão é final.` (`permissions.send_stats` é falso nos dois casos) Faixa `estatisticas_enviadas` ("Tiago enviou: 2 gols, 4 finalizações no alvo (ATA)."). Sem auditoria (é declaração, não decisão).
- **Prévia (RN12):** `scoring.individual_points` com o resultado confirmado, senão o placar informado pelo lado do atleta quando visível ao visitante conforme o relato cego (12.3), senão `null`: presença 1; vitória 3, empate 1, derrota 0; gol 1; assistência 1; estatística da posição 0,5 por ocorrência até 4. `total` soma tudo o que foi enviado; `counted` (`match_rules.counted_stat_fields`) diz o que já pontua. Relato oculto implica `points.result: null`, sem contribuição do resultado no total, também no elenco adversário.
- **Revisar:** quem age pelo lado do atleta; janela aberta; correções validadas; `next_stat_state(…, 'revisar')` → `revisada` (resolve a contestação). Uma estatística `revisada` depois de contestação não aceita outra revisão: `409 Esta estatística já foi contestada e revisada; a revisão é final.`, sem alterar estatística ou ranking; `can_review` fica falso. Faixa `estatistica_revisada`; auditoria `estatistica.revisada` (`{ match_id, user_id, corrections, after_contest }`); com a partida `realizada`, recálculo.
- **Contestar:** quem age pelo outro lado; janela aberta; `normalize_contested_fields`; motivo de 5 a 300 (`422 Conte por que a estatística está errada.`); uma vez (`409 Esta estatística já foi contestada.`). Notificação `estatistica_contestada` ao atleta e a quem age pelo lado dele; faixa `estatistica_contestada`; auditoria `estatistica.contestada`; com a partida `realizada`, recálculo.
- **Fim do prazo:** estatísticas `enviada` não pontuam; itens contestados sem nova revisão não pontuam.

### 12.5 Prazo de 48 h (varredura)

`match_lifecycle.close_due_results`: amistoso `agendada` vencido sem W.O. → `sem_resultado` (notificação `resultado_partida` com `outcome: 'sem_resultado'`, faixa, auditoria `partida.sem_resultado`); com W.O. não contestado → W.O. (seção 10.7); `realizada` vencida → `encerrada` (auditoria `partida.encerrada`, recálculo). W.O. contestado e campeonato sem confirmação ficam como estão (o organizador decide, [seção 17](#17-uso-nas-partidas-de-campeonato-etapa-4)).

### 12.6 Rankings (RN11, RN14, RN16, RN23)

```ts
interface RankingRow {
  rank_position: number
  tier: Tier                     // só classificados aparecem na lista
  metric_value: number           // pontos (time, tênis), média por partida (individual) ou segundos (corrida)
  matches_played: number
  wins: number; draws: number; losses: number
  goals_for: number | null       // time: gols; tênis: sets; individual: null
  goals_against: number | null
  team: TeamRef | null
  athlete: Person | null
  is_mine: boolean
}

interface RankingPage {
  ranking: 'futebol_time' | 'futebol_individual' | 'tenis' | 'corrida_3' | 'corrida_5' | 'corrida_10' | 'corrida_21'
    | 'corrida_42'
  format: FootballFormat | null
  position: Position | null
  distance_km: number | null
  calc_version: number
  classified_count: number
  legend_slots: number           // ⌊classificados × 15%⌋
  required: number               // partidas para classificar
  items: RankingRow[]
  next_cursor: string | null
  mine: (StandingLine & { team: TeamRef | null })[]   // as linhas do titular (ou de cada time ativo dele), mesmo em classificação
}
```

- **Parâmetros:** `sport=futebol&kind=time&format=` (times por formato), `sport=futebol&kind=individual&format=&position=` (12 rankings), `sport=tenis`; `sport=corrida&distance_km=3|5|10|21|42` (seção 18.5: `metric_value` em segundos, o menor tempo vence, `matches_played` conta as marcas da janela, `wins`/`draws`/`losses` são 0 e `goals_for`/`goals_against` são `null`). Faltando categoria: `422 Escolha o formato.`, `422 Escolha a posição.` ou `422 Escolha a distância.` Rankings **gerais** (sem cidade). Ordem por `rank_position` crescente; cursor opaco com a última posição; `limit` padrão 20, máximo 50. Quem tem bloqueio com o titular continua na lista, sem avatar.
- **Recálculo** (`services/standings.recalculate_for_match(db, match, *, now, positions=())`, seção 15.4): na confirmação, na decisão ou no fim do prazo, recalcula os rankings que a partida toca, na mesma transação: os dois times no formato (`futebol_time`), cada atuação presente na posição e no formato (`futebol_individual`) ou os dois tenistas (`tenis`), com:
  - janela de 52 semanas pelo `starts_at` (`scoring.in_window`);
  - partidas `realizada` ou `encerrada` com placar final;
  - time: `scoring.team_record` (pontos 3/1/0; desempates por saldo de gols, gols marcados, menos partidas e o id; RN14);
  - individual: média por partida (`scoring.individual_record`; desempate: mais partidas, depois o id — interpretação); só atuações com presença; itens de estatística contados por `counted_stat_fields`; no W.O., presença e vitória para o lado presente;
  - tênis: 10 por vitória confirmada (RN16) mais o bônus de campeonato (etapa 4); desempate: menos partidas, depois o id (interpretação);
  - classificação com `placement_matches` (3, lido dos cortes por `rankings.required_matches`), posições e elos por `scoring.rank_records` com os cortes de `rank_cuts` da `CURRENT_CALC_VERSION` (Lendário = Diamante e ⌊classificados × 15%⌋, arredondado para baixo), gravados com `scoring.standing_fields`;
  - depois, o elo das buscas abertas dos sujeitos cujo elo mudou é atualizado e elas tentam o pareamento de novo (`queue.try_match`).
- **Saída da janela:** um recálculo diário dos rankings com partidas que saíram das 52 semanas é a tarefa de varredura `rankings_janela` (`standings.recalculate_outside_window`): olha as categorias com partida contabilizada que começou entre a idade da linha mais antiga e o início da janela de agora, recalcula cada uma inteira e carimba as linhas, então rodar de novo não muda nada.
- **`GET /me/standings`:** o contrato da seção 2 não muda; passa a refletir os rankings reais quando `standings` for preenchido.

## 13. Notificações da etapa 3

Registradas em `NOTIFICATION_TYPES` (campos obrigatórios abaixo; outros são opcionais). Nomes de times e pessoas são cópias do momento; a navegação usa os ids. Sem `actor`, o texto usa "O Arena" ou "A administração".

| Tipo | Destinatário | `actor` | `payload` | Texto sugerido | Ao tocar |
| --- | --- | --- | --- | --- | --- |
| `proposta_partida` | quem age por cada lado | `null` | `{ match_id, sport, format, opponent_name, expires_at }` | "Partida encontrada contra {adversário}. Responda em até 2 h" | Proposta em tela cheia |
| `proposta_aceita` | outro lado (`complete: false`); membros dos dois lados (`complete: true`) | quem aceitou | `{ match_id, opponent_name, complete }` | "{adversário} aceitou a proposta" / "Partida confirmada contra {adversário}. Combinem no chat" | Proposta / partida |
| `proposta_encerrada` | quem age pelos lados (exceto quem recusou) | quem recusou ou `null` | `{ match_id, opponent_name, reason: 'recusada' \| 'expirada', requeued }` | "A proposta contra {adversário} foi recusada/expirou" (+ "Sua busca continua") | Placa |
| `vaga_encontrada` | avulso | `null` | `{ match_id, slot_id, position, format, team_name, starts_at, expires_at }` | "Vaga de {posição} no {time}. Responda em até 2 h" | Oferta |
| `condicoes_propostas` | quem age pelo outro lado | quem propôs | `{ match_id, terms_id, starts_at, court_name }` | "{ator} propôs novas condições" | Partida |
| `partida_agendada` | membros dos dois lados e avulsos | quem aceitou | `{ match_id, terms_id, starts_at, court_name, changed }` | "Partida agendada: {data} em {quadra}" / "Partida alterada…" | Partida |
| `partida_cancelada` | membros dos dois lados e avulsos | quem cancelou | `{ match_id, reason }` | "A partida de {data} foi cancelada" (+ motivo) | Partida |
| `wo_registrado` | quem age pelo lado ausente | quem registrou | `{ match_id, opponent_name, contest_until }` | "{adversário} registrou W.O. Conteste até {prazo} se vocês compareceram" | Partida |
| `wo_contestado` | quem age pelo lado que registrou e administração | quem contestou | `{ match_id, reason }` | "{ator} contestou o W.O." | Partida / fila de W.O. |
| `wo_decidido` | membros dos dois lados | `null` | `{ match_id, decision: 'mantido' \| 'anulado', reason? }` | "A administração manteve/anulou o W.O." | Partida |
| `resultado_partida` | membros dos dois lados e avulsos | `null` | `{ match_id, outcome: 'confirmado' \| 'wo' \| 'sem_resultado', score_a?, score_b?, absent_side? }` | "Resultado confirmado: 3 × 1" / "Vale o W.O." / "A partida ficou sem resultado" | Partida |
| `resultado_divergente` | quem age pelos dois lados | `null` | `{ match_id, deadline }` | "Os placares não batem. Corrijam até {prazo}" | Partida |
| `estatistica_contestada` | o atleta e quem age pelo lado dele | quem contestou | `{ match_id, stat_id, fields, reason }` | "{ator} contestou suas estatísticas" | Partida, elenco |
| `vaga_preenchida` | quem age pelo lado da vaga | o avulso | `{ match_id, slot_id, position }` | "{ator} entrou como {posição}" | Partida |
| `removido_da_partida` | o avulso | quem removeu | `{ match_id, team_name }` | "Você foi removido da partida do {time}" | — |
| `oferta_retirada` | avulso com a oferta pendente | quem reduziu as vagas ou cancelou a partida | `{ match_id, slot_id, position, team_name, reason: 'vagas_reduzidas' \| 'partida_cancelada', requeued }` | "A vaga de {posição} no {time} foi retirada" (+ "Sua busca continua" se `requeued`) | Placa |
| `quadra_decidida` | quem sugeriu | `null` | `{ court_id, court_name, decision: 'publicada' \| 'rejeitada', reason?, duplicate_of_id? }` | "{quadra} entrou no catálogo" / "…foi recusada: {motivo}" | — |

A tela Notificações lista também os pedidos para seguir (`GET /me/follow-requests`), que não entram na contagem.

## 14. Auditoria da etapa 3

| Ação | `target_type` | Gerada por |
| --- | --- | --- |
| `busca.criada`, `busca.cancelada` | `match_search` | seção 9 |
| `busca.expirada` | `match_search` | varredura (`actor_id` nulo, `data.automatico = true`) |
| `partida.proposta_criada` | `match` | fila (`automatico`) |
| `partida.proposta_aceita`, `partida.proposta_recusada` | `match` | seção 9 |
| `partida.proposta_expirada` | `match` | varredura |
| `condicoes.propostas`, `condicoes.aceitas` | `match_terms` | seção 10.3 |
| `partida.agendada`, `partida.reserva_atualizada`, `partida.cancelada` | `match` | seções 10.3, 10.5 e 10.6 |
| `partida.wo_registrado`, `partida.wo_retirado`, `partida.wo_contestado`, `partida.wo_decidido` | `match` | seção 10.7 |
| `partida.wo_confirmado`, `partida.sem_resultado`, `partida.encerrada` | `match` | varredura |
| `quadra.sugerida`, `quadra.publicada`, `quadra.rejeitada` | `court` | seção 10.4 |
| `vaga.oferecida` | `match_slot` | fila (`automatico`) |
| `vaga.preenchida`, `vaga.oferta_recusada` | `match_slot` | seção 11.2 |
| `vaga.oferta_sem_resposta`, `vaga.oferta_devolvida` | `match_slot` | varredura (`sem_resposta`) ou, na `devolvida`, o ajuste de vagas e o cancelamento (com o `actor` de quem agiu) |
| `vagas.atualizadas`, `avulso.removido` | `match` / `match_slot` | seção 11.2 |
| `resultado.informado`, `resultado.confirmado`, `resultado.divergente` | `match` | seção 12.3 |
| `presenca.registrada` | `match` | seção 12.4 |
| `estatistica.revisada`, `estatistica.contestada` | `football_stat` | seção 12.4 |

`data` guarda ids, lados, estados, placares e motivos; nunca conteúdo do chat.

## 15. Fila, varredura e serviços compartilhados

### 15.1 Fila (`app/services/matchmaking_queue.py`)

- **Interface `MatchmakingQueue`:** `enqueue(db, search, *, now) -> Pairing | None`, `try_match(db, search, *, now) -> Pairing | None`, `expire(db, now) -> { buscas, propostas, ofertas }`. `Pairing = { kind: 'proposta' | 'oferta', match, searches, slot }`.
- **Implementação `PostgresMatchmakingQueue`** (instância `queue`): `pg_advisory_xact_lock(match_rules.bucket_lock_id(bucket_key))` (hash SHA-256 de 64 bits, estável entre instâncias), releitura da busca e do candidato com `FOR UPDATE`, ordem de `match_rules.rank_candidates`, proposta e encerramento das duas buscas na mesma transação. A trava sai no commit: quem chama faz o commit logo depois. As demais travas seguem a ordem global da seção 15.5 (partida → ranking → balde → vaga → busca).
- **Testes de concorrência** (`tests/integration/test_matchmaking_concurrency.py`, conexões paralelas reais num schema dedicado): duas buscas compatíveis criadas ao mesmo tempo terminam pareadas; nove buscas simultâneas formam quatro propostas sem repetir busca; dois avulsos na mesma vaga recebem uma só oferta; o toque duplo em "Quero jogar" (duas sessões que leem o atleta com `db.get`, sem nada que as serialize antes das travas) preenche a vaga uma vez; e, sem a trava do balde, o mesmo cenário deixa as duas buscas esperando e, sem as releituras `FOR UPDATE`, o toque duplo bate no único do elenco (os testes enxergam a corrida).
- **Quando o pareamento roda:** busca nova (`enqueue`), busca devolvida à fila (recusa ou expiração do outro lado), vagas que abrem ou reabrem (`offer_slots`), elo que muda (`standings`, depois de recalcular um ranking), as vagas abertas pelo aceite das condições (`accept_terms` chama `offer_slots`) e a varredura (`rematch`).
- **Titular ativo (correção da revisão, 12/10):** a releitura com `FOR UPDATE` exige busca `ativa`, prazo não vencido e time `ativo` ou conta `active`, tanto na busca corrente quanto nos candidatos e nas ofertas de avulso. Uma busca de titular inativo é ignorada, sem prender a do atleta ativo; não ganha estado novo nem prazo novo e continua sujeita à expiração original.

### 15.2 Varredura (`python -m app.admin_cli sweep [--loop 60]`)

Tarefas da etapa 3 em `services/sweep.py:TASKS`, nesta ordem e depois das da etapa 2: `buscas_expiradas` (24 h), `propostas_expiradas` (2 h; devolve à fila, com o prazo original, o lado que tinha aceitado e tenta parear; uma proposta por vez, com commit), `ofertas_expiradas` (2 h; a vaga vai ao próximo avulso; balde a balde, com commit), `pareamento` (refaz o pareamento balde por balde, com commit por balde), `resultados_vencidos` (seção 12.5; as categorias de ranking do lote são recalculadas uma vez) e `rankings_janela` (partidas que saíram das 52 semanas; seção 12.6). Todas travam com `SKIP LOCKED` ou pela trava do balde, conferem o estado e são idempotentes: rodar de novo não muda nada. Cada tarefa roda na sua transação e uma falha é registrada sem parar as outras. Ordem de travas: seção 15.5.

### 15.3 Implementados na etapa 3

Regras puras e fundação (migração `0009`):

| Função | Uso |
| --- | --- |
| `match_rules.search_expires_at`, `proposal_expires_at`, `offer_expires_at`, `cancel_deadline`, `result_deadline`, `result_window_open`, `effective_search_state`, `effective_match_state`, `match_phase`, `cancel_error`, `validate_terms_start` | prazos e estado efetivo |
| `match_rules.normalize_open_slots`, `max_slots`, `expand_slots`, `slot_total`, `slot_position_matches`, `FORMAT_SIZES` | vagas (RN06) |
| `match_rules.bucket_key`, `bucket_lock_id`, `pairing_rank`, `compatible`, `Candidate`, `rank_candidates` | baldes e ordem do pareamento |
| `match_rules.court_key`, `court_kind_for`, `clean_court_name` | quadras e duplicidade |
| `match_rules.validate_football_score`, `validate_tennis_sets`, `walkover_score`, `scores_agree`, `result_state`, `tennis_sets_from_json`, `other_side`, `Score`, `TennisSet` | placares |
| `match_rules.next_search_state`, `next_match_state`, `next_stat_state`, `validate_stat`, `normalize_contested_fields`, `counted_stat_fields`, `RuleError` (`422`, com `field`), `TransitionError` (`409`) | transições e estatísticas; os dois erros viram resposta nos handlers globais de `app/main.py` (seção 16.1) |
| `scoring.outcome_for`, `team_points`, `tennis_points`, `individual_points`, `position_stat_points`, `in_window`, `window_start`, `is_classified`, `team_record`, `individual_record`, `tennis_record`, `team_order`, `individual_order`, `tennis_order`, `rank_records`, `standing_fields` | pontos, desempates, classificação e elos |
| `match_access.load_match_for(db, match_id, user, *, for_update=False) -> (Match, sides, MatchAccess)`, `match_access`, `match_accesses(db, matches, user, *, sides=None)` (vários de uma vez, em consultas fixas), `load_sides`, `side_users`, `side_actors`, `guest_users`, `audience`, `subject_names`, `can_read_chat`, `can_write_chat` | papéis, destinatários e chat |
| `match_events.post_event(db, match_id, event_type, body, *, side=None, author_id=None, payload=None, now=None)`, `MATCH_EVENT_TYPES` | faixas do chat |
| `people.people_out(db, viewer, user_ids) -> {id: Person}` | pessoas compactas; o avatar some com bloqueio (nos dois sentidos) e em conta inativa |
| `queue.enqueue`, `try_match`, `offer_slots`, `accept_proposal`, `decline_proposal`, `dissolve_proposal`, `requeue`, `accept_offer`, `decline_offer`, `release_offer(…, reason=)`, `expire_searches`, `expire_proposals(…, commit=)`, `expire_offers(…, commit=)`, `expire`, `rematch`, `lock_bucket`, `proposal_bucket` | fila (seção 15.1) |
| `match_lifecycle.open_declared_slots`, `close_match_slots(db, match, *, now, actor_id=None)`, `apply_final_score`, `close_due_results` | vagas na agenda e no cancelamento, resultado final e prazo |
| `schemas.matches`: entradas (`SearchInput`, `TermsInput`, `ResultInput`…), saídas (`MatchCardOut`, `MatchDetailOut`, `ProposalOut`, `SlotOfferOut`, `PlayBoardOut`, `MatchMessageOut`, `LineupOut`, `RankingPageOut`…) e `score_out`, `court_out` | formas compartilhadas |

Serviços das frentes (as assinaturas combinadas na fundação, como ficaram):

| Função | Módulo |
| --- | --- |
| `match_cards(db, user, matches, *, now) -> list[MatchCardOut]`, `match_detail(db, user, match, *, now, sides=None, access=None) -> MatchDetailOut`, `sides_out(db, viewer, sides, *, my_sides=None) -> {match_id: [MatchSideOut]}`, `permissions_for(match, access, facts, *, now)`, `needs_my_action`, `stat_locked(stat)` (leituras de todas as frentes; o elo do lado é o gravado no pareamento) | `services/match_views.py` |
| `create_search(db, user, data, *, now) -> SearchCreatedOut` e `create_search_with_status` (devolve também se a busca é nova), `cancel_search`, `my_searches`, `my_proposals`, `searches_out(db, user, rows, *, now)`, `proposals_out(db, user, matches, *, now)`, `respond_to_proposal`, `play_board(db, user, *, now) -> PlayBoardOut`, `my_matches`, `settle` (aplica o vencimento de uma retenção antes de uma escrita), `team_ensure_no_active_match`, `cancel_team_searches` | `services/matchmaking.py` |
| `propose_terms`, `accept_terms`, `set_booking`, `cancel_match`, `register_walkover`, `withdraw_walkover`, `contest_walkover`, `decide_walkover`, `walkover_queue`, `messages_page`, `post_message`, `get_match` | `services/matches.py` |
| `catalog`, `suggest_court`, `court_queue`, `decide_court`, `court_duplicates(db, court) -> list[Court]`, `pending_count`, `usable_for_terms` | `services/courts.py` |
| `slot_offers(db, user, *, now) -> list[SlotOfferOut]` (a única implementação das ofertas; a placa e `SearchCreated` a usam), `accept_slot`, `decline_slot`, `update_slots`, `set_open_slots(db, match, side, slots, *, now, actor_id) -> SlotsChange`, `plan_slot_changes`, `slots_error`, `remove_guest(db, match, user_id, *, now, actor_id, side=None)`, `delete_guest` | `services/slots.py` |
| `report_score`, `set_attendance`, `send_my_stats`, `review_stat`, `contest_stat`, `match_lineups`, `lineups_out(db, viewer, match, *, now, sides=None, access=None, only_user_id=None)`, `points_preview(*, outcome, stat, final)`, `rankings_page(db, viewer, params) -> RankingPageOut` | `services/results.py` |
| `recalculate_for_match(db, match, *, now, positions=())`, `recalculate_rankings(db, keys, *, now, touch=False) -> int`, `recalculate_outside_window(db, now) -> int`, `ranking_keys_for_match`, `RankingKey`, `ranking_lock_id` | `services/standings.py` |
| `required_matches(cuts, ranking, sport)` (partidas para classificar, dos cortes da versão atual) | `services/rankings.py` |

### 15.4 Posição do atleta e o recálculo de partidas já contabilizadas

`recalculate_for_match(…, positions=)` recebe as posições **anteriores** de uma atuação que mudou, para recalcular também o ranking de onde ela saiu. Só três rotas alteram a posição registrada numa partida (`match_lineups.position`), e as três já passam `positions` quando a partida está `realizada`: `PUT /matches/{id}/attendance` (a posição informada pelo representante), `PUT /matches/{id}/my-stats` (a do atleta) e `PUT /matches/{id}/stats/{stat_id}/review` (a corrigida na revisão). Nenhuma outra rota muda a posição: o avulso entra com a posição da vaga antes do início, e a remoção de avulso só vale antes do início, portanto antes de qualquer contabilização. Cobertura em `tests/integration/test_results_flow.py` (mudança de posição pelas três rotas).

### 15.5 Ordem global de travas da etapa 3

Toda transição da etapa 3 pede as travas nesta ordem, e nenhuma pede uma de nível acima depois de segurar uma de nível abaixo, então não há ciclo de espera (impasse). Junta a ordem da frente de resultado (partida → ranking → balde → busca) e a das vagas (balde → partida → vaga → busca), que se contradiziam: o balde fica **depois** da partida e do ranking, e a vaga **depois** do balde. A ordem da etapa 2 (evento → time → inscrições → comprovantes, [0003, seção 19.1](0003-times-campeonatos.md#191-ordem-global-das-travas)) e esta compartilham só o time e não se cruzam em nenhuma rota.

| Nível | Trava | Modo | Quem trava |
| --- | --- | --- | --- |
| 1 | time (`teams`) | `FOR SHARE` (busca nova) ou `FOR UPDATE` (encerrar) | criar busca de time e encerrar o time |
| 2 | partida (`matches`) | `FOR UPDATE` | toda transição da partida (`load_match_for(…, for_update=True)`), o aceite e a recusa da proposta, a decisão de quadra e de W.O., o recálculo; a varredura trava em lote com `SKIP LOCKED` |
| 3 | ranking (`pg_advisory_xact_lock(ranking_lock_id)`) | exclusiva | `recalculate_rankings`, por categoria, em ordem de `RankingKey.sort_key` |
| 4 | balde (`pg_advisory_xact_lock(bucket_lock_id)`) | exclusiva | quem pareia ou oferece: `try_match`, `offer_slots`, a dissolução de uma proposta (o balde dela, `proposal_bucket`), o ajuste de vagas, a recusa de oferta e o vencimento de uma oferta; vários baldes numa transação, só em ordem crescente de `bucket_lock_id` |
| 5 | vaga (`match_slots`) | `FOR UPDATE`, por id | aceitar, recusar e liberar oferta, ajustar vagas, fechar vagas no cancelamento, remover avulso |
| 6 | busca (`match_searches`) | `FOR UPDATE`, por id | pareamento, aceite da proposta, oferta, cancelamento; fora do balde só se trava a busca retida (`pareada`) ou a própria busca do pedido |

- **Consequências no código:** `update_slots` e `decline_slot` travam a partida e só depois o balde (antes era o contrário); `settle` (vencimento de uma oferta lida por `create_search` ou `cancel_search`) e `queue.expire_offers` pegam o balde da cidade antes da vaga; `queue.dissolve_proposal` pega o balde da proposta antes das buscas; `accept_terms` chama `queue.offer_slots` com a partida já travada (nível 2 → 4).
- **Varredura:** `expire_offers` trabalha balde a balde, em ordem crescente do id da trava, com commit entre os baldes; `expire_proposals`, uma proposta por vez, com commit entre elas; `rematch`, balde a balde; `close_due_results` junta as categorias de ranking do lote e recalcula cada uma **uma vez** (as partidas do lote já estão travadas, e `recalculate_rankings` ordena ranking e balde). As tarefas passam `db.commit` (`sweep.expire_proposals`, `sweep.expire_offers`).
- **Dentro do balde**, a busca que chega é travada antes das vagas candidatas (`_offer_to_walkin`) e `offer_slots` trava as vagas antes das buscas: sem ciclo, porque quem trava vaga `aberta` ou busca `ativa` fora do balde não existe (o cancelamento da partida trava só vagas e as buscas `pareada` das ofertas).
- **Testes com conexões reais** (`tests/integration/test_lock_order_stage3_concurrency.py`; os três primeiros reproduzem o `DeadlockDetected` da ordem antiga): a varredura de ofertas vencidas contra o representante que fecha a vaga; o cancelamento de uma busca com oferta vencida contra o mesmo fechamento; o segundo aceite das condições (que abre e oferece as vagas) contra o ajuste de vagas da mesma partida; e a varredura que confirma proposta por proposta. Os demais testes de concorrência da etapa (`test_matchmaking_concurrency.py`, `test_matchmaking_routes_concurrency.py`, `test_slots_concurrency.py`, `test_results_concurrency.py`, `tests/integration/partida/test_concurrency.py`) continuam valendo.

#### Extensão das etapas 4 e 5 (campeonatos e corrida)

A ordem completa, juntando a de eventos ([0003, 19.1](0003-times-campeonatos.md#191-ordem-global-das-travas)) e a desta seção, é: conta do organizador → permissão → **evento** → time → inscrições → comprovantes → **partida** (a partida e a que ela alimenta, por `id` crescente) → ranking → balde → vaga → busca. O organizador sempre começa pelo evento, e o time já vinha depois dele em 19.1 (nível 4), então os dois quadros concordam e nenhuma rota pede um nível acima do que já segura.

| Rota ou tarefa | Travas, na ordem |
| --- | --- |
| Sortear e trocar lugares (`POST` e `PATCH …/bracket`) | evento `FOR UPDATE` → chaveamento |
| Confirmar o chaveamento (`POST …/bracket/confirm`) | evento `FOR UPDATE` → chaveamento → inscrições do evento `FOR UPDATE` (por `id`) → partidas novas (linhas inseridas, ninguém as trava ainda) |
| Agendar (`PUT /organizer/matches/{id}/schedule`) | evento `FOR UPDATE` → partida `FOR UPDATE` (lê as outras sem travar; o evento serializa o conflito de agenda) |
| Decidir (`POST …/result-decision`) | evento `FOR UPDATE` → partida → **partida seguinte** (`championship_lifecycle.lock_following`) → ranking → balde → busca |
| Informar o placar que confirma (`PUT /matches/{id}/result`) | partida → partida seguinte (`lock_following`, só quando os placares batem) → ranking → balde → busca; depois **tenta** o evento com `SKIP LOCKED` para encerrá-lo (nunca espera) |
| Encerrar o campeonato (`finish_event`) | o evento `FOR UPDATE` já segurado (pelo organizador, pela tentativa acima ou pela varredura com `SKIP LOCKED`); lê as partidas sem travar; ranking do tênis, se o bônus vale |
| Cancelar o evento | evento `FOR UPDATE` → inscrições → partidas abertas, por `id` |
| Registrar a marca (`POST /me/runs`) | evento `FOR SHARE` → inscrição `FOR UPDATE` (só na prova) → ranking `corrida_<km>` (trava consultiva) |
| Remover a marca (`DELETE /me/runs/{id}`) | a linha da marca `FOR UPDATE` → ranking `corrida_<km>` (a marca é folha: quem a segura nunca espera por evento, partida ou inscrição) |
| Varredura `campeonatos_encerrados` / `rankings_janela` | evento com `SKIP LOCKED`, sem esperar / só os rankings, na ordem de `RankingKey.sort_key` |

**Ajuste da conciliação.** O avanço do vencedor travava a partida seguinte *depois* do ranking, do balde e da busca (`results._confirm` e `championship.decide_result` recalculavam o ranking antes de `after_score`), isto é, pedia uma trava de partida segurando níveis mais baixos. Não havia ciclo alcançável (quem segura essa partida e espera o ranking não existe: ela só recebe resultado depois de agendada, e agendar exige os dois lados), mas a ordem estava fora do contrato. Agora `championship_lifecycle.lock_following` trava a partida seguinte antes de `recalculate_for_match`; `advance_winner` a trava de novo na mesma transação, sem custo. Provado pela **ordem do SQL** (`tests/integration/sql_trace.py`): `test_a_score_locks_the_match_it_feeds_before_it_locks_the_rankings` (placar confirmado e decisão do organizador, em `test_championship_concurrency.py`) e `test_a_mark_takes_its_locks_in_the_global_order_and_the_ranking_last` (corrida, em `test_runs_concurrency.py`). Os testes de concorrência real de campeonato e de corrida continuam valendo.

## 16. Divisão por frente na etapa 3 (executada)

**Backend** (quatro frentes paralelas, sem editar os mesmos arquivos; integradas num único passo, seção 16.1):

- **Pareamento e propostas:** seção 9 em `app/routers/matchmaking.py`, `app/services/matchmaking.py` (e `app/schemas/matchmaking.py`, se precisar de formas próprias).
- **Partida, condições, quadras, chat, cancelamento e W.O.:** seções 10 e 11.1 em `app/routers/matches.py`, `app/routers/courts.py`, `app/services/matches.py`, `app/services/courts.py` e `app/services/match_views.py`; a denúncia de mensagem em `app/routers/social.py` (e `app/schemas/social.py`); os contadores `court_suggestions` e `walkover_disputes` em `GET /admin/queue-counts` (`app/routers/organizers.py`, depois da integração da etapa 2).
- **Avulso e vagas:** seção 11.2 em `app/routers/slots.py` e `app/services/slots.py`.
- **Resultado, estatísticas, contestação e ranking:** seção 12 em `app/routers/results.py`, `app/services/results.py` e `app/services/standings.py`, e a tarefa `rankings_janela` em `app/services/sweep.py`.
- **Fora das frentes de partida:** `ensure_closable` (`app/services/teams.py`) passa a recusar, com a mensagem da seção 3 de 0003, o time com partida `proposta`, `combinando` ou `agendada`, e o encerramento cancela as buscas abertas do time (ajuste a combinar com quem mantém `teams.py`).
- Nenhuma frente cria migração: o esquema está completo na `0009`. Necessidades novas são relatadas ao orquestrador.

**Integração do backend** (um passo depois das quatro frentes): handler global dos erros de regra em `app/main.py`; ordem global de travas (seção 15.5); aceite das condições que oferece as vagas; `slots.slot_offers` como implementação única das ofertas; `permissions.send_stats`; aviso `oferta_retirada`; deduplicação das categorias de ranking em `close_due_results`; testes de concorrência da ordem de travas; fluxo real só pela API.

**Web** (consome este contrato):

- **Placa e busca:** `PlayPage` (abas, chave Com meu time | Avulso, posições, linha do elo, botão com tempo decorrido), `PrepareSearchSheet` (V2) e o ponto menta da navegação (`GET /me/play`).
- **Proposta:** `ProposalDialog` em tela cheia, com contagem regressiva, Recusar, Aceitar e "Responder depois"; oferta de vaga do avulso ("Quero jogar").
- **Partida e chat:** `MatchPage` (P2 + C1): cabeçalho, `ConditionsCard`, `TermsSheet` (Date Picker, horário de 15 min, `CourtPicker` com sugestão, quem reserva), reserva, cancelamento, W.O., `MatchChat` com leitura a cada 4 s, faixas, braçadeira e denúncia.
- **Resultado:** cartão R4/S1 no topo da partida (placar, tênis por sets, Revisar elenco, Suas estatísticas com prévia, contestação, divergência).
- **Ranking real:** tela Ranking com Times | Individual, formato, posição e tênis; "Suas modalidades" lendo `GET /me/standings`.
- **Notificações:** os tipos da seção 13 na tela atual, ao lado dos pedidos para seguir.
- **Administração:** filas "Quadras sugeridas" e "W.O. contestados" no Menu, ao lado das demais, com os contadores.

### 16.1 Desvios registrados na integração dos backends

Já incorporados às seções 7 a 15 (os da fundação estão no próprio texto). Onde um desvio mudou uma resposta, a web e o Expo seguem esta tabela:

| Seção | Desvio | Motivo |
| --- | --- | --- |
| 9.2 | `GET /me/matches?scope=`: `proximas` (padrão) ou `historico`; outro valor responde `422` de validação. As duas respostas são `{ items, next_cursor }`, e `proximas` não pagina (até 100 itens, partidas sem data primeiro, `next_cursor: null`). | Uma só forma de resposta para os clientes; o contrato dava `{ items }` numa e `Page` na outra. |
| 7, 9 a 12 | Um erro de regra (`RuleError`) responde `422 { detail, fields }` com a **mensagem específica** em `detail` (não "Revise os campos informados."); `fields` traz `{ field, message }` quando a regra nomeia o campo e `[]` quando não nomeia. `TransitionError` responde `409 { detail }`. Um handler global (`app/main.py`) cobre as cinco frentes; o `422` da validação de entrada do Pydantic não muda. Os `422` de categoria do ranking e de cursor inválido (`HTTPException`) têm só `{ detail }`. | Antes havia três tratamentos (no roteador, numa classe de rota e em cada rota), um deles com `fields: [{ field: "" }]` para erro sem campo. |
| 10.4 | Rejeitar uma sugestão **sem duplicata** cancela as condições **pendentes** que usavam a quadra (`cancelada`; quem propôs propõe de novo); as condições já aceitas e a partida ficam como estão ("Sugestão recusada" na web). Com duplicata, pendentes e aceitas passam a apontar para a quadra publicada. | Uma proposta pendente com quadra recusada não poderia mais ser aceita. |
| 10.4, 11.1 | A faixa `quadra_sugerida` também registra a **decisão** da administração (sem autor; `payload.decision` = `publicada` ou `rejeitada`), na partida de origem enquanto o chat aceita escrita. | Sem um tipo novo de faixa; o texto muda com a decisão. |
| 10 a 12 | Mensagens que o contrato não listava. **Partida:** `404 Condições não encontradas.`, `409 O W.O. só vale para partidas agendadas.`, `409 Num campeonato, o W.O. é decidido pelo organizador.`, `409 Não há W.O. para contestar.`, `403 Só o lado ausente contesta o W.O.`, `409 O W.O. já foi contestado.`, `409 O prazo de 48 h para contestar o W.O. acabou.`, `422 Use só after ou só before.`, `422 Escreva uma mensagem de 1 a 1000 caracteres.`. **Quadras:** `403 Só os representantes sugerem quadras.`, `409 Só dá para sugerir quadra enquanto a partida está sendo combinada ou agendada.`, `422 Só se indica a quadra duplicada ao rejeitar.`, `422 Descreva o motivo com pelo menos 5 caracteres.` (ao publicar com motivo). **Avulso:** `403 Só os representantes do time do avulso o removem da partida.`. **Resultado:** `403 Só os representantes informam o placar.` (e `… registram a presença.`, `… revisam as estatísticas.`, `… contestam as estatísticas.`), `403 Só quem joga a partida envia estatísticas.`, `403 Só o representante do time do atleta revisa a estatística.`, `403 Só o representante do time adversário contesta a estatística.`, `404 Estatística não encontrada.`, `409 As estatísticas são só do futebol.`, `422 Cada atleta aparece uma vez.`, `422 O futebol não tem sets: informe os gols.`, `422 O placar do tênis é informado em sets.`, `422 Escolha se o ranking é de times ou individual.`, `422 Distância inválida.`, `422 Cursor de paginação inválido.`. As validações de data, de sets e de vagas vêm de `match_rules` (campos `starts_at`, `sets.N` e `open_slots`). | O contrato listava as mensagens principais; as demais saem do código, em português e sem dados sensíveis. |
| 11.2 | `PUT /matches/{id}/slots`: o corpo **substitui** a declaração do lado inteiro, e posição ausente vale `0` (`{ "open_slots": {} }` fecha todas as vagas do lado). O `404`, o `403` e o `409` saem antes de qualquer trava. | `Partial<OpenSlots>` não dizia se ausente era "manter" ou "zero"; substituir é o que `normalize_open_slots` já faz (posições ausentes valem `0`). |
| 12.4 | Estatística **travada depois da revisão final**: `PUT /matches/{id}/my-stats` numa estatística `revisada` que já foi contestada responde `409 Esta estatística já foi contestada e revisada; a revisão é final.`, e `permissions.send_stats` é falso nesse caso (como na `contestada`). A permissão e a rota dizem o mesmo (matriz de teste em `tests/integration/partida/test_permissions_match_routes.py`). | A revisão depois da contestação é final (7.1); sem isso o atleta reabriria a estatística. |
| 12.2, 12.4 | `GET /matches/{id}/stats` e as respostas de presença listam o **elenco inteiro** dos dois lados: representantes e membros ativos dos times e os avulsos escalados (avulso removido não aparece), com `present: null` e `stat: null` para quem ainda não foi registrado; não só quem já tem atuação. A posição é a da atuação, senão a do elenco. | A tela "Revisar elenco" precisa dos que ainda não enviaram nada. |
| 12.6 | `recalculate_rankings(db, keys, *, now, touch=False) -> int` devolve quantas linhas de `standings` mudaram (o contrato dizia `None`), e `recalculate_outside_window(db, now) -> int` faz o mesmo para a janela. A tarefa de varredura `rankings_janela` é a segunda, idempotente (carimba as linhas das categorias que olhou). `rankings.required_matches(cuts, ranking, sport)` lê dos cortes quantas partidas classificam. | A contagem serve à varredura e aos testes; `required` do ranking sai dos cortes, não de uma constante. |
| 12.6 | Bloqueados aparecem nos rankings: a linha continua e só o **avatar** some (`people_out`, nos dois sentidos de bloqueio e em conta inativa). | Mesmo tratamento do resto do app; o ranking é público entre membros. |
| 7.4, 10.1 | Decisões de `match_views`: (a) `MatchSideOut.tier` é o elo gravado em `match_sides.tier` no pareamento, não o atual; (b) `result.points` (a pílula "+3 pts") só vem para o elenco (`representante`, `membro`, `atleta`) com resultado final, e é `null` para avulso, organizador e administração (o avulso pontua no ranking individual); (c) `permissions.suggest_court` e `manage_slots` só valem em partida **amistosa** (`suggest_court` em `combinando` e `agendada`; `manage_slots` só para representante, até o início); (d) `needs_my_action` conta proposta ou condições a aceitar, placar a informar ou corrigir, W.O. a contestar e estatística a enviar. | O cartão e a placa mostram o que foi combinado naquele momento, e cada ação só aparece para quem pode executá-la. |
| 12.3 | **Relato cego** (decisão do orquestrador em 12/10, que revê a de manter o placar visível): `result.reports` só mostra o placar do **outro** lado depois que o meu lado informou o meu, na divergência ou com o resultado decidido; antes, o relato existe com `score: null`. `ScoreReportOut.score` passa a ser opcional. | Copiar o placar do adversário não confirma nada: a confirmação precisa de dois relatos independentes. A web (cartão de resultado) já lia o relato do outro lado só como "já informou". |
| 7.4, 10.1 | `MatchSideOut.declared_slots` (`OpenSlots | null`): as vagas que o lado declarou na busca, só enquanto a partida é `proposta` ou `combinando`; depois, o que vale são as `slots`. | A folha "Vagas para avulsos" em `combinando` precisa mostrar o declarado, que ainda não virou vaga. |
| 10.1, 10.4 | `permissions.suggest_court` é falso depois do início da partida, e `POST /courts/suggestions` responde `409 Só dá para sugerir quadra antes do início da partida.` | Como as condições (`terms_open`): a quadra sugerida depois do horário não serve a nada, e a permissão e a rota dizem o mesmo (matriz `test_permissions_match_routes`). |
| 12.5 | `close_due_results` recalcula cada categoria de ranking **uma vez por lote** (a união das chaves das partidas fechadas), inclusive no fim do prazo de uma `realizada` (que não muda contagens, mas mantém o contrato). | Uma leitura por categoria em vez de uma por partida, e a ordem de travas da seção 15.5. |
| 13 | Tipo novo `oferta_retirada` (ao avulso que perde uma oferta pendente porque o representante reduziu as vagas ou a partida foi cancelada). | Sem o aviso, o avulso continuava esperando uma vaga que já não existia. |
| 14 | `vaga.oferta_devolvida` leva o `actor` de quem reduziu as vagas ou cancelou a partida (só a varredura é automática). | A auditoria diz quem tirou a oferta. |
| 15.5 | A ordem global de travas inverte a das vagas (partida → balde → vaga, e não balde → partida) e põe o balde da proposta antes das buscas na dissolução. | Os três impasses reproduzidos em `test_lock_order_stage3_concurrency.py`. |

### 16.2 Desvios registrados na integração da web

Os tipos comuns da partida (`MatchCard`, `MatchDetail`, `MatchSideOut`, `ScoreOut`, `CourtOut`, `MatchPermissions`, `MatchResultOut`, `WalkoverOut`, `MatchSlotOut`, `MatchMessageOut`...) e as rotas da partida têm um dono só, `web/src/api/matches.ts`; `matchmaking.ts`, `results.ts` e `admin.ts` importam deles (`ResultMatch` é um `Pick` do `MatchDetail`; `DisputeMatch`, da fila de W.O., é um `Pick` do `MatchCard`). `sideName` e `sideOf` ficam em `web/src/data/match.ts`; `useNow(intervalMs, enabled)`, em `web/src/hooks/useNow.ts`; o interruptor é o `Switch` do shadcn (`components/ui/switch.tsx`).

| Seção | Desvio | Motivo |
| --- | --- | --- |
| 9.3 | A proposta abre em tela cheia **dentro da moldura do app** (`DialogContainerProvider`, `data-slot="app-frame"`), não na viewport; "Responder depois" mantém a proposta na placa e nas notificações (só na memória da sessão) até o prazo. A placa lê `GET /me/play` ao montar, ao voltar o foco, ao entrar em Jogar ou no Início e a cada 15 s enquanto há atenção. | No desktop o app é um quadro de 390 px; o diálogo precisa respeitar a moldura. A placa é a única leitura que acende o ponto menta. |
| 9.3 | O botão redondo "Com meu time" abre a folha **"Preparar busca"** (V2: formato, "O time está completo?" e vagas por posição); Avulso e Tênis buscam direto, com o perfil da modalidade. Durante a busca o botão pulsa, conta o tempo e, tocado, pede a confirmação para cancelar. Enquanto o aceite do outro lado não chega, a tela mostra "Aguardando o adversário" e vai à partida quando a placa notar o aceite dos dois. | Fluxo do protótipo V2; sem notificação em tempo real, a placa relê. |
| 13 | **Destino das notificações:** `proposta_partida`, `proposta_encerrada`, `vaga_encontrada`, `oferta_retirada` e o `proposta_aceita` de um lado só abrem a **placa** (`play` com `matchId`: a proposta ou a oferta *daquela* partida, e não a primeira da fila); `proposta_aceita` com `complete: true`, `vaga_preenchida`, `condicoes_propostas`, `partida_agendada`, `partida_cancelada`, `wo_registrado`, `wo_decidido`, `resultado_partida`, `resultado_divergente` e `estatistica_contestada` abrem a **tela da partida** (`match`); `wo_contestado` abre a partida para quem registrou e a fila **"W.O. contestados"** para a administração; `removido_da_partida` e `quadra_decidida` **não têm destino** (quem foi removido perde o acesso; a quadra não tem tela). A aba JOGAR fica acesa nas telas da partida; as filas acendem Perfil. | A seção 13 dizia "Proposta / partida"; a web escolheu o destino mais útil de cada aviso. `oferta_retirada` ficou fora dos 16 tipos do contrato original (criado na integração do backend). |
| 12.6 | **Ranking:** chips **Futebol | Tênis | Corrida** e, no futebol, as abas **Times | Individual** no estilo `track` (`Tabs variant="track"`), com formato e posição em chips; a placa **"Sua posição"** (`forest`) mostra o time ou a modalidade do titular com o elo ou a classificação ("1/3", "1 de 3 partidas"); a lista mostra cada linha com o brasão do elo, a marca **"Você"** ou **"Seu time"** e, no cabeçalho, **"N classificados · X vagas de Lendário"** (a parte de Lendário só quando `legend_slots > 0`). Quem está em classificação não aparece na lista nem ganha elo. | Não havia protótipo do Ranking real; segue os cartões e a placa dos protótipos aprovados. |
| 2, 12.6 | O Início lê `GET /me/standings` no cartão "Seu elo" (elo, pontos ou "n de 3 partidas") e a próxima partida agendada (a de horário mais próximo que ainda não começou) no cartão "Próxima partida", que abre a tela dela; sem partida, o estado vazio. | Dados reais; o cartão dizia "Nenhuma partida agendada" mesmo com uma agendada. |
| 10.1 | A tela da partida fixa no topo o **cartão de resultado** (`MatchResultCard`) acima do cartão de **condições**; o W.O. mostra o estado no cartão de resultado e os botões (registrar, retirar, contestar) ficam só nas condições. A área fixa rola por dentro (até 62% da altura depois do início) e o chat ocupa o resto. "Conversar" (divergência) leva o foco ao campo do chat. | Uma informação em um lugar só; a tela cabe em 320 px. |
| 11.1 | Denúncia de mensagem pelo `ReportForm` (`target: 'match_message'`); na moderação, a prévia traz a partida, o autor e o texto (ou "Mensagem já removida"), o rótulo é "Mensagem da partida" e a decisão "Remover mensagem" avisa que o texto some para todos. A linha "Denúncias" do Menu mostra o contador `queue-counts.reports`. | Moderação única; o contador existia no contrato e não aparecia. |
| 12.4 | Divergência: "Vocês informaram 2 × 0; Tigres do Lago informou 1 × 1" (no tênis, "Você informou…"), em vez de "2 × 0 contra 1 × 1 dos Tigres". | O "dos" não combina com nomes de time no singular (achado no navegador). |
| 12.3 | O cartão de resultado nunca mostra o placar do outro lado antes do meu: "Ferrugem FC já informou o placar. Informe o seu: se os dois baterem, o resultado é confirmado." | Relato cego (seção 12.3). |

## 17. Uso nas partidas de campeonato (etapa 4)

> **Estado (backend e web implementados e integrados em 12 de outubro de 2026; Expo na etapa 6):** as partidas de campeonato reaproveitam a partida, o chat e o cartão de resultado das seções 7 a 15. O chaveamento que as cria, o agendamento do organizador e a decisão da divergência estão em [0003, seção 21](0003-times-campeonatos.md#21-etapa-4--chaveamento-agenda-e-decisão-do-organizador-fases-6-e-7); aqui fica o que muda na partida. A web consome este contrato: na `MatchPage` de campeonato não há "Propor outra" nem aceite, o organizador escreve no chat com a etiqueta "Organizador" e "Agendar", "Reagendar" e "Decidir resultado" seguem `permissions.schedule_match` e `permissions.decide_result`. O Expo consome estes contratos desde a etapa 6.

### 17.1 O que a partida de campeonato é

Uma linha de `matches` com `origin = 'campeonato'`, `event_id`, `round_number` (fase ou rodada), `bracket_position`, `next_match_id` e `next_match_side`. Nasce **`combinando`**, sem proposta, quando o organizador confirma o chaveamento, com **0, 1 ou 2 lados** (`match_sides`): a eliminação cria todas as fases de uma vez e os lados das fases seguintes são preenchidos pelo vencedor de cada jogo (0003, 21.5). Sem lados definidos, só o organizador e a administração enxergam a partida.

| Tema | Amistoso | Campeonato |
| --- | --- | --- |
| Criação | busca e proposta de 2 h | confirmação do chaveamento |
| Data, hora e quadra | condições propostas e aceitas pelos dois lados | **só o organizador** (`PUT /organizer/matches/{id}/schedule`, horário livre, conflito de 2 h) |
| `terms.current`, `terms.pending`, `booking` | condições aceitas e reserva | **sempre `null`**: a data e a quadra estão em `starts_at` e `court` |
| Cancelar | os elencos, até 24 h antes | **só o evento** (cancelar o evento cancela as partidas abertas); `409 Partidas de campeonato são canceladas pelo organizador.` |
| W.O. | o lado presente registra; o ausente contesta; a administração decide | **o organizador decide** (`POST /organizer/matches/{id}/result-decision`) |
| Placar | cartão R4: cada lado informa; iguais confirmam | o **mesmo cartão**; **divergente ou sem placar depois de 48 h, o organizador decide**; na eliminação, sem empate |
| Prazo de 48 h sem resultado | `sem_resultado` | **continua `agendada`** até o organizador decidir (`close_due_results` só fecha amistosos) |
| Chat | os dois elencos e os avulsos | os dois elencos **e o organizador** |
| Vagas e avulsos | sim | não |

### 17.2 Papéis, permissões e chat

- **`organizador`** é o dono do evento (`events.organizer_user_id`), reconhecido por `match_access` quando não é do elenco de um dos lados. `side` é `null` e ele **não age pelo lado** (`acts_for_side` falso): não aceita nem propõe condições, não informa placar, não registra presença nem estatísticas. Quem é, ao mesmo tempo, membro de um time da partida mantém o papel de membro na leitura; as rotas do organizador (agendar e decidir) conferem o **dono do evento**, não o papel.
- **Chat.** O organizador lê e escreve desde `combinando` (até o fim da partida, depois só lê), como `author_role: 'organizador'` e `side: null`. A administração só lê. Estranhos recebem `404`. A denúncia de mensagem (`match_message`) vale para ele como para os demais leitores.
- **`MatchPermissions`** ganha dois campos:

```ts
interface MatchPermissions {
  // …os da seção 10.1…
  schedule_match: boolean   // organizador: os dois lados definidos e (combinando, ou agendada antes do início)
  decide_result: boolean    // organizador: agendada e já iniciada (a decisão pode ser recusada com 409 pela regra de 0003, 21.5)
}
```

  Para os elencos de uma partida de campeonato, `propose_terms`, `accept_terms`, `suggest_court`, `confirm_booking`, `cancel`, `register_walkover`, `withdraw_walkover` e `contest_walkover` são sempre falsos; `report_result`, `attendance` e `send_stats` seguem as regras do amistoso. As rotas respondem `409` com as mensagens do campeonato: `Num campeonato, o organizador define data, horário e quadra.` (propor condições e sugerir quadra), `Partidas de campeonato são canceladas pelo organizador.` e `Num campeonato, o W.O. é decidido pelo organizador.`
- **`needs_my_action`** do organizador: a partida está sem data com os dois lados definidos, ou tem placar divergente, ou passou das 48 h sem resultado. Dos elencos: as regras de sempre (informar o placar, enviar estatísticas…).

### 17.3 Estados e fases

As transições da seção 7.3 valem. Em campeonato: `combinando` significa "aguardando a agenda do organizador" (ou o adversário); `combinando → agendada` é o primeiro `schedule`; `agendada → realizada` por placares iguais; **`agendada → encerrada` por decisão do organizador** (divergência, prazo ou W.O.); `realizada → encerrada` pela varredura, 48 h depois do início. `sem_resultado` não existe em campeonato. Cancelar o evento leva `combinando` e `agendada` a `cancelada`. A fase `divergente` do cartão S1 espera a decisão do organizador, sem prazo.

Placa do Jogar (`GET /me/play`): a partida de campeonato em `combinando` **não** acende o ponto menta (`attention`), porque não há nada para os elencos combinarem.

### 17.4 Resultado e divergência

- Os elencos informam o placar pelas rotas de [12.2](#122-rotas) (`PUT /matches/{id}/result`) como num amistoso. **Placares iguais** confirmam na hora (`realizada`), recalculam os rankings e, na eliminação, **levam o vencedor** à partida seguinte (0003, 21.5).
- **Eliminação simples não tem empate:** `422 Na eliminação simples não há empate. Informe o placar final com o vencedor (some os pênaltis, se houver).` (campo `goals_a`). O todos contra todos aceita empate.
- **Placares diferentes:** os elencos recebem `resultado_divergente` e o organizador, `divergencia_para_decidir` (0003, 21.6). A partida **fica `agendada`** com a fase `divergente`; os lados podem corrigir o próprio placar até o fim das 48 h, e o organizador decide a qualquer momento (sem prazo para ele).
- **Decisão** (`POST /organizer/matches/{id}/result-decision`, `{ score, justification }`): placar final com `result_source = 'organizador'`, `result_decided_by_id`, `result_decided_at` e `result_decision_reason` (a **justificativa**, de 5 a 500 caracteres, visível aos dois times em `MatchDetail.result.decision_reason`), partida `encerrada`, `result_decisions`, `audit_log` (`resultado.decidido`), recálculo dos rankings, avanço do vencedor, faixa `resultado_decidido` no chat e `decisao_registrada` aos dois elencos. Depois dela, os lados não informam mais placar (`409`).
- **Prazo vencido:** depois de 48 h do início sem placar confirmado (nenhum placar, ou só um), o organizador decide da mesma forma (`kind: 'prazo'`). Antes disso, sem divergência: `409 Os times ainda podem informar o placar…`.

### 17.5 W.O. no campeonato

Os elencos não registram W.O. O organizador decide depois do início com `walkover_absent_side` (e a justificativa), sem `score`: o lado presente vence por 3 × 0 (futebol) ou 6-0 6-0 (tênis), a partida vai a `encerrada` e a linha de `result_decisions` tem `kind = 'wo'`. A partida guarda `walkover_absent_side`, `walkover_registered_by_id` e `walkover_registered_at` (o organizador), sem contestação nem decisão da administração (`walkover_decision` fica nulo): na classificação individual, quem estava no lado ausente não pontua e o lado presente ganha a vitória, como no amistoso. Sem restrição automática no MVP (decisão de 12 de outubro).

### 17.6 Ranking e bônus do tênis (RN16)

Uma partida de campeonato conta no ranking como qualquer outra (`realizada` ou `encerrada`, janela de 52 semanas pelo `starts_at`). O **bônus** (campeão +40, vice +20, semifinalistas ou 3º e 4º +10, só com 4 ou mais inscrições confirmadas) é gravado em `event_placements.bonus_points` quando o evento encerra; `standings._tennis_records` soma o bônus dos eventos encerrados dentro da janela (`TennisRecord.bonus`) e a pontuação do tênis passa a ser `10 × vitórias + bônus`. O gancho comentado da M4 foi preenchido. O bônus conta enquanto o `awarded_at` do evento está dentro das 52 semanas e **sai da janela por conta própria**, depois das partidas do mesmo atleta: por isso `standings.recalculate_outside_window` (`rankings_janela`) também recalcula o ranking do tênis quando há um bônus (`bonus_points > 0`) que saiu da janela desde a última gravação, mesmo que nenhuma partida tenha saído (conciliação da etapa 4 com a etapa 3; teste `test_a_championship_bonus_leaves_the_tennis_points_when_its_event_leaves_the_window`). Um atleta com bônus e sem partida confirmada na janela não tem linha: o bônus acompanha as partidas, não classifica ninguém.

### 17.7 Faixas do chat e varredura

`MatchEventType` ganha `resultado_decidido` (`payload: { kind, score_a, score_b, absent_side }`; `side` é o lado vencedor). `partida_combinando` também anuncia que os dois adversários da fase seguinte estão definidos, e `partida_agendada` (com o organizador como autor) anuncia o agendamento e o reagendamento (`payload.changed`). A varredura da seção 15.2 ganha a tarefa `campeonatos_encerrados` (antes de `rankings_janela`), que encerra o evento em andamento cujas partidas todas têm resultado final.

## 18. Fase 6 — Corrida (registro, marcas e elo por distância)

Etapa 5 (backend implementado e conciliado com o backend integrado da etapa 3 em 12 de outubro de 2026; a web consome estas rotas na tela K2 + K4 do [plano](../plano-jogar.md#corrida-k2--k4), com os desvios na seção 18.9; o Expo veio na etapa 6). Convenções da [seção 1 de 0003](0003-times-campeonatos.md#1-convenções): prefixo `/api/v1`, sessão obrigatória, ações com JSON, `DELETE` sem corpo, `{ detail }` em português, `404` para o que não é do titular, `409` para conflito de estado e `422` com `fields` (`[{ field, message }]`) para a regra de produto violada. Código: `app/models/runs.py`, `app/schemas/runs.py`, `app/routers/runs.py`, `app/services/run_rules.py` (regras puras), `app/services/runs.py` (banco), o recálculo em `app/services/standings.py` e as peças puras de `app/services/scoring.py` (`RunRecord`, `run_order`). Esquema na migração `0011`.

### 18.1 Regras do produto

- **Marca autodeclarada (RN17):** treino e prova valem pelo que o atleta informa; **nenhum comprovante** é pedido e `runs.verified` fica `false`. A API não expõe `verified`. A origem que o atleta vê é **"Treino"** ou **o nome da prova**; a palavra "autodeclarado" nunca aparece nas respostas nem deve aparecer nas telas.
- **Distância padrão (tolerância de ±2%):** o atleta informa a distância em metros e o servidor resolve a **distância padrão** (`standard_distance_km`) quando `|distância − padrão| × 50 ≤ padrão`. As faixas não se sobrepõem. Fora de todas elas a marca fica só no histórico (`standard_distance_km: null`) e não toca ranking algum. **Não se converte tempo de outra distância pelo ritmo.**

| Padrão | Faixa aceita (m) | Exemplos |
| --- | --- | --- |
| 3 km | 2 940 a 3 060 | |
| 5 km | 4 900 a 5 100 | |
| 10 km | 9 800 a 10 200 | 9 800 conta como 10 km; 9 790 e 10 201 não |
| 21 km | 20 580 a 21 420 | meia maratona (21 097 m) conta como 21 km |
| 42 km | 41 160 a 42 840 | maratona (42 195 m) conta como 42 km |

- **Limites e plausibilidade (`run_rules`):**
  - distância entre **1 000 m e 100 000 m**;
  - ritmo entre **2:00 e 15:00 por km** (120 a 900 s/km) e duração de no máximo 24 h (86 400 s). Exemplos: 5 km aceita 10:00 a 1:15:00; 10 km, 20:00 a 2:30:00; 42 195 m, 1:24:24 a 10:32:55; 100 km, 3:20:00 a 24:00:00;
  - a mensagem diz se o tempo é "rápido demais" ou "longo demais" para a distância e aponta o campo `duration_s`.
- **Dia da marca:** `date` (`AAAA-MM-DD`) é o dia do calendário de **Brasília (UTC−3)**; sem `date`, o treino vale hoje. O treino **não aceita data futura** nem **anterior à janela de 52 semanas** (de hoje − 364 dias até hoje). Marcas mais velhas que a janela nunca contariam no ranking, então são **recusadas** em vez de entrarem como histórico (decisão).
- **Prova do Arena (`source = 'prova'`):**
  - exige a **inscrição confirmada do próprio atleta** (`entry_id`) numa prova de corrida (`events.sport = 'corrida'`) **cuja largada já passou** (`starts_at ≤ agora`) e que não foi cancelada;
  - a distância declarada precisa bater com a da prova **dentro dos ±2%** (a marca guarda o que o atleta informou, ex.: 10 150 m numa prova de 10 km);
  - o dia da marca é o **dia da prova** (`date` pode ser omitida; se vier outra, `422`) e também precisa estar na janela de 52 semanas;
  - é **uma marca por inscrição** (índice único parcial em `runs.event_entry_id`). Quem remove a marca (`DELETE`) pode registrar outra para a mesma inscrição;
  - o rótulo da origem é o **nome da prova**.
- **Ranking de uma distância:** métrica = **melhor tempo** (segundos) das marcas da janela com aquela distância padrão; **o menor vence**; **a primeira marca já classifica** (`placement_matches = 1`) e já recebe elo. Elo por tempo nos cortes `calc_version = 1` de cada distância (`menor`: tempo ≤ corte) e **Lendário** = tempo de Diamante e posição ≤ ⌊classificados × 15%⌋ (com menos de 7 classificados na distância, ninguém). Empate de tempo: quem correu primeiro (menor `date`), depois o menor id do atleta. Rankings **gerais**, sem cidade.
- **Recálculo na mesma transação:** registrar ou remover uma marca com distância padrão recalcula inteiro o ranking daquela distância (`standings.recalculate_rankings`, com a trava consultiva do ranking `corrida_<km>`), na mesma transação da marca e da auditoria. Uma marca fora das faixas não recalcula nada. A corrida **não tem busca**: o recálculo não toca o pareamento (as buscas e as vagas ignoram `corrida_*`).
- **Saída da janela:** a tarefa diária `rankings_janela` (`standings.recalculate_outside_window`) passa a cobrir também a corrida: marcas que saíram das 52 semanas deixam de contar e quem ficou sem marca volta a `sem_marca`. Até a varredura, o ranking materializado (`/rankings`, `/me/standings`, elo e posição do cartão) pode guardar uma marca que acabou de sair; "Suas marcas" (melhor tempo, origem e série) lê as marcas direto e já respeita a janela.
- **Elegibilidade de provas (RN18):** `rankings.subject_tier(…, 'corrida', distance_km=)` passa a devolver o elo da distância assim que há marca; quem ainda está sem marca continua sem elo.
- **Sem notificações:** registrar uma marca não notifica ninguém.

### 18.2 Objetos

Espelho de `app/schemas/runs.py`. `Tier`, `Page` e `StandingLine` estão na [seção 1 de 0003](0003-times-campeonatos.md#tipos-comuns-typescript) e na seção 2 deste documento. Datas (`date`) são `AAAA-MM-DD`; instantes, ISO 8601 em UTC.

```ts
type RunSource = 'treino' | 'prova'
type RunDistanceKm = 3 | 5 | 10 | 21 | 42
type RunKind = 'primeira_marca' | 'novo_melhor' | 'sem_melhora' | 'fora_do_ranking'
type RunFilter = '3' | '5' | '10' | '21' | '42' | 'outra'   // filtro do histórico

interface RunInput {
  distance_m: number               // inteiro (JSON), 1000 a 100000
  duration_s: number               // inteiro (JSON), plausível para a distância (18.1)
  source: RunSource
  date?: string | null             // treino: padrão hoje; prova: o dia da prova (outra data é recusada)
  entry_id?: number | null         // só em 'prova': a inscrição confirmada do titular
}                                  // campos desconhecidos (user_id, verified, standard_distance_km…) são recusados

/** O que o atleta vê como origem: "Treino" ou o nome da prova. */
interface RunOrigin { source: RunSource; label: string; event_id: number | null }

/** Linha do histórico e marca salva. */
interface Run {
  id: number
  distance_m: number
  standard_distance_km: RunDistanceKm | null   // null: fora das faixas, só histórico
  duration_s: number
  pace_s_per_km: number                        // segundos por km, arredondado; "5:02/km" = 302
  date: string
  origin: RunOrigin
  counts_for_ranking: boolean                  // distância padrão e dentro das 52 semanas
  created_at: string
}

/** O que a marca faz (prévia) ou fez (salva) com o ranking da distância. */
interface RunImpact {
  kind: RunKind
  previous_best_s: number | null    // melhor da janela antes desta marca
  delta_s: number | null            // duration_s − previous_best_s (negativo: mais rápido); null sem melhor anterior
  tier_before: Tier | null          // elo antes (null sem marca anterior)
  tier_after: Tier | null           // elo depois (null fora do ranking); na prévia é uma estimativa
  tier_up: boolean                  // tinha elo e o novo é maior ("Sobe para Ouro")
}

interface RunPreview {
  distance_m: number; duration_s: number; pace_s_per_km: number
  date: string
  standard_distance_km: RunDistanceKm | null
  origin: RunOrigin
  impact: RunImpact
}

interface RunCreated { run: Run; impact: RunImpact; best: RunBest | null }   // best: cartão da distância, null no histórico

/** Cartão "Suas marcas" (K4). */
interface RunBest {
  distance_km: RunDistanceKm
  state: 'sem_marca' | 'ranqueado'
  tier: Tier | null                 // nunca atribuído a quem está sem marca
  rank_position: number | null
  best: { id: number; distance_m: number; duration_s: number; pace_s_per_km: number; date: string; origin: RunOrigin } | null
  marks: number                     // marcas da janela nesta distância
  series: { id: number; date: string; duration_s: number }[]   // minigráfico: marcas da janela, da mais antiga à mais nova, até 60 (as últimas)
}

/** Prova em que o atleta pode registrar a marca ("Prova do Arena"). */
interface RunRace { entry_id: number; event_id: number; event_name: string; distance_km: RunDistanceKm; starts_at: string; date: string }
```

**Textos da web (sugestão):** `kind = 'novo_melhor'` → "Novo melhor tempo · −0:24" (`delta_s`); `tier_up` → "Sobe para Ouro" (`tier_after`); `primeira_marca` → "Primeira marca · Ouro nos 5 km" (nada para subir); `sem_melhora` → "Seu melhor continua 24:12"; `fora_do_ranking` → "Fica só no histórico" (a distância não é de 3, 5, 10, 21 ou 42 km, com a tolerância de ±2%). O ritmo da tela do cronômetro vem de `pace_s_per_km` (a prévia confirma o valor do servidor).

### 18.3 Rotas

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /me/runs/preview` | titular | `RunInput` | `200 RunPreview` (não grava nem trava) |
| `POST /me/runs` | titular | `RunInput` | `201 RunCreated` |
| `GET /me/runs?distance=&cursor=&limit=` | titular | — | `Page<Run>`: histórico completo (inclui as fora das faixas), do dia mais recente para o mais antigo; `distance` = `3`, `5`, `10`, `21`, `42` (distância padrão) ou `outra` (fora das faixas); `limit` padrão 20, máximo 50 |
| `DELETE /me/runs/{id}` | titular | — | `204`; recalcula a distância; `404 Marca não encontrada.` para a marca de outra pessoa |
| `GET /me/run-bests` | titular | — | `{ items: RunBest[] }`: sempre os cinco cartões (3, 5, 10, 21, 42), mesmo sem marca |
| `GET /me/run-races` | titular | — | `{ items: RunRace[] }`: provas com inscrição confirmada, largada passada, dentro das 52 semanas e sem marca; da mais recente para a mais antiga, até 50 |
| `GET /rankings?sport=corrida&distance_km=` | qualquer atleta logado | — | `RankingPage` (18.5) |
| `GET /me/standings` | titular | — | `MeStandings`: `corrida` reflete as marcas (18.5) |

Sem sessão, `401`. O titular é sempre a sessão: `user_id` no corpo é recusado.

### 18.4 Regras das rotas e erros

Validação na ordem em que o atleta a encontra (a prévia aplica as mesmas regras do registro):

1. Forma do corpo (`422 Revise os campos informados.` com `fields`): campo desconhecido, número que não é inteiro, `source` inválido, `date` que não é `AAAA-MM-DD`.
2. Treino: `entry_id` presente → `422 O treino não tem prova.` (`entry_id`). Prova: sem `entry_id` → `422 Escolha a prova do Arena.` (`entry_id`).
3. Prova, a inscrição: inexistente ou de outra pessoa (inclusive o organizador e a administração) → `404 Inscrição não encontrada.`; evento que não é de corrida → `422 Esta inscrição não é de uma prova de corrida.` (`entry_id`); inscrição fora de `confirmada` → `409 Só inscrições confirmadas registram a marca da prova.`; evento cancelado → `409 Esta prova foi cancelada.`; largada no futuro → `409 A marca da prova é registrada depois da largada.`
4. Medida (`422` com o campo):
   - `distance_m`: `A distância deve ficar entre 1 km e 100 km.`
   - `duration_s`: `Informe o tempo da corrida.`, `Esse tempo é rápido demais para 5 km (ritmo abaixo de 2:00 por km). Confira o tempo e a distância.` ou `Esse tempo é longo demais para 5 km (ritmo acima de 15:00 por km). Confira o tempo e a distância.`
5. Data e distância da prova (`422`):
   - `date`: `A data do treino não pode ser no futuro.`, `Só entram marcas das últimas 52 semanas.` (treino), `Esta prova saiu das últimas 52 semanas e não entra mais no ranking.` ou `A data da prova é a do evento.`
   - `distance_m`: `A distância informada não corresponde aos 10 km desta prova.`
6. Prova com marca: `409 Você já registrou a marca desta prova.`

**Registrar:** trava, na [ordem global](0003-times-campeonatos.md#191-ordem-global-das-travas), o evento `FOR SHARE` e a inscrição `FOR UPDATE` (só na prova), grava a marca (`verified = false`) e a auditoria, recalcula o ranking da distância (trava consultiva `corrida_<km>`) e faz um commit. A resposta traz o `impact` **exato** (o elo vem do ranking recalculado, Lendário incluído). Dois toques seguidos na mesma prova deixam uma só marca (`409` no outro); marcas de vários atletas na mesma distância ao mesmo tempo deixam as posições 1..N sem repetição.

**Prévia:** o `impact` é uma **estimativa**: o elo novo conta os outros atletas com o mesmo tempo ou melhor na janela (a hipótese cautelosa para o Lendário) e o atleta entre os classificados; sem melhora, `tier_after = tier_before`. Não grava e não trava.

### 18.5 Ranking e elo por distância

- **`GET /rankings?sport=corrida&distance_km=`** (`distance_km` ausente → `422 Escolha a distância.`; fora de 3, 5, 10, 21 e 42 → `422 Distância inválida.`): o mesmo `RankingPage` da seção 12.6, geral e paginado por posição (cursor opaco; `limit` padrão 20, máximo 50), com `ranking: 'corrida_<km>'`, `required: 1`, `classified_count`, `legend_slots` e `mine` (a linha do titular, `sem_marca` quando não tem marca). Cada `RankingRow`: `metric_value` = melhor tempo em segundos; `tier` e `rank_position` da distância; `matches_played` = marcas da janela; `wins`, `draws` e `losses` = 0; `goals_for` e `goals_against` = `null`; `athlete` = a pessoa; `team` = `null`; `is_mine`. Os parâmetros `kind`, `format` e `position` são ignorados.
- **`GET /me/standings`:** `corrida[]` (uma linha por distância, a seção 2 não muda): `state = 'ranqueado'` depois da primeira marca (`played` = marcas da janela, `required: 1`, `tier`, `rank_position`, `metric_value` = melhor tempo em segundos, `faces` = o mesmo elo e os vizinhos), `sem_marca` sem marca. Nunca há elo sem marca.
- **Cartão de "Suas marcas":** `GET /me/run-bests` dá o melhor tempo da janela e a origem (de onde vêm o rótulo "Treino" ou o nome da prova e a série do minigráfico); o elo e a posição vêm do ranking materializado.

### 18.6 Esquema (migração `0011`)

`down_revision = '0010'` (a migração encadeia depois da `0010` dos campeonatos). Cria só `runs`; os cortes `corrida_*` (`calc_version = 1`) e as linhas de `standings` da corrida já existiam desde a `0005`. O `downgrade` apaga as linhas de `standings` da corrida (derivadas das marcas que saem) e remove a tabela.

| Coluna | Conteúdo e restrições |
| --- | --- |
| `id`, `created_at` | chave e instante do registro |
| `user_id` | o atleta (`users`, `ON DELETE CASCADE`) |
| `distance_m`, `duration_s` | `ck_runs_distance` (1 000 a 100 000 m) e `ck_runs_duration` (1 a 86 400 s); a plausibilidade por ritmo fica no serviço, para poder ser ajustada sem migração |
| `ran_on` | o dia (`DATE`, Brasília) |
| `source` | `treino` \| `prova` (`ck_runs_source`) |
| `event_entry_id` | a inscrição da prova (`event_entries`, sem `CASCADE`); `ck_runs_origin`: `prova` ⇔ há inscrição, e a prova sempre tem distância padrão; único parcial `uq_runs_entry` (uma marca por inscrição) |
| `standard_distance_km` | 3, 5, 10, 21, 42 ou nulo (`ck_runs_standard`) |
| `verified` | `false` por padrão; `ck_runs_verified`: o treino nunca é verificado |

Índices: `ix_runs_user_history (user_id, ran_on, id)` (histórico e cartões) e `ix_runs_ranking (standard_distance_km, ran_on, user_id)` (recálculo da distância).

### 18.7 Auditoria

| Ação | `target_type` | `data` |
| --- | --- | --- |
| `corrida.registrada` | `run` | `distance_m`, `duration_s`, `date`, `source`, `standard_distance_km`, `entry_id`, `kind` |
| `corrida.removida` | `run` | `distance_m`, `duration_s`, `date`, `source`, `standard_distance_km`, `entry_id` |

### 18.8 Desvios do pedido e decisões

| Item | Decisão | Motivo |
| --- | --- | --- |
| Parâmetro de distância | `GET /me/runs?distance=` (com `outra`) e `GET /rankings?…&distance_km=` | O plano escreve `distance=` nas duas rotas, mas `GET /rankings` já usa `distance_km` (seção 12.2, implementado e testado); o histórico precisa do valor `outra`, que não é um número. |
| Rotas além do plano | `DELETE /me/runs/{id}` e `GET /me/run-races` | Sem remover, um tempo digitado errado (ex.: 20:00 em vez de 2:00:00) ficaria 52 semanas no topo do ranking; sem a lista de provas, a tela não saberia o que oferecer em "Prova do Arena". São isoladas e podem sair sem afetar as outras. |
| Corpo da prova | `entry_id` (não `event_entry_id`) | Segue `/entries/{id}`; a coluna se chama `event_entry_id`. |
| Treino antigo | Recusado (`422`), não aceito como histórico | Uma marca fora da janela nunca contaria; manter o histórico "dentro das 52 semanas" evita dado que não aparece em lugar nenhum. |
| Empate de tempo | Quem correu primeiro | O contrato não dizia; é a regra mais comum em marcas. |
| Varredura | `rankings_janela` cobre a corrida | Era `TODO(etapa3)` só para futebol e tênis. |
| Fases 7 e 8 | Fase 7 (campeonatos e provas, lado do atleta): seção 6. Fase 8 (Expo): feita na etapa 6, sem contrato novo. | |

### 18.9 Desvios da web (etapa 5)

A corrida na web (frente W5: `web/src/api/runs.ts`, `RunStopwatchDialog` (K2), `RunMarks`, `RunHistorySheet`, `RunSpark` e `RunSavedCard` (K4), `hooks/useRunBests.ts`) foi integrada em 12 de outubro de 2026 e conferida no navegador contra a API real (treino, prova, "Ver ranking", Ranking com 11 classificados e o Lendário, e a saída da janela de 52 semanas pela varredura). Desvios e escolhas:

| Item | Decisão | Motivo |
| --- | --- | --- |
| Linha do elo da placa | A `TierLine` da corrida lê `GET /me/run-bests` (`runBestLine`, no lugar de `runLine`), não `GET /me/standings`. | O cartão de "Suas marcas" já traz o elo, o melhor tempo e a origem da distância escolhida; evita uma leitura a mais e mantém a placa e os cartões iguais depois de salvar ou remover uma marca. |
| Datas | O formulário usa o dia do **aparelho** (o Date Picker limita a "hoje" e às 52 semanas pelo calendário local), e o servidor decide pelo dia de **Brasília**. | O servidor é quem valida (a mensagem do `422` aparece no campo); perto da meia-noite, fora de Brasília, o limite do aparelho e o do servidor podem diferir em um dia. |
| Prova do Arena | Sem seleção automática: com uma só prova, a pessoa também escolhe (`Escolha a prova para ver o efeito no seu ranking.`). | Evita registrar a marca na prova errada; a prévia só vem depois da escolha. |
| Ranking da corrida | A lista mostra o **tempo** (`mm:ss` ou `h:mm:ss`, com "tempo" sob o número) e "menor tempo vence"; o Início mostra a distância de maior elo. | O `metric_value` da corrida é em segundos; pontos e campanha de partidas não se aplicam. |
| "Ver ranking" | O link no título de "Suas marcas" abre o Ranking (aba raiz) já na **corrida** e na **distância escolhida na placa** (a do contorno verde): `Entry.sport = 'corrida'` e `Entry.distance` na pilha de `ArenaPage`, lidos por `RankingPage` (`initialSport` e `initialDistance`). | Está no protótipo K4; sem o contexto, o Ranking abriria no futebol. A volta é pela navegação inferior, como em qualquer aba. |

**Conferido no navegador nesta integração (antes pendente):** o **Lendário** com 11 classificados (1 vaga, ⌊11 × 15%⌋; o primeiro, com tempo de Diamante) e a **saída da janela de 52 semanas** (uma marca saiu da janela, `rankings_janela=1` na varredura e o ranking foi de 11 para 10 classificados; a data da marca e o carimbo do ranking foram ajustados no banco de verificação para simular a passagem do tempo). **Não conferido:** prova **paga** (a prova da verificação foi gratuita) e a passagem do dia em Brasília.
