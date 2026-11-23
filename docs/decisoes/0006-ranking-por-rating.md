# Decisões — Ranking por rating (`calc_version = 2`)

Data: 22 de novembro de 2026. Altera as regras de ranking da [decisão do Jogar](0002-jogar.md) (seções 1 e 12.6) para `futebol_time` e `tenis`, que deixam de somar pontos e passam a classificar por **rating**. A primeira entrega cobriu o rating do time e do tênis, a versão de cálculo 2 de todos os rankings, a migração dos cortes e o contrato de `metric_value`. Entregas posteriores trouxeram o desempate do pareamento pelo rating (seção 4) e o bônus ponderado de campeonato do tênis (seção 7). A média ajustada do futebol · individual e os rótulos dos clientes vêm em entregas seguintes (seção 10).

## 1. Problema

Com a `calc_version = 1`, o time somava 3/1/0 e o tênis 10 por vitória, comparados a cortes fixos. A classificação (as 3 primeiras partidas) só liberava o elo: a melhor campanha possível de um time (3 vitórias = 9 pontos) caía em Bronze, porque Prata exigia 10; depois dela, o elo media volume, porque derrota não tirava pontos; e vencer um Diamante valia o mesmo que vencer um Bronze.

## 2. Rating

- **Rating inicial:** todo sujeito (time em um formato ou tenista) começa a janela com 1000.
- **Reprodução cronológica:** o rating é obtido reproduzindo, em ordem de `starts_at` e depois do `id` da partida, todas as partidas contabilizadas da janela daquela categoria. Os critérios de partida contabilizada não mudam: `realizada` ou `encerrada` com placar final, dentro das 52 semanas, amistosos e partidas de campeonato, com W.O. e decisões incluídos.
- **Resultado esperado:** `E = 1 / (1 + 10^((rating_adversário − rating) / 400))`.
- **Atualização:** `novo = rating + K × (S − E)`, com `S` = 1 (vitória), 0,5 (empate, só no futebol) ou 0 (derrota). Os dois lados são atualizados com os ratings de antes da partida. A margem de gols ou sets não altera o rating.
- **Fator K:** 64 nas `placement_matches` (3) primeiras partidas do sujeito dentro da janela e 32 depois. Cada lado usa o próprio K, então um estreante move mais do que o veterano que enfrenta.
- **Arredondamento:** 3 casas decimais (meio para cima) a cada passo, com aritmética decimal de precisão fixa (28 dígitos), para que o recálculo seja determinístico. As telas exibem inteiro.
- **Sem estado incremental:** corrigir um placar, decidir uma divergência, alterar presença ou estatísticas e a saída de uma partida da janela produzem o rating de uma reprodução da janela atual do zero. Ao sair a partida mais antiga, a seguinte passa a ser a primeira da janela e volta a usar o K de classificação.
- **Casos de borda:** um placar igual no tênis (que a validação não aceita) conta como derrota para os dois lados, como já acontecia no registro de vitórias e derrotas. Um lado sem sujeito na categoria é enfrentado com o rating inicial e não recebe rating.
- **Pontos da campanha:** os pontos 3/1/0 do time e os 10 por vitória do tênis continuam calculados (`TeamRecord.points`, `TennisRecord.points`) e exibidos por partida (pílula do resultado e linha do tempo), mas não definem elo.

Código: `expected_score`, `updated_rating`, `k_factor`, `RatedMatch` e `replay_ratings` em [`backend/app/services/scoring.py`](../../backend/app/services/scoring.py). O registro do time e do tênis recebe o rating (`rating`) e passa a usá-lo como `metric`.

## 3. Cortes e versão de cálculo

A migração `0016_ranking_rating.py`:

- passa a aceitar `metric = 'rating'` em `ck_rank_cuts_metric`;
- acrescenta a `rank_cuts` os parâmetros versionados `initial_rating`, `placement_k`, `regular_k` (rating) e `prior_matches` (`m`) e `prior_mean` (`μ`) da média ajustada, nulos onde não se aplicam. As restrições `ck_rank_cuts_rating` (os três parâmetros do rating existem só, e sempre, com `metric = 'rating'`, todos positivos) e `ck_rank_cuts_adjusted_mean` (`m` e `μ` juntos e só com `metric = 'media'`) protegem a combinação;
- insere as linhas da `calc_version = 2` para todos os rankings, sem alterar as da versão 1. `placement_matches`, `legend_share` e `window_weeks` são copiados da versão 1.

| Ranking (`calc_version = 2`) | Métrica | Prata | Ouro | Diamante | Parâmetros |
| --- | --- | --- | --- | --- | --- |
| `futebol_time` | `rating` | ≥ 950 | ≥ 1050 | ≥ 1150 | inicial 1000, K 64/32 |
| `tenis` | `rating` | ≥ 950 | ≥ 1050 | ≥ 1150 | inicial 1000, K 64/32 |
| `futebol_individual` | `media` | cópia da versão 1 (2,5 / 4,0 / 5,5) | | | `m` e `μ` nulos (média simples) |
| `corrida_3` a `corrida_42` | `tempo` | cópia da versão 1 | | | — |

`CURRENT_CALC_VERSION` passa a 2. `load_cuts` lê os parâmetros novos em `Cuts`. Quem precisar do rating de um sujeito sem linha em `standings` usa `rankings.initial_rating(cortes)`, que devolve o valor da versão (ou `DEFAULT_INITIAL_RATING` = 1000, sem cortes).

Os valores são iniciais e podem ser calibrados numa futura `calc_version` sem mudar a forma. Os cortes e os parâmetros continuam sem exposição aos clientes.

## 4. Ordem, elos e classificação

- **Ordem do time:** rating, depois os desempates da RN14 (saldo de gols, gols marcados, menos partidas) e o id.
- **Ordem do tênis:** rating, menos partidas e o id.
- O futebol · individual e a corrida mantêm o cálculo da versão 1 dentro da versão 2.
- A classificação continua com 3 partidas. O elo de um classificado sai dos cortes da versão 2 aplicados ao rating. A regra do Lendário (Diamante e posição ≤ ⌊classificados × 15%⌋) não muda.
- Como a métrica continua sendo a primeira chave da ordem, os elos seguem contíguos em `rank_position`, com o Lendário como prefixo (teste de propriedade em `tests/unit/test_ranking_tiers.py`, agora também com os cortes de rating).
- **Desempate do pareamento:** o filtro não muda (elo igual ou vizinho; quem está em classificação enfrenta qualquer nível, RN04 e RN23). Nas buscas de time e de tênis, a ordem dos candidatos passa a ser proximidade de elo (mesmo, vizinho, demais), **menor diferença absoluta de rating**, busca mais antiga e id (`match_rules.candidate_order`). A fila (`matchmaking_queue._search_ratings`) lê o rating de `standings` no momento do pareamento, na categoria da busca (o time no formato; o tênis), numa só consulta para a busca e todos os candidatos, dentro da trava do balde e sem trava nova. O rating guardado em classificação também conta. Sem linha da versão de cálculo atual (sem partida na janela, ou linha ainda da versão 1 antes do recálculo do rollout), vale `rankings.initial_rating` dos cortes (1000). Com cortes que não são de rating (rollback para a versão 1), a ordem volta a ser elo e antiguidade. Não há coluna nova em `match_searches`, e o rating não é copiado para a partida. A busca de avulso e as vagas não mudam. Uma mudança só de rating não gera nova tentativa de pareamento (seção 6).
- A métrica do registro segue o `metric` dos cortes em uso: com cortes `rating`, o rating; com cortes `pontos` (versão 1), os pontos, com o bônus de campeonato do tênis. É isso que torna o rollback da seção 8 possível sem outra mudança de código.

