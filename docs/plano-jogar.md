# Plano — tela Jogar (pareamento, partida, resultado, corrida e eventos)

> Estado: **planejado em 11 de outubro de 2026. Nada deste plano está implementado.** A ordem de trabalho está em [próximos passos](proximos-passos-jogar.md): a implementação começa depois da tela "Times e campeonatos", cujo desenho e plano estão em [plano de Times e campeonatos](plano-times-campeonatos.md) (12 de outubro de 2026). A tela Jogar atual (`web/src/pages/ArenaPage.tsx`, `screen === "play"`) continua só preparando os perfis esportivos. O backend não tem times, partidas, ranking, corrida nem eventos. O Expo ainda não tem a aba Jogar.

## Contexto

O desenho foi fechado em dez rodadas de protótipos, em 11 de outubro de 2026, a partir do [roteiro do projeto](roteiro-projeto.docx) (HU03–HU14, RN04–RN21). Os rankings e elos são os da tela Ranking atual: Bronze, Prata, Ouro, Diamante e Lendário (`rankingTiers` em `web/src/data/arena.ts`).

- **Protótipo consolidado** (artefato privado do usuário): https://claude.ai/artifact/U6RqvawwGLiUSPMst8haN4. O seletor percorre as oito telas decididas, e os fluxos são clicáveis.
- **Fonte local** (não versionada): `artifacts/prototipos/jogar.src.html`. Os arquivos `jogar-r1.src.html` a `jogar-r10.src.html` guardam cada rodada.
- Times, pessoas, elos, cortes, quadras e eventos do protótipo são **exemplos**. Nada disso deve virar dado demonstrativo no produto (AGENTS.md).

### Rodadas e escolhas

| Rodada | Pergunta | Escolha |
| --- | --- | --- |
| 1 | Estrutura da tela | **J1 · Lobby**: placa escura com abas das modalidades e botão redondo central. |
| 2 | Topo do Lobby | **H1 · Chave acima**: "Com meu time \| Avulso" no futebol, linha do elo/classificação e botão. Sem ranking, mostra "n de 3". |
| 3 | Vagas ao buscar | **V2 · Folha antes da busca**: formato, "o time está completo?" e vagas por posição. |
| 4 | Depois do pareamento | **P2**: proposta em tela cheia e tela da partida com as condições fixas no topo e o chat embaixo. |
| 5 | Chat | **C1 · Lados do time**, com braçadeira de capitão "C" no lugar do texto "REP". Data e hora no padrão Date Picker do shadcn. |
| 6 | Informar resultado | **R4 · No cartão da partida**. |
| 7 | Estados e toasts | **S1 · Cartão com prazo**. |
| 8 | Registrar corrida | **K2 · Cronômetro** em tela cheia, com os **cartões de marcas do K4**. |
| 9 | Campeonatos e provas | **E2 · Cartazes**. |
| 10 | Detalhe do evento | **D2 · Cartaz e abas**. O usuário pediu o Navigation Menu; depois de discutir a semântica, ficou o **Tabs** do shadcn com o mesmo visual. |

Rejeitados: estruturas de fundo claro tipo feed (J2), régua de etapas (J3), menu de modos (J4) e carrossel por modalidade (J5). Também ficaram de fora o anel de classificação no botão (H2), o brasão como botão (H4), o campinho para vagas (V3), a sala com abas (P3), as propostas como mensagens (P4), a linha do tempo da partida (P5) e a súmula (R2).

---

## Decisões de produto

### Tela Jogar (placa)
- Placa `forest` com o Coliseu, o título "Jogar", a pílula da cidade e as abas **Futebol | Tênis | Corrida**, sublinhadas em menta. Abaixo da placa, a lista "Outras formas de jogar": Campeonatos (ou Provas) e Meu time.
- **Futebol:** chave **Com meu time | Avulso**.
  - **Com meu time:** só para quem representa um time. Busca amistoso contra outro time.
  - **Avulso:** o atleta escolhe a posição (Goleiro, Defesa, Meio de campo, Atacante) e é encaixado na vaga aberta de outro time.
- **Linha do elo:**
  - Com ranking: o brasão do elo, o nome do elo e "Enfrenta Bronze, Prata ou Ouro".
  - Em classificação: "n/3" num círculo tracejado, três barrinhas e "n de 3 partidas · enfrenta qualquer nível". **Nunca** se atribui elo a quem ainda não tem classificação.
- **Botão redondo:** ENCONTRAR partida, ENCONTRAR vaga (avulso) ou REGISTRAR treino ou prova (corrida). Durante a busca, pulsa e mostra o tempo decorrido; tocar cancela.
- **Ponto menta no botão Jogar da navegação** enquanto houver busca, proposta ou combinação pendente.

