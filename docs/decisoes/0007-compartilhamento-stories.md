# Decisões — Compartilhamento de resultado nos Stories

Data: 26 de novembro de 2026. Contrato do backend do **adesivo de resultado**: o que pode ser compartilhado, o campo `shareable` da linha do tempo e as rotas que entregam os números da placa. Os termos (atividade, adesivo de resultado, barra do elo, categoria da atividade, posição no elo) estão no [glossário](../../CONTEXT.md); o design aprovado está na [fidelidade visual](../fidelidade-figma.md), seção "Compartilhamento de resultado nos Stories".

> **Estado (27 de novembro de 2026):** a regra de compartilhável, o `shareable` da linha do tempo, as duas rotas e o bloco `category` (barra do elo, seção 5) estão implementados no backend. Web e Expo consomem este contrato na folha de ações da aba Partidas e na tela imersiva do Story. Não há migração nem tabela nova.

Código: `app/services/share_rules.py` (regra única), `app/services/profile_timeline.py` (`shareable` e os itens de uma atividade do titular, `own_match_item` e `own_run_item`), `app/services/result_share.py` (rotas), `app/services/share_category.py` (barra do elo), `app/schemas/share.py`, `app/schemas/profile.py` e `app/routers/profile.py`. Testes: `tests/integration/test_share_flow.py`, `tests/integration/test_share_category_flow.py` e `tests/unit/test_share_category.py`.

## 1. Princípios

