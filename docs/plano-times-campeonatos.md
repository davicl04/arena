# Plano — Times e campeonatos (Meus times, organizador e administração)

> Estado: **planejado em 11 e 12 de outubro de 2026. Nada deste plano está implementado.** É a etapa 1 dos [próximos passos do Jogar](proximos-passos-jogar.md). O backend não tem times, eventos, inscrições nem notificações; a web e o Expo não têm essas telas.

## Contexto

O desenho foi fechado em 19 rodadas de protótipos, a partir do [roteiro](roteiro-projeto.docx) (HU08–HU10, RN02, RN18–RN21) e do [plano do Jogar](plano-jogar.md), que deixou para esta etapa a criação de eventos, a análise de comprovantes e a montagem das tabelas.

- **Protótipo consolidado** (artefato privado do usuário): https://claude.ai/artifact/G3xgALgdMGPsQ4YneJPGv7. O seletor percorre as 15 telas decididas, e os fluxos são clicáveis.
- **Fonte local** (não versionada): `artifacts/prototipos/times.src.html`. Os arquivos `times-r1.src.html` a `times-r19.src.html` guardam cada rodada.
- Times, pessoas, elos, eventos, Pix e comprovantes do protótipo são **exemplos**. Nada disso vira dado demonstrativo no produto (AGENTS.md).

### Rodadas e escolhas

| Rodada | Pergunta | Escolha |
| --- | --- | --- |
| 1 | Estrutura única de times e eventos | Rejeitada: **duas áreas separadas**, Meus times (todo atleta) e Organizador (só quem tem a permissão). |
| 2 | Estrutura de Meus times | **M3 · Carteirinhas**: um cartão por time deslizando na placa escura; elenco abaixo. |
| 3 | Carteirinha | **C5 · Painel de formatos**: grade Futsal \| Society \| Campo com o elo, a classificação (n/3) ou "sem jogos". Sem cores do time no fundo. |
| 4 | Elenco | **E1 · Grade de rostos**, com "+N" e folha do atleta. |
| 5 e 6 | Convidar atleta | **I5 · Prévia e mensagem** + **Q2** (abas Escolher atleta \| Link e QR) + **Q5** (botão de QR na carteirinha). |
| 7 | Criar time | **F2 · Prévia ao vivo**. Editar time usa a mesma tela. |
| 8 e 9 | Convite recebido | **R2 · Faixa e folha** com **K1 · Cartão único**. |
| 10 | Área do organizador | **O3 · Cartazes**. |
| 11 | Gestão do evento | **G3 · Agora e seções**. |
| 12 | Comprovantes | **A2 · Lista e folha**. |
| 13 e 14 | Tabela | **B3 · Árvore** no visual **T2 · Espelhada**; tabela cruzada no todos contra todos. |
| 15 | Agendar partidas | **S1 · Lista e folha**, com **horário livre**. |
| 16 | Criar evento | **V4 · Uma pergunta por vez**. |
| 17 | Placar divergente | **D3 · Histórico e chat**. |
| 18 | Pedido de organizador | **P3** (cartão no Menu) com o formulário do **P5** (página "Seja organizador"). |
| 19 | Administração | **AD1 · Filas no Menu**. |

Rejeitados, entre outros: estrutura única com pendências (T3), vestiário de um time só (M2), abas por time (M4), faixas nas cores do time (M5), carteirinha em ingresso, brasão gigante ou camisa (C2–C4), convite em tela cheia ou nas notificações (R3, R4), painel de pendências do organizador (O2), quadro de inscrições (G5), pilha de comprovantes (A4), grade de quadras e agendamento em lote (S2, S3) e criação de evento em página única (V3).

---

## Decisões de produto

### Duas áreas e papéis
- **Meus times** é de todo atleta. Abre pelo atalho "Meu time" da placa do Jogar.
- **Organizador é uma permissão**, não um vínculo: o atleta pede, e a administração aprova ou recusa com motivo. Só quem tem a permissão vê a seção "Organizador" no Menu e cria eventos.
- **Administração** continua sendo `users.is_admin`. As filas novas ficam no Menu, junto de "Denúncias".