### Pareamento (RN04 e RN05 revistas)
- **Faixa = mesmo elo ou elo vizinho** (Prata enfrenta Bronze, Prata e Ouro). Quem está sem ranking enfrenta qualquer nível, e quem tem ranking pode ser pareado com quem está sem. Mesma cidade, mesma modalidade e, no futebol, **mesmo formato**.
- **Formatos do futebol:** Futsal 5×5, Society 7×7 e Campo 11×11. **O ranking de times e o ranking individual são separados por formato** (individual: posição × formato, 12 rankings).
- **Busca dura 24 h** ou até ser cancelada. **A proposta dura 2 h** para os dois representantes aceitarem. Como a resposta pode chegar com o app fechado, a proposta gera notificação.
- **Proposta em tela cheia:** brasões, elos, contagem regressiva, Recusar, **Aceitar partida** e "Responder depois", que mantém a proposta na placa e nas notificações.
- Na **folha "Preparar busca"** (V2), o representante informa o formato e se o time está completo. Se não estiver, informa as vagas por posição com −/+:
  - no máximo um goleiro;
  - total de vagas até o tamanho do formato menos um.

  As vagas **abrem para avulsos quando a partida é agendada**.

### Avulso (RN06 revista)
- O avulso **aceita qualquer formato** (futsal, society ou campo) e escolhe como buscar a posição:
  - **uma posição específica** (Goleiro, Defesa, Meio de campo ou Atacante); ou
  - **qualquer posição** (preenchimento automático): o pareamento oferece a primeira vaga compatível de qualquer posição.
- O pareamento procura vagas abertas em partidas **agendadas** da mesma cidade e compara o elo individual **da posição e do formato da vaga** (ou qualquer nível, se ele estiver em classificação naquela posição e formato). A placa mostra a chave de posição com a opção "Qualquer posição".
- **Entra direto:** ao aceitar "Quero jogar", o avulso é escalado como convidado só naquela partida. O representante pode removê-lo depois. Ingresso permanente no time continua exigindo convite separado.
- O avulso escalado **entra no chat** da partida e perde o acesso quando a partida termina.

### Partida e chat (P2 + C1)
- **Cabeçalho:** brasões dos times com o elo no canto, "Ferrugem × Leões" e o estado (Combinando ou Agendada).
- **Cartão "Condições da partida"** fixo e recolhível no topo, com:
  - data e hora, quadra e quem reserva;
  - selos de aceite de cada lado;
  - **Propor outra** e **Aceitar condições**.

  Agendada a partida, ele mostra a reserva (a confirmar ou confirmada), **Alterar** e **Informar placar**.
- **Qualquer alteração depois do aceite volta a exigir o aceite dos dois** (RN05).
- **Folha "Propor condições":**
  - **Data:** Popover com Calendar, no padrão Date Picker do shadcn base: https://ui.shadcn.com/docs/components/base/date-picker. Dias passados ficam desabilitados.
  - **Horário:** campo de hora com passo de 15 min.
  - **Quadra:** catálogo da cidade ou "Sugerir outra quadra". A sugestão fica "em revisão" e vale só para esta partida (RN07).
  - **Quem reserva com o local** (RN08: o Arena só registra o estado da reserva).
- **Chat em grupo dos dois elencos (C1):**
  - **Lados:** o seu time fala à direita (você em verde-escuro, colegas em verde-claro) e o adversário à esquerda, em branco.
  - **Agrupamento:** mensagens seguidas da mesma pessoa se agrupam, com nome, time, hora e **braçadeira "C" para representantes**.
  - **Eventos da partida** (propostas, aceites, estatísticas enviadas) aparecem como faixas com o brasão.
  - **Permissões:** **o elenco conversa e só o representante aceita** (proposta, condições, placar). Membros veem "Só os representantes aceitam".
- **Brasão do time:** upload opcional. Sem brasão, aparece um escudo neutro com as iniciais.

### Cancelamento e W.O.
- **Cancelar:** qualquer representante cancela uma partida agendada **até 24 h antes** do início, com motivo opcional. Os dois elencos e os avulsos escalados são avisados; a partida vai para `cancelada` e não pontua. Os dois times podem voltar a buscar.
- **Depois das 24 h**, não há cancelamento: quem não comparecer **perde por W.O.** O representante presente registra o W.O. no cartão da partida, dentro do prazo de 48 h; o outro lado pode contestar no mesmo prazo, e a contestação deixa a partida sem resultado até a administração decidir.
- **Avulsos:** em cancelamento ou W.O., os avulsos escalados são avisados e a escalação é encerrada. No W.O., a presença dos atletas do time que compareceu conta.
- **A definir na implementação:** o placar registrado para o W.O. e quantos W.O. levam a alguma restrição de busca (ver [próximos passos](proximos-passos-jogar.md)).

