# Situação da fundação do Arena

## Etapa 3 — Jogar: pareamento, partida, avulso, resultado e ranking (implementação) — 12 de outubro de 2026

Terceira etapa da execução do [plano do Jogar](plano-jogar.md) (fases 2 a 5), no backend e na web. Contrato: [0002, seções 7 a 16](decisoes/0002-jogar.md#7-etapa-3--fases-2-a-5-decisões-esquema-estados-e-tipos). Foi feita em uma fundação (esquema `0009`, regras puras, fila no PostgreSQL, varredura e visões da partida), quatro frentes de backend (pareamento; partida, quadras, chat e W.O.; avulso e vagas; resultado, estatísticas e ranking), a integração do backend, quatro frentes da web (placa, tela da partida, resultado e Ranking, notificações e filas) e esta integração da web. **Não é o MVP completo:** campeonatos (chaveamento, agenda e partidas de campeonato) e corrida ainda não têm tela de partida, e o Expo não foi tocado.

**O que mudou:**
- **Backend** (já integrado antes desta entrega; resumo): migração `0009` (buscas, partidas, lados, condições, quadras, vagas, relatos de placar, presença e estatísticas, mensagens), fila de pareamento no PostgreSQL com a varredura `python -m app.admin_cli sweep` (buscas de 24 h, propostas e ofertas de 2 h, resultados de 48 h, janela dos rankings), partida com condições e quadras (sugestão em revisão e fila da administração), reserva, cancelamento até 24 h antes, W.O. (3×0 no futebol, 6-0 6-0 no tênis, contestação decidida pela administração), chat com denúncia de mensagem, avulso (oferta de vaga por 2 h), resultado com confirmação pelos dois lados, estatísticas com revisão e contestação, rankings e `GET /me/standings` reais, 17 tipos de notificação e auditoria.
- **Web:**
  - **Placa do Jogar (J1):** busca de time (folha "Preparar busca" com formato, "O time está completo?" e vagas por posição), de avulso (posição ou "Qualquer posição") e de tênis; botão que pulsa e cancela; proposta e oferta de vaga em tela cheia dentro da moldura do app (aceitar, recusar, "Responder depois"); "Minhas partidas" (Próximas e Histórico); ponto menta do JOGAR; `Switch` do shadcn e `Sheet` escuro.
  - **Tela da partida (J2):** cabeçalho com brasões e fase, cartão de condições (propor, aceitar, reserva, vagas para avulsos, cancelar, W.O.), Date Picker, catálogo de quadras com "Sugerir outra quadra", chat de 4 em 4 s com denúncia de mensagem.
  - **Resultado e Ranking (J3):** cartão de resultado (informar o placar, aguardar, confirmar, divergência, sem resultado, W.O.), placar do tênis em sets com tie-break e super tie-break, presença, "Suas estatísticas", contestação e revisão, Ranking real (Futebol, Tênis e Corrida; Times e Individual) e "Seu elo" do Início.
  - **Notificações e filas (J4):** os tipos da etapa 3 com texto e destino, filas "Sugestões de quadra" e "W.O. contestados", e a prévia de mensagem do chat na moderação.
- **Integração (este registro):**
  - **cherry-pick** das quatro frentes sobre o backend integrado, na ordem J2, J1, J3, J4. Conflitos resolvidos: `hooks/useNow.ts` (três assinaturas diferentes, ficou `useNow(intervalMs = 30_000, enabled = true)`), `data/arena.ts` (o `Screen` `match` e as duas filas), `ArenaPage.tsx` (comentário de `Entry.matchId`, `DialogContainerProvider`, `board`/`openMatch`/`playAttention` da J1 com a tela `match` e as filas) e `AdminReports.tsx` (a prévia da J4 ficou, com o rótulo "Mensagem da partida" da J2);
  - **tipos únicos:** os tipos comuns da partida passaram a vir só de `web/src/api/matches.ts`; `matchmaking.ts` e `results.ts` perderam as cópias provisórias (`ResultMatch` virou um `Pick` do `MatchDetail`), e `admin.ts` perdeu `AdminCourt`, `Walkover`, `DisputeSide` e `ChatLine` (a fila de W.O. lê o chat e a partida pelas rotas da `matches.ts`);
  - **helpers e componentes únicos:** `sideName` e `sideOf` (havia quatro cópias, com três textos de reserva) em `data/match.ts`; mapa de fase da partida (`matchPhases`, que a lista da placa duplicava), `slotTotal`, `maxSlots` e vagas vazias; o interruptor da J2 foi trocado pelo `Switch` do shadcn; o resumo de resultado em leitura da J2 saiu, e o estado do W.O. aparece uma vez só (no cartão de resultado), com os botões no cartão de condições;
  - **ligações:** `ResultArea` renderiza o `MatchResultCard` (com `viewerId`, `onChanged`, que atualiza o detalhe ou o relê, e `onOpenChat`, que leva o foco ao campo do chat); a placa, o Início e as notificações abrem `match` com `matchId`; `proposta_partida`, `vaga_encontrada` e `oferta_retirada` abrem `play` com `matchId`, e a placa mostra a proposta ou a oferta *daquela* partida; a linha "Denúncias" do Menu mostra o contador `queue-counts.reports`; o tipo `oferta_retirada` ganhou o texto e o destino que faltavam;
  - **Início:** o cartão "Próxima partida" mostra a partida agendada mais próxima (e abre a tela dela) em vez do texto fixo "Nenhuma partida agendada";
  - **layout da tela da partida:** a área fixa do topo (resultado, estatísticas e condições) ganhou uma borda e, depois do início da partida, até 62% da altura, rolando por dentro.
- **Ajustes de backend (mínimos, com teste):**
  - **relato cego** (`services/match_views.py`): `result.reports` só mostra o placar do outro lado depois que o meu lado informou o meu, na divergência ou com o resultado decidido; antes, o relato existe com `score: null` (o `ScoreReportOut.score` ficou opcional); administração e organizador veem os dois; revê a decisão anterior (0002, seções 12.3 e 16.1);
  - **vagas declaradas:** `MatchSideOut.declared_slots`, só enquanto a partida é `proposta` ou `combinando`; a folha de vagas da web mostra o declarado;
  - **`permissions.suggest_court`** é falso depois do início da partida, e `POST /courts/suggestions` responde `409 Só dá para sugerir quadra antes do início da partida.` (a matriz de permissões e rotas confere os dois).
- **Defeitos achados e corrigidos** (no navegador, salvo onde dito):
  - o cartão de condições repetia o estado do W.O. que o cartão de resultado já mostra (achado ao ligar as pontas): ficou só o do cartão de resultado;
  - a área fixa do topo da partida cortava o último cartão de forma seca contra o chat: borda e altura maior no cartão de resultado;
  - a divergência dizia "1 × 1 contra 0 × 2 dos Ferrugem FC": agora "Vocês informaram 1 × 1; Ferrugem FC informou 0 × 2";
  - o Início dizia "Nenhuma partida agendada" com uma partida agendada: agora mostra a próxima;
  - `oferta_retirada` caía em "Nova atividade na sua conta", sem destino: texto e destino pela placa;
  - "Conversar" levava o foco ao log do chat, não ao campo de mensagem (achado pelo teste de navegação ao ligar o cartão de resultado).
- **Documentação:** [0002](decisoes/0002-jogar.md) (estado, tipos, relato cego, tabela 16.1 e os desvios da web na seção 16.2, com os destinos das notificações e as escolhas visuais do Ranking), [README](../README.md) (abertura e "Demonstrar o Jogar pela web"), [próximos passos](proximos-passos-jogar.md) e [qualidade do código](qualidade-codigo.md).

**Verificações executadas na integração (branch `orq/etapa3`):**
- **Backend:**
  - `ruff check app migrations tests` sem apontamentos;
  - `pytest -q --cov=app --cov-branch` com `TEST_DATABASE_URL`: 1243 aprovados e 1 pulado (o teste do bucket S3 real), cobertura combinada de 98% (9118 instruções, 112 não cobertas; 1998 ramos, 56 parciais), acima do piso de 85%;
  - só a unidade (`pytest tests/unit -q --cov=app --cov-branch`): 875 aprovados, 76%, acima do piso de 60%;
  - `alembic check` no banco da verificação, depois do `upgrade head`: sem diferenças (não há migração nova).
- **Web:**
  - `npm run lint` sem apontamentos;
  - `npm run build` concluído, com o aviso de pacote acima de 500 kB (1.157 kB minificado, 924 kB na etapa 2);
  - `npx vitest run --coverage --maxWorkers=4`: 60 arquivos e 733 testes aprovados; cobertura de 91,79% das instruções, 85,01% dos ramos, 91,42% das funções e 94,94% das linhas.
- **Testes novos desta integração:**
  - `stage3-navigation.test.tsx` (8 testes): placa → proposta → partida → resultado (relato cego, envio, divergência e "Conversar"), o botão do W.O. uma vez só, notificações → proposta daquela partida, oferta, partida e fila de W.O., Menu → quadras, W.O. e denúncias (com os contadores), Início → próxima partida;
  - backend: relato cego (outro lado, membro, administração, divergência e resultado decidido), `declared_slots` (proposta, combinando e agendada) e a sugestão de quadra depois do início (permissão e rota);
  - web: vagas declaradas na folha de vagas, `oferta_retirada`, divergência com o texto novo e o contador de denúncias no Menu; ajustes nos testes da J2 (cartão de resultado no lugar do resumo), da J3 (relato cego) e da J4 (a tela `match` com o detalhe simulado).
- **Fluxo real no navegador** (Chrome headless pelo CDP contra a API real da árvore):
  - **Ambiente:** banco `arena_orq_e2e3` com as migrações aplicadas, bucket `arena-orq-e2e`, API na 8211 (`ALLOWED_ORIGINS` e `PUBLIC_WEB_URL` da 5311), Vite na 5311 (configuração auxiliar com cache próprio), Chrome na 9411 e portas auxiliares, uma sessão por conta. Contas: administradora (`promote-admin`), dois representantes (Ferrugem FC e Tigres do Lago, em Brasília), um membro, um avulso e dois tenistas, criadas pela API como preparação; as partidas 2 a 5 e 7 a 9 tiveram a busca, o aceite e as condições feitos pela API (só o encaminhamento) e o foco de cada fluxo, pela web, e a primeira e a do tênis foram inteiras pela web;
  - **Conferido pela web em cada passo, com persistência depois de recarregar:**
    1. os dois times buscam pela placa (a folha com vagas de goleiro e atacante), a proposta abre em tela cheia para os dois, ambos aceitam e chegam à partida (JOGAR aceso);
    2. condições com quadra sugerida ("Sugestão em revisão"), publicação na fila "Sugestões de quadra", aceite do outro lado (agendada), vagas declaradas viram vagas abertas e a reserva confirmada persiste;
    3. o avulso busca "Qualquer posição", recebe a oferta ("Vaga de goleiro"), "Quero jogar" e escreve no chat;
    4. chat entre os lados e o avulso, denúncia pelo `ReportForm`, e a administração remove a mensagem na moderação (contador "1 pendente" no Menu; "Mensagem removida" para os dois lados);
    5. com `starts_at` no passado **só no banco da verificação:** presença dos dois elencos, relato cego (o servidor devolve o relato do outro lado com `score: null` e a tela diz só "já informou", sem vazar o placar; a administração vê o placar), confirmação pelo segundo envio, estatísticas do membro e do avulso, contestação pelo representante adversário, revisão final pelo representante do atleta, e o Ranking (Bronze, 1º lugar, 9 pontos) e "Seu elo" do Início atualizados;
    6. segunda partida: placares diferentes (os dois aparecem), "Conversar" leva o foco ao chat, "Corrigir o meu" e confirmação;
    7. terceira: W.O. registrado, contestado pelo lado ausente e mantido pela administração na fila "W.O. contestados" (3 × 0, 3 pontos);
    8. cancelamento de uma partida futura (motivo, os dois lados avisados, chat fechado) e a partida a menos de 24 h sem o botão de cancelar;
    9. tênis com super tie-break (6-4 3-6 10-8): ligado na proposta, o terceiro set vira os pontos do super tie-break, o relato cego vale também aqui, e 10 pontos para o vencedor;
    10. notificações de cada papel (representantes, membro, avulso, tenista e administração) com a navegação certa e a aba acesa.
  - **Prazos observados só por ajuste de horário no banco de verificação e pela varredura:** a proposta de 2 h sem resposta expirou (`propostas_expiradas=1`, notificação "A proposta … expirou") e duas partidas passaram das 48 h (uma com placares divergentes e outra com um relato só) e viraram "sem resultado" (`resultados_vencidos=2`), com a notificação e o cartão "Partida sem resultado"; a regra das 24 h do cancelamento foi vista numa partida a 20 h.
  - **Layout:** as telas da placa, da partida em cada fase (divergente, aguardando, W.O. contestado, confirmada, agendada, relato cego), da folha do elenco, do Ranking, do Início, das Notificações, do tênis e da administração (Menu, quadras, W.O.) em 320, 390 e 1440 px sem overflow horizontal (verificação automática de cada captura); console sem erros (só o `401` esperado do `GET /me` antes do login e o `favicon`).
  - **Teclado:** na proposta em tela cheia o foco entra no diálogo, Tab e Shift+Tab ficam dentro dele, Esc fecha e o foco volta ao botão da placa; no chat, Enter envia (Shift+Enter não) e o foco fica no campo; na folha de condições, o foco entra, circula e volta ao botão de origem com Esc. O ponto menta acende com busca, proposta ou partida combinando e apaga sem elas.
  - Capturas em `artifacts/etapa3/integracao/`; scripts e credenciais em `.local/orquestracao/integracao3/` (não versionados).

**Limitações e pendências:**
- O Expo não foi tocado, e a paridade visual do Expo não foi verificada; o CI remoto não foi executado nesta entrega; nada foi validado em aparelho.
- Os prazos de 24 h (busca), 2 h (proposta e oferta de vaga) e 48 h (resultado) foram observados **só por ajuste de horário no banco de verificação**; a expiração da busca de 24 h e a da oferta de vaga ao avulso não foram observadas na web (só nos testes do backend).
- A web relê a placa a cada 15 s (com atenção) e o chat a cada 4 s: não há atualização em tempo real; "Responder depois" guarda a proposta só na memória da sessão.
- Campeonatos (chaveamento, agenda, partidas de campeonato e a divergência decidida pelo organizador) e corrida na web seguem por vir; a aba Tabela do D2 continua "ainda não definida".
- A calibragem dos cortes de elo com dados reais (`rank_cuts`, `calc_version = 1`) fica para depois das primeiras partidas reais; o agendamento da varredura em produção, para a implantação.
- O botão "Configurar modalidade" do Ranking vazio aparece mesmo com o perfil configurado (leva a Suas modalidades); ajuste visual não solicitado, registrado.

## Etapa 2 — Eventos, inscrições, comprovantes e devoluções (implementação) — 12 de outubro de 2026

Segunda etapa da execução dos planos de [Times e campeonatos](plano-times-campeonatos.md) (fases 4 e 5) e do [Jogar](plano-jogar.md) (fase 7, lado do atleta), no backend e na web. Contratos: [0003, seções 10 a 20](decisoes/0003-times-campeonatos.md#10-etapa-2--eventos-inscrições-e-comprovantes-fases-4-e-5) e [0002, seção 6](decisoes/0002-jogar.md#6-fase-7--campeonatos-e-provas-lado-do-atleta). Foi feita em uma fundação (backend e web), duas frentes de backend (organizador e administração; atleta e comprovantes), a conciliação dos backends, três frentes da web (organizador, administração e atleta) e a integração. **Não é o MVP completo:** não há chaveamento, tabela, agenda, partidas, resultados nem ranking calculado, e o Expo não foi tocado.

**O que mudou:**
- **Esquema (`0008`):** eventos, inscrições, comprovantes (arquivo privado no MinIO, imagem ou PDF) e canal de avisos, com os índices e as restrições dos estados.
- **Backend:**
  - **organizador:** rascunho com checklist, publicação direta do gratuito, envio do pago para a aprovação, retirada, cancelamento (as inscrições pagas viram devolução pendente), edição limitada depois de publicar, inscrições do evento, decisão de comprovantes com motivo, avisos no canal e contadores de pendências;
  - **administração:** fila de eventos pagos (aprovar ou recusar com motivo, com volta a rascunho), revogação de organizador com a decisão "seguir" ou "cancelar" sobre os eventos abertos e devoluções contestadas;
  - **atleta:** lista e detalhe com elegibilidade (RN18), inscrição (gratuita na hora, paga com reserva de 48 h ou até 12 h antes do início), envio e reenvio do comprovante, desistência, devolução por Pix (envio pelo organizador, confirmação ou contestação do participante) e leitura dos avisos;
  - **comum:** notificações e auditoria dos tipos novos, ordem global das travas (0003, seção 19.1), `GET /admin/queue-counts` ampliado e a varredura `python -m app.admin_cli sweep [--loop 60]` (reservas vencidas e devoluções sem resposta em 7 dias; README).
- **Web:**
  - **Organizador:** Criar evento (V4) com uma pergunta por vez, Date Picker, rascunho e erros da API no campo certo; Meus eventos (O3) e a seção Organizador do Menu; gestão (G3) com o cartão "Agora", Inscritos, Dados do evento, Pagamento e Pix, avisos, edição de local e contato, retirada, cancelamento e exclusão de rascunho; Comprovantes e devoluções (A2) com folha, recusa motivada, "2ª tentativa" e anexo da devolução;
  - **Administração:** filas "Eventos pagos", "Eventos de organizador revogado" e "Devoluções contestadas" no Menu, com os contadores;
  - **Atleta:** Campeonatos e Provas na placa do Jogar (E2), Minhas inscrições, detalhe (D2) com Informações, Tabela ou Percurso e Inscritos, inscrição, Pix com cópia, comprovante, desistência, resposta à devolução e avisos;
  - **Notificações:** os tipos da etapa 2, com o texto e a tela de cada um (0003, seção 17 e 20.2).
- **Correções da revisão independente da etapa 1 (web):**
  - a lista de Notificações não cai mais quando `GET /me/follow-requests` falha: o erro fica na seção "Solicitações para seguir", com "Tentar novamente", e as atividades continuam;
  - Meus times mostra o erro de `GET /me/team-invites` com "Tentar novamente", na página e na folha de convites, que não diz mais "Nenhum convite pendente." quando a lista não chegou;
  - o token do link (`/entrar/{token}`) volta ao `App` quando a sessão expira com a tela do link aberta, e o próximo login a reabre;
  - o cartão do organizador, a folha do link e a folha do pedido de organizador relêem o estado depois de um `404` ou `409` (cancelar um pedido já decidido, cancelar um pedido de entrada já decidido, decidir um pedido que já foi decidido: a folha fecha, avisa e a fila recarrega).
- **Integração (este registro):**
  - **cherry-pick da frente do atleta** em cima das duas frentes do organizador e da administração; conflitos resolvidos em `data/arena.ts` (`entryStates` com `rejeitada`, "Comprovante recusado" e `devolucao_contestada`, mais `eventPhases`), `ArenaPage.tsx` (telas das três frentes e o layout dos eventos), `events-fixtures.ts` (arquivo criado pelas duas frentes) e `events-format.test.ts`;
  - **tipos únicos:** cartaz, Pix, inscrição, comprovante, aviso, pendências e bônus do tênis têm uma definição só, em `web/src/api/events.ts`; `receipts.ts` guarda as rotas e as regras de comprovante e `entries.ts`, as formas do atleta. Saíram as cópias de tipos, de `eventReceiptsPath`, `decideReceipt`, `eventEntriesPath` (a do atleta virou `publicEntriesPath`), `listReceipts`, `formatFileSize`, `receiptFileUrl` e dos limites do arquivo; a validação do comprovante segue a ordem do servidor (tamanho, arquivo vazio, tipo; sem tipo vale a extensão);
  - **helpers únicos:** `plural` em `utils/format.ts` (eram três cópias) e `receiptRefusalSentence` para o motivo da recusa em frases (atleta e notificações);
  - **testes:** `tests/events-fixtures.ts` passa a reunir os dados do organizador, do atleta, dos comprovantes e da administração (o antigo `receipts-fixtures.ts` saiu);
  - **ligações:** a seção "Comprovantes" da G3 abre a A2 do evento certo, com o contador na placa e na aba; a notificação `devolucao_contestada` abre a fila "Devoluções contestadas" para a administração (antes caía no Menu); `comprovante_recebido`, `evento_para_aprovar` e os demais tipos abrem a tela do assunto; o organizador no D2 abre a gestão; `tests/stage2-navigation.test.tsx` cobre Menu → O3 → G3 → A2, Menu → filas da administração, Jogar → E2 → D2 → inscrição, o atalho do organizador e as notificações;
  - **defeitos achados no navegador e corrigidos:** o cartaz da folha da revogação mostrava "Inscrições abertas" com as inscrições suspensas (agora "Inscrições suspensas", como no O3 e no E2); o cartão da contestação repetia o ponto depois das aspas; o limite do comprovante aparecia como "5 MB" no atleta e "5 MiB" no organizador (agora "5 MiB").
- **Desvios das frentes:** web na seção 20.2 do [0003](decisoes/0003-times-campeonatos.md#202-desvios-registrados-na-integração-da-web-da-etapa-2) e na seção 6.7 do [0002](decisoes/0002-jogar.md#67-desvios-registrados-na-integração-da-web); backend na 20.1 do 0003 e na 6.6 do 0002.
- **Documentação:** contratos [0003](decisoes/0003-times-campeonatos.md) e [0002](decisoes/0002-jogar.md) (estado, desvios da web e a tabela de estados S1 com os textos reais); [README](../README.md) (abertura, migração `0008` e "Demonstrar eventos e inscrições"); [próximos passos](proximos-passos-jogar.md).

**Verificações executadas na integração (branch `orq/etapa2`):**
- **Backend** (uma vez, sem mudanças de código nesta integração):
  - `ruff check app migrations tests` sem apontamentos;
  - `pytest -q` com `TEST_DATABASE_URL`: 572 aprovados e 1 pulado (o teste do bucket S3 real);
  - `alembic check` no banco da verificação, depois do `upgrade head`: sem diferenças.
- **Web:**
  - `npm run lint` sem apontamentos;
  - `npm run build` concluído, com o aviso de pacote acima de 500 kB (924 kB minificado, 613 kB na etapa 1);
  - `npm run test:coverage`: 45 arquivos e 465 testes aprovados; cobertura de 89,77% das instruções, 83,00% dos ramos, 88,89% das funções e 93,16% das linhas. Os pisos foram atendidos.
- **Testes novos desta integração:**
  - `stage2-navigation.test.tsx` (10 testes): Menu, O3, G3, A2, filas, Jogar, E2, D2, atalho do organizador e notificações;
  - os quatro achados da etapa 1: erro só na seção das solicitações; erro e nova tentativa dos convites (página e folha); token do link depois da sessão expirada (com `App`); estado relido depois de `404` e `409` no cartão do organizador, na folha do link e na folha do pedido (e erro de rede que mantém a folha);
  - rótulos de `activeNavFor`, `receiptRefusalSentence`, extensão do comprovante sem tipo, cartaz suspenso e ponto da contestação.
  - Três mutações conferidas à mão: trocar o `eventId` do `onReceipts` ou o destino da notificação `devolucao_contestada` quebra o teste de navegação, e não devolver o token ao `App` quebra o teste do token.
- **Fluxo real no navegador** (Chrome headless pelo CDP contra a API real da árvore principal):
  - **Ambiente:** banco `arena_orq_e2e2` com as migrações aplicadas, bucket MinIO `arena-orq-e2e`, API na porta 8191 (`ALLOWED_ORIGINS` e `PUBLIC_WEB_URL` da porta 5291), Vite na 5291 (configuração auxiliar com cache próprio), Chrome na 9391 e portas auxiliares.
  - **Contas:** administradora (`promote-admin`), organizadora (cadastrada pela web, com pedido e aprovação pela web), representante com o time criado pela web (com brasão), atleta de tênis e um membro, estes dois pela API.
  - **Conferido, pela web em cada passo, com persistência depois de recarregar:**
    - evento gratuito de tênis no V4, com teclado (Tab, Enter, setas nos calendários), publicado; o atleta se inscreve pelo D2 e vê "Inscrição confirmada" e a aba Inscritos;
    - evento pago de futebol no V4 com Pix, enviado para a aprovação e aprovado na fila "Eventos pagos" (folha com o Pix informado);
    - reserva do time, cópia da chave Pix (com clique real, área de transferência conferida) e envio de um PNG;
    - recusa na A2 com motivo e detalhe, reenvio de um PDF ("2ª tentativa", com a recusa anterior) e aprovação;
    - aviso no canal, lido pelo inscrito na notificação e no D2;
    - cancelamento pela G3 (motivo, confirmação), devolução anexada na A2, contestação pelo representante e decisão "Pedir outro" na fila "Devoluções contestadas"; nova devolução, confirmação do recebimento e estado "Devolução recebida";
    - revogação do organizador pela API: inscrições suspensas no D2, Menu e O3 da organizadora, e a decisão "Seguir evento" na fila de revogados, com a notificação e as inscrições reabertas;
    - novo pedido de organizador depois da revogação; prova de corrida paga no V4, recusada pela administração com motivo ("Dados do Pix incompletos"), corrigida e reenviada, e aprovada; o atleta (sem perfil de corrida) se inscreve, desiste, se inscreve de novo, envia o comprovante, e a organizadora aprova (inscrição individual);
    - notificações de cada papel (administração, organizadora, representante) com a navegação e a aba acesa;
    - link do time com a sessão expirada no meio (cookie apagado): volta ao login com o aviso, o mesmo link reabre depois de entrar, e o pedido é enviado e aprovado; o token não foi para o armazenamento do navegador;
    - teclado nas abas (D2 e A2: setas, Home e End, tabulação itinerante) e Esc fechando a folha e devolvendo o foco;
    - 320, 390 e 1440 px em Menu, O3, G3, A2 (as duas abas), E2, D2, Jogar, as três filas da administração e os cinco passos do V4 (calendário, cidade e a folha "Sair sem salvar" incluídos), sem overflow horizontal;
    - console sem erros além do `401` de `/me` antes do login e do `favicon.ico` ausente, que já faltava antes.
  - **Reserva vencida:** o prazo de uma reserva foi alterado no banco da verificação; a leitura mostrou "A vaga foi liberada" e a vaga voltou, e `app.admin_cli sweep` gravou a expiração (`reservas_expiradas=1`). Não foi uma expiração ao vivo.
  - Capturas em `artifacts/etapa2/integracao/` e scripts em `.local/orquestracao/integracao2/`, não versionados.

**Limitações:**
- O Expo não foi tocado: as telas da etapa 2 (inclusive organizador e administração) entram na última etapa.
- O CI remoto não foi executado.
- A expiração de reserva ao vivo (48 h) e a devolução considerada recebida em 7 dias não foram observadas: a primeira foi simulada com o prazo alterado no banco da verificação, e a segunda só tem os testes do backend.
- Copiar o Pix funciona com clique real; a leitura do QR do link por câmera de aparelho e a execução em dispositivos físicos seguem sem verificação.
- O atleta não tem tela do histórico de inscrições (a rota `scope=historico` existe); uma inscrição devolvida, expirada ou cancelada sai de "Minhas inscrições".
- Chaveamento, tabela, partidas e resultados aparecem como "Em breve" na G3 e como "Tabela ainda não definida" no D2.
- A notificação `devolucao_decidida` e a `devolucao_confirmada` automática abrem o D2 (com o atalho "Abrir gestão" para o organizador), porque não indicam se quem recebe é o organizador ou um participante.
- O pacote da web passou de 500 kB (924 kB).

**Pendências de integração:**
- Fases 6 e 7 de Times e campeonatos: chaveamento, rodadas, agendamento, partidas de campeonato e divergência.
- Lembrete de "reserva expirando" (exigiria um registro de lembrete enviado), fora desta etapa.
- Agendamento da varredura fora do desenvolvimento, na implantação.
- Histórico de inscrições do atleta (tela) e a tela Ranking real (ainda sem ler `GET /me/standings`).
- Divisão do pacote da web, se o tamanho virar problema.
- Atualizar os diagramas de modelagem (`docs/diagramas/`) e os indicadores de [qualidade do código](qualidade-codigo.md) com a etapa 2.
- Calibragem dos cortes de elo com dados reais.

## Etapa 1 — Times, link do time, organizador e elos (implementação) — 12 de outubro de 2026

Primeira etapa da execução dos planos de [Times e campeonatos](plano-times-campeonatos.md) (fases 1 a 3) e do [Jogar](plano-jogar.md) (fase 1), no backend e na web. Contratos: [0003](decisoes/0003-times-campeonatos.md) e [0002](decisoes/0002-jogar.md). Foi feita em uma fundação comum, quatro frentes paralelas (A e B no backend, C e D na web) e a integração. **Não é o MVP completo:** não há partidas, eventos, resultados nem ranking calculado, e o Expo não foi tocado.

**O que mudou:**
- **Esquema (`0005`):** times, elenco com histórico, convites, pedidos de entrada, link do time (nonce e hash; o token é derivado por HMAC com `TEAM_LINK_SECRET`), pedidos de organizador, organizadores, notificações, auditoria e elos (`rank_cuts` com os cortes iniciais e `standings` vazio).
- **Backend:**
  - times: criar, editar, brasão (WebP com transparência), elenco, papéis, sair, remover e encerrar;
  - convites com mensagem e candidatos (quem você segue ou busca);
  - link e QR, pedido de entrada e "Gerar outro link";
  - pedido de organizador, fila e decisão da administração, revogação e contadores das filas;
  - notificações da conta (lista, não lidas, marcar lida), auditoria e `GET /me/standings`.
- **Web:**
  - **Meus times:** placa com carrossel de carteirinhas (C5) e grade de elos por formato, elenco em rostos, folha do atleta, pedidos para entrar e convites enviados;
  - **Criar e editar time:** prévia ao vivo e recorte do brasão;
  - **Convidar:** "Escolher atleta" ou "Link e QR";
  - **Convite recebido:** faixa e folha;
  - **Entrar pelo link:** `/entrar/{token}`, inclusive deslogado;
  - **Organizador:** cartão P3 e "Seja organizador" no Menu, seção Organizador sem eventos, fila "Pedidos de organizador" da administração (com contador) e revogação;
  - **Notificações:** atividades da conta junto dos pedidos para seguir, com o contador no sino do Início;
  - **Placa do Jogar:** abas, "Com meu time | Avulso", chips e a linha do elo (H1), sempre em classificação nesta fase.
- **Integração (este registro):**
  - conflitos do cherry-pick da frente C resolvidos: `ArenaPage.tsx` com as telas das duas frentes; `utils/relativeTime.ts` unificado ("há 3 horas", texto vazio para data inválida, mais `shortDate` e `monthYear`);
  - duplicações removidas: `Person` e `FormatStanding` passam a ter uma definição só (`api/client.ts` e `api/play.ts`); o link do time e o time do convite usam o `useResource` comum;
  - ligações entre as frentes: o convite abre Meus times com a folha de convites; o pedido para entrar rola até "Pedidos para entrar"; o aceite e o pedido aprovado abrem o time certo no carrossel;
  - a linha "Notificações" do Menu abre a tela (antes "Em breve"), com "Perfil" aceso;
  - "Meu time" e "Com meu time" sem time levam a Meus times (já ligados pela frente D, conferidos no fluxo real);
  - correção: um `409`/`404` na folha do atleta (elenco desatualizado) agora relê o time, e a braçadeira passa a aparecer desabilitada; antes a tela ficava com o dado antigo até recarregar;
  - a célula de formato ausente na carteirinha sai com `faces_any_level: true`, como no contrato.
- **Desvios das frentes**, registrados na seção 9.1 do [0003](decisoes/0003-times-campeonatos.md#91-desvios-registrados-na-integração-da-etapa-1):
  - brasão com `Cache-Control: no-store`;
  - avatar nulo para conta inativa;
  - `team_id` na auditoria de papel;
  - `403 Só representantes podem cancelar convites.`;
  - link gerado na primeira leitura, sem auditoria;
  - `queue-counts` com `reports`;
  - novas mensagens `422` e `409` do organizador;
  - filas do mais recente para o mais antigo.
- **Documentação:**
  - contratos [0003](decisoes/0003-times-campeonatos.md) (estado e seções 1 a 9) e [0002](decisoes/0002-jogar.md) (fase 1 implementada);
  - [próximos passos](proximos-passos-jogar.md);
  - README: link do time (`PUBLIC_WEB_URL`, `TEAM_LINK_SECRET`, rota `/entrar/{token}` com `index.html` em produção), brasões na reconciliação e demonstração de times e organizador.

**Verificações executadas na integração (branch `orq/etapa1`):**
- **Backend:**
  - `ruff check app migrations tests` sem apontamentos;
  - `pytest -q --cov=app --cov-branch` com `TEST_DATABASE_URL`: 390 aprovados e 1 pulado (o teste do bucket S3 real); cobertura total de 95%;
  - o teste pulado, executado à parte com `MEDIA_TEST_S3=1` num bucket MinIO isolado: aprovado;
  - só unidades: 326 aprovados, cobertura de 66%;
  - `alembic upgrade head` e `alembic check` num banco próprio (`arena_orq_int1`): cabeça `0005`, sem diferenças.
- **Web:**
  - `npm run lint` sem apontamentos;
  - `npm run build` concluído, com o aviso de pacote acima de 500 kB (613 kB minificado);
  - `npm run test:coverage`: 32 arquivos e 267 testes aprovados; cobertura de 87,87% das instruções, 81,03% dos ramos, 87,68% das funções e 91,18% das linhas.
  - Uma execução anterior da suíte, em paralelo com outros processos, terminou com um worker encerrado inesperadamente; a repetição passou inteira.
- **Fluxo real no navegador** (Chrome headless contra a API real):
  - **Ambiente:** banco `arena_orq_e2e1` com as migrações aplicadas, bucket MinIO próprio `arena-orq-e2e`, API na porta 8131 e Vite na 5231;
  - **Contas:** três contas adultas, uma cadastrada pela web e duas pela API, todas com perfil de futebol em Brasília; uma promovida a administradora com `promote-admin`.
  - **Conferido:**
    - placa do Jogar em classificação 0/3, sem elo, com o botão desabilitado e honesto, e "MEU TIME" sem time;
    - criar o time com brasão PNG transparente: lido pela API como WebP 400×400 RGBA, com o canto transparente;
    - convite com mensagem; a notificação abre a folha, e o convite é aceito;
    - tornar representante e tirar a braçadeira;
    - último representante: botão desabilitado e, com dado desatualizado, o `409` do servidor na folha;
    - remoção do atleta;
    - link e QR aberto deslogado (endereço limpo após abrir), login e pedido; aprovação pela notificação;
    - "Gerar outro link", com "Este link não vale mais" no antigo;
    - organizador: pedido, recusa com motivo "Outro", notificação e cartão recusado no Menu, novo pedido, aprovação e seção Organizador no Menu;
    - notificações: lista, marcar todas como lidas e navegação;
    - encerrar o time: o aviso ao membro só marca como lida, e o link deixa de valer;
    - persistência após recarregar (elenco, organizador e time encerrado);
    - teclado no carrossel (setas, Home e End) e nas abas do Jogar e do convite, com foco visível;
    - 320, 390 e 1440 px em Jogar, Meus times, Convidar, Link e QR, Editar time, Notificações e Menu, sem overflow horizontal;
    - console sem erros além das respostas esperadas: `401` de `/me` antes do login, `404` do link inválido, `409` provocado e o `favicon.ico` ausente, que já faltava antes.
  - As correções da integração foram conferidas de novo no navegador.
  - Capturas em `artifacts/etapa1/integracao/` e scripts em `.local/orquestracao/integracao1/`, não versionados.

**Limitações:**
- O Expo não foi tocado: as telas da etapa 1 entram na última etapa.
- O CI remoto não foi executado.
- Copiar e compartilhar o link (`navigator.clipboard`, `navigator.share`) foram cobertos só pelos testes da web, e o QR não foi lido por câmera de aparelho.
- A troca da própria posição no time não tem tela (a rota existe).
- O pacote da web passou de 500 kB.

**Pendências de integração:**
- Fase 4 de Times e campeonatos (eventos): `handle_open_events` da revogação ainda vazio; `ensure_closable` sem as checagens de partidas e inscrições.
- Calibragem dos cortes de elo com dados reais.
- Divisão do pacote da web, se o tamanho virar problema.
- A tela Ranking ainda mostra o estado vazio, sem ler `GET /me/standings`.

## Plano de Times e campeonatos (apenas planejamento) — 12 de outubro de 2026

A etapa 1 dos [próximos passos do Jogar](proximos-passos-jogar.md) foi desenhada em 19 rodadas de protótipos, sem implementação. As decisões estão no [plano de Times e campeonatos](plano-times-campeonatos.md).

**Decisões principais:**
- **Duas áreas separadas:** **Meus times**, de todo atleta, e **Organizador**, para quem tem a permissão.
- **Organizador passa a ser uma permissão.** O atleta pede pelo Menu (cartão com etapas e página "Seja organizador"), e a administração aprova ou recusa com motivo.
- **Meus times:**
  - carrossel de carteirinhas com a grade de elos por formato;
  - elenco em grade de rostos;
  - sempre pelo menos um representante;
  - convite com prévia e mensagem;
  - link e QR do time, sem validade, com pedido de entrada aprovado por um representante;
  - convite recebido numa faixa que abre uma folha;
  - criar e editar o time com prévia ao vivo.
- **Organizador:**
  - eventos em cartazes;
  - gestão com o cartão "Agora" e seções;
  - criar evento com uma pergunta por vez e Pix para eventos pagos;
  - análise de comprovantes em lista e folha, com recusa motivada e reenvio;
  - chaveamento em árvore espelhada e tabela cruzada no todos contra todos;
  - agendamento com horário livre e bloqueio de conflito de quadra;
  - placar divergente decidido com histórico, chat e justificativa.
- **Partidas de campeonato:** têm chat com o organizador e usam o mesmo cartão de resultado dos amistosos. Isso fecha uma pendência do plano do Jogar.
- **Administração:** filas "Pedidos de organizador" e "Eventos pagos" no Menu, ao lado de Denúncias.

**Protótipo:** a versão consolidada é um artefato privado do usuário (https://claude.ai/artifact/G3xgALgdMGPsQ4YneJPGv7). A fonte local fica em `artifacts/prototipos/times.src.html`, com as rodadas em `times-r1.src.html` a `times-r19.src.html`, todas não versionadas. Times, pessoas, eventos, Pix e comprovantes do protótipo são exemplos.

**Documentos atualizados:**
- novo [plano de Times e campeonatos](plano-times-campeonatos.md);
- [próximos passos](proximos-passos-jogar.md): etapa 1 com desenho e plano concluídos, decisões de 12 de outubro e novas pendências;
- [plano do Jogar](plano-jogar.md): referências cruzadas, fase 1 sem os times mínimos e pendência das partidas de campeonato resolvida.

**Pendências:**
- **Perguntas em aberto do plano:** o desenho do chat do campeonato (canal do evento) e a devolução que o participante não confirma.
- **Dependências do Jogar:** a análise de comprovantes depende da inscrição do atleta (fase 7 do Jogar), e a divergência em campeonato depende do cartão de resultado (fase 5).

**Decisões complementares do mesmo dia:**
- **Chaveamento:** com menos confirmados, o campeonato segue com folgas.
- **Conflito de quadra:** 2 h.
- **Encerrar time:** um representante pode encerrar o time, sem partida agendada nem inscrição ativa, preservando o histórico.
- **Cancelar evento com inscritos:** devolução por Pix, com comprovante por inscrição, confirmação do participante e aviso no chat do campeonato.
- **Revogar organizador:** cabe à administração.
- **QR:** `qrcode.react` na web e `react-native-qrcode-svg` no Expo.
- **Ordem de implementação recomendada:** intercala os dois planos, registrada nos [próximos passos](proximos-passos-jogar.md).

**Roteiro atualizado:** `docs/roteiro-projeto.docx` recebeu, como requisitos planejados:
- estado do projeto e público e papéis (organizador por permissão);
- HU08–HU10, RN01, RN02, RN09, RN19, RN20 e RN21;
- Tela 3, permissões, a linha de contas e papéis e as limitações.

A edição foi feita no XML, só no texto de 18 parágrafos. O arquivo passou na validação de esquema da skill `docx` (848 parágrafos antes e depois) e abriu no Word com as mesmas 21 páginas, exportado para PDF. A conferência visual página a página não foi possível, por falta de renderizador de PDF no ambiente. A cópia anterior fica em `artifacts/roteiro-projeto-antes-times.docx`, não versionada.

**Estado do código:** backend, web, mobile, esquema e contratos não foram alterados.

**Verificações:** por ser apenas documentação e protótipo, nenhum teste de código foi executado. As 15 telas do protótipo consolidado e cada rodada foram conferidas em Chrome headless a 320 e 390 px, sem overflow horizontal da tela. Os ajustes foram feitos no próprio protótipo: contraste, colisão de classe, quebras de botões e posição do calendário. Sem commit, push ou publicação no repositório.

## Plano da tela Jogar (apenas planejamento) — 11 de outubro de 2026

A pedido do usuário, a tela Jogar foi desenhada em dez rodadas de protótipos, sem implementação. As decisões estão consolidadas no [plano da tela Jogar](plano-jogar.md).

O plano trata de:
- pareamento por elo igual ou vizinho e formato;
- atleta avulso;
- proposta, condições e chat da partida;
- resultado e contestação;
- elos com cortes fixos e Lendário no top 15%;
- corrida por distância;
- campeonatos e provas com inscrição paga.

O protótipo consolidado é um artefato privado do usuário (https://claude.ai/artifact/U6RqvawwGLiUSPMst8haN4). A fonte local fica em `artifacts/prototipos/jogar.src.html`, não versionada. Os times, pessoas, elos, cortes e eventos do protótipo são exemplos e não entram no produto.

**Decisões posteriores do mesmo dia:**
- **Rankings, elos e Lendário são gerais.** A cidade serve apenas para o pareamento, e a tela Ranking perde a linha de cidade.
- **Seções do detalhe do evento usam `Tabs`** em vez do Navigation Menu, com o mesmo visual.
- **`react-day-picker` aprovado**, para instalar só na implementação.
- **Pix na inscrição paga:** bloco "Pix do organizador" com chave e botão de copiar só com ícone; "Copiar Pix Copia e Cola"; ícone ⓘ com a folha "Pagamento e informações".

**Fila de pareamento:** o plano passou a detalhar a fila no PostgreSQL. A tabela `match_searches` é a fila; o pareamento roda por evento, com trava `pg_advisory_xact_lock` por balde (modalidade + cidade + formato), e uma varredura periódica pareia o que ficou esperando e expira os prazos. Isso corrige a brecha do `SKIP LOCKED`, em que buscas simultâneas não se enxergavam. A migração para Redis ficou registrada como pergunta em aberto, com os sinais que a justificariam e uma interface de serviço para não travar a troca.

**Decisões de esquema e próximos passos:**
- **Cancelamento:** qualquer representante cancela a partida agendada até 24 h antes; depois, quem não comparece perde por W.O.
- **Tênis:** melhor de 3 sets, com tie-break em 6-6 e super tie-break opcional.
- **Avulso:** aceita qualquer formato e busca por uma posição específica ou por qualquer posição.

O plano e o roteiro (RN05, RN06, RN15, HU07 e o parágrafo de estado) foram ajustados. O roteiro foi validado de novo e conferido renderizado pelo Word.

A ordem de trabalho ficou em [próximos passos da tela Jogar](proximos-passos-jogar.md): primeiro a tela "Times e campeonatos"; depois o desenho de Ranking real, Notificações e revisão de quadras; só então a implementação do Jogar.

**Roteiro atualizado:** `docs/roteiro-projeto.docx` recebeu as regras revistas como requisitos **planejados**:
- estado do projeto, visão, escopo e Tela 1;
- HU03, HU06 e HU07;
- RN04–RN06, RN09–RN11, RN14, RN15, RN17, RN18 e a nova **RN23** (elos);
- componente de pareamento e tabela de vagas;
- TU01, TU05, TF01 e TF03;
- limitações conhecidas.

A edição foi feita no XML, preservando a formatação. O arquivo passou na validação de esquema do pacote `docx` e foi conferido renderizado pelo Word (21 páginas, tabelas de regras intactas).

**Pendências:**
- As perguntas em aberto do plano: cancelamento e W.O., placar do tênis, chat em partidas de campeonato, moderação do chat e momento do Expo.
- Os eventos dependem da criação pelo organizador em "Times e campeonatos".

**Estado do código:** backend, web, mobile, esquema e contratos não foram alterados. A tela Jogar continua só preparando os perfis esportivos.

**Verificações:** por ser apenas documentação e protótipo, nenhum teste de código foi executado. As capturas do protótipo foram conferidas no Chrome headless a 430 px; durante as rodadas, foram corrigidos overflows e problemas de contraste do próprio protótipo. Sem commit, push ou publicação no repositório.

## Correções da revisão da branch — 11 de outubro de 2026

Corrigidos os dois achados da revisão de `feat/tailwind-migrate`, com subagentes em paralelo autorizados pelo usuário:

- O pedido de nova publicação vindo de "Nova foto" agora é consumido ao abrir. A Comunidade permanece montada durante o consumo, preservando o compositor e o foco; fechar ou publicar, visitar outro perfil e voltar não reabre o diálogo. Novas aberturas pelo perfil e pelo cabeçalho continuam disponíveis.
- O `Slider` normaliza valores escalares controlados ou iniciais em um único controle, incluindo zero. Intervalos mantêm controles separados com índices explícitos; sem valor informado, o controle usa o mínimo, conforme o Base UI.

Adicionados nove testes de regressão: seis do slider (incluindo teclado e intervalos), dois de navegação com `StrictMode` (Fechar e Escape, retorno e reabertura) e um de publicação seguida de visita a perfil e retorno. Web: `npm run lint`, `npm run build` e `npm run test:coverage` aprovados, com 129 testes em 19 arquivos; cobertura de 83,82% de statements e 73,78% de branches. A revisão React conferiu callback estável, atualização funcional da pilha e preservação do foco.

O navegador confirmou fechamento, navegação/retorno, reabertura intencional, recorte, zoom por teclado (1 → 1,05) com um único controle e publicação seguida de retorno. Conferidos recorte e ausência de overflow horizontal em 320, 390 e 1440 px. Usadas respostas simuladas apenas no cenário auxiliar `.local/review-branch/`, sem inclusão no produto; evidência visual em `artifacts/review-tailwind/zoom-corrigido.png`.

Limitações: não foram exercitadas a API real nem a persistência nesta correção. Backend, esquema, contratos e mobile não foram alterados; seus checks não foram repetidos. Sem validação em aparelho ou CI remoto. `git diff --check` das alterações locais aprovado. O usuário autorizou o commit das correções em `feat/tailwind-migrate` e, em seguida, a criação de `feat/play-page` a partir dele. Sem push ou publicação.

## Revisão da branch `feat/tailwind-migrate` — 11 de outubro de 2026

Revisados os três commits entre a base `6f1c850` de `origin/main` e `cd6d278`, abrangendo conteúdo do perfil, Tailwind/NativeWind e nova Comunidade. Nenhuma correção funcional foi aplicada nesta revisão.

Dois achados confirmados na web:

- **P2:** o pedido `compose` permanece na pilha de navegação. Depois de abrir "Nova foto", fechar o compositor, visitar outro perfil e voltar, "Nova publicação" abre novamente sem solicitação. O pedido precisa ser consumido ao abrir.
- **P3:** `Slider` usa `[min, max]` como fallback mesmo quando recebe um `value` escalar. O zoom do compositor monta dois controles sobrepostos, ambos chamados "Zoom", criando uma parada de foco duplicada. Valores escalares devem gerar apenas um controle.

Verificações executadas: web lint, build e cobertura (120 testes aprovados); mobile lint, typecheck, cobertura (107 testes aprovados), exportação Android e `expo install --check`. Duas reproduções isoladas confirmaram os achados; a fonte está em `artifacts/review-tailwind/reproducoes.test.tsx`, sem inclusão na suíte versionada. O navegador também confirmou ambos em uma página isolada com respostas simuladas exclusivamente para teste. Conferidos visualizador, abertura do compositor após rolagem, recorte e passagem à legenda; ausência de overflow horizontal nas larguras 320, 390 e 1440 px. O cenário auxiliar fica em `.local/review-branch/` e não faz parte do produto.

Limitações: a API real e a persistência não foram exercitadas nesta revisão; backend e esquema não foram alterados pela branch. Não houve execução em aparelho/emulador nem CI remoto. `git diff --check origin/main...HEAD` identificou somente uma linha em branco adicional no fim de `web/src/components/ui/button-variants.ts`. A revisão atualizou apenas este registro versionado; sem commit, push ou publicação.

## Nova Comunidade (web e Expo) — 11 de outubro de 2026

Implementado o [plano da Comunidade](plano-comunidade.md), sem mudança de backend, contrato da API, esquema ou dependências. As versões de `package.json` e dos locks não mudaram.

### Web

**Comunidade (`SocialCommunity`, `CommunityFeed`, `CommunityPeople`, `PostComposer`)**
- Barra escura fixa no topo do `main`, com:
  - o Coliseu;
  - o botão "Nova publicação";
  - as abas Publicações | Atletas, numa nova variante `dark` de `Tabs`.
- O título recolhe ao rolar para baixo. Tocar em "Publicações" já ativa só volta ao início.
- Feed:
  - puxar para atualizar (`usePullToRefresh`: toque e roda do mouse a partir do topo);
  - botão "Atualizar feed" visível só no foco;
  - paginação automática;
  - estados "arquibancada", com barra de progresso indeterminada.
- Atletas:
  - busca na barra, com espera de 300 ms;
  - Seguir/Solicitar/Solicitado/Seguindo;
  - "Segue você";
  - fileira de quem você segue (`/users/{id}/following`).
- Nova publicação em tela cheia escura:
  - escolher a foto;
  - recorte com atalhos 1×–3×, Slider, girar, Centralizar e Redefinir;
  - legenda e "Publicar".
- `cropImage` passou a aceitar `rotation`.
- O quadro "Nova foto" do perfil abre a Comunidade já na nova publicação.

**Post (Comunidade e visualizador do perfil)**
- Foto 1:1.
- Etiqueta de vidro com avatar sem contorno e `@usuário`.
- ••• em círculo de vidro.
- Data no início da legenda.
- O layout `feed`, o tamanho de avatar `author` e o tom de botão `photo` foram removidos por falta de uso.

**shadcn/ui:** entraram Slider, Toggle Group e Progress, ligados ao Base UI. As correções do que o CLI gerou estão no plano.

### Expo

Mesma estrutura, feita por um agente restrito a `mobile/` e revisada:
- barra escura com abas e título que recolhe (`Animated`);
- `RefreshControl`;
- estados do feed;
- busca e fileira de quem você segue;
- post 1:1 com o autor no novo formato;
- publicação em dois passos: recorte pelo editor nativo e tela escura de legenda;
- "Nova foto" do perfil abre o seletor.

`usePagedList` ganhou `refresh()`, que relê a primeira página sem esvaziar a lista. Diferenças em relação à web:
- não há marca do Coliseu nos assets do mobile;
- o recorte não tem atalhos de zoom, giro nem centralização, porque exigiria dependências novas.

### Verificações executadas

**Web**
- `npm run lint`, `npm run build` e `npm run test:coverage`: **120 testes aprovados** e pisos atendidos. Cobertura de 83,6% em instruções e 73% em ramos.
- Testes novos em `tests/community.test.tsx` e `tests/crop-image.test.ts`.

**Navegador** (Chrome headless, ambiente auxiliar: API 8010 com `arena_e2e`, web 5180, conta de teste), em 320, 390 e 1440 px:
- sem overflow horizontal e sem erros no console;
- foto 1:1;
- barra recolhendo e voltando;
- busca;
- recorte com 2× e giro;
- legenda.

Em 390 px também houve uma publicação real: o post persistiu após recarregar e depois foi excluído pela interface. Capturas em `artifacts/comunidade-web/` (não versionado).

O ensaio real revelou que `/users/{id}/following` devolve `{ user, state }`; o código e o mock foram corrigidos.

**Mobile**
- `npm run lint`, `npm run typecheck` e `npm run test:coverage`: **107 testes aprovados** e pisos atendidos.
- `npm run export:android`: aprovado.

### Limitações
- O Expo não foi executado em aparelho ou emulador: o recolhimento da barra, o `RefreshControl`, o Modal com teclado e as datas no Hermes não foram conferidos. Não há paridade visual declarada.
- O gesto de puxar foi exercitado com eventos simulados no jsdom e com a rolagem no Chrome headless, não com toque real.
- CI remoto não executado.
- Durante a sessão, um `npm ci` na web falhou porque os servidores Vite em execução travavam um binário. As dependências foram restauradas com `npm install`, a partir do lock e sem mudanças nele.

Sem commit, push ou publicação.

## Plano da nova Comunidade — 11 de outubro de 2026

A pedido do usuário, a Comunidade foi redesenhada em oito rodadas de protótipos, e as decisões foram registradas em [docs/plano-comunidade.md](plano-comunidade.md):

- Barra escura compacta com o Coliseu e as abas Publicações | Atletas. O título recolhe ao rolar e "Publicações" volta ao início.
- Puxar para atualizar no lugar do botão "Atualizar feed".
- Feed igual ao visualizador do perfil.
- Busca de atletas dentro da barra, com uma fileira de quem você segue.
- Publicação em tela cheia com painel de vidro e recorte com atalhos de zoom, Slider, girar, Centralizar e Redefinir.
- Estados do feed "arquibancada".
- Componentes shadcn/ui: Slider, Toggle Group, Progress e Input Group.

A sessão encontrou uma divergência no código: o servidor exige foto quadrada e o recorte da web é 1:1, mas o `PostItem` exibe o post em 4:5 com `object-cover`, cortando as laterais. O usuário decidiu manter 1:1 e exibir o post quadrado no feed e no perfil.

Depois, o usuário confirmou o Expo nesta entrega e um botão "Atualizar feed", visível só no foco, como alternativa de teclado ao gesto. Seguem em protótipo o fluxo da publicação em dois passos e o autor sobre a foto (@usuário legível, sem contorno branco). O protótipo é um artefato privado do usuário; a fonte local fica em `artifacts/prototipos/`, que não é versionado. Somente documentação: nenhum código foi alterado e nenhum teste foi executado. Diff conferido. Sem commit, push ou publicação.

## Migração do visual para Tailwind (web) e NativeWind (Expo) — 11 de outubro de 2026

A pedido do usuário, foi executado o [plano de migração](plano-migracao-tailwind.md), sem commit. Para o mobile, o usuário autorizou a versão candidata do NativeWind 5. A interface aprovada não mudou e nenhuma funcionalidade foi acrescentada.

### Web

**Rede de segurança (A0)**
- Roteiro local de capturas em Chrome headless, em `.local/e2e/`: 46 telas × 320/390/1440 px = 138 PNG.
  - Datas congeladas, animações desligadas e seletores por papel, rótulo e texto.
  - Comparação por pixel com relatório.
  - Também há despejo de estilos computados e geometria (`style-dump`, `layout-diff`) e conferência de teclado com teclas reais (`keyboard-check`).
  - O guia está em `.local/e2e/README-tailwind.md`. Nada disso é versionado.
- As capturas usam o ambiente auxiliar já documentado: API na porta 8010, banco `arena_e2e` do Compose e Vite na 5180. Nesse banco foram semeadas quatro contas de teste com posts, comentários, solicitações, denúncias e um bloqueio. O banco `arena` de desenvolvimento não foi alterado.
- **Incidente, já corrigido:** um script de estilos criou uma denúncia real no `arena_e2e`. Ela foi apagada e a sequência restaurada, e os scripts agora bloqueiam escritas não simuladas.
- Nove consultas de teste por classe CSS passaram a usar papéis, `data-condensed`, `data-state` ou `data-testid`.

**Tokens (A1)**
- `@theme` em `web/src/ui.css` virou a fonte única:
  - cores `brand`, `ink`, `ink-muted`, `line`, `app`, `focus`, `danger`, `mint`, `glass` e outras;
  - fontes `sans`/`display`, raios e sombras;
  - camadas `--z-index-*`: tabs 12, topbar 15, viewer 19, nav 20, scrim 40, sheet 41 e outras. O valor 25 citado no plano não existia no código.
  - animações e a variante `app-narrow` (até 430 px).
- Os `--ui-*` do shadcn apontam para esses tokens.

**Primitivos (A2)**
- Em `web/src/components/ui/`, com `class-variance-authority`: Button/IconButton, Sheet (com `useDialogFocus`), Tabs, Glass (com escolhas, ações, confirmação e textarea), ListHeading/ListGroup/ListRow, PersonRow/PersonList, Chip, Card, EmptyState, Badge, IconTile, SectionTitle, Eyebrow e variantes de feedback e avatar.
- Nenhum componente shadcn novo foi adotado: os do preset não reduziriam código nem manteriam o foco atual.

**Migração por área (A3, etapas 1 a 10)**
- Áreas migradas: casca (`BottomNav` novo), autenticação, Início, Ranking/Jogar, listas do Menu, Editar perfil e folhas, cabeçalho/abas/grade do perfil, post/visualizador/vidros, Comunidade e moderação.
- As regras de `styles.css` foram apagadas a cada etapa: 2.476 → 0 linhas.
- Removidos `BottomSheet`, `EmptyState`, `GlassPanel`, `ListRow` e `PersonRow` antigos, substituídos pelos primitivos.

**Encerramento (A4)**
- Preflight ligado (`@import "tailwindcss"`), `styles.css` removido e a base ARENA levada para `@layer base`.
- Exceções `:where(:not([data-slot]))` e `[aria-hidden="true"]` removidas. A regra de campos agora exclui `checkbox` e `radio` por tipo.
- Ajustes pontuais neutralizam o preflight: elos do Ranking, botões da navegação, `legend` da denúncia, caixa de seleção do cartão, `small` da moderação e textarea.

**Mudanças de comportamento**
- As abas de Conexões ganharam setas, Home e End, o padrão do primitivo de abas.
- `useDialogFocus` passou a devolver o foco ao botão de origem ao fechar com Esc os vidros de comentários e ••• sobre a foto. A falha já existia antes da migração, conferida no código de `7be7196`. Ganhou teste.
- Continua igual ao que era: num vidro aberto a partir de outro (••• → Editar legenda → Esc), o foco ainda vai para o corpo da página.

**CSS de produção:** 55.283 B (11,39 kB gzip) → 60.301 B (12,03 kB gzip). A diferença vem da camada base com o preflight, cerca de 5 kB.

### Expo

- **Dependências:**
  - `nativewind` 5.0.0-rc.0 e `react-native-css` 3.1.0-rc.0 (peer exato da rc);
  - `react-native-reanimated` 4.5.1 e `react-native-worklets` 0.10.1, via `npx expo install`;
  - em desenvolvimento, `tailwindcss` e `@tailwindcss/postcss` 4.1.12 (versão testada pelo guia da v5; a web usa 4.3.3), `postcss` 8.5.29 e `lightningcss` 1.30.1, fixado em `@expo/metro-config` por `overrides`.
- **Arquivos novos:** `metro.config.js`, `postcss.config.mjs`, `global.css` (importado em `App.tsx`), `nativewind-env.d.ts`, `css-modules.d.ts`, `src/theme.ts`, `src/styles.ts` (classes compartilhadas) e `src/components/Screen.tsx`.
- **Migração:** todas as telas e componentes saíram de `StyleSheet.create` e objetos `style` estáticos. Ficaram em `style` só valores dinâmicos: tamanho do avatar, altura da capa e sombra de texto do post.
- **Tokens:** mesmos nomes da web, em `global.css` e `theme.ts`, mantidos em sincronia. Os valores preservam o app anterior: `ink` #343d39, `ink-muted` #606965, `line` #cdd4d0 e `danger` #b42318 diferem da web. O mobile continua com fontes do sistema.
- **Testes:** o Vitest ganhou um stub de `nativewind`. Duas verificações que liam `style` passaram a verificar estrutura e texto.

### Verificações executadas

**Web**, em `web/`, no estado final:
- `npm run lint` e `npm run build` aprovados.
- `npm run test:coverage`: 16 arquivos e **107 testes aprovados**. Instruções 78,58%, ramos 70,75%, funções 79,82%, linhas 84,1%; pisos atendidos.
- Comparação visual completa contra a linha de base, a cada etapa e no fim: nenhuma tela com diferença perceptível. As 9 telas com diferença estão dentro do ruído medido (reamostragem da capa JPEG e borda da sombra do Jogar), com menos de 0,001% dos pixels acima da tolerância.
- Nenhum overflow horizontal em 320 px.
- `keyboard-check`: 66/66 em 320, 390 e 1440 px.

**Mobile**, em `mobile/`:
- `npm run lint` e `npm run typecheck` aprovados.
- `npm run test:coverage`: 9 arquivos e **89 testes aprovados**. Instruções 69,2%, ramos 63,12%, funções 71,68%, linhas 75,68%.
- `npx expo install --check`: "Dependencies are up to date".
- `npm run export:android` aprovado, com 1.171 módulos.
- O bundle foi inspecionado e aplica as regras compiladas pelo `react-native-css`.

### Limitações e pendências

- **Sem aparelho:** não houve teste em aparelho nem Expo Go. Paridade visual do Expo não verificada: sombras/elevação, bordas de um lado só e `aspect-[4/5]` precisam de conferência.
- **Versão candidata:** o NativeWind 5 rc não é recomendado para produção pelo próprio projeto. Rever ao sair a versão estável.
- **Divergências web × mobile:** decidir se a versão do Tailwind (4.3.3 × 4.1.12) e os valores de `ink`, `ink-muted`, `line` e `danger` devem convergir.
- **`npm audit` no mobile:** subiu de 22 para 27 alertas, herdados de react-native, metro e `@expo/metro-config`.
- **Navegador:** web conferida só em Chrome headless. O hover dos utilitários vale apenas em dispositivos com hover.
- **Fluxos que gravam dados** (salvar, publicar, denunciar, moderar) foram conferidos até a confirmação, para não invalidar a linha de base. Os testes automatizados cobrem as gravações.
- **Ambiente local:** durante a A4, um `git worktree remove` apagou parte de `web/node_modules`. Foi restaurado com `npm install`, sem mudar o `package-lock.json`. Reinicie o `npm run dev` se ele se comportar de forma estranha.
- **README:** os comandos não mudaram.

## Plano de migração para Tailwind — 11 de outubro de 2026

A pedido do usuário, criada a branch local `feat/tailwind-migrate` a partir de `7be7196` e registrado em [docs/plano-migracao-tailwind.md](plano-migracao-tailwind.md) o plano para substituir `web/src/styles.css` (2.476 linhas, cerca de 435 regras) por utilitários Tailwind sem alterar o visual aprovado. O plano prevê: linha de base de capturas em 320, 390 e 1440 px antes de migrar; tokens únicos no `@theme`, sem a colisão de `--muted`; primitivos reutilizáveis com variantes; dez etapas por área, apagando o CSS correspondente em cada uma; e preflight ligado só ao final. Para o Expo, o plano registra que a adoção exige NativeWind: a versão estável 4.2.7 usa Tailwind 3 e exige Reanimated, Babel e Metro configurados, e a 5.0 (Tailwind 4) ainda é candidata. Recomenda centralizar já os tokens em `mobile/src/theme.ts` e fazer uma prova de conceito isolada com teste em aparelho. Somente documentação: nenhum código foi alterado e nenhum teste foi executado. Versões do NativeWind conferidas no npm e na documentação oficial. Sem commit, push ou publicação.

## Versionamento do conteúdo do perfil — 11 de outubro de 2026

A pedido do usuário, reunidas em um commit na branch `feat/profile-improvement` e enviadas ao remoto as entregas registradas abaixo: conteúdo do perfil, visualizador de posts, denúncias e topo fixo (web e Expo), topo do post sem sombreamento, navegação inferior sobre o visualizador e denúncias com RadioGroup do shadcn/ui, além do plano e da documentação. Credenciais e capturas do ensaio permanecem em `.local/` e `artifacts/`, ignorados. Os checks aprovados nas entregas abaixo não foram repetidos, pois o código não mudou desde a validação; a execução remota do CI não foi verificada.

## Denúncias com RadioGroup do shadcn/ui — 11 de outubro de 2026

A pedido do usuário, os motivos de denúncia (post, comentário e conta) na web passaram a usar o [Radio Group do shadcn/ui](https://ui.shadcn.com/docs/components/base/radio-group), na variante Base UI e no padrão "Choice Card" (`FieldLabel` › `Field` › `FieldContent` + `RadioGroupItem`). O usuário escolheu a integração completa com Tailwind em vez de apenas o primitivo Base UI.

- **Configuração:** Tailwind CSS 4.3.3 com `@tailwindcss/vite`, alias `@/` em Vite, Vitest e TypeScript e `components.json` (preset `base-nova`). Os componentes `radio-group`, `field`, `label` e `separator` foram gerados pelo CLI do shadcn em `web/src/components/ui/`, e `cn` fica em `web/src/lib/utils.ts`.
- **Dependências novas, com versões exatas:** `@base-ui/react` 1.8.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0, `tailwindcss` e `@tailwindcss/vite` 4.3.3. O CLI tinha instalado o pacote de terceiros `cn` e reescrito os imports para ele, porque `@/lib/utils` ainda não existia; o pacote foi removido e os imports corrigidos.
- **Isolamento do visual aprovado:** `src/ui.css` importa apenas o tema e os utilitários do Tailwind, sem preflight. Os tokens do shadcn apontam para variáveis `--ui-*` ligadas à paleta ARENA, com variação `.dark` para o vidro escuro, e não redefinem `--muted`. A regra base de borda do shadcn foi restrita a `[data-slot]`. Em `styles.css`, as regras globais de `label` e `input` deixaram de atingir componentes shadcn e o input oculto do Base UI, com a especificidade preservada. Os estilos do formulário antigo (`.report-option`) foram removidos.
- **Testes:** o teste de denúncia de post passou a verificar o estado por `aria-checked` e a ordem dos motivos pelos rótulos, pois o rádio do Base UI é um `span role="radio"`.

Verificações: em `web/`, `npm run lint`, `npm run build` e `npm run test:coverage` (**98 aprovados**; instruções 77,22%, linhas 82,65%, ramos 70,15%; pisos atendidos). O CSS de produção não contém preflight e mantém `--muted: #626970`. O servidor Vite local foi reiniciado com o mesmo `--host 0.0.0.0` para carregar a nova configuração. No navegador, com a conta de teste visitante, em 390 e 320 px: o clique no cartão seleciona o motivo e habilita o envio, as setas do teclado movem a seleção e o foco, não há overflow horizontal e o anel de foco aparece no cartão. Nenhuma denúncia nova foi enviada nesse ensaio. Capturas: `artifacts/perfil-conteudo-web/*-shadcn-denuncia-*.png`. O Expo mantém seu `ReportForm` em React Native, pois o shadcn/ui é só para a web. Sem commit, push ou publicação.

## Navegação inferior sobre o visualizador — 10 de outubro de 2026

A pedido do usuário, corrigido o visualizador "Publicações" da web, que cobria a parte superior do botão Jogar da navegação inferior: ele ficava acima da barra (z-index 25 contra 20) e terminava exatamente no topo dela, enquanto o botão sobe 25 px. O visualizador passou a ocupar a altura total do `.arena-app` abaixo da barra (z-index 19), e a rolagem ganhou espaço inferior equivalente ao da barra (com a área segura em telas estreitas), como nas demais telas. Folhas e vidro de tela cheia continuam acima. Verificações: `npm run build` e `vitest run` (98 aprovados). A revisão visual no navegador não foi repetida para este ajuste. Expo não afetado (o visualizador é um `Modal`). Sem commit, push ou publicação.

## Topo do post sem sombreamento — 10 de outubro de 2026

A pedido do usuário, removido o degradê escuro sobre o topo da foto do post (autor, data e •••), que atrapalhava a visualização da imagem. Na web, `.post-top` perdeu o `linear-gradient` e o espaçamento inferior extra; a legibilidade sobre fotos claras passou a vir de `text-shadow` no texto e `drop-shadow` no ícone •••. No Expo, o `PostItem` deixou de pintar a faixa escura semitransparente; o texto já tinha sombra própria. Verificações: `npm run build` na web; `npm run lint`, `npm run typecheck` e `npm test` no mobile (89 aprovados). A revisão visual no navegador não foi repetida para este ajuste. Sem commit, push ou publicação.

## Conteúdo do perfil, visualizador de posts, denúncias e topo fixo — 10 de outubro de 2026

Implementado o [plano do conteúdo do perfil](plano-perfil-conteudo.md) na web e no Expo, sem mudança de backend, contrato da API, esquema ou dependências. Nova camada `api/social.ts` em cada cliente, com as mesmas funções (curtir, editar legenda, excluir post, comentar, excluir comentário, denunciar com `description` e bloquear), motivos de denúncia e limites (legenda 2200, comentário e detalhes 1000).

- **Web:** perfil com abas Fotos | Partidas (Fotos padrão; Atividades saiu do perfil); grade de ponta a ponta com quadro "Nova foto" no perfil próprio, que leva à Comunidade; visualizador "Publicações" que abre no post tocado e carrega mais publicações; post A3 (foto 4:5, autor e data sobrepostos, pílulas de curtir/comentar, legenda abaixo); comentários C4 e menu M3 em vidro sobre a foto; denúncia de post, comentário e conta por `ReportForm`; ações da conta (Bloquear/Denunciar) em vidro de tela cheia; topbar fixa que condensa com @usuário e abas grudadas abaixo. `window.prompt`/`window.confirm` foram eliminados. O feed da Comunidade passou a usar o mesmo post A3. `SocialPostCard.tsx` e `PhotoGrid.tsx` foram removidos; `SocialPhoto` foi movido para arquivo próprio e agora aplica o tamanho de avatar também às fotos reais. Foco, Esc e Tab-trap do `BottomSheet` foram extraídos para `useDialogFocus`, reutilizado pelos vidros. CSS órfão removido.
- **Expo:** mesmos fluxos com `usePagedList` portado, `PostImage` autenticada por Bearer, vidro como camada escura semitransparente e glifos Unicode com rótulos de acessibilidade. O perfil ganhou rolagem própria, `ProfileTopBar` fixa com ☰ e condensação por rolagem, abas, galeria e Partidas vazio. Na Comunidade, o feed usa `PostItem`, o perfil visitado ganhou topo ‹/•••, ações da conta, abas e galeria, e foram removidos o `Alert` de denúncia/exclusão e o modal de legenda. Curtidas, legendas, comentários e exclusões feitos no perfil visitado refletem no feed, e `comment_count` diminui ao excluir comentário.
- Comentário novo entra no topo da lista, pois a API lista do mais recente para o mais antigo. Partidas mostra apenas estado vazio; nenhum resultado é simulado.

Verificações executadas: em `web/`, `npm run lint`, `npm run build` e `npm run test:coverage` (**98 testes aprovados** em 15 arquivos; instruções 78,05%, linhas 83,98%, ramos 70,86%). Em `mobile/`, `npm run lint`, `npm run typecheck` e `npm run test:coverage` (**89 testes aprovados** em 9 arquivos; instruções 69,18%, linhas 75,72%, ramos 63,32%), `npm run export:android` e `npx expo install --check` aprovados. `git diff --check` sem problemas. Pisos de cobertura atendidos nos dois clientes. Backend sem alterações; seus testes não foram repetidos.

No navegador (Chrome headless, API e Vite locais já em execução), em 320, 390 e 1440 px, com contas de teste novas (dono e visitante, e-mails `@example.com`): topbar fixa e condensada, abas grudadas, grade sem overflow horizontal, visualizador aberto no post tocado com Esc devolvendo o foco; curtir, comentar, excluir comentário, editar legenda e excluir post persistindo após recarregar; denúncias de post, comentário (com detalhes) e conta, com envio desabilitado sem motivo; bloqueio voltando à Comunidade e conta listada em Contas bloqueadas (depois desbloqueada pela API). As denúncias foram conferidas por consulta somente leitura em `content_reports`, com motivo e descrição; a tela de moderação não foi testada por falta de conta admin. Capturas em `artifacts/perfil-conteudo-web/` e protótipo em `artifacts/prototipos/perfil-conteudo.html` (não versionados). As contas de teste e os dados gerados permanecem no banco local.

Limitações: o Expo não foi executado em aparelho ou Expo Go; a exportação não comprova funcionamento em Android/iOS nem o posicionamento inicial do visualizador sem `getItemLayout`. No Expo as abas não grudam no topo, o vidro não tem desfoque, o foco não volta ao quadro ao fechar o visualizador e o voltar do Android fecha o visualizador inteiro; não há paridade visual com a web. Pendências: domínio e boletim de Partidas (P2), Atividades em Notificações. Sem commit, push ou publicação.

## Plano do conteúdo do perfil — 10 de outubro de 2026

A pedido do usuário, registrado em [docs/plano-perfil-conteudo.md](plano-perfil-conteudo.md) o plano de implementação definido em rodadas de protótipos. Ele cobre: abas Fotos e Partidas no perfil, grade sem espaços em branco, visualizador de posts em feed vertical, post com foto 4:5, comentários e menu de ações em vidro sobre a foto, denúncia de post, comentário e conta com motivo e detalhes, e barra superior fixa que condensa ao rolar (o hambúrguer hoje some com a rolagem). O plano vale para a web e o Expo e também para a Comunidade. Atividades sai do perfil e vai para Notificações em entrega futura; o boletim de Partidas fica só como desenho até existir o domínio. Somente documentação: nenhum código foi alterado e nenhum teste foi executado. Diff conferido. Sem commit, push ou publicação.

## Versionamento das correções e do acesso local — 10 de outubro de 2026

A pedido do usuário, reunidas em um commit local as correções das aprovações no Expo, a escolha da URL da API na web em desenvolvimento, seus testes e a documentação de acesso pelo celular. Os arquivos `.env` locais e os artefatos de ensaio permanecem ignorados. Diff revisado e verificado; os checks aprovados nas entregas abaixo não foram repetidos, pois o código não mudou desde a validação. Sem push ou publicação. A validação em aparelho e as pendências de integração permanecem conforme os registros abaixo.

## Acesso por celular na rede local — 10 de outubro de 2026

A pedido do usuário, preparados o navegador do celular e o Expo Go para a rede local. O IPv4 identificado na interface Ethernet é `192.168.0.95`. Em `backend/.env` (ignorado), a origem explícita `http://192.168.0.95:5173` foi acrescentada a `ALLOWED_ORIGINS`, preservando as origens anteriores. A API, que já escutava em `0.0.0.0:8000`, foi recarregada pelo watcher para aplicar o ambiente. A validação de Origin, cookies HttpOnly e o transporte Bearer foram preservados.

Na web, `VITE_API_URL` vazio passa a usar o protocolo e o hostname da página na porta 8000 somente em desenvolvimento; uma URL explícita mantém precedência e o fallback fora do desenvolvimento permanece anterior. Isso evita que o navegador do celular tente acessar o próprio `localhost` e mantém o uso local pelo computador. `web/.env` local foi ajustado, o Vite recarregou a configuração e `.env.example`/README foram atualizados. Adicionados cinco testes de escolha da URL (localhost, loopback, IP da rede, URL explícita e fallback fora do desenvolvimento).

Criado `mobile/.env` local ignorado com a URL pública da API `http://192.168.0.95:8000`, e iniciado o Expo em LAN na porta 8081. A primeira exportação reaproveitou uma transformação com o endereço do emulador; a exportação foi repetida com `--clear` e o Metro reiniciado com `npm start -- --lan --clear`. O bundle Android exportado foi inspecionado e contém a URL da API na rede. Nenhuma senha, token, conta ou volume foi alterado; nenhuma regra de firewall foi modificada.

Verificações: preflight real da origem LAN aprovado (200, origem explícita e credenciais habilitadas); origem desconhecida recusada (400, sem autorização de origem); saúde do banco/API, Vite e Metro pelo IP da rede com 200; `/me` sem sessão com 401 esperado tanto com Origin quanto sem Origin. O manifesto Android do Expo aponta para `192.168.0.95:8081`. A web foi aberta nesse endereço pelo navegador conectado, mostrou a tela de login e não registrou erros de conexão. Web lint, build e cobertura com **81 testes aprovados**, com pisos atendidos; Ruff e backend em schema PostgreSQL isolado com **183 aprovados e um round-trip S3 opcional pulado**; exportação Android com cache limpo aprovada. As correções mobile e seus 64 testes registrados na entrega anterior foram preservados; lint/typecheck/cobertura mobile não foram repetidos por não haver nova alteração de código mobile. Diff conferido. Login pelo aparelho e execução Android/iOS não foram comprovados: os dispositivos precisam alcançar a mesma rede, e uma mudança de IP exige atualizar a origem/URL local. Sem commit, push ou publicação; as pendências de integração esportiva e produção permanecem.

## Correção das aprovações no Expo — 10 de outubro de 2026

Corrigidos os três problemas identificados na revisão abaixo em `mobile/src/screens/ProfileScreen.tsx`. "Aprovar todas" consulta a primeira página até a fila realmente esvaziar, sem o teto de 400 pedidos. Cada aprovação bem-sucedida remove o pedido da interface e atualiza a contagem local; em falha parcial, esses efeitos são preservados. Ao concluir ou falhar uma resposta individual, aprovação em lote ou mudança de privacidade, o cliente consulta novamente a fila, a primeira página de seguidores com seu cursor e as contagens da conta. Leituras bem-sucedidas são aplicadas mesmo quando outra consulta falha, e respostas 401 mantêm o tratamento de sessão expirada. Um bloqueio imediato impede aprovações simultâneas; as ações relacionadas ficam desabilitadas durante o envio e a sincronização.

Adicionados dez casos de regressão em `mobile/tests/community.test.ts`: 401 solicitações; falha parcial e retomada sem duplicar aprovações; falha ao ler o próximo lote; falha também na releitura da fila; aprovação e recusa individuais; reinício do cursor de seguidores após páginas já carregadas; 45 aprovações automáticas pela privacidade; chamadas simultâneas; expiração de sessão em uma consulta paralela. Os doubles continuam restritos aos testes.

Verificações executadas nesta correção, em `mobile/`: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (**64 testes aprovados**, zero falhas/pulados; cobertura de instruções 55,03%, linhas 62,17% e ramos 50,78%, com os pisos atendidos) e `npm run export:android`, todos aprovados. Diff conferido com `git diff --check`. Permanecem os avisos de depreciação de `react-test-renderer` nos testes e de configuração de cores no bundler. Não houve mudança de dependências, contrato da API ou esquema; os checks web/backend da revisão anterior não foram repetidos. O comportamento foi verificado por renderização React com respostas controladas, sem novo ensaio do Expo em aparelho ou com API real; a exportação não comprova execução Android/iOS. Documentação da revisão preservada como histórico. Sem commit, push ou publicação. As pendências de integração esportiva e produção permanecem.

## Revisão dos perfis e menu — 10 de outubro de 2026

Revisados os três commits de `648e850` a `8451aca` na branch `feat/profile-improvement` (comparação com `d104520`), pois não havia alterações locais pendentes. A revisão identificou três problemas no Expo, pendentes naquela etapa e corrigidos na entrega registrada acima:

- `ProfileScreen.approveAll` limita a aprovação a 20 lotes de 20 pedidos e limpa a fila local mesmo quando sobram solicitações. Com 401 pedidos, aprova 400 e mostra que não há notificações, ocultando o pedido restante até remontar a tela.
- Se uma aprovação em lote falha depois de aprovar outros pedidos, a fila e a contagem locais preservam o estado anterior. Pedidos já aprovados continuam com ações de aprovação/recusa; reaprovar um desses pedidos aumenta indevidamente a contagem local.
- Aprovar um pedido atualiza a contagem, mas não recarrega nem atualiza a lista de seguidores e seu cursor. Abrir Conexões após a primeira aprovação mostra um seguidor no título e a lista vazia. A aprovação em lote e a aprovação automática ao tornar a conta pública também precisam sincronizar as conexões.

Verificações desta revisão: Ruff; lint web/mobile; build web; typecheck mobile; exportação Android; cobertura web (76 testes aprovados) e mobile (54 aprovados). Backend: a primeira execução teve 150 aprovados e 34 pulados por ausência de `TEST_DATABASE_URL`; com a URL local configurada somente no processo e schema aleatório isolado, foram 183 aprovados e um teste opcional de round-trip S3 pulado. As três falhas de estado no mobile foram reproduzidas com respostas controladas em ensaio temporário, preservado em `artifacts/review-profile-2026-10-10/reproducoes-mobile.test.ts`; esses dados existem apenas no ensaio.

No navegador com a sessão local já existente, conferidos o perfil e os caminhos Menu → Editar perfil → Voltar e Menu → Minhas modalidades. O perfil foi inspecionado em 320, 390 e 1440 px, sem overflow horizontal da página ou do conteúdo principal. Não foram feitas alterações de conta, logout ou escritas na API por esse ensaio. Não houve novo ensaio de perfil visitante, administração, nomes no limite de comprimento ou aparelho Android/iOS. Nenhuma correção de produto, commit, push ou publicação foi realizada; apenas este registro foi atualizado. As pendências de integração esportiva e produção permanecem.

## Cabeçalho do perfil e menu — 10 de outubro de 2026

Implementado na web e depois no Expo o [plano do cabeçalho e do menu](plano-perfil-menu.md), definido com o usuário em quatro rodadas de protótipos interativos. A pedido do usuário, a verificação com API real e a adaptação ao Expo rodaram em paralelo com subagentes e foram revisadas antes deste registro.

- `ProfileHeader` agora tem como título `@usuario`, com o @ em verde, e mostra o nome real menor e em cinza abaixo. A mudança vale para o perfil próprio e para o de visitante.
- O selo de edição no avatar trocou o lápis por pessoa com engrenagem (`UserCog`), porque Editar perfil também reúne Privacidade. A engrenagem da capa virou o hambúrguer `Menu`.
- A tela `app-settings` virou `menu` (`MenuPage.tsx`, título "Menu"), com lista agrupada:
  - *Conta*: atalhos para Editar perfil e Minhas modalidades.
  - *App*: Notificações "Em breve" e Sobre o ARENA com a versão.
  - *Moderação*: Denúncias, só para administradores.
  - "Sair da conta" em linha vermelha separada.
- O painel `AdminReports` saiu dessa tela e foi para uma tela própria, `moderation` ("Moderação"), sem mudança de API. O sobretítulo "MODERAÇÃO" saiu do painel, e o título "Denúncias" ficou do tamanho de título de seção.
- O `Row` de Editar perfil foi extraído para `components/ListRow.tsx`, reutilizado no menu, com a variante `danger`.
- O README foi atualizado quanto ao acesso às denúncias.

**Verificações executadas.**
- Web: `npm run lint` sem avisos, `npm run build` e `npm run test:coverage` com **76 testes aprovados** e cobertura de instruções em **71,89%**, com os pisos atendidos. Na navegação, três testes são novos (@ como título, atalhos do menu com retorno e moderação só para administradores) e o teste de saída foi reescrito para o hambúrguer. Os testes de @ passaram a verificar o nome acessível do título.
- Navegador: ensaio isolado no Chrome headless, com o app real na porta 5181 e respostas controladas exclusivas do ensaio, sem usar contas reais. Foram conferidos o perfil a 390 px, o menu comum e o de administrador, a tela Moderação, e o nome e @ longos com o menu a 320 px. Não houve overflow horizontal em nenhuma das telas. As capturas estão em `artifacts/perfil-menu/`, que não é versionado.

- Navegador com API real: banco separado `arena_e2e` no PostgreSQL local, com migrações até `0004`. A API auxiliar rodou na porta 8010, com a origem permitida `http://localhost:5180` definida só no ambiente do processo, e a web auxiliar na porta 5180, no Chrome headless via CDP. Duas contas de teste `@example.com` foram criadas pela API: uma com nome e @ longos, outra promovida a administradora apenas em `arena_e2e`. Uma denúncia real foi criada pela API. Todos os pontos abaixo foram confirmados:
  - O @ é o título e o nome fica abaixo, no perfil próprio e no de visitante, em 320, 390 e 1440 px, sem overflow horizontal.
  - Os atalhos do Menu abrem Editar perfil e, por Minhas modalidades, a tela Suas modalidades. Nos dois casos, o Voltar retorna ao Menu.
  - Moderação fica oculta para a conta comum e, para a administradora, mostra a denúncia real.
  - A ordem do Tab passa pelo Menu e pelo selo, com foco visível, e o Enter ativa os itens.
  - "Sair da conta" apaga a sessão em `auth_sessions`, `/me` responde 401 e a conta continua deslogada após recarregar.
  - O console não teve erros além do 401 inicial e do `favicon.ico`.

  As capturas estão em `artifacts/perfil-menu-e2e/` e os roteiros em `.local/e2e/`, ambos não versionados. O banco `arena_e2e`, com as contas e a denúncia pendente, foi mantido para novos ensaios. O banco de desenvolvimento não foi tocado.

**Expo.** O perfil próprio e o visitado (Comunidade) usam o novo `components/ProfileTitle.tsx`, com `@usuario` como título (o @ em verde) e o nome real abaixo. O botão da capa virou "Menu" (☰) e abre a folha "Menu", que substitui "Configurações do app":
- *Conta*: Editar perfil, que volta ao menu, e Minhas modalidades, que fecha a folha e deixa à vista a lista, logo abaixo no perfil.
- *App*: Notificações "Em breve" e Sobre o ARENA, com a versão lida de `app.json` por `utils/appInfo.ts`.
- "Sair da conta" em linha vermelha, com "Aguarde…" durante a saída.

O `Row` local foi extraído para `components/ListRow.tsx`, com a variante `danger`. Há diferenças em relação à web:
- O mobile não tem biblioteca de ícones, então o selo usa o glifo ⚙ no lugar de `UserCog`, mantendo o rótulo "Editar perfil", e as linhas do menu não têm ícones.
- O grupo Moderação foi omitido, porque o Expo não tem painel de denúncias.

Em `mobile/`, lint e typecheck passaram sem avisos, os **54 testes com cobertura** passaram (7 novos em `tests/profile-menu.test.ts`), com cobertura de instruções de **49,14%** e pisos atendidos, e `export:android` foi aprovado. Os comandos foram executados pelo subagente e repetidos na revisão.

**Limitações.**
- O Expo não foi validado em aparelho Android ou iOS. O layout em 320 e 390 px e a aparência dos glifos ☰ e ⚙ não foram conferidos, e não há paridade visual declarada com a web.
- Ficaram fora do ensaio real a decisão sobre denúncias (a fila foi apenas exibida) e o envio de foto ou capa.
- Duas observações que não são defeitos:
  - O anel de foco global (#b26c08) tem contraste fraco sobre a capa padrão laranja, no botão Menu.
  - O seletor de decisão de denúncia de conta começa em "Suspender conta responsável", comportamento anterior a esta entrega.
- Não houve mudança de contrato, dependências, migrações ou deploy. A pedido do usuário, a entrega foi versionada e enviada à branch remota `feat/profile-improvement`, sem repetir as verificações para o envio.

## Correções da revisão da branch — 10 de outubro de 2026

Corrigidos os quatro problemas encontrados na revisão de `feat/profile-improvement` contra `origin/main`, com três subagentes em paralelo e revisão conjunta no checkout atual:

- MinIO: o `COPY` do entrypoint define permissão `0755`, independentemente da permissão do arquivo no checkout Linux. A normalização de CRLF foi preservada.
- Paginação web: respostas, erros e finalizações de páginas antigas são descartados após troca de lista, recarga da mesma URL ou desmontagem. O cursor, o estado de carregamento e o erro de paginação pertencem à geração atual da lista.
- Notificações web: "Aprovar todas" consulta e aprova lotes sequenciais até esvaziar a fila, inclusive pedidos ainda não carregados. Em erro parcial, recarrega os pedidos pendentes para permitir retomada; não mostra "Tudo em dia" enquanto a operação continua.
- Expo: avatar e capa associam a falha à URL e à sessão que falharam. Uma imagem substituta ou uma nova sessão podem carregar sem precisar remontar a tela; as imagens continuam usando Bearer.

**Validação desta correção.**
- Web: lint sem avisos, build e **73 testes com cobertura** aprovados, incluindo 8 casos do hook de paginação e 4 de aprovação em múltiplas páginas/retomada. Cobertura de instruções: **71,10%**; pisos configurados atendidos.
- Mobile: lint, typecheck, **47 testes com cobertura** e exportação Android aprovados. Os 3 casos novos verificam troca de URL após falha de avatar/capa e troca de sessão. Cobertura de instruções: **46,67%**; pisos configurados atendidos.
- Infraestrutura: `docker compose config --quiet` aprovado; o Dockerfile preserva a configuração existente e acrescenta somente a permissão do entrypoint.
- Navegador: ensaio isolado na porta 5181 com componentes reais e respostas controladas exclusivas de teste. Confirmados troca de Seguidores para Seguindo durante paginação lenta, descarte da página atrasada, erro parcial na aprovação e retomada até esvaziar 21 solicitações. Evidências locais em `artifacts/branch-review/`.

**Limitações.** O daemon Docker e o PostgreSQL/API locais estavam indisponíveis. Não foram executados build/start do MinIO nem ensaio integrado com persistência nesta correção; a permissão do entrypoint foi verificada pelo diff, sem confirmação em container Linux. Os testes dos clientes e o ensaio de navegador usam doubles, não comprovam API, banco ou storage reais. Nenhum aparelho Android/iOS foi validado; CI remoto continua pendente. Sem novas dependências, migrações ou deploy. Após a validação, o usuário autorizou o commit das correções e o envio à branch remota `feat/profile-improvement`; esse envio não inclui deploy nem nova execução das verificações.

## Implementação do perfil, da edição de perfil e do perfil de visitante — 10 de outubro de 2026

Implementado o [plano do perfil](plano-perfil.md) no backend, na web e no Expo. A pedido do usuário, a entrega foi versionada e enviada ao remoto `origin` na branch `feat/profile-improvement`, sem linhas `Co-Authored-By`; essa regra de commits foi registrada em `AGENTS.md`. As verificações abaixo não foram repetidas para o envio, que não inclui deploy.

**Backend.** Migração `0004`: `users.username` único (`uq_users_username`), com backfill a partir do nome, e `users.cover_media_id` com `ON DELETE SET NULL`. Regras do @ (3–30 caracteres `[a-z0-9._]`, sem ponto no início, no fim ou repetido, reservados recusados), geração no cadastro com nova tentativa em conflito concorrente, `PATCH /me` com `name` e/ou `username` (409 para @ em uso) e `GET /me/username-availability` autenticado, com até três sugestões. Capa em `PUT/GET/DELETE /me/cover` e `GET /users/{id}/cover`, recortada no servidor em 5:2 (até 1500×600, WebP), com o mesmo limite de corpo e a mesma proteção de origem do avatar; o reconcile considera o prefixo `covers/`. `SocialUser` ganhou `username` e `cover_url`; as contagens de seguidores e seguindo passaram a ser sempre visíveis, com `post_count` e as listas ainda fechados para quem não pode ver. Novo `GET /users/{id}/mutual-followers` (`items`, `total`, `next_cursor`). A busca aceita @ e trata `%`/`_` como literais.

**Web.** Perfil próprio com capa, lápis no avatar (edição), engrenagem (Configurações), @ e "N seguidores · N seguindo", sem e-mail. Editar perfil em lista agrupada, com folhas inferiores para foto (recorte circular), capa (recorte 5:2, troca e capa padrão), nome, @ (regras ao vivo, verificação com debounce, sugestões, 409) e visibilidade (duas opções, fatos e avisos, substituindo o `window.confirm`). Telas de contas bloqueadas, conexões (seguidores/seguindo e "em comum"), perfil de visitante (Seguir/Solicitar/Cancelar, Bloquear/Denunciar, seguidores em comum, conteúdo fechado em conta privada) e Configurações (Notificações "Em breve", versão, Sair, denúncias para administradores). As solicitações para seguir ficaram, provisoriamente, em Notificações, com ✓/✕ e "Aprovar todas". A navegação passou a usar pilha, e o botão voltar retorna à tela anterior. `AvatarEditor.tsx` e `SocialSettings.tsx` foram removidos, e o painel inline de perfil da Comunidade deu lugar à tela de visitante. O recorte foi centralizado em `utils/cropImage.ts`.

**Expo.** Mesmo fluxo com `Modal`: perfil próprio com capa (bloco de cor quando não há capa), lápis, @ e contagens; edição em lista; @ com disponibilidade; capa via `expo-image-picker` com `aspect: [5, 2]`; visibilidade em duas opções; bloqueadas; conexões; solicitações numa seção de notificações; configurações com Sair. Na Comunidade, o perfil visitado mostra capa, @, contagens sempre visíveis e seguidores em comum. O rótulo fixo "Perfil privado" foi corrigido.

**Verificações executadas.**
- Backend: ruff sem achados; `alembic upgrade head` no banco de desenvolvimento (5432), sem apagar dados, com @ gerados para as duas contas existentes; `alembic check` sem diferenças. **183 testes aprovados, 1 pulado** (S3 isolado opcional), com PostgreSQL em schemas aleatórios, cobertura combinada **90%** (piso 85%) e unitária **66%** (piso 60%). Inclui backfill da migração em schema próprio, cadastros concorrentes com o mesmo nome, capa com `FakeStorage` e seguidores em comum.
- Web: lint e build aprovados; **61 testes aprovados**, cobertura de 69,91% em instruções e `client.ts` dentro do piso.
- Mobile: lint, typecheck e `export:android` aprovados; **44 testes aprovados**, com `client.ts` em 100% de linhas.
- Navegador (Chrome via Playwright, roteiro local fora do repositório): API e web auxiliares nas portas 8010/5180, com banco separado `arena_e2e` e o MinIO local, para não alterar as contas de desenvolvimento. Conferidos @ em uso (com sugestões), inválido e disponível, com persistência; Esc e foco nas folhas; recorte e envio de capa e de foto, servidas como WebP e mantidas após recarregar; ✓ e "Aprovar todas" em Notificações; avisos de visibilidade, com troca persistida; desbloqueio; remoção de seguidor; volta à tela anterior; busca por @; perfil de visitante privado com contagens, seguidores em comum, aviso nas contagens e solicitar/cancelar; Sair pela engrenagem. Sem overflow horizontal em 320, 390 e 1440 px. Console sem erros além do `favicon.ico` ausente e do 401 esperado da verificação de sessão antes do login. Capturas em `artifacts/perfil-e2e/` (não versionado).

**Limitações e pendências.** O Expo não foi executado em aparelho ou emulador; o build não comprova o funcionamento, e não há paridade visual com a web. No iOS, o recorte nativo é quadrado e o servidor centraliza em 5:2. Bloquear e Denunciar na web mantêm o `window.confirm`/`window.prompt` que já existiam na Comunidade. "Aprovar todas" faz uma chamada por solicitação, pois não há rota em lote. A revisão definitiva de Notificações continua pendente. O banco auxiliar `arena_e2e` e os objetos de teste no bucket local (prefixos `avatars/` e `covers/`) permanecem; os objetos sem vínculo no banco de desenvolvimento podem ser removidos pelo reconcile após 24 horas. CI remoto não executado.

## Plano do perfil e da edição de perfil — 10 de outubro de 2026

Registrado em [plano do perfil](plano-perfil.md) o plano para redesenhar o perfil, a edição de perfil e o perfil de visitante. Ele foi definido com o usuário a partir de oito rodadas de protótipos interativos. O protótipo de referência, `prototypes/editar-perfil.html`, não é versionado.

O plano prevê:
- edição em lista agrupada, com folhas inferiores;
- nome de usuário (@) novo, gerado automaticamente para contas existentes e novas;
- foto de capa personalizável;
- contagens de seguidores sempre visíveis;
- seguidores em comum no perfil de visitante;
- engrenagem dedicada às configurações do app;
- solicitações para seguir na tela Notificações, de forma provisória.

O escopo cobre backend, web e mobile.

Nada foi implementado: código, esquema e contratos permanecem como antes. Esta entrega é só de documentação. Foram conferidos os caminhos citados e o diff; não houve testes de código. As decisões de identidade, imagens e privacidade ainda precisam ser incorporadas a [decisões técnicas](decisoes/0001-fundacao.md) quando forem implementadas. O usuário solicitou o commit e o envio ao remoto `origin` na branch `feat/minio-images`; o protótipo não foi incluído. Em seguida, o diretório `prototypes/` foi adicionado ao `.gitignore`, a pedido do usuário, para manter os protótipos locais fora do versionamento.

## Correção local da conexão de mídia — 10 de outubro de 2026

Investigado o erro `EndpointConnectionError` durante a publicação de posts. O container local do MinIO reiniciava porque `entrypoint.sh`, copiado do checkout Windows com finais CRLF, tinha um shebang inválido para Linux. O Dockerfile agora normaliza os finais de linha do entrypoint durante o build. A imagem foi reconstruída e somente o serviço MinIO foi recriado; `arena-minio` ficou healthy, `/minio/health/live` respondeu HTTP 200 e o PostgreSQL permaneceu healthy. O volume persistente `miniodata` foi preservado. Não foi possível executar `ensure-bucket` pela CLI, pois `backend/.venv` não existe neste checkout; nenhum post foi criado para teste.

Após reiniciar a API, o log revelou `NoSuchBucket`. Criado e validado o bucket privado `arena-media` no MinIO local usando as credenciais configuradas, que foram comparadas sem exposição com as credenciais do container. O bucket está acessível; nenhum post ou dado existente foi alterado. A publicação não foi repetida para evitar inserir conteúdo de teste na conta.

## Versionamento de posts e correções — 10 de outubro de 2026

O usuário autorizou o commit e o envio ao remoto `origin` na branch existente `feat/minio-images`. A entrega reúne a implementação de posts, perfis sociais e moderação, a migração `0003`, os clientes web/Expo, a documentação e as correções da revisão descritas abaixo. Artefatos de validação, ambientes locais e segredos permanecem fora do versionamento.

O diff foi conferido para esta entrega. As verificações de código e dos fluxos são as registradas na seção de correções; não foram repetidas para este registro de versionamento. A execução remota do CI, o ensaio em aparelhos e o aceite cruzado com reinício permanecem pendentes. Este envio não inclui deploy.

## Correções da revisão de imagens e posts — 10 de outubro de 2026

Corrigidos os nove achados da revisão abaixo. O feed filtra bloqueios nos dois sentidos; a leitura do avatar de comentário reavalia bloqueio e suspensão do comentarista; falhas de leitura posteriores ao commit não apagam a imagem de um post persistido. Denúncias de contas privadas visíveis não exigem autorização para seus posts, mantendo a proteção de posts/comentários privados. Aprovações repetidas retornam sucesso e rejeitar uma solicitação já rejeitada é idempotente, sem excluir uma relação aprovada.

O card de publicação web foi extraído para `SocialPostCard`, preservando o foco enquanto se digita. Busca, galerias, comentários, solicitações, seguidores, seguindo e bloqueios agora oferecem continuação por cursor na web e no Expo. `GET /api/v1/me/blocks` passou a responder `{ items, next_cursor }`, com 20 itens por padrão e limite máximo de 50; ambos os clientes e testes foram atualizados. A fila administrativa inclui `target_user_id` e `target_user_active`, referências administrativas que permitem reativar uma conta suspensa após resolver a denúncia sem revelar o conteúdo privado na fila resolvida. A reativação usa a rota administrativa existente, exige justificativa, registra decisão e não restaura sessões revogadas. A privacidade carregada/alterada em Configurações também é sincronizada com o estado da conta na web.

Adicionados testes unitários para regras de autorização, cursores, redação dos dados privados na moderação, reenvios e compensação de upload, além de regressões PostgreSQL e testes de digitação/paginação/reativação nos clientes. Os pisos do CI foram preservados, sem exclusão de arquivos da cobertura. Resultados: **108 unidades backend aprovadas**, cobertura combinada **65,48%** (piso 60%); **130 testes backend aprovados, nenhum pulado**, com PostgreSQL em schemas aleatórios e bucket MinIO isolado, cobertura combinada **87,52%** (piso 85%); **33 testes web** e **20 mobile** aprovados com cobertura. Ruff, Alembic check, lint/build web, lint/typecheck/exportação Android mobile aprovados. `expo install --check` já havia passado nesta sessão de revisão, e nenhuma dependência foi alterada nas correções. Detalhes de cobertura em [qualidade do código](qualidade-codigo.md).

Os seis cenários adicionais locais de API também passaram, incluindo upload/leitura/troca/remoção de avatar e publicação/leitura/exclusão de post no MinIO real. No navegador da web, com a sessão local existente, conferidos feed/imagens, digitação completa com foco preservado, aba Fotos, Configurações, relações e sincronização do indicador de privacidade. Conferidas larguras de 320, 390 e 1440 px, sem overflow horizontal da página; o viewport original foi restaurado. Não foram alterados posts, comentários ou privacidade da conta existente durante a conferência, e o rascunho de teste foi limpo. Paginação com múltiplas páginas e moderação foram verificadas por testes automatizados, sem acrescentar dados fictícios à interface.

Persistem pendentes ensaio em aparelhos Android/iOS, aceite cruzado web/mobile com reinício e execução remota do CI. Contas, mídias vinculadas, configurações locais e volumes foram preservados. Nenhum commit, push ou deploy foi realizado. A seção de revisão abaixo é o registro histórico dos defeitos anteriores a estas correções.

## Revisão dos planos de imagens e posts — 10 de outubro de 2026

Revisados o commit `fb75efc` de avatar/MinIO e as alterações locais de posts, comparando implementação, contratos e testes com [plano-minio-imagens.md](plano-minio-imagens.md) e [plano-posts.md](plano-posts.md). A entrega social ainda não satisfaz todos os critérios de aceite. Esta revisão preservou o código existente; as falhas abaixo não foram corrigidas.

Achados prioritários, reproduzidos em testes adicionais locais:

- **P1 — bloqueio recebido não filtra o feed:** em `backend/app/routers/social.py:209–210`, a condição inversa compara `blocked_id` com o autor, em vez do leitor. Se uma conta pública bloqueia o visitante, o detalhe e a imagem retornam 404, mas o feed ainda entrega nome, legenda e metadados de seus posts.
- **P1 — avatar de comentário ignora bloqueio/suspensão do comentarista:** em `backend/app/routers/social.py:349–350`, a autorização confere apenas o dono do post. Num post público de terceiro, a URL previamente obtida continua retornando a imagem após bloqueio entre leitor e comentarista, embora o comentário seja ocultado. A mesma verificação não exige que o comentarista esteja ativo.
- **P1 — falha após commit exclui a imagem de post persistido:** em `backend/app/routers/social.py:240–244`, `refresh` está no mesmo tratamento de falhas da gravação. Uma falha de leitura depois do commit executa a exclusão S3; rollback já não desfaz o post. A injeção dessa falha confirmou registro persistido sem sua imagem.
- **P1 — comentário web perde foco a cada caractere:** em `web/src/components/SocialCommunity.tsx:187`, `PostCard` é definido dentro do componente pai. Cada atualização do rascunho remonta o card e o input. Digitar `Boa!` com eventos reais de teclado do Testing Library resultou somente em `B`.
- **P2 — denúncia de conta privada exige acesso aos posts:** em `backend/app/routers/social.py:482–486`, `_can_view` também é exigido para alvo de tipo `user`. O perfil básico pode ser aberto e os clientes oferecem denúncia, mas um não seguidor recebe 404 mesmo denunciando a conta visível. A autorização da denúncia de conta precisa distinguir perfil básico de conteúdo privado.
- **P2 — aprovação não suporta reenvio:** em `backend/app/routers/social.py:406–409`, somente relações pendentes são buscadas. Repetir uma aprovação bem-sucedida retorna 404, contrariando a idempotência prevista no plano.
- **P2 — cursores descartados pelos clientes:** `SocialSettings`, `ProfilePage` e os perfis/comentários/busca de `SocialCommunity` e `CommunityScreen`, além das relações no perfil Expo, consomem somente a primeira página e descartam `next_cursor`. Galerias, comentários, busca e gestão de relações ficam limitados aos primeiros 20 itens carregados. Confirmada na web a ausência de continuação quando a API devolve cursor de solicitações. A API de bloqueios também limita silenciosamente a lista a 50 contas, sem continuação.
- **P2 — painel não reativa conta já suspensa:** em `web/src/components/AdminReports.tsx:58`, ações aparecem somente em denúncias pendentes. Suspender resolve a denúncia; a fila resolvida não oferece reativação, e o cliente não usa `/admin/users/{id}/status`. Confirmada a ausência de controle de reativação na fila resolvida. Uma nova denúncia pendente não é um caminho confiável, pois contas suspensas são ocultadas.

**P1 — piso de cobertura do CI não atendido:** executado o comando de unidades com `--cov=app --cov-branch --cov-fail-under=60`, equivalente ao passo `.github/workflows/ci.yml:42`. Os 65 testes passaram, mas o comando terminou com código 1 por cobertura combinada de **52,84%**, inferior a 60%. O CI configurado ficará bloqueado nesse passo; ampliar cobertura de unidades sem excluir arquivos ou reduzir o piso para esconder a regressão.

Verificações aprovadas: Ruff; Alembic check no banco de desenvolvimento; aplicação de todas as migrações em schemas PostgreSQL aleatórios dos testes; suíte completa backend com **80 testes aprovados, nenhum pulado**, incluindo round-trip S3 e rejeição de leitura anônima em bucket MinIO isolado; web lint/build e **24 testes com cobertura**; mobile lint/typecheck, **15 testes com cobertura**, `expo install --check` e exportação Android. Teste adicional com MinIO real aprovou upload/leitura/troca/remoção idempotente de avatar, isolamento da rota privada entre contas, e criação/leitura/exclusão de post. O bucket temporário da revisão foi removido após a execução, preservando buckets, contas e volumes existentes.

Os cenários adicionais confirmaram **cinco falhas de comportamento backend e três web**, separadamente das suítes existentes que passaram. Reproduções e relatórios ficam em `artifacts/review-plans/`, ignorado pelo Git. Não houve revisão visual em navegador, teste em aparelho Android/iOS, fluxo cruzado web/mobile com reinício nem execução remota do CI nesta revisão. Essas validações de aceite permanecem pendentes, assim como correção dos achados. Nenhum commit, push ou deploy foi realizado.

## Plano de posts, perfis sociais e moderação — 10 de outubro de 2026

Salvo o [plano de posts](plano-posts.md), definido com o usuário para web e mobile autenticados: uma foto quadrada com recorte ajustável e legenda opcional, feed geral cronológico, curtidas, comentários, privacidade social por conta, seguidores com aprovação, bloqueios, denúncias e painel administrativo web. O plano também registra contratos previstos, reutilização do armazenamento privado, sequência de implementação e critérios de aceite. A foto original no dispositivo será preservada; somente a versão recortada e otimizada será publicada.

## Implementação de posts, perfis sociais e moderação — 10 de outubro de 2026

Implementado o escopo do [plano de posts](plano-posts.md) nos contratos da API, PostgreSQL, web e Expo. A migração `0003` acrescenta visibilidade social privada por padrão, posts, curtidas, comentários, seguidores aprovados/pendentes, bloqueios, denúncias, papel administrativo e histórico de decisões. A autorização é conferida em consultas e em cada leitura de imagem; dados pessoais e perfis esportivos não se tornam públicos. Posts usam MinIO/S3 privado, foto quadrada WebP até 1.080 px e reconciliação de órfãos que preserva avatares e posts vinculados.

A web agora tem criação com recorte e zoom, feed cronológico, busca, perfis/galeria, interações e painel administrativo em Configurações. O Expo tem Comunidade com lista virtualizada e seletor/recorte nativo, perfil e ferramentas sociais. Contas públicas aprovam pedidos pendentes quando a visibilidade muda; tornar privada preserva seguidores existentes. Bloqueio remove vínculos e não os restaura ao desbloquear. O papel de administrador é concedido somente pelo comando explícito `python -m app.admin_cli promote-admin EMAIL`.

Verificações desta entrega: Ruff aprovado; backend com PostgreSQL em schema aleatório, 79 testes aprovados e 1 teste de round-trip S3 real pulado; cobertura combinada de 86,13% (88,67% de linhas e 71,96% de ramos). Web ESLint, TypeScript, build e 24 testes com cobertura aprovados (39,83% de linhas, 31,84% de ramos); mobile ESLint, TypeScript, exportação Android e 15 testes com cobertura aprovados (24,72% de linhas, 13,61% de ramos). Os testes de integração social usaram armazenamento S3 falso; a integração MinIO/S3 real não foi repetida nesta entrega. No navegador local, a tela inicial carregou, mas a API estava indisponível; por isso não foi possível revisar os fluxos sociais ou a responsividade. Nenhum aparelho foi validado e o CI remoto não foi executado. Migração e Alembic check foram aplicados/verificados no banco local de desenvolvimento sem apagar dados. Permanecem pendentes ensaio em Android/iOS, revisão responsiva ao vivo, S3 real para posts e execução remota do CI. Nenhum mock foi acrescentado à interface. Sem commit, push ou deploy.

## Plano definido — posts, perfis sociais e moderação — 10 de outubro de 2026

O plano foi registrado com o usuário antes desta implementação. Seus critérios e contratos continuam em [plano de posts](plano-posts.md); o estado verificado desta entrega está na seção acima.

## Plano da próxima evolução: imagens e avatar — 9 de outubro de 2026

Implementado o armazenamento privado S3 compatível e o fluxo de foto de perfil na web e no mobile, conforme [plano-minio-imagens.md](plano-minio-imagens.md). PostgreSQL guarda metadados e referência nullable; a API autenticada serve as imagens. MinIO local usa volume próprio. Posts, brasões, perfis públicos e infraestrutura de produção continuam fora desta entrega.

Data: 9 de outubro de 2026. Implementação inicial de conta e perfis, referente à entrega 1. Este registro complementa o roteiro e não declara o MVP completo.

## Implementado

- API FastAPI com saúde, configuração, erros sem valores sensíveis e OpenAPI.
- Cadastro adulto, e-mail normalizado e único, hash de senha Argon2, login, expiração e logout revogável.
- Consulta e edição do nome, do nome de usuário (@) e dos perfis privados de futebol, tênis e corrida, com autorização pelo titular.
- Migração Alembic com integridade relacional, catálogo inicial de seis municípios e seed idempotente de desenvolvimento.
- Cliente React/Vite responsivo e cliente React Native/Expo consumindo a mesma API.
- Frontend web aproximado do protótipo Figma Make: símbolo atualizado do Coliseu enviado pelo usuário, marca `arena.` com ponto verde, fontes Inter/Sora, cores, cards compactos, carrossel, capa e avatar do perfil e navegação inferior com Início, Ranking, Jogar, Comunidade e Perfil. Detalhes em [fidelidade ao Figma](fidelidade-figma.md).
- Estados de carregamento, erro recuperável, sucesso e sessão expirada; labels e foco na web, controles acessíveis e adaptação ao teclado no mobile.
- Arquivos de lock, exemplos de ambiente, comandos de execução e workflow CI.
- Avatar privado: MinIO local construído da versão fixada no Compose, bucket `arena-media` criado por comando explícito, entidade de mídia e referência nullable por migração, upload autenticado com normalização WebP e leitura/removal sob sessão. A web permite recorte quadrado com arraste/zoom; o Expo usa seletor e editor nativo quadrado. Os dois clientes enviam multipart e não recebem URL presigned.

## Diretriz para esta fase inicial

Em 9 de outubro de 2026, o usuário aprovou a interface como está e esclareceu que não é necessário acrescentar mocks. Manter os dados reais nas funcionalidades integradas e os estados vazios ou indicações de disponibilidade futura nas demais áreas. Essa preferência substitui a orientação anterior sobre o uso de dados demonstrativos.

Atualizar este Markdown a cada entrega ou alteração no projeto, registrando implementação, validações e pendências de integração. A orientação também está em `AGENTS.md` para as próximas tarefas. Na atualização mais recente, moedas e carteira foram removidas da interface web por solicitação do usuário. Os símbolos do logo e dos elos foram extraídos de `Resumo Arena.html`; a marca voltou a `arena.` com ponto verde. A tela de ranking apresenta Bronze, Prata, Ouro, Diamante e Lendário como referência visual de progressão, sem atribuir classificação ou pontuação fictícia à conta. O símbolo de parede alta foi aplicado ao botão central. Build, TypeScript e ESLint aprovados; no navegador, ilustrações carregadas, navegação e perfil sem carteira conferidos, sem overflow horizontal na viewport de 390 px.

### Estado atual das áreas da interface

| Área | Estado |
| --- | --- |
| Cadastro, login, sessão e logout | Integrados à API. |
| Nome, cidade, posição e disponibilidade esportiva | Integrados à API, com persistência. |
| Saudação, iniciais do avatar e chips de modalidades | Derivados dos dados reais da conta. |
| Foto de perfil (avatar) e capa | Integradas à API e ao armazenamento privado, com recorte, troca e remoção (capa padrão) na web e no mobile. |
| Edição de perfil e @ | Integradas à API: lista agrupada com folhas, @ único com verificação de disponibilidade, visibilidade, contas bloqueadas e conexões. |
| Posts, comunidade e perfis sociais | Integrados à API: feed cronológico, foto/legenda, curtidas, comentários, busca, privacidade social, seguidores, bloqueios e denúncias. Painel administrativo web e histórico de decisões implementados. |
| Conteúdo do perfil | Abas Fotos \| Partidas na web e no Expo: grade com visualizador "Publicações", post 4:5, comentários e ações em vidro, denúncias de post/comentário/conta com motivo e detalhes e topo fixo condensado. Partidas (P2) aguarda domínio e mostra estado vazio; Atividades sairá para Notificações em entrega futura. |
| Partidas, ranking, estatísticas e notificações | Estrutura visual e estados vazios ou indicação de disponibilidade futura; sem dados demonstrativos ou integração de domínio. Notificações exibe, provisoriamente, as solicitações para seguir. |
| Moedas e carteira | Removidas da interface web e fora da direção atual do produto; não implementar sem nova solicitação. |
| Botão Jogar | Abre a preparação dos perfis esportivos; busca e agendamento ainda pendentes. |
| Cliente Expo | Comunidade e recursos sociais implementados; título @, hambúrguer e folha Menu aplicados; a revisão visual do Figma foi aplicada somente à web. |

## Evidências e limites

### Posts e perfis sociais — 10 de outubro de 2026

| Verificação | Resultado |
| --- | --- |
| Migração e esquema | `0003` aplicado no PostgreSQL local preservando os dados existentes; Alembic check sem diferenças. |
| Backend | Ruff aprovado; 79 testes aprovados em PostgreSQL isolado, com um teste opcional S3 real pulado; cobertura combinada: 86,13% (88,67% de linhas, 71,96% de ramos). |
| Fluxos sociais PostgreSQL | Privacidade, solicitação/aprovação, feed, imagem autorizada, curtida idempotente, comentário, bloqueio/desbloqueio, denúncia e suspensão testados. Storage de integração social substituído por double; MinIO real para posts pendente. |
| Web | ESLint, TypeScript, build e 24 testes/cobertura aprovados; cobertura de ramos: 31,84%. |
| Mobile | ESLint, typecheck, 15 testes/cobertura e exportação Android aprovados. |
| Navegador e aparelhos | A tela inicial abriu, mas API indisponível impediu validar a Comunidade e a revisão responsiva; nenhum aparelho Android/iOS foi validado. |
| CI remoto | Pendente. |

| Verificação | Resultado |
| --- | --- |
| Migração em PostgreSQL 16.14 vazio | Aplicada até `0001`; catálogo e tabelas criados. |
| Alembic check | Sem operações novas de migração; modelos e banco coerentes. |
| Testes backend | 60 aprovados: 52 unitários e 8 de integração, sem testes pulados. Cobertura de linhas: 62,11% apenas unidade e 88,20% na suíte completa. |
| Integração PostgreSQL | Testes em schema aleatório isolado; unicidade concorrente, perfis, autorização, expiração e logout exercitados. |
| Seed | Executado duas vezes sem duplicar a conta nem perfis. |
| Web | Build, TypeScript e ESLint aprovados; fluxo de cadastro/login/perfil executado no navegador. |
| Persistência web | Perfil e nome mantidos após recarregar e após reiniciar API e PostgreSQL; logout seguido de recarga voltou ao login. |
| Responsividade web | Interface inicial conferida a 320, 375, 390, 430, 768, 1024 e 1280 px; revisão visual do Figma conferida a 320, 390 e 1440 px, sem overflow horizontal da página. |
| Revisão visual do Figma | Build, TypeScript e ESLint aprovados; cadastro, login, edição do nome e salvamento de perfil de futebol exercitados na API. Perfil mantido após recarregar; navegação, filtro de modalidade e abas por teclado verificados. |
| Mobile | TypeScript, ESLint e exportação Android aprovados; transporte Bearer coberto nos testes da API. |
| Aparelhos Android e iOS | Pendente; bundle gerado não comprova usabilidade ou SecureStore em dispositivo. |
| CI remoto | Workflow criado, ainda não executado no GitHub. |
| Imagens e avatar | Migração `0002` aplicada e `alembic check` limpo. Suíte backend: 73 aprovados com PostgreSQL e MinIO local; round-trip S3 real aprovado. Web: lint, TypeScript, cobertura (22 testes) e build aprovados. Mobile: lint, typecheck, cobertura (14 testes), Expo install check e export Android aprovados. |
| Aplicativo mobile em aparelhos | Pendente; o seletor e recorte foram configurados no Expo, mas nenhum aparelho foi validado. |
| Meta de desempenho RNF03 | Não medida; carga e matriz de ensaio pendentes. |

O Docker Desktop falhou ao iniciar seu serviço de inferência. Os testes usaram PostgreSQL isolado na porta 55432; o Compose permanece configurado para porta 5432. Testes de integração precisam de `TEST_DATABASE_URL`; sem essa variável ficam explicitamente pulados e não comprovam persistência.

Ambiente de execução dos checks: Windows, Python 3.13.0, Node.js 25.9.0, npm 11.12.1 e Expo SDK 57. O CI propõe Node 24 LTS e Linux; essa execução remota ainda está pendente.

O audit inicial do mobile apontou 22 alertas transitivos em ferramentas Expo/Metro/Xcode, ligados a `braces`, `node-forge` e `uuid`. A atualização compatível não os eliminou; a sugestão automática exige regressão para Expo 44 e não foi aplicada. Rever versões corrigidas antes de publicar ou usar fluxos de assinatura; a web apresentou zero alertas no audit inicial. O relatório bruto local não é versionado.

## Relação com as especificações

HU01, RN01 e a seleção de modalidades em RN02 possuem implementação. RN22 é atendida por perfis sociais privados por padrão, publicação opt-in, posts com fotos e controles de acesso; busca de contas também foi implementada. Inscrições de TI05 permanecem futuras.

O roteiro original contém propostas e diagramas para o MVP completo. Na entrega inicial, a modelagem se limitava a cidades, usuários, sessões e perfis. A entrega de 10 de outubro também implementou as tabelas sociais descritas nesta página e no [diagrama da fundação](diagramas/fundacao.md); as demais propostas do MVP continuam como desenho futuro.

A implementação social ainda exige validação visual em navegador e demonstração em aparelho mobile. Times, vagas, partidas, chat, resultados, rankings, corrida e eventos permanecem fora das entregas realizadas até aqui.

A revisão do arquivo Word ficou pendente: o renderizador da skill de documentos não encontrou o LibreOffice necessário à inspeção visual. O arquivo original foi preservado; este registro e o README descrevem o estado atual e devem orientar a atualização do roteiro quando houver renderização disponível.

## Atualização dos ícones de modalidades — 9 de outubro de 2026

Aplicados provisoriamente os três PNGs enviados pelo usuário: bola com louros para futebol, raquete com louros para tênis e sandália alada com louros para corrida. Os arquivos originais foram copiados para `web/public/images/sports/`, sem alteração das imagens. O componente `SportIcon` centraliza a apresentação nos cards da home, cards de preparação de perfis, filtros do ranking e chips do perfil. CSS adapta o tamanho e o contraste em fundos claros e verdes. Logo e ilustrações dos elos permanecem com os símbolos do Coliseu.

Validação: build, TypeScript e ESLint aprovados; carregamento dos três arquivos, cards e contraste dos filtros conferidos no navegador. Evidência em `artifacts/arena-modalidades.png`. Nenhum mock ou alteração de API foi acrescentado; as integrações pendentes permanecem as registradas acima. Esta atualização aplica-se à web; a adaptação visual do cliente Expo continua pendente.

## Ajuste do ponto da marca — 9 de outubro de 2026

O ponto verde de arena. passou a ser um círculo de 5 × 5 px com border-radius de 50%, independente do desenho da fonte. Build e TypeScript aprovados; forma circular conferida no navegador. Evidência em artifacts/arena-ponto-redondo.png. Sem mudanças nas integrações ou nos dados.

## Refinamento do alinhamento da marca — 9 de outubro de 2026

Após avaliação visual do usuário, o ponto circular verde foi elevado em 4 px para acompanhar a base das letras de arena., evitando a aparência de ponto solto abaixo do nome. Build e TypeScript aprovados; alinhamento conferido no navegador. Evidência em artifacts/arena-marca-alinhada.png. Integrações e pendências preservadas.

## Ampliação das orientações do projeto — 9 de outubro de 2026

AGENTS.md ampliado com contexto e fontes de consulta, mapa do repositório, decisões de produto e identidade visual, contratos de autenticação/persistência, validação proporcional por área e critérios de conclusão. Preservada a obrigação de atualizar este registro a cada entrega. Comandos e caminhos conferidos contra README, scripts npm, configuração Python e workflow CI. Alteração somente documental; nenhum novo teste de código executado.

## Versionamento da fundação — 9 de outubro de 2026

Commit local na branch main autorizado pelo usuário, reunindo a fundação de backend/web/mobile, documentação, workflow CI e ajustes visuais realizados nesta sessão. Revisão de arquivos versionáveis e verificação de whitespace executadas antes do commit. Ambientes .env, dependências instaladas, banco auxiliar e screenshots permanecem ignorados. Não foram repetidos testes de código nesta etapa de versionamento; as evidências anteriores permanecem registradas acima. Nenhum push foi solicitado.

## Envio ao repositório remoto — 9 de outubro de 2026

O usuário autorizou enviar a main para origin (repositório davicl04/arena no GitHub). O commit a0b7603 reúne a fundação e os ajustes visuais; este registro acompanha o envio. Nenhuma alteração funcional nem novos testes de código nesta etapa. A confirmação do push é verificada pelo comando Git e pela comparação entre HEAD e a referência remota.

## Armazenamento privado e avatar — 9 de outubro de 2026

Adicionado MinIO local, compilado do código da versão `RELEASE.2025-10-15T17-29-55Z`, com portas 9000/9001 e volume próprio `miniodata`; o volume `pgdata` foi preservado. Bucket `arena-media` inicializado pelo comando administrativo explícito. A migração `0002` registra mídia com UUID, titular, chave opaca, MIME, tamanho, dimensões e data, e acrescenta ao usuário a referência nullable do avatar. Upload limita tamanho e megapixels, valida JPEG/PNG/WebP estáticos pelo conteúdo, corrige EXIF, remove metadados e converte para WebP quadrado de até 512 px. A API serve e remove a imagem somente com a sessão do titular; falha na limpeza da imagem anterior não desfaz uma troca já persistida e o comando `reconcile` limpa órfãos com mais de 24 horas.

A web tem editor quadrado com arraste, zoom, prévia e controles por teclado; o mobile usa `expo-image-picker` com recorte nativo. Cancelamento e erro preservam a foto atual; sem foto ou em falha de leitura aparecem as iniciais. As abas de fotos continuam vazias. Atualizados README, decisões técnicas, diagrama, workflow de CI e locks.

Verificações executadas: Alembic upgrade/check; Ruff; 76 testes backend aprovados com PostgreSQL e round-trip S3 contra MinIO local; cobertura unitária 72,69% e total 87,71%, acima dos pisos de 60% e 85%. Web lint, typecheck, cobertura (22 testes) e build passaram. Mobile lint, typecheck, cobertura (14 testes), `expo install --check` e exportação Android passaram. A primeira tentativa do MinIO revelou permissão no volume Docker; o entrypoint foi ajustado para preparar o diretório e executar o processo como usuário sem privilégios. O serviço ficou healthy e o round-trip S3 passou. A revisão visual web do avatar não foi concluída porque o navegador estava sem acesso à API local. Nenhum aparelho Android/iOS foi testado; suporte, hospedagem, HTTPS e backup de produção seguem pendentes.

## Correção da conexão com Compose — 9 de outubro de 2026

Diagnosticado erro de conexão no Alembic: o backend/.env local ainda apontava para a porta auxiliar 55432, embora o PostgreSQL do Docker Compose estivesse healthy na porta 5432. A porta foi corrigida no arquivo local ignorado, preservando os demais valores. Alembic upgrade head, current (0001 head) e check executados com sucesso no banco do Compose. O auxiliar havia sido reiniciado durante o diagnóstico inicial e foi encerrado após a correção; seus dados foram preservados. README ampliado para explicar que a cópia condicional do .env não atualiza arquivos existentes e que os dois bancos possuem dados independentes. API e fluxos dos clientes não foram iniciados nem testados nesta etapa; reiniciar a API para carregar a configuração atualizada.

## Indicadores de qualidade e testes unitários — 9 de outubro de 2026

Avaliação dos itens 3.1 e 3.2 registrada em docs/qualidade-codigo.md, com repositório, padrões e resultados verificáveis. Executados 8 casos unitários do backend: 8 aprovados, zero falhas/pulados e taxa de sucesso de 100%. Cobertura de instruções de backend/app apenas por esses testes: 146 de 322 (45,34%; relatório arredondado 45%). XML local em artifacts/coverage-unit.xml. Ruff aprovado. Não foram repetidos testes de integração nem checks dos clientes. Pendente ampliar testes isolados, definir meta, publicar cobertura no CI e adicionar testes unitários de web/mobile; não há indicador de cobertura do sistema inteiro.

## Ampliação dos testes e cobertura no CI — 9 de outubro de 2026

Adicionados testes unitários de cadastro, autenticação, hash/sessão, expiração, proteção de origem e schemas no backend; transporte, cadastro/login, recuperação de conexão e abas por teclado na web; SecureStore/Bearer, respostas e timeout no mobile. Doubles são exclusivos dos testes, sem dados demonstrativos na interface. Vitest/V8 e Testing Library foram instalados como dependências de desenvolvimento com versões exatas e locks atualizados. Scripts npm test e test:coverage disponíveis nos dois clientes.

Resultados locais: 52/52 unidades backend, 18/18 web e 12/12 mobile, com 100% de sucesso e zero falhas/pulados. Suíte completa do backend: 60/60, incluindo 8 testes PostgreSQL em schema isolado. Cobertura de linhas: backend unidade 62,11%, completo 88,20%, web 35,02%, mobile 16,66%. Cobertura de ramos: 47,83%, 71,74%, 34,69% e 8,91%, respectivamente. Cobertura combinada de instruções/ramos do backend: 60,33% unidade e 85,87% completo. Ambos os arquivos de transporte dos clientes têm 100% de linhas cobertas; cobertura global continua inicial, especialmente nas telas mobile.

Checks: Ruff (incluindo scripts), lint e TypeScript web/mobile, build web e exportação Android aprovados. YAML do CI validado e gerador de resumo conferido com relatórios reais. Pisos iniciais de cobertura, uploads HTML/XML/JUnit/LCOV/JSON e resumos GitHub Actions configurados; execução remota desta alteração ainda pendente. Os 22 alertas transitivos anteriores do mobile permanecem, sem atualização forçada do Expo. Detalhes dos indicadores e comandos em docs/qualidade-codigo.md. Não houve alteração funcional dos clientes/API nem novo ensaio em aparelho.

Roteiro Word atualizado nos itens 3.1/3.2 e no estado da fundação, preservando os cenários futuros como planejados. Estrutura DOCX, indicadores, tabelas e imagens conferidos; backup anterior local em artifacts/. A tentativa de renderização com a skill documents falhou porque o runtime não contém LibreOffice/soffice.exe. A paginação e aparência final do Word permanecem sem validação visual. README e AGENTS.md atualizados com execução e acompanhamento da cobertura. Sem commit/push nesta entrega.

## Versionamento dos testes e indicadores — 9 de outubro de 2026

Commit e envio à main de origin autorizados pelo usuário, incluindo testes unitários dos três módulos, configuração de cobertura/CI, documentação e roteiro Word atualizado. Revisão de whitespace e arquivos versionáveis realizada; relatórios, backup do Word e configuração local .env permanecem ignorados. Verificações de código registradas na entrega anterior não foram repetidas nesta etapa. Confirmação do envio por Git e comparação de HEAD com a referência remota; execução do novo CI remoto permanece pendente.
