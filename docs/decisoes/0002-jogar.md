# Decisões e contratos — Jogar

Data: 12 de outubro de 2026. Contrato da **fase 1 do [plano do Jogar](../plano-jogar.md)** (elos: `rank_cuts` e `standings` vazios e a linha de classificação), executada na etapa 1 junto das fases 1 a 3 de [Times e campeonatos](0003-times-campeonatos.md). As fases 2 a 8 ficam **a definir na fase correspondente** (seção 6).

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

A infraestrutura (`notifications`, rotas de leitura e o serviço `notify`) é a de [0003, seção 7](0003-times-campeonatos.md#7-notificações). Os tipos do Jogar (proposta, aceite, condições, partida agendada, cancelamento, W.O., resultado, divergência, contestação, vaga preenchida, reserva expirando e comprovante decidido) entram nas fases correspondentes.

## 6. Fases 2 a 8 (a definir na fase correspondente)

- **Fase 2 — Pareamento de amistosos:** `match_searches`, `matches`, `match_sides`, trava por balde, varredura e notificações. A definir.
- **Fase 3 — Partida:** condições, quadras, reserva, chat, cancelamento e W.O. A definir.
- **Fase 4 — Avulso.** A definir.
- **Fase 5 — Resultado e ranking:** cálculo de `standings` com `tier_for`, janela de 52 semanas e tela Ranking real. A definir.
- **Fase 6 — Corrida:** registro, tolerância de ±2% e marcas. A definir.
- **Fase 7 — Campeonatos e provas (inscrição e comprovante).** A definir.
- **Fase 8 — Expo.** A definir.