### Resultado (R4 + S1)
- Depois do horário da partida, o cartão fixo vira **"Informe o placar"**, com −/+ por lado, **Revisar elenco** (presença) e **Enviar placar**.
- **Placar do tênis:** melhor de 3 sets, com tie-break em 6-6 e **super tie-break opcional** no lugar do terceiro set (até 10 pontos, com 2 de vantagem). O servidor valida cada set: 6-0 a 6-4, 7-5 ou 7-6 (com o placar do tie-break); vencedor com 2 sets; terceiro set só quando os dois primeiros forem divididos. O formato de super tie-break é combinado nas condições da partida.
- **Atleta:** cartão "Suas estatísticas", com a posição em que jogou, gols, assistências e a estatística da posição, além de uma **prévia de pontos** (RN12). Os envios aparecem no chat como eventos.
- **Confirmação bilateral** (RN09, RN15): o placar entra no ranking quando os dois lados informam o mesmo resultado.
- **Divergência** em amistoso: os dois podem corrigir até o prazo. Depois disso, a partida fica "sem resultado" e **não pontua**. Em campeonato, o organizador resolve (RN09).
- **Prazo de 48 h** após o início previsto para placar, estatísticas, revisão e contestação.
- **Contestação por estatística** (RN10): o representante adversário contesta itens; o item contestado não pontua até o representante do atleta revisar.
- **Estados no cartão S1** (verde-escuro):
  - Aguardando: anel com as horas restantes e "fecha seg, 20 out · 16:00".
  - Confirmado: selo menta e pílula "+3 pts".
  - Divergente: ícone ≠, os dois placares, **Corrigir o meu** e **Conversar**.
- **Toasts:** pílula escura com ícone menta.

### Corrida (K2 + K4)
- **Placa:** chips de distância **3, 5, 10, 21 e 42 km**. O elo mostrado é o daquela distância ("Ouro nos 5 km · Melhor 24:12 · treino").
- **Abaixo da placa:** "Suas marcas", com um cartão por distância (melhor tempo em 52 semanas, elo, origem, minigráfico de evolução e "+").
- **REGISTRAR** abre o **cronômetro em tela cheia**:
  - régua de distâncias com "Outra";
  - h:min:s com setas;
  - ritmo calculado;
  - **Treino | Prova do Arena** e data;
  - prévia ("Novo melhor tempo · −0:24", "Sobe para Ouro") e Salvar.
- **Origem visível:** "Treino" ou o nome da prova. **A palavra "autodeclarado" não aparece para o usuário.** O dado continua marcado internamente como não verificado (RN17).
- **Sem comprovante** para treino.
- **Distância livre** (ex.: 7 km) fica só no histórico. **Tolerância de medição de ±2%:** 9,8–10,2 km conta como 10 km (vale para cada distância padrão). Fora disso, vai para o histórico. Não se converte tempo de outra distância pelo ritmo.

### Campeonatos e provas (E2 + D2)
- **Lista em cartazes verde-escuros:** dia grande, elos aceitos (ou globo para "aberto a todos"), nome, formato e preço. Eventos fora da faixa aparecem apagados, com cadeado.
- **Detalhe:**
  - o cartaz no topo, com chips de formato, tipo e preço;
  - **Tabs** (`web/src/components/ui/tabs.tsx`, shadcn Base UI) com **Informações | Tabela** (ou **Percurso**, na corrida) **| Inscritos**, no visual do protótipo: pílula branca ativa sobre a faixa cinza;
  - o cartão do organizador ("Contato");
  - o aviso de pagamento fora do Arena;
  - o botão fixo "Inscrever Ferrugem FC · R$ 240".
- **Elegibilidade** (RN18): futebol usa o elo do time no formato; tênis, o do atleta; corrida, o da distância da prova. Quem está sem ranking só se inscreve em evento aberto.
- **Inscrição gratuita:** confirmada na hora.
- **Inscrição paga** (RN20, RN21):
  1. **Reservar vaga:** folha com o valor, o prazo e o bloco **"Pix do organizador"** em destaque: favorecido, chave em fonte monoespaçada com um botão de copiar **só com ícone** (`aria-label="Copiar chave Pix"`), para a chave caber na linha, e **Copiar Pix Copia e Cola** (código com valor e favorecido), para colar no app do banco.
  2. **Vaga reservada:** cartão S1 com o anel de horas, **Copiar chave Pix** e **Pagamento** (ⓘ). O prazo é 48 h ou até 12 h antes, o que vier primeiro.

  O **ícone ⓘ** (no bloco do Pix, ao lado do preço no detalhe e no cartão reservado) abre a folha **"Pagamento e informações"**: valor, favorecido, chave e Copia e Cola com botão de copiar, prazo do comprovante, "Como funciona" em 4 passos, instruções e contato do organizador e o aviso de que o Arena não recebe pagamentos. Esses dados de pagamento são cadastrados pelo organizador ao criar o evento ("Times e campeonatos") e ficam visíveis só para quem está logado. Copiar usa `navigator.clipboard`; se falhar, o texto fica selecionável.
  3. **Enviar comprovante:** imagem ou PDF de até 5 MB, visível só para o inscrito e o organizador.
  4. **Em análise.**
  5. **Confirmada**, ou **Recusada com motivo** e "Enviar outro".

  Sem comprovante no prazo, a vaga é liberada.
