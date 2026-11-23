# Decisões — Ranking por rating (`calc_version = 2`)

Data: 22 de novembro de 2026. Altera as regras de ranking da [decisão do Jogar](0002-jogar.md) (seções 1 e 12.6): `futebol_time` e `tenis` deixam de somar pontos e passam a classificar por **rating**, e o `futebol_individual` passa a usar a **média ajustada**. A entrega está implementada e integrada no backend, na web e no Expo: rating do time e do tênis com a versão de cálculo 2 de todos os rankings (seções 2 a 6), desempate do pareamento pelo rating (seção 4), bônus ponderado de campeonato do tênis (seção 7), média ajustada do individual (seção 8), rótulo "rating" nos clientes (seção 5) e o rollout com o recálculo administrativo, aplicado no banco de desenvolvimento (seção 9). As questões não bloqueantes estão na seção 11.

## 1. Motivação

Com a `calc_version = 1`, o time somava 3/1/0 e o tênis 10 por vitória, comparados a cortes fixos. A classificação (as 3 primeiras partidas) só liberava o elo e não calibrava ninguém:

- no futebol · time, a melhor campanha possível de classificação (3 vitórias = 9 pontos) caía sempre em Bronze, porque Prata exigia 10; no tênis, 3 vitórias davam 30 pontos, Prata no limite;
- depois da classificação, o elo media **volume**: derrota valia 0 e nunca tirava pontos, então quem jogava mais subia mais, independentemente do nível;
- a **força do adversário não contava**: vencer um Diamante valia o mesmo que vencer um Bronze;
- o pareamento por elo igual ou vizinho (RN04) prendia quem jogava bem a adversários fracos até acumular volume;
- no futebol · individual, a métrica já era uma média por partida, mas 3 partidas boas bastavam para chegar a Diamante, porque amostras pequenas não eram amortecidas.

O rating resolve os quatro primeiros pontos (a classificação vira calibração real, a derrota tira rating e a força do adversário entra no resultado esperado), e a média ajustada resolve o último. A corrida (melhor tempo) não tinha o problema e não muda. Os pontos 3/1/0, os pontos por atuação (RN12) e os 10 por vitória continuam como **pontos da campanha**, exibidos por partida, sem definir elo.

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

A migração `0017_individual_adjusted_mean.py` completa a linha `futebol_individual` da versão 2, que a `0016` inseriu como cópia da versão 1, com `m`, `μ` e os cortes revistos da média ajustada (seção 8). Há uma só linha por ranking: as 12 categorias posição × formato a compartilham.

| Ranking (`calc_version = 2`) | Métrica | Prata | Ouro | Diamante | Parâmetros |
| --- | --- | --- | --- | --- | --- |
| `futebol_time` | `rating` | ≥ 950 | ≥ 1050 | ≥ 1150 | inicial 1000, K 64/32 |
| `tenis` | `rating` | ≥ 950 | ≥ 1050 | ≥ 1150 | inicial 1000, K 64/32 |
| `futebol_individual` | `media` (média ajustada) | ≥ 2,6 | ≥ 3,9 | ≥ 5,2 | `m` = 5, `μ` = 3,0 |
| `corrida_3` a `corrida_42` | `tempo` | cópia da versão 1 | | | — |

`CURRENT_CALC_VERSION` passa a 2. `load_cuts` lê os parâmetros novos em `Cuts`. Quem precisar do rating de um sujeito sem linha em `standings` usa `rankings.initial_rating(cortes)`, que devolve o valor da versão (ou `DEFAULT_INITIAL_RATING` = 1000, sem cortes).

Os valores são iniciais e podem ser calibrados numa futura `calc_version` sem mudar a forma. Os cortes e os parâmetros continuam sem exposição aos clientes.

## 4. Ordem, elos e classificação

