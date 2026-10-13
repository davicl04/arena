# Plano — aba Partidas do perfil (linha do tempo) e estatísticas do perfil (web + Expo)

> Estado: **apenas planejamento, 12 de outubro de 2026**. Nenhum código foi alterado. Substitui a decisão "Partidas (P2) — Boletim por modalidade" de [plano-perfil-conteudo.md](plano-perfil-conteudo.md).

## Contexto

Hoje a aba Partidas mostra apenas um `EmptyState`, no perfil próprio ([ProfilePage.tsx](../web/src/pages/ProfilePage.tsx)) e no visitado ([UserProfilePage.tsx](../web/src/pages/UserProfilePage.tsx)). Os blocos "Suas estatísticas" (Taxa de vitória, Partidas, Pontos de elo) exibem "—" fixo.

O domínio de partidas, resultados, ranking e corrida já existe (etapas 3 a 5). Nenhuma leitura atual, porém, atende a aba:

- `GET /me/matches?scope=historico` lista todas as partidas dos times dos quais o titular é membro **hoje**, mesmo aquelas em que ele não jogou. Quem saiu do time perde o histórico. O avulso não vê as partidas já encerradas. O cartão não traz pontos nem estatísticas ([matchmaking.py](../backend/app/services/matchmaking.py), `_my_match_clause`).
- Os pontos do resultado (`MatchResultOut.points`) e as estatísticas (`FootballStat`) só aparecem no detalhe de cada partida, e só para participantes.
- `GET /me/runs` não guarda o "melhor anterior" nem o tipo da marca. `RunImpact` é calculado apenas na prévia e no registro ([runs.py](../backend/app/services/runs.py)).
- Não existe um "pontos de elo" único. Cada linha (time × formato, posição × formato, tênis e cada distância) tem a própria métrica: pontos, média ou segundos.
- Nenhuma dessas leituras existe para visitante.

## Decisões da sessão de protótipos

As decisões foram tomadas na sessão de protótipos de 12 de outubro de 2026. O protótipo está num artefato privado do usuário, https://claude.ai/artifact/KGwcFydVfPfYokQsocMPJ2, versão "Consolidado", com os estados Com partidas, Iniciante, Vazio, Visitante e Carregando.

| Parte | Decisão |
| --- | --- |
| Estrutura | **Linha do tempo**: um trilho vertical único, do mais recente para o mais antigo, com separadores por mês e um nó por registro (ícone da modalidade). Mistura partidas de futebol, de tênis e corridas. |
| Topo | **Mínimo**: "N registros · Todas as modalidades" e um botão **só com o ícone** de filtro (`aria-label="Filtrar por modalidade"`). O botão abre a lista Todas, Futebol, Tênis e Corrida. Um ponto indica que há filtro ativo. |
| Próxima partida | Primeiro nó do trilho, no **cartão verde-escuro** (forest, data em menta): "Em N dias · sáb, 18 out, 16:00", os dois lados, formato, origem e quadra. Não é tracejado. Aparece **só no perfil próprio**. |
| Registro | **Duelo**: um mini placar claro com os dois lados em linhas e o escudo ou as iniciais de cada um. O lado do titular leva o marcador "você" (só no perfil próprio) e o vencedor fica em negrito. O alto mostra data e formato, e o selo do resultado fica no canto (Vitória, Empate ou Derrota). No tênis, cada set aparece em uma coluna. Embaixo vêm as pílulas de pontos (+3 / +1 / 0 no time, +10 / 0 no tênis) e das estatísticas contadas ("1 gol · 1 assistência"). |
| Campeonato | Faixa escura no topo do cartão, com troféu, nome do evento e a fase em menta (ex.: "Copa Sudoeste · SEMIFINAL"). |
| W.O. | O lado que faltou mostra a etiqueta **"Ausente"** no lugar do placar. O selo diz "Vitória · W.O." ou "Derrota · W.O.". |
| Corrida | **Contra a própria marca**: um duelo entre "Esta marca" (distância e tempo) e o "Melhor anterior" na mesma distância (ou "Sem marca anterior"). O selo indica "Novo melhor", "Primeira marca" ou nada. O alto mostra a data e a origem (Treino ou Prova · nome). |
| Canceladas e sem resultado | Mesmo Duelo, **esmaecido**, com "–" no placar e o selo tracejado "Cancelada" ou "Sem resultado". |
| Quem aparece no futebol | **Só as partidas que a pessoa jogou** (regra na seção B1). |
| Visitante | Também vê a aba, com a mesma regra de visibilidade das fotos. **Não vê** a próxima partida nem a quadra ou o local. Os registros não são tocáveis. |
| Estatísticas do perfil | **Partidas** e **Taxa de vitória** são calculadas no servidor com a mesma regra de participação. **"Pontos de elo" passa a ser "Melhor elo"**. |