- **Tênis:** o detalhe informa o bônus no ranking (campeão +40, vice +20, 3º e 4º +10, com 4 ou mais inscritos; RN16).
- **Criar evento**, aprovar comprovantes e montar a tabela **ficam para a tela "Times e campeonatos"** (fora deste plano), desenhados no [plano de Times e campeonatos](plano-times-campeonatos.md). Criar eventos exige a **permissão de organizador**, concedida pela administração mediante pedido.

### Elos e pontuação

**Ideia geral:** **pontos fixos até Diamante.** **Lendário exige os pontos de Diamante e estar entre os 15% melhores daquele ranking** (modalidade + categoria: time/formato, posição/formato, tênis ou distância), arredondando para baixo. Exemplo: com menos de 7 classificados, ninguém é Lendário.

**Abrangência (decidida em 11 de outubro de 2026): tudo geral.** Elos, Lendário e a lista do Ranking consideram todo o Arena. A cidade serve **apenas para o pareamento** (RN04). Como os cortes são fixos, o elo significa o mesmo em qualquer cidade, e o top 15% do Lendário não fica distorcido em cidades com poucos jogadores.

**Classificação:** 3 partidas confirmadas no futebol (time e individual) e no tênis. Na corrida, a primeira marca já classifica. A janela é sempre de **52 semanas**.

**Cortes iniciais, a calibrar com dados reais antes de publicar:**

| Ranking | Métrica | Bronze | Prata | Ouro | Diamante |
| --- | --- | --- | --- | --- | --- |
| Futebol · time (por formato) | Pontos 3/1/0 (RN14) | 0–9 | 10–29 | 30–59 | 60+ |
| Futebol · individual (posição × formato) | Média por partida (RN11, RN12) | < 2,5 | 2,5–3,9 | 4,0–5,4 | ≥ 5,5 |
| Tênis | Pontos (RN16) | 0–29 | 30–79 | 80–149 | ≥ 150 |
| Corrida 3 km | Melhor tempo | > 20:00 | ≤ 20:00 | ≤ 15:00 | ≤ 12:00 |
| Corrida 5 km | Melhor tempo | > 35:00 | ≤ 35:00 | ≤ 27:00 | ≤ 22:00 |
| Corrida 10 km | Melhor tempo | > 1:15:00 | ≤ 1:15:00 | ≤ 57:00 | ≤ 47:00 |
| Corrida 21 km | Melhor tempo | > 2:45:00 | ≤ 2:45:00 | ≤ 2:05:00 | ≤ 1:45:00 |
| Corrida 42 km | Melhor tempo | > 5:45:00 | ≤ 5:45:00 | ≤ 4:20:00 | ≤ 3:40:00 |

**Onde ficam os cortes:**
- Os cortes ficam **no servidor**, numa tabela de configuração versionada com `calc_version`.
- O cliente só mapeia o nome do elo para a imagem.
- O ranking guarda a versão de cálculo usada, como pede o roteiro (2.4).

### Mudanças necessárias no roteiro

**Aplicadas em `docs/roteiro-projeto.docx` em 11 de outubro de 2026**, como requisitos planejados, sem apresentar nada como entregue. O resumo das mudanças:

- **RN04:** trocar as três faixas relativas pelo pareamento por **elo igual ou vizinho**; incluir formato, cidade, busca de 24 h e quem está sem ranking.
- **RN05:** proposta de 2 h; elenco no chat, com aceite só dos representantes.
- **RN06:** o avulso **entra direto** e o representante pode remover; as vagas são declaradas ao buscar e abrem ao agendar.
- **RN09/RN15:** prazo de 48 h; divergência não resolvida em amistoso fica sem resultado.
- **RN11/RN14:** rankings por formato; individual por posição e formato.
- **RN17:** distâncias 3/5/10/21/42 km, tolerância de ±2% e origem exibida como "Treino" ou nome da prova.
- **Elos (nova RN23):** cortes fixos por pontos, regra do Lendário (top 15%), 3 partidas de classificação e rankings gerais, com a cidade usada só no pareamento.
- **HU03/HU07:** botão Encontrar com o time ou como avulso.
- **TU01:** reescrever o teste de nível para o modelo de elo vizinho.

---

## Parte A — Backend (`backend/`)

Módulos por domínio, como pede o RNF08: `models/`, `schemas/`, `routers/` e `services/` novos para `teams`, `matchmaking`, `matches`, `courts`, `results`, `rankings`, `runs`, `events` e `notifications`. Toda transição de estado e todo cálculo ficam no servidor. O titular vem sempre da sessão.

### A1. Esquema (migrações Alembic, uma por fase)