- **Ordem do time:** rating, depois os desempates da RN14 (saldo de gols, gols marcados, menos partidas) e o id.
- **Ordem do tênis:** rating, menos partidas e o id.
- **Ordem do individual:** média ajustada (seção 8), mais partidas e o id.
- A corrida mantém o cálculo da versão 1 dentro da versão 2.
- A classificação continua com 3 partidas. O elo de um classificado sai dos cortes da versão 2 aplicados ao rating (time e tênis) ou à média ajustada (individual). A regra do Lendário (Diamante e posição ≤ ⌊classificados × 15%⌋) não muda.
- Como a métrica continua sendo a primeira chave da ordem, os elos seguem contíguos em `rank_position`, com o Lendário como prefixo (teste de propriedade em `tests/unit/test_ranking_tiers.py`, agora também com os cortes de rating).
- **Desempate do pareamento:** o filtro não muda (elo igual ou vizinho; quem está em classificação enfrenta qualquer nível, RN04 e RN23). Nas buscas de time e de tênis, a ordem dos candidatos passa a ser proximidade de elo (mesmo, vizinho, demais), **menor diferença absoluta de rating**, busca mais antiga e id (`match_rules.candidate_order`). A fila (`matchmaking_queue._search_ratings`) lê o rating de `standings` no momento do pareamento, na categoria da busca (o time no formato; o tênis), numa só consulta para a busca e todos os candidatos, dentro da trava do balde e sem trava nova. O rating guardado em classificação também conta. Sem linha da versão de cálculo atual (sem partida na janela, ou linha ainda da versão 1 antes do recálculo do rollout), vale `rankings.initial_rating` dos cortes (1000). Com cortes que não são de rating (rollback para a versão 1), a ordem volta a ser elo e antiguidade. Não há coluna nova em `match_searches`, e o rating não é copiado para a partida. A busca de avulso e as vagas não mudam. Uma mudança só de rating não gera nova tentativa de pareamento (seção 6).
- A métrica do registro segue o `metric` dos cortes em uso: com cortes `rating`, o rating; com cortes `pontos` (versão 1), os pontos, com o bônus de campeonato do tênis. É isso que torna o rollback de código da seção 9 possível sem outra mudança no backend. No individual, a métrica é a média ajustada quando os cortes em uso têm `m` e `μ`, e a média simples quando os dois são nulos (versão 1).

## 5. Contrato da API

As formas das respostas não mudam. Muda o significado de alguns campos em `futebol_time` e `tenis`:

- `GET /rankings`, `GET /rankings/overview` e `GET /me/standings` devolvem `calc_version = 2`;
- `metric_value` (linhas da lista e `mine`) é o rating, com 3 casas; `leader_gap` e `next_gap` ficam em pontos de rating;
- **em classificação**, `standings.metric_value` guarda o rating (o pareamento o usará), mas as respostas não o expõem: `metric_value` é `null` na linha `classificacao` de `futebol_time` e `tenis` (`StandingLine` de `/me/standings`, a grade de formatos dos times e `mine` do Ranking). A regra é `rankings.hides_placement_metric`, derivada da métrica dos cortes;
- no futebol · individual, `metric_value` é a **média ajustada** (3 casas), e `leader_gap` e `next_gap` ficam na mesma unidade. O comportamento em classificação não muda: a linha em classificação continua expondo a métrica (agora a média ajustada). O rótulo exibido continua "média";
- a corrida mantém o comportamento atual, inclusive a métrica em classificação.

**Clientes (web e Expo).** Não há campo novo: o rótulo continua derivado da chave do ranking, num mapeamento único por cliente (`components/ranking/metric.ts` na web e no Expo: `isRatingRanking`, `formatMetric`, `metricUnit`, `metricText` e `gapText`). Em `futebol_time` e `tenis`, a métrica aparece como inteiro arredondado, sem separador de milhar, com o rótulo "rating" depois do número e sem "pts" nem "pontos": a linha e a placa de posição no elo do Ranking ("1087 rating", "37 rating atrás do 1º", "2 rating à frente do 7º"), a lista do Salão dos Lendários e as pílulas de elo do Início ("Futebol: elo Ouro, 1087 rating"). O individual continua "média" (duas casas) e a corrida, "tempo". Em classificação, as telas mostram só "n de 3", sem rating nem "0". A grade de formatos de Times não formata `metric_value`. A pílula "+3 pts" ou "+10 pts" do resultado e a linha do tempo do perfil continuam com os pontos da campanha. Os nomes acessíveis leem o rating junto com o número.

## 6. Recálculo