## Decisões assumidas (podem ser revistas antes da implementação)

- **Período:** a linha do tempo e as estatísticas cobrem a **carreira inteira**, não a janela de 52 semanas do ranking. A linha do tempo mostra tudo, e as estatísticas acompanham. O texto não fala em "temporada".
- **Toque no registro:** no perfil próprio, um toque em uma partida abre a tela da partida (`go("match", { matchId })`, o mesmo caminho de `MyMatches`). Corridas não são tocáveis. No visitado, nada é tocável, porque a tela da partida exige participação.
- **Treinos de corrida** aparecem também para o visitante. A corrida não tem local.
- **Partidas em aberto** (`realizada`, aguardando placar) ainda não entram no trilho. Elas continuam no Jogar até fechar.
- **Canceladas** só entram se chegaram a ter data (`starts_at` não nulo). Propostas recusadas ou expiradas nunca entram.
- **Escopo:** web e Expo, seguindo o padrão das entregas do perfil. A parte Expo pode ser adiada sem afetar o contrato.

---

## Parte A — Backend (`backend/`)

### A1. Regra de participação (serviço novo `services/profile_history.py`)

A regra serve à linha do tempo e às estatísticas. Uma partida pertence ao histórico de `owner` quando o estado é `encerrada`, `sem_resultado` ou `cancelada` (esta com `starts_at` não nulo) e vale **uma** das condições:

1. **Tênis:** `owner` é o atleta de um lado (`MatchSide.user_id`).
2. **Futebol, escalação:** existe `MatchLineup` de `owner` com `removed_at IS NULL` e `present IS TRUE`. Isso inclui o avulso (`guest`).
3. **Futebol, presença não informada:** não existe `MatchLineup` de `owner` com `present IS FALSE`, e `owner` era membro do time do lado **na data da partida**: `TeamMember.joined_at <= starts_at` e (`left_at IS NULL` ou `left_at > starts_at`). Isso cobre partidas sem chamada, W.O. e canceladas.

Com isso, o histórico deixa de depender da associação atual: quem saiu do time mantém o passado, e quem entrou depois não herda partidas antigas.

O resultado do ponto de vista do titular sai de `scoring.outcome_for(side, winner)`. No W.O., o lado ausente perde, como em `standings._individual_records`.

### A2. `GET /users/{user_id}/timeline`

Rota nova em `routers/social.py` (ou `routers/profile.py`), autenticada.

- **Acesso:** usa `_can_view(db, viewer, owner)` ([social.py](../backend/app/routers/social.py)): o próprio titular, conta pública ou seguidor aprovado, sem bloqueio nos dois sentidos. Sem acesso, responde **404**, como em `/users/{id}/posts`.
- **Parâmetros:** `sport` (`futebol` | `tenis` | `corrida`, opcional), `cursor` e `limit` (padrão 20, máximo 50, como em `core/pagination.py`).
- **Ordenação:** `occurred_at DESC, kind, id DESC`.
  - Na partida, `occurred_at` é `starts_at`.
  - Na corrida, é `ran_on` combinado com `created_at` para desempate.
  - O cursor opaco codifica `occurred_at|kind|id`. A união entre partidas e corridas é feita no servidor.
- **Resposta:** `{ items: TimelineItem[], next_cursor, total }`. `total` respeita o filtro e alimenta "N registros".
- **`TimelineItem`:** união discriminada por `kind`.
  - `kind: "partida"` traz:
    - id, sport, format, origin, state, `occurred_at`;
    - `sides` (`MatchSideOut` reduzido: kind, team {id, name, initials, crest_url}, athlete {id, name, username, avatar_url}, is_owner);
    - `owner_side`, `score` (`ScoreOut`, com sets), `outcome` (`vitoria` | `empate` | `derrota` | null) e `walkover_absent_side`;
    - `points` (3/1/0 ou 10/0, nulo se não houver resultado);
    - `stats` ({goals, assists, position_stat}, só dos campos contados por `counted_stat_fields`, nulo no W.O. e no tênis);
    - `event` ({id, name} | null) e `round_label` (de `bracket_rules`, ex.: "Semifinal");
    - `court` ({name} | null), **sempre nulo para quem não é o titular**.
  - `kind: "corrida"` traz:
    - id, distance_m, standard_distance_km, duration_s e pace_s_per_km;
    - `origin` ({source, label});
    - `previous_best_s` e `mark_kind` (`primeira_marca` | `novo_melhor` | `sem_melhora` | null).