| Tabela | Conteúdo principal |
| --- | --- |
| `teams` | Nome, `city_id`, `crest_media_id` (opcional) e criador. |
| `team_members` | `team_id`, `user_id`, papel (`representante` \| `membro`), entrada e saída. Único por usuário e time ativo. |
| `team_invites` | Convites com estado. |
| `match_searches` | Modalidade, cidade, formato, tipo (`time` \| `tenis` \| `avulso`), `team_id` ou `user_id` (nunca ambos), posição do avulso (nula = qualquer posição), formato (nulo para avulso = qualquer formato), elo no momento da busca, vagas declaradas (JSON por posição), estado e `expires_at` (24 h). |
| `matches` | Modalidade, formato, cidade, origem (`amistoso` \| `campeonato`), `event_id`, estado (`proposta`, `combinando`, `agendada`, `realizada`, `encerrada`, `sem_resultado`, `cancelada`), `proposal_expires_at` (2 h), `starts_at`, quadra (catálogo ou sugestão), quem reserva, reserva confirmada e `result_deadline` (início + 48 h). |
| `match_sides` | Lado A/B, `team_id` ou `user_id`, `accepted_at` e quem aceitou. |
| `match_terms` | Propostas de condições (data e hora, quadra, quem reserva), lado e autor, estado e aceites dos dois lados. A proposta vigente é única. |
| `match_slots` | Vagas para avulsos por posição; `filled_by`, `filled_at` e `removed_at`. |
| `match_lineups` | Atuação por atleta: time, posição, convidado e presença (RN03). |
| `match_messages` | Mensagens do chat; tipo `texto` \| `evento` com payload. Acesso: elencos dos dois lados e avulsos escalados até o encerramento. |
| `match_results` | Placar informado por lado (gols ou sets em JSON), autor e data. A confirmação é derivada da igualdade dos dois lados. |
| `football_stats` | Atleta, partida, posição, gols, assistências e estatística da posição; estado (`enviada`, `revisada`, `contestada`), revisor, quem contestou e motivo. |
| `courts` | Catálogo por cidade, tipo, estado (`publicada` \| `em_revisao` \| `rejeitada`), quem sugeriu e partida de origem (uso provisório). |
| `runs` | Atleta, distância em metros, duração em segundos, data, origem (`treino` \| `prova`), `event_entry_id` e distância padrão resolvida (ou nula, se fora dos ±2%). |
| `standings` | Ranking materializado e **geral** (sem cidade): sujeito, modalidade, categoria (formato, posição ou distância), métrica, posição no ranking, partidas, elo, `calc_version` e `updated_at`. |
| `rank_cuts` | Cortes versionados por ranking. |
| `events` | Campeonato ou prova: organizador, cidade, formato, tipo, capacidade, preço em centavos, dados de pagamento (favorecido, tipo e chave Pix, código Copia e Cola, instruções e contato), elos aceitos, datas e estado de publicação. A **criação** fica para "Times e campeonatos"; aqui só a leitura. |
| `event_entries` | Time ou atleta, estado (`reservada`, `em_analise`, `confirmada`, `rejeitada`, `expirada`, `cancelada`) e `reserved_until`. |
| `entry_receipts` | `media_id` privado, estado, decisão, motivo e data. Reenvios são preservados. |
| `notifications` | Destinatário, tipo, payload e `read_at`. |
| `audit_log` | Autor, ação, alvo e dados, para aceites, confirmações e decisões (RNF07). |

**Restrições obrigatórias:**
- Dois lados distintos por partida.
- Lado identificado por time ou atleta, nunca ambos.
- Uma busca ativa por time ou atleta e modalidade.
- Uma vaga preenchida por atleta e partida.
- Um resultado por lado.
- Comprovante acessível só ao inscrito, ao organizador e à administração.

### A2. Regras e concorrência
- **Fila no PostgreSQL:** a tabela `match_searches` é a fila. Cada busca ativa é uma linha esperando, e a ordem sai da consulta. Não há serviço de fila externo no MVP: o volume é baixo e a escala de tempo é de horas (busca de 24 h, proposta de 2 h), não de segundos.
- **Balde de compatibilidade:** modalidade + cidade + formato; no avulso, modalidade + cidade + posição. Só buscas do mesmo balde podem ser pareadas.
- **Pareamento por evento, numa transação:**
  1. `pg_advisory_xact_lock` sobre o hash do balde. Buscas do mesmo balde são pareadas uma de cada vez; baldes diferentes seguem em paralelo. A trava é do banco, então vale com várias instâncias da API.
  2. Procurar a busca compatível que espera. **Ordem:** mesmo elo primeiro, depois o vizinho e, por fim, a mais antiga.
  3. Se achar, criar a partida em `proposta`, encerrar as duas buscas e gerar as notificações, tudo na mesma transação. Se não achar, a busca continua esperando.
- **Por que a trava por balde, e não `SKIP LOCKED`:** com `SKIP LOCKED`, duas buscas compatíveis que chegam ao mesmo tempo não se enxergam (nenhuma das duas foi gravada ainda) e as duas ficariam esperando. A trava por balde serializa esse caso. Na transação, as linhas encontradas ainda são relidas com `FOR UPDATE` para não entrar em duas propostas, inclusive em reenvios (RNF06).
- **Quando o pareamento roda:** toda busca que espera é incompatível com as outras que esperam; por isso, só estes eventos podem formar um par novo, e cada um chama o mesmo serviço:
  - uma busca nova;
  - uma busca que volta à fila (recusa ou proposta expirada do outro lado);
  - vagas que abrem quando uma partida é agendada (avulsos que esperam);
  - o elo de quem espera que muda depois de um resultado confirmado.