### Meus times (M3 + C5 + E1)
- **Placa escura** com o Coliseu e um **carrossel de carteirinhas**, uma por time, e um último quadro tracejado "Criar time".
- **Carteirinha (C5):**
  - brasão (ou escudo neutro com as iniciais), nome e "Brasília · você representa" ou "você é membro";
  - grade Futsal \| Society \| Campo com o brasão do elo, "n/3" de classificação ou "sem jogos";
  - elenco em miniatura;
  - para o representante, **Convidar**, botão só com ícone de **QR** (`aria-label="Link e QR do time"`) e **Editar** (só ícone);
  - para o membro, **Sair do time**.
- **O cartão centralizado define o elenco mostrado abaixo** (E1): grade de rostos com a braçadeira "C" nos representantes, primeiro nome e posição; acima de 11, um "+N" mostra todos.
- **Folha do atleta:**
  - ver perfil;
  - **tornar representante** ou **tirar a braçadeira**;
  - **remover do time**, com confirmação. O histórico de partidas continua registrado, e para voltar é preciso novo convite.
- **Regra:** o time tem **sempre pelo menos um representante**. O último não tira a própria braçadeira nem sai sem antes passá-la.
- Abaixo do elenco, para o representante: **Pedidos para entrar** (pelo link) e **Convites enviados** (com Cancelar).
- Um atleta pode estar em vários times (RN02).

### Convidar (I5 + Q2 + Q5)
- **Passo 1, aba "Escolher atleta":**
  - quem você segue e busca por nome ou @usuário (a busca de usuários já existe);
  - cada pessoa mostra "No elenco", "Pendente" ou "Escolher".
- **Passo 2, revisão:** a carteirinha C5 como o convidado vai ver e uma **mensagem opcional de até 140 caracteres**.
- **Aba "Link e QR":**
  - QR, link com copiar e compartilhar e "Gerar outro link";
  - **o link não expira**; só deixa de valer quando um representante gera outro;
  - **quem entra pelo link pede e aguarda a aprovação** de um representante. Isso cria o **pedido de entrada**, além do convite.
- **Quem escaneia** vê a carteirinha do time e **Pedir para entrar**, depois "Pedido enviado · aguardando um representante". Link trocado mostra "Este link não vale mais".
- **Convite recebido (R2 + K1):**
  - faixa menta no topo da placa ("Leões do Cerrado convidou você" ou "2 convites para times") abre uma folha escura;
  - cada convite é um **cartão único**: brasão e nome, "Caio Ramos convidou você · há 2 horas", elos em pílulas só dos formatos em que o time jogou, mensagem como citação com filete menta, elenco em miniatura, **Aceitar | Recusar**;
  - aceitar põe o time no carrossel como membro;
  - o convite também gera notificação.

### Criar e editar time (F2)
- **Tela escura** com a carteirinha no topo, que muda enquanto se digita.
- **Campos:**
  - brasão opcional: enviar, trocar ou remover; sem imagem, usam-se as iniciais;
  - nome, de 3 a 40 caracteres;
  - cidade, vinda do perfil de futebol, com "Trocar" pelo catálogo.
- Quem cria é o representante. Depois de criar, o time só tem você, e o aviso "Seu time só tem você" leva a Convidar ou a Link e QR.
- **Times não têm cores próprias:** a C5 dispensa esse campo.

### Pedido de organizador (P3 + P5)
- **No Menu**, um cartão escuro "Organizar no Arena" com as etapas Pedir → Análise → Organizar e o estado do pedido:
  - **em análise**, com "Cancelar pedido";
  - **recusado**, com o motivo e "Enviar novo pedido";
  - **aprovado**: o cartão some e aparece a seção **Organizador · Meus eventos**.
- **Página "Seja organizador"** com as regras do papel antes do formulário:
  - o pagamento é feito fora do Arena;
  - o organizador analisa os comprovantes e resolve as divergências;
  - eventos pagos passam pela administração.
- **Campos do pedido:**
  - nome do organizador (pessoa ou entidade);
  - cidade;
  - modalidades;
  - experiência (opcional);
  - contato;
  - link (opcional);
  - aceite das responsabilidades.

### Área do organizador (O3 + G3)
- **Lista em cartazes** (o E2 do Jogar):
  - estado no canto: Rascunho, Em aprovação, Inscrições abertas, Em andamento ou Encerrado;
  - barra de inscrições;
  - alerta com o número de pendências;
  - "Novo evento" como último cartaz tracejado.
- **Gestão do evento:**
  - cartaz no topo (data, nome, formato, tipo, preço e barra);
  - cartão **"Agora"** com a próxima ação: analisar comprovantes, agendar partidas, completar o rascunho ou aguardar a administração;
  - **seções**, cada uma com tela própria: times inscritos, comprovantes, chaveamento (ou tabela), partidas, dados do evento e pagamento/Pix.