- Os carregadores de time e tênis (`services/standings.py`) leem as partidas da janela numa única consulta, em ordem cronológica e com os dois lados de cada partida, e reproduzem o rating a partir dela. Não há consulta por partida.
- O carregador do tênis lê também os bônus da janela (`event_placements` com `bonus_points > 0`, `user_id` e `awarded_at` dentro das 52 semanas) numa consulta e, só com cortes de rating e havendo bônus, os inscritos confirmados de todos esses eventos numa segunda (`_tennis_bonuses`). Não há consulta por evento nem por atleta.
- `standings` continua com a mesma forma: `metric_value` guarda o rating (ou a média ajustada, no individual) e `calc_version = 2`.
- O carregador do individual (`_individual_records`) passa `m` e `μ` dos cortes aos registros. Não há consulta nova.
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

## 8. Média ajustada do futebol · individual

Com a média simples, 3 partidas boas bastavam para um atleta chegar a Diamante, porque amostras pequenas não eram amortecidas. A partir da versão 2, a métrica do `futebol_individual` (posição × formato) é a **média ajustada**:

`média ajustada = (total_de_pontos + m × μ) / (partidas + m)`

- **Parâmetros:** `m` = 5 partidas fantasmas na média de referência `μ` = 3,0 pontos, gravados em `rank_cuts.prior_matches` e `rank_cuts.prior_mean` da linha `futebol_individual` da versão 2 (migração `0017`). São os valores propostos pela spec. A simulação abaixo escolhe só os cortes.
- **Efeito:** com poucas partidas, o valor fica perto de `μ`. Conforme a pessoa joga, ele converge para a média real, de cima ou de baixo. Com média real 7,0, o valor é 4,5 em 3 partidas, 5,0 em 5, 5,667 em 10 e 6,429 em 30.
- **Pontos por atuação (RN12) inalterados:** presença, resultado, gols, assistências e estatística da posição continuam iguais, assim como a prévia de estatísticas da partida e a pílula do resultado. Só muda a média que vai para o ranking.
- **Arredondamento:** 3 casas decimais (meio para cima), como a média simples.
- **Ordem:** média ajustada, mais partidas e o id. Os elos continuam contíguos e a regra do Lendário não muda.
- **Classificação:** continua com 3 partidas, e a linha em classificação continua expondo a métrica (diferente do time e do tênis).
- **Sem `m` e `μ`:** com os dois nulos (versão 1 ou downgrade da `0017`), o cálculo volta a ser a média simples.

Código: `adjusted_mean`, `IndividualRecord` (`metric` é a média ajustada; `average` continua a média simples) e `individual_record(..., prior_matches, prior_mean)` em [`backend/app/services/scoring.py`](../../backend/app/services/scoring.py); `_individual_records` em [`backend/app/services/standings.py`](../../backend/app/services/standings.py).

### Simulação de calibragem dos cortes

O script [`backend/scripts/simular_media_ajustada.py`](../../backend/scripts/simular_media_ajustada.py) é determinístico (semente fixa 20261122). Ele não faz parte do CI e documenta a distribuição; executar em `backend/` com `.venv/bin/python scripts/simular_media_ajustada.py`.

- **População sintética:** 2.000 atletas (500 por posição), cada um com uma habilidade latente sorteada de uma normal padrão e 30 atuações. Os pontos de cada atuação saem de `scoring.individual_points` (RN12). A vitória tem chance de 40% ± 10% por desvio de habilidade (entre 5% e 75%), e o empate, de 20%. Gols, assistências e ocorrências da estatística da posição seguem distribuições de Poisson com taxas por posição (goleiro 0,02 / 0,05 / 3,0; defesa 0,10 / 0,15 / 2,0; meio-campo 0,25 / 0,35 / 1,5; atacante 0,60 / 0,30 / 1,0), ajustadas pela habilidade. Em 80% das atuações as estatísticas foram revisadas e pontuam. A amostra de n partidas é o prefixo das 30. A média real das atuações simuladas é 3,6 pontos.
- **Critério:** para cada fronteira, o valor da grade de 0,1 em que a parcela de atletas acima dele, com a média ajustada e 30 partidas (a referência de amostra estável da spec), fica mais próxima da parcela acima do corte da versão 1 com a média simples e as mesmas 30 partidas. Com essa amostra, o ajuste é uma transformação crescente da média simples (`(30 × média + 15) / 35`), então os cortes mapeados quase não dependem da população: 2,5 → 2,571, 4,0 → 3,857 e 5,5 → 5,143. A grade e a distribuição discreta dos pontos levam a **Prata ≥ 2,6, Ouro ≥ 3,9 e Diamante ≥ 5,2**.
- **Por que não manter 2,5 / 4,0 / 5,5:** como a média ajustada puxa todos para `μ`, manter os cortes da versão 1 deslocaria a distribuição de quem já tem amostra estável: com 30 partidas, Diamante cairia de 1,5% para 0,8% dos atletas, e uma média real de 6,0 precisaria de 25 partidas para chegar a Diamante. Os cortes revisados preservam, com 30 partidas, a distribuição que a versão 1 pretendia, e o amortecimento fica concentrado nas amostras pequenas.