- **Melhor anterior da corrida:** o menor `duration_s` do mesmo titular e `standard_distance_km` dentro da janela de 52 semanas anterior àquela corrida. É a mesma semântica de `Before`/`_in_window` em `services/runs.py`, recalculada por linha (subconsulta lateral ou `window function`). `mark_kind` reutiliza `run_rules.run_kind`. Uma distância fora das faixas não tem comparação.
- **O que não é exposto:** próxima partida, chat, condições pendentes, contestações, prazos e dados de perfis esportivos (cidade, posição preferida, disponibilidade). Isso preserva a [decisão 0001](decisoes/0001-fundacao.md).

### A3. `GET /me/profile-stats`

Rota nova, só para o titular, porque os blocos existem apenas no perfil próprio.

- **Resposta:** `{ played, wins, draws, losses, win_rate, best_tier, in_placement }`.
  - `played` conta as partidas de futebol e tênis da regra A1 com resultado final, incluindo o W.O. Canceladas, sem resultado e corridas ficam fora.
  - `win_rate` é `wins / played`, com uma casa decimal, ou `null` sem partidas.
  - `best_tier` é o maior elo entre as linhas `ranqueado` de `/me/standings`, na ordem Bronze < Prata < Ouro < Diamante < Lendário. Nunca vem de uma linha em classificação.
  - `in_placement` indica se há alguma linha em classificação quando não existe `best_tier`.

### A4. Índices e consultas

Conferir com `EXPLAIN` e, se necessário, criar uma migração Alembic com os índices:

- `match_lineups (user_id, present)`;
- `team_members (user_id, joined_at)`;
- `runs (user_id, standard_distance_km, ran_on)`.

Nenhuma coluna nova é prevista. Se houver migração, rodar `alembic check`.

### A5. Testes (`backend/tests/`)

- **Unitários da regra A1:**
  - presença confirmada;
  - presença não informada com membro na data;
  - presença `false` excluída;
  - avulso incluído;
  - ex-membro mantém o passado;
  - membro novo não herda partidas antigas;
  - tênis;
  - W.O. dos dois lados;
  - cancelada sem data excluída.
- **Integração de `/users/{id}/timeline`:**
  - privacidade: próprio, conta pública, privada sem seguir (404), seguidor aprovado, pendente (404) e bloqueio nos dois sentidos (404);
  - `court` nulo para o visitante;
  - filtro `sport` e `total`;
  - paginação estável entre partidas e corridas na mesma data;
  - `previous_best_s` e `mark_kind` iguais aos devolvidos por `create_run` no momento do registro;
  - estatísticas contestadas não aparecem.
- **Integração de `/me/profile-stats`:** contagens com W.O., empate, cancelada e sem resultado; `best_tier` com linhas mistas; nenhum elo em classificação.

---

## Parte B — Web (`web/`)

### B1. API

- Novo `web/src/api/profile.ts`, que usa `request`/`Page` de `src/api/client.ts`:
  - tipos `TimelineItem`, `TimelineMatch`, `TimelineRun`, `TimelinePage` e `ProfileStats`;
  - `timelinePath(userId, sport?)` e `getProfileStats()`.
- A paginação usa o `usePagedList` já existente. Hoje o hook lê só `items`/`next_cursor` de `Page<T>`; ele deve passar a expor `total` quando a resposta o trouxer, sem quebrar os usos atuais.

### B2. Componentes (`web/src/components/profile-matches/`)

- **`MatchTimeline.tsx`:** a aba inteira.
  - Recebe `userId`, `own`, `onOpenMatch?` e `onExpired`.
  - Reúne o topo, a próxima partida (só com `own`, vinda de `getPlayBoard` + `nextScheduledMatch`, sem nova requisição se a página já tiver a placa), o trilho e "Carregar mais".
  - Estados: carregando (esqueleto com 3 cartões e `role="status"`), erro com "Tentar novamente", vazio próprio ("Sua história em campo começa aqui" + Jogar), vazio visitante ("Nenhuma partida por aqui") e vazio do filtro.
- **`TimelineHeader.tsx`:** a contagem e o `IconButton` de filtro.
  - O botão abre o `Popover` já existente (`components/ui/popover.tsx`) com Todas e as três modalidades. As opções são de escolha única (`radio-group` ou `toggle-group` do `ui/`) e usam `SportIcon` e o mapeamento de `data/arena.ts`.
  - Foco, Esc e navegação por setas seguem o padrão dos primitivos.
- **`TimelineRail.tsx`:** o trilho, os separadores de mês ("outubro 2026") e os nós com `SportIcon`.
- **`NextMatchNode.tsx`:** o cartão forest da próxima partida, tocável e levando à partida.
- **`DuelCard.tsx`:** a partida.
  - Contém as linhas dos lados (reaproveitar `TeamMark`/`SideMark` de `components/match` e `components/play`), o selo de resultado (`StateBadge` ou variante nova), a faixa de campeonato, "Ausente", sets do tênis, pílulas de pontos e estatísticas e a variante esmaecida.
  - Vira `button` somente quando `onOpenMatch` existe.