### Criar evento (V4)
- **Uma pergunta por vez** em tela escura, com a prévia do cartaz abaixo:
  1. nome;
  2. modalidade, formato (futsal, society, campo; ou 3 a 42 km) e tipo (todos contra todos ou eliminação simples; a corrida não tem tipo);
  3. vagas (4, 8 ou 16 na eliminação; livre nos demais) e quem pode entrar, aberto ou elos escolhidos (RN18);
  4. data, fim das inscrições e local;
  5. inscrição gratuita ou paga.
- **Evento pago:**
  - pede valor e o bloco **"Pix para receber"**: favorecido, tipo de chave (CPF, e-mail, telefone ou aleatória), chave, Pix Copia e Cola (opcional), instruções e contato;
  - esses dados alimentam a folha "Pagamento e informações" do Jogar e ficam visíveis só para quem está logado;
  - o botão vira **"Enviar para aprovação"**.
- **Evento gratuito** publica direto.
- **Rascunho:** pode ser salvo a qualquer momento. A gestão mostra o checklist do que falta, e "Publicar" fica desabilitado até completar.

### Comprovantes (A2)
- **Abas** Para analisar \| Decididos, com miniaturas.
- **Folha do comprovante:**
  - a imagem ou o PDF, quando foi enviado, o tipo e o valor;
  - o **histórico de recusas** anteriores;
  - **Aprovar | Recusar**.
- **Recusar exige motivo:** valor diferente, favorecido errado, comprovante ilegível, data fora do prazo ou outro, com detalhe opcional.
- O time vê o motivo e **pode enviar outro até o fim da reserva** (48 h ou até 12 h antes, como no plano do Jogar). Os envios anteriores ficam preservados.
- O comprovante é visível só para o inscrito, o organizador e a administração.

### Tabela (B3 + T2)
- **Eliminação simples:**
  - **árvore espelhada**: quartas dos dois lados, semifinais no meio e a final escura no centro com o troféu e contorno dourado;
  - escudos com as iniciais, cabendo em 390 px;
  - o sorteio monta os confrontos; tocar em dois times troca os lugares;
  - "Sortear de novo" e "Confirmar chaveamento";
  - semifinais e final aparecem como "Vencedor J1 × Vencedor J2".
- **Todos contra todos:**
  - as rodadas são geradas automaticamente (cada time joga uma vez por rodada);
  - a **tabela cruzada** mostra a rodada de cada confronto;
  - o sorteio só muda a ordem.
- Depois de confirmar, os times veem a tabela e o organizador agenda as partidas.

### Partidas do campeonato (S1)
- **Lista dos jogos**, com os sem data primeiro. Tocar abre a folha:
  - **data** pelo Date Picker do shadcn;
  - **horário livre**, num campo de hora digitado, sem horários prontos;
  - **quadra** do catálogo ou "Sugerir outra quadra" (fica em revisão, RN07).
- **Conflito:** se a mesma quadra já tem jogo a menos de **2 h** naquele dia, a folha mostra o aviso e bloqueia o agendamento (decidido em 12 de outubro de 2026; o protótipo foi ajustado).
- Os dois elencos são avisados. A reserva é com o local; o Arena só registra (RN08).
- **Partidas de campeonato têm chat**, com o **organizador participando**. Data, hora e quadra são do organizador; o cartão de condições não tem "Propor outra".
- **Resultado:** usam o **mesmo cartão de resultado** dos amistosos (R4 do Jogar). Se os placares divergirem, a decisão vai ao organizador (RN09).

### Placar divergente (D3)
- **Linha do tempo da partida:** jogo, os dois envios com quem e quando, e a divergência.
- **Trecho do chat** da partida, com "Abrir chat".
- **Decisão:**
  - o placar informado por um dos times ou outro placar (contadores);
  - **justificativa obrigatória**, registrada e visível aos dois times.
- Ao registrar, a tabela e o ranking são atualizados e os elencos avisados.

### Administração (AD1)
- No Menu, a seção **Administração** ganha **Pedidos de organizador** e **Eventos pagos**, com contador, ao lado de **Denúncias**.
- **Cada fila** é uma lista que abre uma folha:
  - pedido de organizador: dados do pedido e "Ver perfil";
  - evento pago: cartaz, dados e Pix informado.