- **Varredura periódica (rede de segurança):** um comando `admin_cli` agendado a cada minuto (agendador do sistema ou do provedor, a definir na implantação) que:
  - refaz o pareamento das buscas que esperam, balde por balde;
  - expira buscas (24 h), propostas (2 h), reservas pagas (48 h ou 12 h antes) e prazos de resultado (48 h);
  - devolve à fila, com o prazo original, o lado que aceitou uma proposta que expirou.

  As leituras também tratam `expires_at`, então um atraso da varredura nunca mostra estado vencido como válido.
- **Descoberta pelos clientes:** notificações e a leitura periódica da placa (a cada 15 s durante a busca). Sem WebSocket no MVP.
- **Recusa:** encerra a busca de quem recusou. O outro lado volta à fila.
- **Avulso:** o preenchimento de vaga é atômico, e duas pessoas não ocupam a mesma vaga.
- **Ranking:** a confirmação do resultado (ou o fim do prazo de contestação) recalcula `standings` dos rankings afetados, dentro da transação. O corte das 52 semanas é aplicado na leitura; um recálculo diário opcional atualiza quem saiu da janela.
- **Tolerância da corrida:** ±2% resolve a distância padrão no servidor.

### A3. Contratos da API (rascunho; nomes finais na implementação)
- **Times:**
  - `POST /teams`
  - `GET /me/teams`
  - `GET /teams/{id}`
  - `PUT /teams/{id}/crest`
  - `POST /teams/{id}/invites`
  - `PUT /team-invites/{id}`
  - `DELETE /teams/{id}/members/{user_id}`
- **Busca:**
  - `POST /matchmaking/searches`, com o corpo `{sport, format?, team_id?, position?, open_slots?}`
  - `GET /me/searches/active`
  - `DELETE /matchmaking/searches/{id}`
- **Propostas:**
  - `GET /me/proposals`
  - `PUT /matches/{id}/accept`
  - `PUT /matches/{id}/decline`
- **Partida:**
  - `GET /matches/{id}`
  - `GET /me/matches?state=`
  - `POST /matches/{id}/terms`
  - `PUT /matches/{id}/terms/{terms_id}/accept`
  - `PUT /matches/{id}/booking`
  - `GET /matches/{id}/messages?after=` e `POST /matches/{id}/messages`
  - `DELETE /matches/{id}/guests/{user_id}`
- **Quadras:**
  - `GET /courts?city_id=&q=`
  - `POST /courts/suggestions`
  - `GET /admin/court-suggestions` e `POST /admin/court-suggestions/{id}/decision`
- **Resultado:**
  - `PUT /matches/{id}/result`
  - `PUT /matches/{id}/attendance`
  - `PUT /matches/{id}/my-stats`
  - `PUT /matches/{id}/stats/{stat_id}/review`
  - `POST /matches/{id}/stats/{stat_id}/contest`
- **Ranking:**
  - `GET /rankings?sport=&kind=&format=&position=&distance=` (geral, paginado)
  - `GET /me/standings`, com elo, partidas de classificação e faixa enfrentada.
- **Corrida:**
  - `POST /me/runs`
  - `GET /me/runs?distance=`
  - `GET /me/run-bests`
- **Eventos:**
  - `GET /events?sport=&city_id=`
  - `GET /events/{id}`
  - `GET /events/{id}/entries`
  - `POST /events/{id}/entries`
  - `PUT /entries/{id}/receipt` (upload) e `GET /entries/{id}/receipt`
  - `DELETE /entries/{id}`
- **Notificações:**
  - `GET /me/notifications`
  - `PUT /me/notifications/{id}/read`

  Os tipos são proposta, aceite, condições, agendada, resultado, divergência, contestação, vaga preenchida, reserva expirando e comprovante decidido. A tela Notificações atual, que só mostra pedidos para seguir, passa a listar também esses tipos.

Erros com mensagens em português e sem dados sensíveis. A documentação da API e as decisões técnicas devem ser atualizadas a cada contrato: criar `docs/decisoes/0002-jogar.md`.

### A4. Mídia
- **Brasão do time:** reaproveitar `services/media.py` (MinIO) com a mesma normalização de imagem do avatar. Fica visível a quem vê o time.
- **Comprovante:** `MediaObject` privado (imagem ou PDF, 5 MB), servido só por rota autorizada (RNF02, RNF07). PDF exige ampliar a validação atual, que é só de imagem.

## Parte B — Web (`web/`)