## 5. Contrato da API

As formas das respostas não mudam. Muda o significado de alguns campos em `futebol_time` e `tenis`:

- `GET /rankings`, `GET /rankings/overview` e `GET /me/standings` devolvem `calc_version = 2`;
- `metric_value` (linhas da lista e `mine`) é o rating, com 3 casas; `leader_gap` e `next_gap` ficam em pontos de rating;
- **em classificação**, `standings.metric_value` guarda o rating (o pareamento o usará), mas as respostas não o expõem: `metric_value` é `null` na linha `classificacao` de `futebol_time` e `tenis` (`StandingLine` de `/me/standings`, a grade de formatos dos times e `mine` do Ranking). A regra é `rankings.hides_placement_metric`, derivada da métrica dos cortes;
- o futebol · individual e a corrida mantêm o comportamento atual, inclusive a métrica em classificação.

## 6. Recálculo

- Os carregadores de time e tênis (`services/standings.py`) leem as partidas da janela numa única consulta, em ordem cronológica e com os dois lados de cada partida, e reproduzem o rating a partir dela. Não há consulta por partida.
- O carregador do tênis lê também os bônus da janela (`event_placements` com `bonus_points > 0`, `user_id` e `awarded_at` dentro das 52 semanas) numa consulta e, só com cortes de rating e havendo bônus, os inscritos confirmados de todos esses eventos numa segunda (`_tennis_bonuses`). Não há consulta por evento nem por atleta.
- `standings` continua com a mesma forma: `metric_value` guarda o rating e `calc_version = 2`.
- As travas consultivas por categoria e a ordem global de travas não mudam.
- Quando o elo muda, as buscas abertas recebem o novo elo e tentam o pareamento de novo, como antes. Uma mudança só de rating não gera nova tentativa.

## 7. Bônus ponderado do tênis

O bônus de campeonato do tênis (RN16) entra no rating convertido pela força da chave.

- **Concessão (sem mudança):** colocação final de um evento de tênis com 4 ou mais inscrições confirmadas. A base continua gravada em `event_placements.bonus_points` quando o evento encerra: 40 (campeão), 20 (vice) e 10 (semifinalistas na eliminação, 3º e 4º no todos contra todos). A conversão em rating acontece só no recálculo.
- **Janela:** o bônus conta enquanto o evento terminou dentro das 52 semanas (`awarded_at`). Ao sair, deixa de contar, mesmo que nenhuma partida saia nesse dia: a varredura `rankings_janela` continua olhando os bônus que saem da janela (`_bonus_departed`) e recalcula o tênis. Um atleta com bônus e sem partida na janela continua sem linha.
- **Fórmula:** na reprodução cronológica (seção 2), no instante `awarded_at`, o rating do atleta recebe `base × 2 × (1 − E_chave)`, com `E_chave = 1 / (1 + 10^((média_chave − rating) / 400))`. `média_chave` é a média dos ratings dos **demais inscritos confirmados** do evento naquele instante, sem o próprio atleta; quem ainda não tem partida na janela entra com o rating inicial. O valor é arredondado a 3 casas, como o rating.
- **Efeito:** com chave do mesmo nível (`média_chave = rating`), o bônus é exatamente a base. Com chave mais forte, passa da base e chega a até 2 × a base; com chave mais fraca, fica abaixo dela e tende a 0. Nunca é negativo: o valor é limitado a 0 depois do arredondamento.
- **Ordem na linha do tempo:** as partidas entram por (`starts_at`, `id`) e os bônus por (`awarded_at`, evento). Quando o `awarded_at` coincide com o `starts_at` de uma partida, a partida vem antes, porque o evento encerra depois das próprias partidas. Os bônus de um mesmo evento são aplicados juntos, a partir dos ratings de antes daquele instante (o vice não é medido contra o rating já bonificado do campeão), e eventos do mesmo instante seguem o id do evento.
- **Não é partida:** o bônus não conta para o fator K. As `placement_matches` primeiras partidas do atleta continuam com K de classificação, mesmo que um bônus venha antes delas, e o bônus não muda `matches_played` nem a classificação.
- **Efeito nos adversários:** como o bônus muda o rating do atleta, as partidas seguintes dele usam esse rating, e os adversários ganham ou perdem conforme o novo valor. Quando o bônus sai da janela, essas partidas são reproduzidas de novo sem ele.
- **Pontos da campanha:** a pílula "+10 pts" das partidas não muda. A soma das bases (`TennisRecord.bonus`) continua compondo os pontos do tênis, que só são a métrica com os cortes da versão 1 (rollback).
- **Concorrência:** o bônus lê os ratings da própria categoria `tenis`, dentro do recálculo que já segura a trava dessa categoria. Não há trava nova.