- **Aprovar | Recusar exige motivo.** Os motivos sugeridos:
  - organizador: contato não funciona, pouca informação, pedido repetido, outro;
  - evento: Pix incompleto, preço ou datas inconsistentes, conteúdo inadequado, outro.
- **Efeitos da recusa:**
  - **pedido recusado** pode ser reenviado;
  - **evento recusado** volta a rascunho com o motivo, e o organizador corrige e reenvia.

### Decisões de 12 de outubro de 2026 (perguntas da primeira versão do plano)
- **Chaveamento com menos confirmados que as vagas:** o campeonato **segue com os confirmados**.
  - Na eliminação simples, as vagas sem time viram **folgas**: quem fica sem adversário na primeira fase passa direto, e a árvore mostra "Folga".
  - No todos contra todos, as rodadas são geradas com os confirmados. Com número ímpar, um time folga em cada rodada.
- **Conflito de quadra:** 2 horas por jogo.
- **Encerrar time:** um representante pode **encerrar o time**, desde que não haja partida agendada nem inscrição ativa.
  - O time some de Meus times e da busca, e os membros são avisados.
  - O histórico de partidas e o ranking continuam registrados.
  - É assim que um time sem uso deixa de existir, já que o último representante não pode sair.
- **Cancelar evento publicado com inscritos:** o organizador cancela com motivo e **devolve o dinheiro** por Pix, fora do Arena.
  - Cada inscrição paga vira **"Devolução pendente"**.
  - O organizador anexa o **comprovante da devolução** na inscrição, no mesmo fluxo de envio de comprovantes, e o participante confirma o recebimento.
  - O cancelamento é avisado no **chat do campeonato**: um canal do evento com o organizador e os inscritos, ainda a desenhar.
- **Revogar organizador:** só a **administração**, com motivo. Para os eventos abertos do organizador revogado, a administração decide se seguem ou se são cancelados, com o fluxo de devolução.
- **QR:** **`qrcode.react`** na web (SVG, sem dependências) e **`react-native-qrcode-svg`** no Expo, com leitura pelo `expo-camera`. A instalação fica para a implementação.

### Mudanças no roteiro

**Aplicadas em `docs/roteiro-projeto.docx` em 12 de outubro de 2026**, como requisitos planejados: estado do projeto, público e papéis, HU08–HU10, RN01, RN02, RN09, RN19–RN21, Tela 3, permissões, a linha "Contas adultas, papéis por vínculo e permissão de organizador" e as limitações. O resumo:

- **Papéis e permissões:** organizador passa a ser uma permissão concedida pela administração mediante pedido, não um papel derivado de vínculos.
- **RN02:** time com pelo menos um representante; convite com mensagem opcional; **pedido de entrada pelo link do time** (sem validade, revogado ao gerar outro), aprovado por um representante.
- **RN09:** em campeonato, a decisão do organizador exige justificativa registrada.
- **RN19:** o organizador agenda data, horário livre e quadra; as partidas de campeonato têm chat com o organizador e o mesmo cartão de resultado.
- **RN20:** além dos eventos pagos, os **pedidos de organizador** passam pela administração; o evento recusado volta a rascunho com motivo; a administração pode revogar a permissão de organizador.
- **RN19 (complemento):** chaveamento com folgas quando faltam confirmados; conflito de quadra de 2 h.
- **RN21 (complemento):** evento cancelado com inscritos exige a devolução por Pix, com comprovante por inscrição e confirmação do participante.
- **RN02 (complemento):** um representante pode encerrar o time sem partidas agendadas nem inscrições ativas, preservando o histórico.
- **RN21:** reenvio de comprovante até o fim da reserva, com os envios anteriores preservados.
- **HU08–HU10** e a Tela 3 ("Times e campeonatos") passam a descrever as duas áreas separadas.

---

## Parte A — Backend (`backend/`)

Módulos por domínio (RNF08): `teams`, `organizers`, `events`, `entries`, `brackets`, `notifications` e `audit`. Toda transição de estado fica no servidor, e o titular vem sempre da sessão.

### A1. Esquema (migrações Alembic, uma por fase)