Distribuição por elo (a Lendário depende da posição e entra como Diamante):

| Cenário | Partidas | Bronze | Prata | Ouro | Diamante |
| --- | --- | --- | --- | --- | --- |
| Versão 1 (média simples, 2,5 / 4,0 / 5,5) | 3 | 17,0% | 45,6% | 28,8% | 8,6% |
| | 5 | 13,1% | 52,3% | 29,7% | 5,0% |
| | 10 | 10,7% | 58,0% | 28,2% | 3,1% |
| | 30 | 7,1% | 65,2% | 26,2% | 1,5% |
| Média ajustada, cortes da versão 1 | 3 | 4,5% | 88,3% | 7,2% | 0,0% |
| | 5 | 4,5% | 84,4% | 11,2% | 0,1% |
| | 10 | 5,1% | 78,8% | 15,9% | 0,2% |
| | 30 | 5,1% | 73,2% | 20,9% | 0,8% |
| **Média ajustada, cortes revisados (adotados)** | 3 | 8,2% | 83,2% | 8,6% | 0,1% |
| | 5 | 7,1% | 78,2% | 14,6% | 0,1% |
| | 10 | 8,2% | 72,0% | 19,3% | 0,5% |
| | 30 | 7,7% | 66,5% | 24,4% | 1,4% |

O script também imprime a linha de 20 partidas. Partidas necessárias para chegar a Diamante com uma média real constante:

| Média real | Cortes da versão 1 (5,5) | Cortes revisados (5,2) |
| --- | --- | --- |
| 6,0 | 25 | 14 |
| 7,0 | 9 | 7 |
| 8,0 | 5 | 4 |
| 9,0 | 4 | 3 |

Com os cortes adotados, 3 atuações excepcionais com média real 7,0 dão 4,5 (Ouro), e não Diamante. Na classificação (3 partidas), Diamante exige pelo menos 27 pontos (média real 9,0 por atuação), e uma média real de 5,2 nunca chega lá, porque o valor só se aproxima dela por baixo. Os testes `test_three_exceptional_matches_do_not_reach_diamante` (unidade) e `test_the_individual_ranking_uses_the_adjusted_mean_of_the_version_2_cuts` (integração) cobrem esses casos.

**Limitações:** a população é uma suposição (não há volume de partidas reais) e a média dela (3,6) fica acima de `μ` (3,0). `m`, `μ` e os cortes são iniciais e podem ser recalibrados numa futura `calc_version` sem mudar a forma.

## 9. Rollout e rollback