### B1. Componentes shadcn/ui (Base UI, estilo `base-nova`)
- **Novos, pelo CLI:**
  - **Popover** e **Calendar**, para o Date Picker. O Calendar traz `react-day-picker`, **dependência nova aprovada pelo usuário em 11 de outubro de 2026** (instalar só na implementação, pelo CLI do shadcn);
  - **Collapsible**, para as condições recolhíveis;
  - **Dialog**, para a proposta em tela cheia e o cronômetro.
- **Toast:** preferir o Toast do Base UI, já instalado, ao Sonner, que seria outra dependência.
- **Reaproveitar:** `Tabs` (variante `dark`), `ToggleGroup`, `Sheet`, `Button`, `Badge`, `Progress`, `Slider` e `EmptyState`.
- **Seções do evento com `Tabs`:** trocar painéis na mesma tela é o papel de abas (`tablist`/`tab`/`tabpanel` e setas do teclado). O Navigation Menu, pedido no protótipo, é para navegar entre páginas e exigiria uma tela por seção; por isso ficou o `Tabs`, com o mesmo visual.

### B2. Telas e componentes (em `components/play/`, sem duplicar mapeamentos)
- **`PlayPage`** (substitui o bloco `play` de `ArenaPage`): `PlayPlate` (abas, `ModeSwitch`, `PositionChips`, `DistanceChips`, `TierLine` com `PlacementPips`, `PlayButton`), "Outras formas de jogar" e `RunMarks`.
- **`PrepareSearchSheet`:** formato, `Switch` "time completo" e `SlotSteppers`.
- **`ProposalDialog`:** tela cheia com `TeamMark` (brasão + elo) e contagem regressiva.
- **`MatchPage`:** `ConditionsCard` (Collapsible), `MatchChat`, `TermsSheet` (Date Picker, horário, `CourtPicker` com sugestão, quem reserva), `Armband` e `ResultCard` (R4) com `MyStatsCard`.
- **`StatusCard`** (S1, reutilizado em resultado, corrida e inscrição) e o toast S1.
- **`RunStopwatchDialog`:** régua de distâncias, cronômetro, ritmo e prévia.
- **`EventsPage`** (`EventPoster`), **`EventPage`** (`Tabs` e seções) e **`EntrySheet`/`ReceiptSheet`**.

**Dados e navegação:**
- **Cliente da API:** `src/api/play.ts`, tipado, sobre o `request` existente, com cookie HttpOnly e tratamento de 401.
- **`data/arena.ts`:** mapeamentos de elo → imagem, formatos, posições (siglas GOL/DEF/MEI/ATA) e distâncias.
- **Pilha de telas:** o tipo `Screen` e a pilha de `ArenaPage` ganham `match`, `events` e `event` (com ids no `Entry`).
- **Atualização:** o chat e a placa usam leitura periódica enquanto a tela está visível (chat a cada 4 s com `after=`; placa ao focar e a cada 15 s durante a busca). WebSocket fica para depois.
- **Dados reais apenas:** sem time, partida ou evento cadastrado, a interface mostra estados vazios.

### B3. Tela Ranking
- Os rankings passam a consumir `GET /rankings`, sempre **gerais**. A linha de cidade da tela atual ("Cidade ainda não definida") sai. As escolhas são:
  - futebol: Times | Individual, formato e posição;
  - tênis;
  - corrida: distância.
- Os elos da tela continuam como referência visual. Cada linha mostra o brasão do elo de quem já tem classificação.
- Os cartões de "Suas modalidades" deixam de mostrar o texto fixo "Sem classificação" e passam a ler `GET /me/standings`.

### B4. Acessibilidade e layout
- **Navegação e leitura:**
  - Foco visível.
  - Navegação por teclado no cronômetro (setas) e nos contadores −/+.
  - `aria-live` no tempo de busca e nos estados.
  - Rótulos em todos os botões só com ícone.
  - A braçadeira tem `aria-label="Representante"`.
- **Contraste:** menta sobre `forest` nos rótulos escuros. A rodada 10 corrigiu um caso de verde sobre escuro.
- **Larguras:** conferir 320, 390 e 1440 px e a ausência de overflow horizontal. As rodadas 6 e 8 acharam overflow de grade, resolvido com `minmax(0, 1fr)` e `min-width: 0`.
- **Movimento:** `prefers-reduced-motion` nos pulsos, anéis e animações de entrada.

## Parte C — Expo (`mobile/`)

O Expo hoje só tem as abas Comunidade e Perfil. A aba Jogar entra **numa fase própria, depois da web**, com a mesma API (Bearer + SecureStore): placa, folha de busca, proposta, partida com chat, resultado, cronômetro e eventos. O Date Picker nativo e o upload de comprovante (`expo-document-picker`) exigem verificar as dependências com `npx expo install --check`. Não se declara paridade visual sem conferir em aparelho.

## Fases de entrega

Cada fase precisa ser demonstrável de ponta a ponta, com persistência após recarregar.