| Tabela | Conteúdo principal |
| --- | --- |
| `teams` | Nome, `city_id`, `crest_media_id` (opcional), criador, `invite_token_hash`, data de geração do link e estado (`ativo` \| `encerrado`, com quem e quando). |
| `team_members` | `team_id`, `user_id`, papel (`representante` \| `membro`), entrada e saída. Único por usuário e time ativo. |
| `team_invites` | Time, convidado, quem convidou, mensagem (até 140), estado (`pendente`, `aceito`, `recusado`, `cancelado`) e datas. Um pendente por time e convidado. |
| `team_join_requests` | Time, quem pediu (pelo link), estado (`pendente`, `aprovado`, `recusado`, `cancelado`), quem decidiu e quando. Um pendente por time e usuário. |
| `organizer_requests` | Usuário, nome do organizador, `city_id`, modalidades, experiência, contato, link, aceite, estado (`em_analise`, `aprovado`, `recusado`, `cancelado`), motivo, quem decidiu e quando. Um em análise por usuário. |
| `organizers` | `user_id` único, nome exibido, aprovação (quem e quando) e revogação. A permissão é a existência de linha ativa. |
| `events` | O do plano do Jogar, mais: organizador, nome, modalidade, formato ou distância, tipo, vagas, aberto ou elos aceitos, data, fim das inscrições, local (quadra ou texto), preço em centavos, Pix (favorecido, tipo de chave, chave, Copia e Cola, instruções, contato), estado (`rascunho`, `em_aprovacao`, `recusado`, `publicado`, `em_andamento`, `encerrado`, `cancelado`), motivo da recusa e quem revisou. |
| `event_entries` e `entry_receipts` | Os do plano do Jogar. A decisão guarda motivo, detalhe, quem decidiu e quando; os reenvios ficam preservados. A inscrição ganha os estados `devolucao_pendente` e `devolvida`, e o comprovante ganha o tipo (`pagamento` \| `devolucao`), além da confirmação do participante. |
| `event_messages` | Chat do campeonato (organizador e inscritos), com avisos como o cancelamento. Desenho pendente. |
| `matches` | O do plano do Jogar, com `origem = campeonato`, `event_id`, fase ou rodada, posição na chave e `next_match_id`, para a árvore. |
| `result_decisions` | Partida, organizador, placar decidido, justificativa e data. |
| `notifications` e `audit_log` | Os do plano do Jogar, com os tipos novos desta etapa. |

**Restrições obrigatórias:**
- Pelo menos um representante ativo por time, garantido na transação de remover, tirar braçadeira e sair.
- Só representantes convidam, aprovam pedidos, geram link e editam o time.
- Só o organizador do evento (ou a administração) vê comprovantes, decide, monta a tabela e agenda.
- O token do link é guardado como hash; gerar outro invalida o anterior.
- Evento pago só fica `publicado` por decisão da administração.

### A2. Regras
- **Convite:**
  - aceitar cria o vínculo `membro` e encerra os outros convites e pedidos pendentes da mesma pessoa para o time;
  - o representante pode cancelar o convite enquanto estiver pendente.
- **Link:**
  - `GET` do token mostra a prévia só para usuário logado;
  - `POST` cria o pedido; um repetido devolve o pendente.
- **Pedido de organizador:**
  - aprovar cria `organizers` e notifica;
  - recusar exige motivo;
  - quem foi recusado pode pedir de novo.
- **Evento:**
  - `rascunho` → publicar: gratuito vai a `publicado`; pago vai a `em_aprovacao`;
  - a administração aprova (`publicado`) ou recusa (`rascunho`, com motivo).
- **Chaveamento:**
  - a eliminação exige 4, 8 ou 16 vagas; o sorteio usa semente gravada (reprodutível);
  - a troca e a confirmação geram as partidas;
  - no todos contra todos, as rodadas saem pelo método do círculo.
- **Agendamento:**
  - conflito quando a mesma quadra tem outra partida do evento a menos de 2 horas;
  - o servidor valida e responde `409`, com o jogo que conflita.
- **Divergência:** só o organizador decide, com justificativa de pelo menos 5 caracteres. A decisão entra no `audit_log`, atualiza o ranking e notifica os dois elencos.

### A3. Contratos da API (rascunho; nomes finais na implementação)

**Times:**
- `POST /teams`, `PATCH /teams/{id}`, `PUT /teams/{id}/crest` e `DELETE /teams/{id}/crest`
- `GET /me/teams`, `GET /teams/{id}` e `GET /teams/{id}/members`
- `PATCH /teams/{id}/members/{user_id}` (papel) e `DELETE /teams/{id}/members/{user_id}` (remover ou sair)