- **`RunDuelCard.tsx`:** "Esta marca" contra "Melhor anterior", com o selo do `mark_kind`. Reaproveitar a formatação de `play/runView.ts`.
- Textos e mapeamentos (rótulos de resultado, selos e meses) ficam em `web/src/data/match.ts` ou num `timelineView.ts`, sem duplicar `matchPhases`.

### B3. Páginas

- **`ProfilePage.tsx`:**
  - A aba Partidas passa a renderizar `<MatchTimeline own userId={user.id} onOpenMatch=… />`.
  - Os blocos de estatística leem `getProfileStats()` e mostram "Taxa de vitória" (`62%` ou "—"), "Partidas" e **"Melhor elo"** (`TierEmblem` + nome, "Em classificação" ou "—").
  - O carregamento e o erro dos blocos não bloqueiam o perfil.
  - O fluxo de `go` precisa expor a abertura de partida a partir do perfil, em `ArenaPage.tsx`.
- **`UserProfilePage.tsx`:** a aba Partidas renderiza `<MatchTimeline userId={person.id} own={false} />` dentro do `canView` já existente. Um 404 da timeline vira o vazio visitante.

### B4. Testes (`web/tests/`)

- `MatchTimeline`:
  - estados de carregamento, erro, vazio próprio e vazio visitante;
  - filtro pelo ícone, com `aria-label`, menu e ponto de filtro ativo;
  - "Carregar mais";
  - próxima partida só com `own`;
  - registros tocáveis só com `own`.
- `DuelCard`: vitória, empate, derrota, W.O. com "Ausente" do lado certo, sets do tênis, faixa de campeonato e esmaecida.
- `RunDuelCard`: primeira marca, novo melhor e distância fora das faixas.
- `ProfilePage`: blocos de estatística com "Melhor elo", "Em classificação" e "—".
- Não criar testes que repitam CSS.

---

## Parte C — Expo (`mobile/`)

- `mobile/src/api/profile.ts` com os mesmos tipos e caminhos.
- Os mesmos componentes em RN (`MatchTimeline`, `DuelCard`, `RunDuelCard`, `TimelineHeader` com uma folha de filtro), dentro da rolagem própria do `ProfileScreen`, sem `FlatList` aninhada.
- `ProfileScreen.tsx` (aba e blocos de estatística), `UserProfileScreen.tsx`/`VisitedProfile.tsx` (aba do visitado) e `ProfileTabs.tsx`.
- Testes equivalentes em `mobile/tests/`.
- A paridade visual com a web não deve ser declarada sem verificação em aparelho.

---

## Parte D — Documentação

- **[decisoes/0002-jogar.md](decisoes/0002-jogar.md):**
  - registrar os contratos de `GET /users/{id}/timeline` e `GET /me/profile-stats`;
  - registrar a regra de participação A1;
  - registrar a exposição a terceiros: o que o visitante vê e o que não vê.
- **[situacao-fundacao.md](situacao-fundacao.md):** entrada datada da implementação e tabela de estado ("Conteúdo do perfil: Partidas integrada").
- **[fidelidade-figma.md](fidelidade-figma.md):** a linha "Partidas (P2)" passa a descrever a linha do tempo com Duelo.
- **[plano-perfil-conteudo.md](plano-perfil-conteudo.md):** nota de que P2 foi substituído por este plano.
- **README:** só se a lista de endpoints ou comandos mudar.

## Fora deste plano

- Atividades em Notificações.
- Estatísticas no perfil visitado.
- Gráficos de evolução.
- Exportar histórico.
- Partidas `realizada` no trilho.
- Commit e push.

## Ordem de execução e validação

1. **Backend:**
   - A1 → A2 → A3, com testes A5.
   - Em `backend/`: `.venv/Scripts/python.exe -m ruff check app migrations tests` e `.venv/Scripts/python.exe -m pytest -q`, com `TEST_DATABASE_URL`.
   - Se A4 gerar migração, também `alembic upgrade head` e `alembic check`.
2. **Web:**
   - B1 → B2 → B3 → B4.
   - Em `web/`: `npm run lint`, `npm run build` e `npm run test:coverage`.
   - No navegador com API real:
     - perfil próprio com partidas, corrida e campeonato;
     - perfil visitado público, privado sem seguir e seguidor aprovado;
     - filtro;
     - "Carregar mais";
     - recarregar a página e conferir a persistência;
     - larguras de 320, 390 e 1440 px sem overflow horizontal.
3. **Expo:**
   - Parte C.
   - Em `mobile/`: `npm run lint`, `npm run typecheck`, `npm run test:coverage` e `npm run export:android`.
4. **Documentação:** Parte D. Revisar o diff para evitar alterações incidentais.