- **Só o titular compartilha.** O titular vem da sessão (cookie `HttpOnly` na web, Bearer no mobile), nunca de um ID enviado pelo cliente. As rotas ficam sob `/me`.
- **O servidor decide.** A regra de compartilhável existe uma vez (`share_rules`), usada pela linha do tempo e pelas rotas. Os clientes leem `shareable` e não reimplementam a regra.
- **Mesmos números do perfil.** As rotas devolvem os números do item da linha do tempo da mesma atividade, visto pelo titular: lados, placar e sets, resultado, pontos, estatísticas contadas, melhor anterior e tipo de marca saem do mesmo código ([0002, seção 19](0002-jogar.md#19-histórico-do-perfil-linha-do-tempo-e-estatísticas-12-de-outubro-de-2026)). Nada é inventado: campo sem dado vem nulo.
- **Sem revelar existência.** Atividade de outra pessoa, inexistente ou não compartilhável responde o mesmo `404`.

## 2. Regra de compartilhável

Uma atividade é compartilhável quando quem lê é o titular e:

- **partida:** pertence ao histórico do titular (regra de participação de [0002, seção 19.1](0002-jogar.md#191-regra-de-participação)), tem resultado final (`realizada` ou `encerrada`, com `outcome` do lado do titular) e **não é uma vitória do titular por W.O.** (W.O. mantido em que o lado ausente é o adversário);
- **corrida:** toda corrida do titular, em distância padrão ou não.

Nunca são compartilháveis a partida `sem_resultado` (inclusive o W.O. anulado pela administração) e a `cancelada`. A derrota por W.O. (o lado do titular faltou) é compartilhável, com `walkover_absent_side` igual a `owner_side`. A partida `realizada` (placar confirmado, janela das estatísticas aberta) é compartilhável; as estatísticas ainda não contadas vêm nulas.

Funções: `match_shareable(viewer_id, owner_id, match, owner_side)` e `run_shareable(viewer_id, run)`.

## 3. `shareable` na linha do tempo

`GET /api/v1/users/{user_id}/timeline` ganha `shareable: boolean` em todo item, de partida e de corrida, calculado pela regra da seção 2. Para quem não é o titular do perfil (seguidor aprovado ou conta pública), o valor é **sempre `false`**. O restante do contrato da linha do tempo não muda ([0002, seção 19.2](0002-jogar.md#192-get-apiv1usersuser_idtimeline) e [plano do perfil, parte A2](../plano-perfil-partidas.md#a2-get-usersuser_idtimeline)).

## 4. Rotas dos dados do adesivo

Autenticadas; titular da sessão; sem parâmetros além do ID no caminho. Uma requisição por abertura da tela de compartilhar.

### 4.1 `GET /api/v1/me/share/matches/{match_id}`

```ts
type Side = 'a' | 'b'

interface ShareMatch {
  id: number
  sport: 'futebol' | 'tenis'
  format: 'futsal' | 'society' | 'campo' | null       // null no tênis
  origin: 'amistoso' | 'campeonato'
  event: { id: number; name: string } | null           // campeonato
  round_label: string | null                           // ex.: "Semifinal", "Rodada 2"; null em amistoso
  occurred_at: string                                  // ISO 8601 (starts_at)
  sides: {                                             // ordem a, b
    side: Side
    kind: 'time' | 'atleta'
    team: { id: number; name: string; initials: string; crest_url: string | null } | null
    athlete: { id: number; name: string; username: string; avatar_url: string | null } | null
    is_owner: boolean                                  // marca o lado do titular
  }[]
  owner_side: Side
  score: {                                             // ScoreOut
    a: number                                          // gols (futebol) ou sets vencidos (tênis)
    b: number
    sets: { a: number; b: number; tiebreak: { a: number; b: number } | null; super_tiebreak: boolean }[] | null
    winner: Side | null                                // null: empate no futebol
  }
  outcome: 'vitoria' | 'empate' | 'derrota'            // do ponto de vista do titular
  walkover_absent_side: Side | null                    // só a derrota por W.O. aparece (igual a owner_side)
  points: number                                       // pontos da campanha: 3/1/0 no futebol, 10/0 no tênis
  stats: {                                             // estatísticas contadas do titular; null no tênis, no W.O. e sem estatística
    position: 'goleiro' | 'defesa' | 'meio_campo' | 'atacante' | null
    goals: number | null
    assists: number | null
    position_stat: number | null
  } | null
  category: ShareCategory | null                       // barra do elo; ver seção 5
}
```

A placa de futebol usa `outcome`, `score` e, em "Você", `stats.goals`/`stats.assists`; sem estatísticas, o terceiro número é o formato (`format`). No tênis, `score.sets` (com `tiebreak`) e `score.a`/`score.b` (sets vencidos).

### 4.2 `GET /api/v1/me/share/runs/{run_id}`

```ts
interface ShareRun {
  id: number
  occurred_at: string                                  // meia-noite de `date` em Brasília (-03:00)
  date: string                                         // dia da corrida (ISO, sem fuso)
  distance_m: number
  standard_distance_km: 3 | 5 | 10 | 21 | 42 | null    // null: fora de todas as faixas (só histórico)
  duration_s: number
  pace_s_per_km: number
  previous_best_s: number | null                       // melhor marca anterior na distância padrão (semântica de create_run)
  mark_kind: 'primeira_marca' | 'novo_melhor' | 'sem_melhora' | null  // null fora da distância padrão
  origin: { source: 'treino' | 'prova'; label: string; event_id: number | null }
  category: ShareCategory | null                       // barra do elo; ver seção 5; null fora da distância padrão
}
```

### 4.3 Erros

| Situação | Resposta |
| --- | --- |
| Sem sessão válida | `401` |
| Partida fora do histórico do titular, corrida de outra pessoa, ID inexistente ou atividade não compartilhável | `404` `{ "detail": "Atividade não encontrada." }`, o mesmo corpo em todos os casos |
| ID que não é inteiro | `422` (validação do caminho) |

## 5. Bloco `category` (barra do elo)

O bloco descreve o **estado atual** da **categoria da atividade** no momento em que a rota é chamada: não há histórico, snapshot por partida nem estado "Subiu de elo". Os rankings são gerais, sem cidade. Código: `app/services/share_category.py`; só leitura de `standings` e `rank_cuts`.

```ts
type Tier = 'bronze' | 'prata' | 'ouro' | 'diamante' | 'lendario'

interface ShareCategory {
  ranking: 'futebol_time' | 'futebol_individual' | 'tenis'
         | 'corrida_3' | 'corrida_5' | 'corrida_10' | 'corrida_21' | 'corrida_42'
  state: 'classificacao' | 'ranqueado'
  tier: Tier | null            // só em 'ranqueado'
  tier_position: number | null // posição no elo (3 em "3º na Prata"), a mesma da tela de Ranking; só em 'ranqueado'
  tier_size: number | null     // classificados no mesmo elo; só em 'ranqueado'
  played: number               // partidas (corrida: marcas) na janela; em classificação, no máximo `required`
  required: number             // partidas (marcas) que classificam: 3 no futebol e no tênis, 1 na corrida
  progress: number             // 0..1, com 4 casas
  next_tier: Tier | null       // null no Lendário e em classificação
  gap: {
    amount: number             // > 0; segundos e posições são inteiros (ex.: 240.0)
    unit: 'rating' | 'media' | 'segundos' | 'posicoes' | 'pontos'
  } | null                     // null no Lendário, no Diamante sem vagas de Lendário e em classificação
}
```

O bloco nunca traz o valor da métrica (rating, média ou tempo), só a distância até o próximo elo. Por isso, nos rankings por rating em classificação, o rating continua sem exposição ([0006, seção 5](0006-ranking-por-rating.md#5-contrato-da-api)).

### 5.1 Categoria resolvida

| Atividade | `ranking` | Linha lida |
| --- | --- | --- |
| Partida de tênis | `tenis` | a do titular |
| Partida de futebol com o titular na escalação (presente, não removido) e com posição | `futebol_individual` | a do titular no formato da partida e na posição da escalação |
| Partida de futebol sem posição do titular (sem linha na escalação, ou com posição vazia) | `futebol_time` | a do time do lado do titular, no formato da partida |
| Corrida em distância padrão | `corrida_<km>` | a do titular na distância |
| Corrida fora das distâncias padrão | — | `category: null` (sem barra) |

O lado do titular é o mesmo da placa (`owner_side`). No time, vale o time do lado, mesmo que o titular tenha saído dele depois. Na partida, `category` é tipado como anulável, mas só seria nulo se o lado do titular não tivesse time, o que não ocorre com os dados atuais.

### 5.2 Classificado (`ranqueado`)

- **Elo, posição e tamanho do elo:** vêm da mesma leitura da tela de Ranking (`ranking_views.my_lines`, com a trava compartilhada da categoria, a contagem por elo e os cortes de `CURRENT_CALC_VERSION`). Assim, `tier`, `tier_position` e `tier_size` são sempre os mesmos de `mine` em `GET /rankings/overview` para a mesma categoria (e o mesmo time, no futebol · time).
- **Bronze, Prata e Ouro:** `next_tier` é o elo seguinte. `gap.amount` é a distância do `metric_value` da linha até o corte do próximo elo, na unidade da métrica, respeitando a direção dos cortes: `maior` (rating e média, `corte − valor`) ou `menor` (tempo da corrida em segundos, `valor − corte`); nunca é negativa. `progress` vai de 0, no corte do elo atual, a 1, no corte do próximo, limitado a 0..1.
- **Piso do Bronze:** o Bronze não tem corte inferior. A barra começa uma largura da Prata (Prata → Ouro) abaixo do corte da Prata, na direção da métrica: `piso = prata − (ouro − prata)`. O piso depende só dos cortes da versão de cálculo, então é estável. Na versão 2: rating 950/1050 → 850; média ajustada 2,6/3,9 → 1,3; 5 km 35:00/27:00 → 43:00 (as demais distâncias seguem a mesma regra). Abaixo do piso (rating menor que 850, por exemplo), o progresso fica em 0, e a distância continua contada até a Prata.
- **Diamante:** `next_tier` é `lendario`. Com vagas de Lendário (`legend_slots(classificados, legend_share)` > 0), `gap` vem em `posicoes`: `rank_position − vagas`, as posições até a última vaga. O progresso vai do corte de Diamante (0) até a métrica de quem ocupa a última vaga (1), também respeitando a direção. Sem vagas de Lendário (menos de 7 classificados com 15%), `progress` é 1 e `gap` é `null`.
- **Lendário:** `progress` 1, `next_tier` e `gap` nulos.
- **Unidades:** `rating` em `futebol_time` e `tenis` (3 casas; os clientes arredondam para cima ao exibir inteiro, para nunca mostrar "faltam 0"); `media` no `futebol_individual` (média ajustada, 3 casas); `segundos` na corrida; `posicoes` do Diamante para o Lendário. `pontos` só apareceria num rollback para a `calc_version = 1` (cortes por pontos) e não ocorre na versão atual.

### 5.3 Em classificação (`classificacao`)

Sem elo atribuído: `tier`, `tier_position`, `tier_size`, `next_tier` e `gap` nulos; `played` (limitado a `required`) e `required` como em `GET /me/standings`; `progress = played / required` (4 casas). Quem não tem linha na categoria (nenhuma partida ou marca na janela de 52 semanas) também vem em `classificacao`, com `played` 0.

### 5.4 Exemplos

Futebol · time (society), Ouro, 2º de 2 no elo, com rating 1079,839 (Diamante a partir de 1150):

```json
{ "ranking": "futebol_time", "state": "ranqueado", "tier": "ouro", "tier_position": 2, "tier_size": 2, "played": 5, "required": 3,
  "progress": 0.2984, "next_tier": "diamante", "gap": { "amount": 70.161, "unit": "rating" } }
```

Futebol · individual (atacante · society), Prata com média ajustada 3,25 (Ouro a partir de 3,9):

```json
{ "ranking": "futebol_individual", "state": "ranqueado", "tier": "prata", "tier_position": 1, "tier_size": 1, "played": 5,
  "required": 3, "progress": 0.5, "next_tier": "ouro", "gap": { "amount": 0.65, "unit": "media" } }
```

Corrida de 5 km, Prata com melhor tempo 31:00 (Ouro até 27:00):

```json
{ "ranking": "corrida_5", "state": "ranqueado", "tier": "prata", "tier_position": 1, "tier_size": 1, "played": 3,
  "required": 1, "progress": 0.5, "next_tier": "ouro", "gap": { "amount": 240.0, "unit": "segundos" } }
```

Diamante na 2ª posição com uma vaga de Lendário; Diamante sem vagas; Lendário:

```json
{ "ranking": "futebol_time", "state": "ranqueado", "tier": "diamante", "tier_position": 1, "tier_size": 1, "played": 5,
  "required": 3, "progress": 0.2727, "next_tier": "lendario", "gap": { "amount": 1.0, "unit": "posicoes" } }
{ "ranking": "tenis", "state": "ranqueado", "tier": "diamante", "tier_position": 1, "tier_size": 1, "played": 5,
  "required": 3, "progress": 1.0, "next_tier": "lendario", "gap": null }
{ "ranking": "futebol_time", "state": "ranqueado", "tier": "lendario", "tier_position": 1, "tier_size": 1, "played": 5,
  "required": 3, "progress": 1.0, "next_tier": null, "gap": null }
```

Em classificação no tênis (2 de 3), sem o rating:

```json
{ "ranking": "tenis", "state": "classificacao", "tier": null, "tier_position": null, "tier_size": null, "played": 2,
  "required": 3, "progress": 0.6667, "next_tier": null, "gap": null }
```

Os números dos exemplos são os dos testes, não dados de uma conta.

## 6. Compatibilidade e reversão

O contrato só ganha um campo (`shareable`) e duas rotas. Clientes antigos ignoram o campo. Reverter é remover as rotas, o campo e `share_rules`, sem dados a desfazer.

## 7. Testes

`tests/integration/test_share_flow.py`, pela API com PostgreSQL: sessão obrigatória; titular x outra pessoa, seguidor aprovado e ID inexistente (mesmo `404`); o adversário compartilha a mesma partida do próprio lado; membro do time ausente na escalação não compartilha; regra completa (confirmada, `realizada`, empate, derrota por W.O. compartilháveis; sem resultado, cancelada, vitória por W.O. e W.O. anulado não); `shareable` do titular e do visitante; conteúdo do futebol com evento, rodada e estatísticas, futebol sem estatísticas, tênis com tie-break e tênis sem resultado; corrida em distância padrão (melhor anterior e tipo de marca) e fora dela. `tests/integration/test_profile_timeline_flow.py` passou a incluir `shareable` no conjunto exato de campos dos itens.

`tests/integration/test_share_category_flow.py`, pela API com PostgreSQL: futebol · time por rating em Lendário, Diamante com vaga de Lendário, Ouro, Prata no corte e Bronze acima e abaixo do piso, comparados com `GET /rankings/overview`; futebol com escalação sem posição (time no formato); futebol · individual pela média ajustada (Prata e Bronze); individual em classificação; tênis em Diamante sem vagas de Lendário; tênis em classificação sem expor o rating e sem linha; corrida de 5 km com direção `menor` e corrida livre (`null`); e, pelo recálculo real, tênis após três partidas (Ouro e Bronze) e o individual da posição jogada. `tests/integration/test_share_flow.py` passou a conferir o bloco no futebol, no tênis e na corrida padrão (Ouro após o recálculo do registro das marcas). `tests/unit/test_share_category.py`: piso do Bronze, progresso e distância nos limites dos cortes, nas duas direções, Diamante com e sem vagas, Lendário e progresso da classificação.