**Convites e link:**
- `POST /teams/{id}/invites`, com `{user_id, message?}`; `DELETE /team-invites/{id}`
- `GET /me/team-invites` e `PUT /team-invites/{id}`, com `{decision: aceitar | recusar}`
- `GET /teams/{id}/invite-link` e `POST /teams/{id}/invite-link` (gera outro)
- `GET /join/{token}` (prévia) e `POST /join/{token}` (pede entrada)
- `GET /teams/{id}/join-requests` e `PUT /team-join-requests/{id}`

**Organizador:**
- `POST /me/organizer-request`, `GET /me/organizer-request` e `DELETE /me/organizer-request`
- Administração: `GET /admin/organizer-requests` e `POST /admin/organizer-requests/{id}/decision`

**Eventos (organizador):**
- `POST /organizer/events` (rascunho), `PATCH /organizer/events/{id}` e `POST /organizer/events/{id}/submit`
- `GET /organizer/events` e `GET /organizer/events/{id}` (com pendências)
- Administração: `GET /admin/events?state=em_aprovacao` e `POST /admin/events/{id}/decision`

**Inscrições e comprovantes (organizador):**
- `GET /organizer/events/{id}/entries` e `GET /entries/{id}/receipts` (histórico)
- `GET /receipts/{id}/file` (rota autorizada) e `POST /receipts/{id}/decision`, com `{decision, reason?, details?}`

**Tabela e partidas:**
- `POST /organizer/events/{id}/bracket`, `PATCH /organizer/events/{id}/bracket` (troca) e `POST /organizer/events/{id}/bracket/confirm`
- `GET /events/{id}/bracket`
- `PUT /organizer/matches/{id}/schedule`, com `{starts_at, court_id? | court_suggestion?}`
- `POST /organizer/matches/{id}/result-decision`, com `{score, justification}`

**Notificações** (tipos novos): convite de time, convite aceito, pedido de entrada, pedido decidido, pedido de organizador decidido, evento decidido, comprovante recebido (para o organizador), partida agendada, divergência para decidir e decisão registrada.

Erros em português e sem dados sensíveis. Os contratos ficam em `docs/decisoes/0003-times-campeonatos.md`.

### A4. Mídia e privacidade
- **Brasão:** reaproveita `services/media.py` com a normalização do avatar.
- **Comprovante:** `MediaObject` privado (imagem ou PDF, até 5 MB), servido só por rota autorizada. É preciso ampliar a validação, que hoje aceita só imagem.
- **Busca de atletas para convite:** usa a busca de usuários existente, excluindo bloqueios nos dois sentidos.

## Parte B — Web (`web/`)

### B1. Componentes shadcn/ui (Base UI, `base-nova`)
- **Reaproveitar** `Sheet`, `Tabs`, `Button`, `Badge`, `ToggleGroup`, `EmptyState` e `Toast`.
- **Date Picker:** Popover e Calendar, os mesmos do plano do Jogar (`react-day-picker` já aprovado).
- **Campo de hora:** `input type="time"` com o visual dos campos atuais.
- **Árvore do chaveamento:** componente próprio em SVG, sem biblioteca nova.

### B2. Telas e componentes
- **`TeamsPage` (Meus times):**
  - `TeamCardCarousel` com `TeamCard` (C5, `FormatGrid`);
  - `RosterGrid` com `MemberSheet`;
  - `JoinRequestsList` e `SentInvitesList`;
  - `InviteStrip` com `InviteSheet` (K1).
- **`TeamFormPage`** (F2, criar e editar) e **`InviteFlow`** (I5 com abas, `InvitePreview`, `TeamLinkPanel` com QR).
- **`JoinPage`** (rota do link).
- **Menu:**
  - `OrganizerCard` e `OrganizerRequestPage` (P3 + P5);
  - seção Organizador (Meus eventos);
  - seção Administração com `AdminQueue` (pedidos e eventos pagos).
- **`OrganizerEventsPage`** (O3, `EventPoster` do Jogar) e **`EventManagePage`** (G3, `NextActionCard` e seções).
- **`EventWizard`** (V4) e **`ReceiptsPage`** com `ReceiptSheet` (A2).
- **`BracketPage`** (`MirrorBracket` e `RoundRobinGrid`), **`ScheduleList`** com `ScheduleSheet` e **`ResultDecisionPage`** (D3).
- **Dados:** cliente `src/api/teams.ts` e `src/api/organizer.ts`, sobre o `request` existente (cookie HttpOnly e 401). Mapeamentos de formatos e estados ficam em `data/arena.ts`.
- **QR:** gerado no cliente a partir do link. Avaliar uma biblioteca pequena ou geração própria; **dependência nova só com aprovação**.
- **Dados reais apenas:** sem time, convite ou evento, as telas mostram estados vazios.