- **Rollout:** em cada ambiente, em `backend/`, aplicar as migrações (`alembic upgrade head`, que leva a `0016` e a `0017`) e executar `python -m app.admin_cli recalculate-rankings` logo em seguida. Até o recálculo, as linhas de `standings` mantêm `calc_version = 1` e os valores antigos (pontos no time e no tênis, média simples no individual), e os clientes já rotulam "rating"; o próximo resultado de uma categoria também a recalcula. O comando recalcula todas as categorias numa transação e é idempotente: uma segunda execução imprime `0 linhas alteradas`. As buscas abertas recebem o elo novo quando ele muda.
- **Aplicação no banco de desenvolvimento (22 de novembro de 2026):** com cópia prévia (`pg_dump -Fc`, fora do versionamento, em `.local/backups/`), `alembic upgrade head` levou o banco `arena` de `0015` a `0017`, `alembic check` ficou limpo e o recálculo alterou 1 linha (a única linha existente, da corrida, passou à versão 2); a segunda execução não alterou nenhuma. Nenhuma conta, partida ou volume foi apagado. Em seguida, pela API real e com contas sintéticas, uma partida de time e uma de tênis confirmadas mudaram rating, posição e elo como na reprodução (time: 1052,863 Ouro → 1033,010 Prata; tênis: 1037,292 Prata → 1051,713 Ouro), e a linha em classificação não expôs o rating (`metric_value` nulo); o registro está na [situação da fundação](../situacao-fundacao.md).
- **Rollback de código:** voltar `CURRENT_CALC_VERSION` para 1 e executar o recálculo. Os cortes da versão 1 (`metric = 'pontos'`) fazem o time e o tênis voltarem a classificar por pontos, com o bônus do tênis somado. No individual, os cortes da versão 1 não têm `m` nem `μ`, então o recálculo volta à média simples. As linhas da versão 2 continuam gravadas em `rank_cuts`. Os clientes continuariam rotulando "rating" no time e no tênis até uma reversão do mapeamento de `metric.ts`.
- **Rollback só da média ajustada:** o downgrade da `0017` devolve a linha `futebol_individual` da versão 2 ao estado da `0016` (cortes da versão 1, `m` e `μ` nulos); depois do recálculo, o individual volta à média simples, sem mudança de código.
- **Rollback do esquema:** `alembic downgrade 0015` remove as linhas da versão 2 e as novas colunas de `rank_cuts` e restaura `ck_rank_cuts_metric`. Coordene o downgrade com a implantação de um backend compatível com a migração `0015`, cujo modelo `RankCut` ainda usa apenas as colunas da versão 1. Rode o recálculo com esse backend. Se precisar reverter apenas o cálculo, mantenha o esquema em `0017`. O downgrade preserva partidas, resultados e `event_placements`.

## 10. Cenários de referência

Três partidas de classificação contra adversários com o rating inicial (K = 64):

| Resultados | Rating | Elo |
| --- | --- | --- |
| V V V | 1087,494 | Ouro |
| V V D / V D V / D V V | 1023,494 / 1029,332 / 1034,668 | Prata |
| V D D / D V D / D D V | 965,332 / 970,668 / 976,506 | Prata |
| D D D | 912,506 | Bronze |

Contra o mesmo adversário nas três partidas, 3 vitórias dão 1079,839 (Ouro) e 3 derrotas, 920,161 (Bronze). Vencer um adversário mais forte rende mais do que vencer um mais fraco, e perder para um mais fraco custa mais.

## 11. Questões em aberto (não bloqueantes)

As entregas desta decisão estão concluídas: regras e recálculo, pareamento, bônus ponderado, média ajustada, rótulos da web e do Expo, documentação e rollout no banco de desenvolvimento. Ficam as questões da spec, sem bloquear o uso:

- **W.O. no rating:** hoje o W.O. conta como vitória e derrota normais, coerente com a contagem de pontos. Uma alternativa é excluí-lo do rating, para evitar ganhos grandes sem jogo.
- **Rótulo da média ajustada:** as telas continuam exibindo "média" no individual; falta decidir se passam a "média ajustada".
- **Calibragem final:** o rating inicial, os fatores K, os cortes, `m` e `μ` são iniciais (sem volume de partidas reais). Uma recalibragem entra numa futura `calc_version`, sem mudar a forma.
- **Roteiro:** as mudanças necessárias em RN14, RN16 e RN23 estão registradas como requisitos planejados no [plano do Jogar](../plano-jogar.md#mudanças-necessárias-no-roteiro); falta decidir quem atualiza `docs/roteiro-projeto.docx`, e quando.
- **Textos de regra com "pontos":** o Salão dos Lendários (web e Expo) diz "com os pontos de Diamante", e as colocações da chave do campeonato de tênis mostram a base do bônus ("+40 no ranking"; no Expo, o nome acessível diz "mais 40 pontos no ranking"), embora na versão 2 o efeito no rating seja o bônus ponderado. Esses textos não formatam `metric_value` e ficaram como estão; reescrevê-los é uma decisão de produto pendente.
