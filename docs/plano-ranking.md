# Plano — tela Ranking: você no centro, cada elo como ranking próprio e Salão dos Lendários (backend + web + Expo)

> Estado: **planejado em 13 de outubro de 2026, ainda não implementado.** Branch de origem: `feat/notifications-ranking`.

## Contexto

A tela Ranking já lê dados reais, mas não mostra ao atleta o lugar dele:

- **A estrutura é genérica.** [RankingPage.tsx](../web/src/pages/RankingPage.tsx) usa a barra padrão de [ArenaPage.tsx](../web/src/pages/ArenaPage.tsx) com voltar, embora seja aba raiz, e repete o título num `h2`. Depois vêm cinco cartões fixos de elos, que são só decoração, e até quatro fileiras de filtros: modalidade, Times/Individual, formato e posição ou distância. O botão "Configurar modalidade" aparece sempre.
- **A lista é a geral.** [RankingRows.tsx](../web/src/components/ranking/RankingRows.tsx) mostra a posição geral ("18º de 80") e o brasão do elo em cada linha, a partir do 1º lugar. Quem está no 18º só se vê depois de "Carregar mais", ou na placa "Sua posição".
- **O Lendário não tem vitrine.** É o único elo que depende de posição: os pontos de Diamante **e** estar entre ⌊classificados × 15%⌋ ([0002, seção 1](decisoes/0002-jogar.md#1-elos-e-rankings)). Hoje ele aparece como mais um brasão.
- **A API não busca por elo.** `GET /rankings` ([routers/results.py](../backend/app/routers/results.py), [services/results.py](../backend/app/services/results.py) `rankings_page`) pagina só por `rank_position` a partir do 1º. Faltam vários dados: a contagem por elo, a posição dentro do elo, a janela ao redor do titular e a forma recente. A resposta também não traz uma prévia dos Lendários. Os cortes de cada elo não são expostos ao cliente.
- **O Expo repete a tela.** [RankingScreen.tsx](../mobile/src/screens/RankingScreen.tsx) e `mobile/src/components/ranking/` têm o mesmo desenho e o mesmo cliente.

## Decisões da sessão de protótipos

As decisões saíram da sessão de protótipos de 13 de outubro de 2026, em sete rodadas e três perguntas finais. O protótipo está no artefato privado do usuário https://claude.ai/artifact/8xB9mf8R2w1Wz3d5PhEaar, cuja versão 7 tem o desenho final, com a 3ª variação "Borda esmaecida". A fonte local fica em `artifacts/prototipos-ranking/`, fora do versionamento: `ranking.src.html` e as rodadas `ranking-r1…r7.src.html`.

| Parte | Decisão |
| --- | --- |
| Estrutura (R1) | **Você no centro**. A barra clara leva só o título "Ranking" e o sino, sem voltar. Abaixo vêm o cartão **Categoria**, a entrada do **Salão dos Lendários** e a **placa contínua** do elo. Saem o `h2` repetido, o subtítulo, os cinco cartões de elos e o "Configurar modalidade" fixo. |
| Lendários (R2) | **Salão dos Lendários**. Uma entrada compacta mostra o brasão, a contagem e até 4 escudos ou fotos, e abre uma **subtela escura própria** com os Lendários e a regra do elo. |
| Lista (R2/R3) | Mostra **quem está no mesmo elo que o titular**, não o ranking geral. |
| Posições (R4) | **Cada elo é um ranking próprio**: 1º ao último **dentro do elo**. A tela **não mostra a posição geral** nem "Top %". A placa diz "6º de 12 no Diamante". |
| Ordem | **1º no topo** do elo, o último embaixo. Na corrida, o 1º é o menor tempo. |
| Placa (R4) | **Placa contínua**. É um bloco escuro tingido na cor do elo. No topo fica a troca de elo (‹ Ouro · **DIAMANTE** · Salão ›), depois a posição no elo e a janela em vidro. |
| Janela (R3) | O titular aparece com **2 acima e 2 abaixo** dentro do elo. Uma expansão mostra o elo inteiro. |
| Categoria (R5) | **Folha de filtros**. O cartão "Categoria" abre uma folha com a modalidade em blocos com ícone, Times/Individual, formato e posição ou distância. Tem o botão "Ver ranking". |
| Modalidades | A folha **só mostra as modalidades em que o titular tem perfil ativo**. Com uma só modalidade, o bloco some. Sem nenhuma, a tela mostra um estado vazio com "Configurar modalidade". |
| Linha (R6) | **Forma recente**: posição no elo, escudo ou foto, nome, os **últimos 5 resultados** (V/E/D; V/D no tênis) e a métrica. Na corrida, "melhor marca em dd/mm" toma o lugar da forma. As linhas não têm mais brasão, porque todas são do mesmo elo. |
| Forma recente (gravação) | **Gravada em `standings`** pelo mesmo recálculo que atualiza pontos, posição e elo: a coluna `recent_form` e, na corrida, `best_mark_on`. A leitura só copia essas colunas. |
| Fora da janela (R7) | **Borda esmaecida**. A próxima linha escondida aparece cortada, apagando na borda, com um botão redondo com seta e número (⌃ 3). O tracejado "+3 acima" foi rejeitado. |
| Vários times | **Um time com troca.** A placa abre no time em que o titular é representante (ou no mais antigo), e chips acima da placa trocam entre os times ativos dele. |
| Escopo | **Backend, web e Expo** na mesma entrega. |

Decisões tomadas pelo plano (podem ser revistas antes de implementar):

- **Sem elo, a tela mostra as faixas.** Em classificação, sem marca, sem time ou sem jogos, a placa da posição mostra o estado atual (medidor "2/3", "Sem marca nos 5 km" com "Registrar uma corrida", "Sem time ativo" com "Meus times"). Abaixo, chips *Bronze · Prata · Ouro · Diamante* escolhem qual faixa ver, com Bronze por padrão. A placa contínua mostra "Os 5 primeiros no Bronze".
- **Elos vazios são pulados.** As setas da troca de elo vão ao elo vizinho **com integrantes**. Sem nenhum, a seta fica desabilitada. A seta do Diamante para cima abre o Salão quando houver Lendários.
- **Diferenças relativas às pessoas, não aos cortes.** A placa mostra "7 pts atrás do 1º" e "1 pt à frente do 7º". "Faltam X para o Ouro" fica de fora porque os cortes continuam fora do contrato do cliente ([0002, seção 1](decisoes/0002-jogar.md#1-elos-e-rankings)).
- **`rank_position` continua na API** por compatibilidade e para a paginação. A web e o Expo deixam de exibi-la.

## Comportamento da tela

### Estrutura, de cima para baixo

1. **Barra clara**: "Ranking" e `NotificationBell` (`tone="light"`), sem voltar.
2. **Cartão Categoria**: ícone da modalidade, rótulo "CATEGORIA" e o texto "Futebol · Society 7×7 · Times" (ou "· Atacante", "Tênis", "Corrida · 5 km"), com o ícone de ajuste. Ele abre a folha.
3. **Chips dos times**, só no ranking de Times quando o titular tem mais de um time ativo. Cada chip mostra o escudo e o nome, e o selecionado define a linha da placa.
4. **Entrada do Salão dos Lendários.**
5. **Sem elo:** a placa da posição em estado (forest) e os chips de faixa.
6. **Placa contínua.**

### Folha de filtros

- Usa a folha inferior existente ([sheet.tsx](../web/src/components/ui/sheet.tsx)) com o título "Categoria do ranking". A seleção se aplica na hora, e "Ver ranking" fecha a folha.
- **Modalidade**: os blocos (ícone `SportIcon` e nome) vêm só das modalidades com perfil em `profiles`, na ordem futebol, tênis e corrida. Com uma só, o bloco não aparece e a folha mostra o texto "Futebol é a sua única modalidade ativa".
- **Futebol**: segmentado *Times | Individual*, chips de formato e, no individual, chips de posição. A posição padrão é a do perfil de futebol.
- **Corrida**: chips de distância (3, 5, 10, 21 e 42 km). **Tênis**: nada além da modalidade.
- **Modalidade inicial**: `initialSport`, quando o titular tem esse perfil (o "Ver ranking" de "Suas marcas"); senão, a primeira modalidade ativa. `initialDistance` continua valendo.
- **Sem nenhum perfil**: em vez do cartão, do Salão e da placa, a tela mostra o estado vazio "Você ainda não joga nenhuma modalidade" e o botão "Configurar modalidade", que leva a `go("sports")`.

### Placa contínua

- Bloco com `rounded-card` e gradiente da cor do elo para `forest`. O tom de cada elo vira token novo em `ui.css` (`--color-tier-bronze-tint`, `-prata-`, `-ouro-`, `-diamante-`, `-lendario-`), com o Coliseu em marca-d'água como nas demais placas.
- **Troca de elo**: botão ‹ com o elo de baixo, o centro com o brasão, o nome do elo em caixa alta e "12 times/atletas", e o botão › com o elo de cima. Para cima a partir do Diamante, o texto é "Salão" e o botão abre o Salão. Os nomes acessíveis são "Ver elo Ouro" e "Abrir o Salão dos Lendários".
- **No elo do titular**: rótulo "SUA POSIÇÃO NO DIAMANTE"; número grande "6º"; "de 12 no Diamante · Resenha EC" (o time só no ranking de Times); e três números:
  - a métrica: "94 pontos", "5,66 média" ou "21:50 tempo";
  - a distância para o 1º do elo ("7 pts atrás do 1º") ou "Lidera o Diamante";
  - a vantagem sobre o próximo ("1 pt à frente do 7º") ou "Último do Diamante".
  Na corrida, as diferenças são tempos ("0:42"); no individual, médias com duas casas.
- **Em outro elo**: "Você está no Diamante. Os 5 primeiros no Ouro:". Sem elo do titular, só "Os 5 primeiros no Ouro:".
- **No Salão** (titular Lendário), a placa usa o tom do Lendário e o texto "no Salão".

### Janela, borda esmaecida e expansão

- No elo do titular, a janela tem o titular com 2 acima e 2 abaixo. Em outro elo, mostra os 5 primeiros.
- Quando há linhas escondidas acima ou abaixo, a próxima delas aparece **cortada e esmaecida** (máscara em gradiente, sem interação). Sobre ela fica um botão redondo de vidro com seta e número (⌃ 3 / ⌄ 4), com nome acessível "Ver 3 times acima". Nada de tracejado.
- O botão carrega **o elo inteiro**, a partir do 1º, com `GET /rankings?…&tier=` e cursor. A lista mantém o titular visível (rolagem até a linha dele) e mostra "Mostrar só ao seu redor" para voltar à janela. No fim de uma página com mais linhas, a mesma borda esmaecida chama a próxima página.
- Um erro ao expandir aparece abaixo da lista com "Tentar de novo". A janela continua visível.

### Linha da lista (forma recente)

- Mostra a **posição no elo**, o escudo do time (`TeamCrest`) ou a foto do atleta (`SocialPhoto`), o nome (com o selo "Você" ou "Seu time" na linha do titular) e, abaixo, a **forma**.
- **Forma**: até 5 quadradinhos, do mais antigo à esquerda para o mais recente à direita. V em menta, E neutro e D no tom de perigo suave. No tênis não há E. Com menos de 5 partidas, mostra só as que existem. O nome acessível é "Últimos resultados: vitória, vitória, empate, derrota, vitória".
- **Corrida**: "melhor marca em 03/09" no lugar da forma.
- **Métrica** à direita, com a unidade: "pontos", "média" ou "tempo".
- A linha do titular fica em destaque com borda menta. A linha de um atleta abre o perfil (`onOpenUser`), como hoje. A de um time continua sem navegação.

### Salão dos Lendários

- **Entrada**: cartão escuro com gradiente dourado (`--color-legend: #F4DE9A`), brasão Lendário grande, "SALÃO DOS LENDÁRIOS" e "12 Lendários", com até 4 escudos ou fotos e "+8". Se o titular é Lendário, o texto vira "Você está no Salão", com contorno menta.
- **Sem Lendário**: com `legend_slots = 0` ou ninguém com os pontos de Diamante, um cartão discreto "Nenhum Lendário ainda" explica que as vagas abrem com 7 classificados (15%), entre quem tem os pontos de Diamante.
- **Subtela `legends`**, nova `Screen` na pilha do `ArenaPage`, com voltar e sem sino. O fundo é escuro, com o brasão grande e brilho dourado. Traz "SALÃO DOS LENDÁRIOS", a categoria e o texto "Topo 12 (15% dos classificados) com os pontos de Diamante. 12 de 12 vagas ocupadas". A lista numerada de 1 a N usa a mesma linha com forma recente, e um rodapé lembra que quem sai do topo 15% ou perde os pontos de Diamante volta ao Diamante no próximo cálculo. A entrada carrega a categoria (`Entry.ranking`) para a subtela ler `tier=lendario`.

### Estados

- **Carregando**: "Carregando ranking…" (`role="status"`), como hoje.
- **Erro**: `LoadError` de tela com a causa e a releitura quando a conexão volta, como em `useRanking`. O 401 chama `onExpired`.
- **Ranking vazio** (nenhum classificado): `EmptyState` atual (troféu ou cronômetro) com o texto da categoria e, na corrida, "Registrar uma corrida". A placa da posição continua acima.
- **Sem time ativo** (ranking de Times): placa "Sem time ativo" com "Meus times".

### Layout e acessibilidade

- Larguras de 320, 390 e 1440 px, sem overflow horizontal. Nos nomes da troca de elo e nas linhas, o texto é truncado com reticências. A rolagem respeita a navegação inferior.
- Foco visível em menta sobre as placas escuras. A troca de elo, a borda esmaecida e os chips funcionam por teclado. O painel da lista tem `aria-busy` durante a carga, e a linha do titular tem `aria-current`.

## Contrato do backend

A web e o Expo atuais continuam funcionando: tudo o que entra em `GET /rankings` é campo ou parâmetro novo.

### Invariante a fixar em teste

Os elos de uma categoria são **contíguos** em `rank_position`, e o Lendário é um prefixo. Isso decorre de as ordens de [scoring.py](../backend/app/services/scoring.py) (`team_order`, `individual_order`, `tennis_order` e `run_order`) terem a métrica como primeira chave, e o elo depender da métrica (mais a posição, no Lendário). A posição no elo e as janelas dependem disso. Um teste de propriedade sobre `rank_records` deve garantir que o elo não sobe ao longo da posição.

### Serviço (`app/services/ranking_views.py`, novo)

`rankings_page` sai de `services/results.py` para um módulo de leitura próprio, junto com o resto do Ranking, e `results.py` fica só com resultado e estatísticas. O roteador continua em `routers/results.py` ou passa a `routers/rankings.py`, com o mesmo prefixo.

- `tier_counts(db, where) -> dict[str, int]`: uma consulta agrupada por `tier` nos classificados da categoria.
- `tier_offset(counts, tier)`: quantos classificados há nos elos acima. Com isso, `tier_position = rank_position - offset`.
- `gap(a, b, direction)`: diferença absoluta pela métrica do ranking, usada para "atrás do 1º" e "à frente do próximo".
- A leitura copia `recent_form` e `best_mark_on` da própria linha de `standings`, sem consulta extra a `matches`.

### Forma recente gravada no recálculo ([services/standings.py](../backend/app/services/standings.py))

A forma é calculada em `_recalculate_key`, que já percorre todas as partidas pontuadas da janela de 52 semanas de cada categoria a cada resultado, e é gravada junto com os pontos.

- **Os carregadores trazem a ordem.** `_team_records`, `_individual_records` e `_tennis_records` passam a selecionar também `Match.starts_at` e `Match.id`. Para cada sujeito, guardam o resultado (V/E/D) de cada partida, além dos totais que já calculam.
- **Regra pura em [scoring.py](../backend/app/services/scoring.py):** `recent_form(outcomes, limit=5) -> str` ordena por (`starts_at`, `id`), pega as 5 últimas e devolve a sequência da mais antiga para a mais recente, por exemplo `"VVEDV"`.
  - **Times**: o resultado sai do placar de cada lado.
  - **Individual**: só aparições com presença, na posição e no formato. Em W.O., só o lado que compareceu conta, como já acontece em `_individual_records`. O resultado vem de `scoring.outcome_for`.
  - **Tênis**: só V/D.
- **Corrida:** `best_mark_on` é o `achieved_on` que `RunRecord` já calcula (o primeiro dia com o melhor tempo) e passa a ser gravado.
- **`standing_fields` e `VALUE_FIELDS`** incluem `recent_form` e `best_mark_on`. Assim, a linha só é regravada quando algo muda, como já acontece com os demais campos.
- **Todos os caminhos já passam pelo recálculo da categoria inteira:** resultado confirmado ou decidido, W.O. e contestação, presença e estatísticas, marca registrada ou removida, e a varredura `rankings_janela` quando uma partida sai da janela. Por isso a forma acompanha os pontos sem código novo em cada serviço.
- **Sujeitos em classificação** também ganham a forma, que não aparece na lista porque eles não estão classificados. Ela fica pronta para quando se classificarem.

### Endpoints

**1. `GET /api/v1/rankings` (estendido)**

- Parâmetro novo `tier` (`bronze`, `prata`, `ouro`, `diamante`, `lendario`), que filtra os classificados do elo. `cursor` e `limit` continuam (o cursor é a última `rank_position`).
- Cada item de `items` ganha:
  - `tier_position: int` (posição dentro do elo);
  - `form: list[Literal['V', 'E', 'D']] | None` (até 5; `None` na corrida);
  - `best_mark_on: date | None` (só na corrida).
- A página ganha `tier_counts: {bronze, prata, ouro, diamante, lendario}`.
- Sem `tier`, a resposta é a de hoje mais os campos novos.

**2. `GET /api/v1/rankings/overview` (novo)**

Recebe os mesmos parâmetros de categoria e um `team_id` opcional. O `team_id` precisa ser de um time ativo do titular; senão, `404`. O titular vem sempre da sessão. A resposta (`RankingOverviewOut`) traz:

- `ranking`, `format`, `position`, `distance_km`, `calc_version`, `required`, `classified_count`, `legend_slots` e `tier_counts`;
- `mine: list[MyRankingLineOut]`, a mesma lista de hoje (cada time ativo, ou o próprio atleta). Cada linha ganha:
  - `tier_position` e `tier_size`;
  - `leader_gap: float | None` (nulo quando lidera);
  - `next_gap: float | None` e `next_tier_position: int | None` (nulos quando é o último).
- `selected_team_id`: o `team_id` pedido ou, sem ele, o primeiro time de `mine` (representante, depois o mais antigo);
- `window: list[RankingRowOut] | None`: as linhas do elo da linha selecionada de `tier_position − 3` a `tier_position + 3`, limitadas ao elo. O cliente mostra ±2 e usa as pontas como linha esmaecida. É nulo quando a linha não tem elo;
- `legends_preview: list[RankingSubjectOut]`: até 4 times ou atletas Lendários, em ordem, para a entrada do Salão.

O Salão e "Ver o elo inteiro" usam `GET /rankings?tier=…`. Os 5 primeiros de outro elo usam `GET /rankings?tier=…&limit=6`.

### Migração

Não há tabela nova. Uma migração Alembic altera `standings`:

- `recent_form VARCHAR(5) NOT NULL DEFAULT ''`, com `CHECK (recent_form ~ '^[VED]{0,5}$')`. No tênis e na corrida não há E, o que o serviço garante e um teste cobre.
- `best_mark_on DATE NULL`, com `CHECK (sport = 'corrida' OR best_mark_on IS NULL)`.
- O índice parcial `ix_standings_ranking_tier` em (`sport`, `format`, `position`, `distance_km`, `tier`, `rank_position`) `WHERE rank_position IS NOT NULL`, para o filtro por elo e a janela.

**Preenchimento das linhas existentes.** A migração não chama serviços da aplicação: ela cria as colunas vazias. Um comando novo, `python -m app.admin_cli recalculate-rankings`, recalcula todas as categorias com `recalculate_rankings(..., touch=False)`. É idempotente e é executado uma vez após a migração, em cada ambiente. Até ele rodar, as linhas antigas mostram a forma vazia (sem quadradinhos), nunca uma forma errada. O README ganha esse passo.

### Schemas e documentação

`RankingRowOut`, `MyRankingLineOut`, `RankingPageOut` e o novo `RankingOverviewOut` ficam em [schemas/matches.py](../backend/app/schemas/matches.py), ou mudam para `schemas/rankings.py`. O contrato entra numa seção nova "20. Ranking por elo, janela, forma recente e Salão" em [0002-jogar.md](decisoes/0002-jogar.md), com o desvio de "posição geral fora da tela" registrado.

## Web

- **API** ([api/results.ts](../web/src/api/results.ts)): `RankingQuery.tier`; `RankingRow.tier_position`, `form` e `best_mark_on`; `RankingPage.tier_counts`; tipos `RankingOverview` e `TierCounts`; `rankingOverviewPath` e `getRankingOverview`.
- **Hooks** (`components/ranking/`):
  - `useRankingOverview(query, teamId, onExpired)`: carga, causa do erro e releitura única quando a conexão volta, no padrão de `useRanking`;
  - `useRanking` ganha `tier` e um `enabled` para só ler na expansão, ao trocar de elo ou no Salão.
- **Componentes** (`components/ranking/`):
  - `CategoryCard` e `CategorySheet` (folha filtrada por `profiles`);
  - `TeamSwitch` (chips dos times);
  - `LegendsEntry`;
  - `TierPlate`, composto por `TierSwitch`, `TierPositionHero` e `TierWindow`;
  - `FadeEdge` (borda esmaecida);
  - `RankingLine` e `RecentForm`;
  - `TierPicker` (chips de faixa sem elo).
  
  `RankingRows` e `MyRankingPlate` saem; hoje só a `RankingPage` os usa. `metric.ts` ganha `gapText` ("7 pts", "1 pt", "0,28", "0:42").
- **Páginas**: `RankingPage.tsx` reescrita e `LegendsPage.tsx` nova.
- **`ArenaPage`**: a aba Ranking passa a ter barra própria (título e sino, sem voltar); a `Screen` `legends` entra com voltar e título "Salão dos Lendários"; `Entry` carrega a categoria.
- **Dados e estilo**: `data/arena.ts` ganha a ordem dos elos e o mapeamento de tom; `ui.css` ganha `--color-legend` e os tons dos elos. A forma usa `--color-mint`, `--color-danger-soft` e um neutro.
- **Testes** ([ranking.test.tsx](../web/tests/ranking.test.tsx) reescrito, com fixtures em `results-fixtures.ts`):
  - folha só com perfis ativos (uma modalidade esconde o bloco; nenhuma mostra o estado vazio);
  - placa com posição no elo e diferenças (incluindo "Lidera" e "Último") e ausência da posição geral;
  - troca de elo, que pula elos vazios e abre o Salão;
  - borda esmaecida: expandir lê `tier=` e pagina com cursor; "Mostrar só ao seu redor" volta à janela;
  - forma recente (ordem e `aria-label`) e "melhor marca" na corrida;
  - chips de vários times enviam `team_id`;
  - sem elo, os chips de faixa leem `tier=bronze`;
  - Salão (lista, regra e titular Lendário);
  - erros, 401 e o "Ver ranking" de "Suas marcas" (`initialSport` e `initialDistance`).

## Expo

O conjunto é o mesmo em `mobile/src/`:

- **API**: [api/results.ts](../mobile/src/api/results.ts) com os mesmos tipos e caminhos.
- **Componentes**: `components/ranking/`. A folha usa o [Sheet.tsx](../mobile/src/components/Sheet.tsx) do app. Como `expo-linear-gradient` não é dependência, a borda esmaecida vira sobreposição com opacidade decrescente, sem dependência nova.
- **Telas**: `screens/RankingScreen.tsx` reescrita e `screens/LegendsScreen.tsx` nova, registrada em [navigation/screens.tsx](../mobile/src/navigation/screens.tsx).

Os testes acompanham os da web. A paridade visual e o funcionamento em aparelho **não** ficam comprovados pelo build.

## Ordem de implementação

1. **Backend**:
   - teste da invariante de elos contíguos;
   - migração das colunas `recent_form` e `best_mark_on` e do índice;
   - forma e melhor marca no recálculo (`scoring.recent_form`, carregadores com a data, `standing_fields` e `VALUE_FIELDS`);
   - comando `recalculate-rankings` no `admin_cli`;
   - `ranking_views.py` (contagens, posição no elo e diferenças);
   - `GET /rankings` estendido e `GET /rankings/overview`;
   - testes de integração;
   - seção 20 da [0002](decisoes/0002-jogar.md).
2. **Web**: tipos e hooks, componentes, `RankingPage`, `LegendsPage`, `ArenaPage`, tokens e testes. Depois, a conferência no navegador.
3. **Expo**: o mesmo conjunto, com testes.
4. **Documentação**: [situacao-fundacao.md](situacao-fundacao.md), com o que mudou, as verificações executadas e as limitações; [README](../README.md), com o comando `recalculate-rankings` depois da migração.

Cada etapa pode virar um commit local separado. Push e PR só depois da validação do usuário.

## Testes e validação

Backend (`backend/`):

- **Unitários**: elos contíguos e Lendário como prefixo nas quatro ordens; `tier_offset` e `tier_position`; `gap` nas duas direções (`maior` e `menor`); `scoring.recent_form` (ordem por data e id, limite de 5, menos de 5 partidas e sem E no tênis).
- **Integração com PostgreSQL** (`TEST_DATABASE_URL`):
  - `tier_counts` por categoria;
  - `tier=` filtra e pagina com cursor dentro do elo;
  - `tier_position` começa em 1 em cada elo;
  - janela do overview no 1º, no último e em elos com 1 ou 2 integrantes;
  - `leader_gap` e `next_gap` (corrida com o menor tempo);
  - `team_id` de outro titular ou de time inativo devolve 404;
  - várias equipes do titular, com o representante primeiro;
  - linhas em classificação e sem jogos;
  - `legends_preview` vazio sem vagas;
  - forma gravada no recálculo e atualizada por cada caminho: resultado confirmado, decisão da administração, W.O. e contestação, presença e estatísticas, e saída da janela pela varredura;
  - forma no individual só com presença e sem o lado ausente no W.O.; só partidas pontuadas da janela;
  - `best_mark_on` gravado na corrida e atualizado ao registrar ou remover uma marca;
  - `recalculate-rankings` preenche linhas antigas e, rodado de novo, não muda nada;
  - a leitura devolve `form` e `best_mark_on` das colunas, sem consultar partidas;
  - visibilidade dos atletas igual à de hoje (`people_out`).
- **Comandos**: `.venv/Scripts/python.exe -m ruff check app migrations tests` e `.venv/Scripts/python.exe -m pytest -q`. Depois de aplicar a migração em banco de desenvolvimento ou teste, `.venv/Scripts/python.exe -m alembic check`.

Web (`web/`): `npm run lint`, `npm run build` e `npm run test:coverage`. No navegador, a 320, 390 e 1440 px:
- folha com 1, 2 e 3 perfis, e o estado sem perfil;
- troca de elo e Salão;
- expansão e volta à janela;
- vários times;
- sem overflow horizontal, foco visível e rolagem com a navegação inferior;
- os mesmos dados depois de recarregar.

Expo (`mobile/`): `npm run lint`, `npm run typecheck`, `npm run test:coverage` e `npm run export:android`. Se alguma dependência Expo mudar, também `npx expo install --check`. Registre se houve validação em Android ou iOS.

## Riscos e pontos de atenção

- **Elos contíguos.** Se uma calibragem futura (`calc_version = 2`) desacoplar o elo da primeira chave de ordem, a posição no elo e a janela quebram. O teste da invariante fica como guarda.
- **Forma gravada desatualizada.** A forma só fica certa se todo caminho que muda partidas pontuadas chamar o recálculo da categoria. Hoje todos chamam, mas um caminho novo no futuro pode esquecer. Mitigação: um teste de integração por caminho e a regra pura em `scoring.py`, usada só pelo recálculo.
- **Ambientes sem o comando.** Se `recalculate-rankings` não rodar depois da migração, as linhas antigas mostram a forma vazia até o próximo resultado da categoria. Registre o passo no README e na [situacao-fundacao.md](situacao-fundacao.md).
- **Privacidade.** A forma mostra só as letras dos resultados (e a data da melhor marca na corrida), sem adversário nem partida, e segue a mesma visibilidade de atleta das linhas de hoje. Confira se perfis privados aparecem do mesmo jeito que aparecem agora.
- **Elos grandes.** O Bronze pode ter centenas de linhas. A expansão pagina com cursor e mantém o titular visível; não há carga completa de uma vez.
- **Contrato compartilhado.** A web e o Expo dependem dos campos novos. Atualize os dois clientes e a [0002](decisoes/0002-jogar.md) na mesma entrega, e mantenha o Expo atual funcionando até a troca, porque os campos são aditivos.
- **Cortes fora do cliente.** Sem "faltam X para o Ouro". Se o usuário quiser essa meta depois, ela pede uma decisão sobre expor os cortes.
- **Aparelho.** A revisão visual vale para a web. Não declare paridade do Expo sem verificação em aparelho.