1. **Elos:** `standings`/`rank_cuts` vazios e a linha do elo (classificação 0 de 3). Os times (criar, brasão, convites, papéis e link) vêm da fase 1 do [plano de Times e campeonatos](plano-times-campeonatos.md#fases-de-entrega).
2. **Pareamento de amistosos (time e tênis):** busca de 24 h, proposta de 2 h, aceite bilateral, notificações e a placa com os estados.
3. **Partida:** condições com novo aceite, quadras (catálogo, sugestão e revisão administrativa), reserva, chat, cancelamento até 24 h antes e W.O.
4. **Avulso:** vagas declaradas ao buscar, busca por posição ou em qualquer posição, qualquer formato, entrada direta, remoção e acesso ao chat.
5. **Resultado e ranking:** placar bilateral, presença, estatísticas, contestação, prazos, cálculo dos rankings e elos, e a tela Ranking real.
6. **Corrida:** registro, tolerância de ±2%, marcas e elo por distância.
7. **Campeonatos e provas:** lista, detalhe e inscrição com comprovante. **Depende de existirem eventos criados**, o que exige a criação pelo organizador em "Times e campeonatos". Sem ela, a lista mostra o estado vazio, sem eventos fictícios.
8. **Expo.**

## Testes e verificação
- **Backend, unidade:**
  - TU01 reescrito (elo vizinho e sem ranking) e TU02–TU06;
  - cortes de elo e regra do Lendário (15%, arredondamento, mínimo de classificados);
  - classificação de 3 partidas;
  - tolerância de ±2%;
  - prazos de 24 h, 2 h, 48 h e 48 h/12 h;
  - prévia de pontos.
- **Backend, integração (PostgreSQL):**
  - pareamento concorrente sem duplicidade (uma busca nunca entra em duas propostas);
  - duas buscas compatíveis criadas ao mesmo tempo terminam pareadas, sem as duas ficarem esperando (trava por balde);
  - a varredura pareia o que ficou esperando e expira o que venceu, e rodar duas vezes não muda o resultado;
  - aceite e recusa;
  - expiração;
  - novo aceite após alteração;
  - vaga disputada por dois avulsos;
  - placar igual, divergente e expirado;
  - contestação;
  - acesso ao chat e ao comprovante por papel;
  - inscrição paga expirando.

  Cobrir TI02–TI07 do roteiro.
- **Web:** testes dos fluxos com Testing Library (busca, proposta, condições, resultado, cronômetro, inscrição) e os checks do AGENTS.md (`npm run lint`, `npm run build`, `npm run test:coverage`). No navegador, conferir o fluxo real contra a API, a persistência ao recarregar e as larguras 320/390/1440.
- **Roteiro:** atualizar TF01–TF08 com as evidências de cada fase.

## Perguntas em aberto

Resolvidas em 11 de outubro de 2026: ranking e Lendário gerais; `react-day-picker` aprovado; `Tabs` nas seções do evento; eventos dependem da criação pelo organizador em "Times e campeonatos"; cancelamento até 24 h antes e W.O. depois; placar do tênis em melhor de 3 com tie-break e super tie-break opcional; avulso em qualquer formato, com posição específica ou qualquer posição. A ordem do que vem a seguir está em [próximos passos](proximos-passos-jogar.md).

- **Migração da fila para Redis (em aberto, sem decisão).** O MVP usa o PostgreSQL como fila. Reavaliar o Redis (filas ordenadas por balde, travas distribuídas e pub/sub para avisar os clientes) se aparecer um destes sinais:
  - pareamento em tempo real, em segundos, como num jogo online;
  - muitas buscas por segundo no mesmo balde, a ponto de a trava virar gargalo;
  - avisos instantâneos por WebSocket em vez de leitura periódica.

  Para não travar essa troca: deixar o pareamento atrás de uma interface de serviço (`MatchmakingQueue` com `enqueue`, `try_match` e `expire`), com a implementação em PostgreSQL. Mesmo com Redis, o PostgreSQL continua sendo a fonte da verdade das buscas e partidas; o Redis seria só índice e aviso. Isso exige um serviço novo no Docker Compose e no CI.

- **Detalhes do W.O.:** placar registrado e eventual restrição por W.O. repetido.
- ~~**Partidas de campeonato:** têm chat? Usam o mesmo cartão de resultado?~~ Resolvido em 12 de outubro de 2026: têm chat **com o organizador participando**, usam o **mesmo cartão de resultado**, e a divergência vai ao organizador, que decide com justificativa ([plano de Times e campeonatos](plano-times-campeonatos.md#partidas-do-campeonato-s1)).
- **Moderação do chat:** denúncia de mensagem, reaproveitando `ContentReport`.
- **Momento do Expo** e se ele acompanha cada fase ou vem no fim.

## Fora do escopo
- Criar e gerir campeonatos e provas, aprovar comprovantes como organizador e montar tabelas: estão no [plano de Times e campeonatos](plano-times-campeonatos.md).
- Pagamento dentro do Arena, reserva automática de quadra, Strava ou relógios, vídeos e push notifications nativas (a lista de notificações é dentro do app).
- Moedas, recompensas ou qualquer pontuação fictícia (AGENTS.md).