Exemplo (eliminação com 4 inscritos, ratings depois das partidas): campeão 1064, vice 1000 e semifinalistas 968.

| Colocação | Base | Rating | Média dos demais | Bônus | Rating final |
| --- | --- | --- | --- | --- | --- |
| Campeão | 40 | 1064 | 978,667 (chave mais fraca) | 30,369 | 1094,369 |
| Vice | 20 | 1000 | 1000 (mesmo nível) | 20 | 1020 |
| Semifinalista | 10 | 968 | 1010,667 (chave mais forte) | 11,222 | 979,222 |

Código: `RatedBonus`, `weighted_bonus` e o parâmetro `bonuses` de `replay_ratings` em [`backend/app/services/scoring.py`](../../backend/app/services/scoring.py); `_tennis_bonuses` em [`backend/app/services/standings.py`](../../backend/app/services/standings.py).

## 8. Rollout e rollback

- **Rollout:** aplicar a migração (`alembic upgrade head`) e executar `python -m app.admin_cli recalculate-rankings` logo em seguida. Até o recálculo, as linhas de `standings` mantêm `calc_version = 1` e os valores antigos. O comando é idempotente: uma segunda execução não altera nenhuma linha.
- **Rollback:** voltar `CURRENT_CALC_VERSION` para 1 e executar o recálculo. Os cortes da versão 1 (`metric = 'pontos'`) fazem o time e o tênis voltarem a classificar por pontos, com o bônus do tênis. Se for preciso desfazer o esquema, o downgrade da `0016` remove as linhas da versão 2 e as colunas novas e restaura `ck_rank_cuts_metric`; ele deve ser seguido do código com `CURRENT_CALC_VERSION = 1` e do recálculo.

## 9. Cenários de referência

Três partidas de classificação contra adversários com o rating inicial (K = 64):

| Resultados | Rating | Elo |
| --- | --- | --- |
| V V V | 1087,494 | Ouro |
| V V D / V D V / D V V | 1023,494 / 1029,332 / 1034,668 | Prata |
| V D D / D V D / D D V | 965,332 / 970,668 / 976,506 | Prata |
| D D D | 912,506 | Bronze |

Contra o mesmo adversário nas três partidas, 3 vitórias dão 1079,839 (Ouro) e 3 derrotas, 920,161 (Bronze). Vencer um adversário mais forte rende mais do que vencer um mais fraco, e perder para um mais fraco custa mais.

## 10. Pendências

- Média ajustada do futebol · individual: `m`, `μ` e cortes revistos da linha `futebol_individual` da versão 2, em migração própria.
- Rótulo "rating" na web e no Expo, sem "pts" nas categorias por rating, e ocultação em classificação nas telas.
- Seção 1 de [0002](0002-jogar.md), [plano do Jogar](../plano-jogar.md), [plano do Ranking](../plano-ranking.md) e README, com o rollout.
- Questões não bloqueantes da spec: W.O. no rating (hoje conta como vitória e derrota normais), calibragem final e atualização de RN14, RN16 e RN23 no roteiro.