### B3. Acessibilidade e layout
- Foco visível e teclado no carrossel e nas abas.
- Rótulos nos botões só com ícone: QR, editar, ✓ e ✕.
- `aria-live` nos estados de envio.
- Conferir 320, 390 e 1440 px. A árvore espelhada cabe em 390 px e rola na horizontal em 320 px.

## Parte C — Expo (`mobile/`)

Fica para depois da web, na mesma decisão de momento do Jogar. Leitura do QR e upload de comprovante exigem verificar dependências com `npx expo install --check`. Não se declara paridade visual sem aparelho.

## Fases de entrega

Cada fase precisa ser demonstrável de ponta a ponta, com persistência após recarregar.

1. **Times:** criar e editar (brasão), Meus times (C5, E1), papéis, remover e sair, convite com mensagem, convite recebido (R2 + K1) e notificações básicas. Substitui os "times mínimos" da fase 1 do Jogar.
2. **Link do time:** token, QR, página de quem escaneia e pedidos de entrada.
3. **Organizador:** pedido (P3 + P5), fila da administração (AD1) e seção Organizador.
4. **Eventos:** criar (V4), rascunho e checklist, publicar, aprovação de pagos (AD1), cartazes (O3) e gestão (G3), sem inscrições.
5. **Inscrições e comprovantes:** análise A2. **Depende do lado do atleta** (inscrição, reserva e envio de comprovante, fase 7 do Jogar). Proposta: antecipar essa parte da fase 7 para junto desta fase.
6. **Tabela e agenda:** chaveamento (B3 + T2), rodadas, agendamento (S1) e notificações.
7. **Divergência em campeonato (D3):** depende do cartão de resultado da fase 5 do Jogar, então entra junto ou logo depois dela.

## Testes e verificação
- **Backend, unidade:**
  - representante mínimo;
  - geração e troca de token;
  - método do círculo;
  - chaveamento com semente;
  - conflito de 2 horas;
  - transições de estado do evento e do pedido.
- **Backend, integração (PostgreSQL):**
  - aceite e recusa de convite e pedido;
  - link revogado;
  - permissões (membro não convida, não organizador não cria evento, terceiros não veem comprovante);
  - aprovação e recusa da administração;
  - reenvio de comprovante;
  - confirmação de chaveamento;
  - agendamento com conflito;
  - decisão de divergência com auditoria.
- **Web:**
  - Testing Library nos fluxos (criar time, convidar, aceitar, pedido de organizador, criar evento, analisar comprovante, montar e agendar);
  - `npm run lint`, `npm run build` e `npm run test:coverage`;
  - no navegador, o fluxo real contra a API, a persistência ao recarregar e as larguras 320, 390 e 1440 px.

## Perguntas em aberto

Resolvidas em 12 de outubro de 2026 (ver [decisões](#decisões-de-12-de-outubro-de-2026-perguntas-da-primeira-versão-do-plano)): folgas no chaveamento, conflito de 2 h, encerrar time, devolução no cancelamento, revogação pela administração e bibliotecas de QR.

- ~~**Chat do campeonato**~~ e ~~**devolução contestada**~~: resolvidos em 12 de outubro de 2026, ao iniciar a implementação ([próximos passos](proximos-passos-jogar.md#decisões-fechadas-em-12-de-outubro-de-2026-execução)). O canal do campeonato é de **avisos** (o organizador escreve, os inscritos leem, o cancelamento entra como aviso automático). Na devolução, o participante confirma ou contesta; sem resposta em 7 dias, conta como recebida, e a contestação vai à administração. A tela do canal será desenhada junto da fase que implementar o cancelamento com inscritos.

## Fora do escopo
- Pagamento dentro do Arena, reembolso e cobrança.
- Cores próprias do time (a carteirinha C5 dispensa).
- Inscrição do atleta e tela do evento para o atleta: estão no plano do Jogar (E2, D2 e fase 7).
- Ranking real, notificações completas e revisão de quadras: etapa 2 dos próximos passos.
