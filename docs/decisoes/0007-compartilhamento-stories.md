# Decisões — Compartilhamento de resultado nos Stories

Data: 26 de novembro de 2026. Contrato do backend do **adesivo de resultado**: o que pode ser compartilhado, o campo `shareable` da linha do tempo e as rotas que entregam os números da placa. Os termos (atividade, adesivo de resultado, barra do elo, categoria da atividade, posição no elo) estão no [glossário](../../CONTEXT.md); o design aprovado está na [fidelidade visual](../fidelidade-figma.md), seção "Compartilhamento de resultado nos Stories".

> **Estado (26 de novembro de 2026):** a regra de compartilhável, o `shareable` da linha do tempo e as duas rotas estão implementados no backend. O bloco `category` (barra do elo) **ainda vem sempre nulo**: a forma planejada está na seção 5 e será preenchida numa entrega seguinte. Web e Expo ainda não consomem este contrato. Não há migração nem tabela nova.

Código: `app/services/share_rules.py` (regra única), `app/services/profile_timeline.py` (`shareable` e os itens de uma atividade do titular, `own_match_item` e `own_run_item`), `app/services/result_share.py` (rotas), `app/schemas/share.py`, `app/schemas/profile.py` e `app/routers/profile.py`. Testes: `tests/integration/test_share_flow.py`.

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
  category: null                                       // barra do elo; ver seção 5
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
  category: null                                       // barra do elo; ver seção 5
}
```

### 4.3 Erros

| Situação | Resposta |
| --- | --- |
| Sem sessão válida | `401` |
| Partida fora do histórico do titular, corrida de outra pessoa, ID inexistente ou atividade não compartilhável | `404` `{ "detail": "Atividade não encontrada." }`, o mesmo corpo em todos os casos |
| ID que não é inteiro | `422` (validação do caminho) |

## 5. Bloco `category` (forma planejada, preenchido numa entrega seguinte)

Nesta entrega, `category` é **sempre `null`** nas duas rotas. A forma abaixo é a planejada para a barra do elo; será confirmada, com as regras finais (categoria resolvida, piso do Bronze, cortes e Lendário), quando o bloco for preenchido. `category` continua `null` quando não há barra (corrida fora das distâncias padrão).

```ts
type Tier = 'bronze' | 'prata' | 'ouro' | 'diamante' | 'lendario'

interface ShareCategory {
  ranking: string              // chave do ranking resolvido: 'tenis', 'futebol_individual', 'futebol_time' ou 'corrida_<km>'
  state: 'classificacao' | 'ranqueado'
  tier: Tier | null            // só em 'ranqueado'
  tier_position: number | null // posição no elo (ex.: 3 em "3º na Prata"); só em 'ranqueado'
  tier_size: number | null     // classificados no mesmo elo; só em 'ranqueado'
  played: number               // partidas (corrida: marcas) na janela
  required: number             // necessárias para sair da classificação
  progress: number             // 0..1: entre o corte do elo atual e o do próximo; em classificação, played / required
  next_tier: Tier | null       // null no Lendário
  gap: {
    amount: number
    unit: 'rating' | 'media' | 'segundos' | 'posicoes'   // 'posicoes': do Diamante até a última vaga de Lendário
  } | null                     // null no Lendário, no Diamante sem vagas de Lendário e em classificação
}
```

Regras previstas (da especificação de trabalho): tênis usa `tenis`; futebol usa `futebol_individual` do formato e da posição do titular na escalação e, sem posição, `futebol_time` do time do titular no formato; corrida usa `corrida_<km>` na distância padrão. O progresso usa os cortes da versão de cálculo atual (`rank_cuts`) e o `metric_value` da linha do titular em `standings`, respeitando a direção da métrica. Nos rankings por rating em classificação, a métrica não é exposta ([0006, seção 5](0006-ranking-por-rating.md#5-contrato-da-api)). Só leitura de `standings` e `rank_cuts`, sem migração.

## 6. Compatibilidade e reversão

O contrato só ganha um campo (`shareable`) e duas rotas. Clientes antigos ignoram o campo. Reverter é remover as rotas, o campo e `share_rules`, sem dados a desfazer.

## 7. Testes

`tests/integration/test_share_flow.py`, pela API com PostgreSQL: sessão obrigatória; titular x outra pessoa, seguidor aprovado e ID inexistente (mesmo `404`); o adversário compartilha a mesma partida do próprio lado; membro do time ausente na escalação não compartilha; regra completa (confirmada, `realizada`, empate, derrota por W.O. compartilháveis; sem resultado, cancelada, vitória por W.O. e W.O. anulado não); `shareable` do titular e do visitante; conteúdo do futebol com evento, rodada e estatísticas, futebol sem estatísticas, tênis com tie-break e tênis sem resultado; corrida em distância padrão (melhor anterior e tipo de marca) e fora dela. `tests/integration/test_profile_timeline_flow.py` passou a incluir `shareable` no conjunto exato de campos dos itens.
