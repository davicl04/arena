# Próximos passos — tela Jogar

> Estado em 12 de outubro de 2026: o [plano da tela Jogar](plano-jogar.md) e o [plano de Times e campeonatos](plano-times-campeonatos.md) estão fechados. **A etapa 1 da execução está implementada e integrada no backend e na web**: Times e campeonatos, fases 1 a 3 (times, convites, link do time, encerrar time, pedido de organizador e fila da administração), e Jogar, fase 1 (elos e linha de classificação na placa). Os contratos estão em [0003](decisoes/0003-times-campeonatos.md) e [0002](decisoes/0002-jogar.md); o registro, em [situação da fundação](situacao-fundacao.md). **A etapa 2 também está implementada e integrada no backend e na web**: Times e campeonatos, fases 4 e 5 (criar evento, aprovação de pagos pela administração, gestão, comprovantes, devoluções por Pix, avisos e revogação), e Jogar, fase 7 (Campeonatos e Provas do atleta: lista, detalhe, inscrição, reserva, Pix e comprovante). **A etapa 3 também está implementada e integrada no backend e na web** (12 de outubro de 2026): Jogar, fases 2 a 5 (pareamento de times, tênis e avulso, proposta e oferta de vaga, tela da partida com condições, quadras, reserva, chat, cancelamento e W.O., resultado com relato cego, presença, estatísticas, contestação e revisão, Ranking real e as filas de quadras e de W.O. da administração). O Expo fica para a última etapa. Este arquivo define a ordem de trabalho e o que ainda falta decidir. Atualize-o a cada etapa concluída, junto com a situação da fundação.

## Ordem de implementação recomendada (12 de outubro de 2026)

Os dois planos se cruzam: o Jogar precisa de times, e partes de Times e campeonatos precisam da inscrição e do resultado do Jogar. Por isso a execução **intercala** os dois, em vez de terminar um plano inteiro antes do outro:

1. **Times e campeonatos, fases 1 a 3:** times, link do time e organizador (pedido e aprovação). **Implementado no backend e na web em 12 de outubro de 2026 (etapa 1).**
2. **Jogar, fase 1:** elos e linha de classificação. **Implementado no backend e na web em 12 de outubro de 2026 (etapa 1)**, com `standings` vazio até existirem partidas.
3. **Times e campeonatos, fase 4:** criar evento, rascunho, aprovação de pagos e gestão. **Implementado no backend e na web em 12 de outubro de 2026 (etapa 2).**
4. **Jogar, fase 7, junto com Times e campeonatos, fase 5:** inscrição do atleta, comprovante e análise pelo organizador, com a devolução por Pix. **Implementado no backend e na web em 12 de outubro de 2026 (etapa 2).**
5. **Jogar, fases 2 a 5:** pareamento, partida e chat, avulso, resultado e ranking. **Implementado no backend e na web em 12 de outubro de 2026 (etapa 3)**; pendência: a calibragem dos cortes de elo com dados reais.
6. **Times e campeonatos, fases 6 e 7:** chaveamento, agenda das partidas de campeonato (usando a partida e o chat do Jogar) e divergência decidida pelo organizador.
7. **Jogar, fase 6:** corrida.
8. **Expo**, na última etapa, com todas as telas (decidido em 12 de outubro de 2026).

## Ordem combinada (11 de outubro de 2026)

A implementação do Jogar **começa depois da tela "Times e campeonatos"**. O Jogar depende de times com elenco e representantes, e os campeonatos dependem de eventos criados por organizadores. As telas que o plano exige e que ainda não têm desenho também entram depois dela.

| Etapa | O que é | Depende de |
| --- | --- | --- |
| 1 | **Tela "Times e campeonatos"**: desenho (rodadas de protótipo), plano e implementação. | — |
| 2 | **Telas complementares**: desenho e plano. | Etapa 1 |
| 3 | **Jogar, fases 1 a 7** do plano. | Etapas 1 e 2 |
| 4 | **Jogar no Expo** (fase 8). | Etapa 3; última etapa, com tudo |

### Etapa 1 — Tela "Times e campeonatos"

> **Desenho e plano concluídos em 12 de outubro de 2026**, em 19 rodadas de protótipos: veja o [plano de Times e campeonatos](plano-times-campeonatos.md). O escopo virou **duas áreas separadas**: Meus times, de todo atleta, e Organizador, só para quem tem a permissão concedida pela administração. A implementação segue as fases do plano. As fases 5 (comprovantes) e 7 (divergência) dependem de partes do Jogar (inscrição do atleta e cartão de resultado).
>
> **Progresso:** as fases 1 a 3 (times, papéis, convites, sair e remover, elenco, link e QR com pedido de entrada, encerrar time, pedido de organizador, fila e decisão da administração, revogação) estão implementadas no backend e na web, com notificações e auditoria. Os eventos do organizador (fase 4), a gestão de comprovantes e a aprovação de eventos pagos pela administração entraram na etapa 2 (implementados e integrados no backend e na web). Falta, da lista abaixo, a montagem do chaveamento ou da tabela e o agendamento das partidas (fase 6), além de todas as telas no Expo.
>
> **Etapa 2 (12 de outubro de 2026):** criar evento (V4) com rascunho e checklist, publicação direta do gratuito, aprovação do pago na fila "Eventos pagos", cartazes (O3) e gestão (G3), análise de comprovantes (A2) com recusa e reenvio, avisos do evento, cancelamento com devolução por Pix e contestação decidida pela administração, revogação de organizador com a decisão da administração, Campeonatos e Provas do atleta (E2 e D2) com reserva, Pix e comprovante, e as notificações dos tipos novos, todos conferidos num fluxo real no navegador. Pendências desta etapa: histórico de inscrições do atleta (a rota `scope=historico` existe, sem tela), a aba Tabela do D2 (depende da fase 6) e as telas no Expo.

Escopo mínimo para destravar o Jogar, como foi planejado em 11 de outubro:

- **Times:**
  - criar time com nome, cidade e brasão opcional (upload no MinIO);
  - convidar membros e aceitar convites;
  - papéis de representante e membro;
  - sair do time e remover membros;
  - ver o elenco.

  Um atleta pode estar em vários times (RN02).
- **Campeonatos e provas, como organizador:**
  - criar evento com modalidade, formato, tipo (todos contra todos ou eliminação simples), capacidade, elos aceitos, datas e local;
  - preço e **dados de pagamento** (favorecido, chave Pix, código Copia e Cola, instruções e contato), usados na folha "Pagamento e informações" do Jogar.
- **Gestão do organizador:** aprovar ou recusar comprovantes com motivo, montar a tabela ou o chaveamento e agendar as partidas do campeonato (RN19).
- **Administração:** aprovar eventos pagos antes da publicação (RN20).

Com isso, a fase 7 do Jogar (inscrição em campeonatos e provas) passa a ter eventos reais.

### Etapa 2 — Telas complementares (sem desenho até agora)

Fazer uma rodada curta de protótipos para cada uma, no mesmo processo usado no Jogar:

- **Tela Ranking real:**
  - filtros Times | Individual, formato, posição (futebol) e distância (corrida);
  - ranking **geral**, sem a linha de cidade;
  - posição de quem está vendo e brasão do elo em cada linha.
- **Notificações com os tipos novos:** proposta, aceite, condições, partida agendada, cancelamento, W.O., resultado, divergência, contestação, vaga preenchida, reserva expirando e comprovante decidido. Elas convivem com os pedidos para seguir que já existem.
- **Revisão de quadras pela administração:** fila de sugestões, detecção de duplicidade, publicar ou rejeitar com motivo (RN07). Fica junto da moderação atual.

### Etapa 3 — Implementação do Jogar

> **Progresso (12 de outubro de 2026):** as fases 2 a 5 estão implementadas e integradas no backend e na web, com a tela Ranking real, as notificações dos tipos novos e as filas de quadras e de W.O. da administração; o contrato e os desvios estão em [0002, seções 7 a 16](decisoes/0002-jogar.md#7-etapa-3--fases-2-a-5-decisões-esquema-estados-e-tipos). A web foi conferida num fluxo real no navegador (placa, proposta, condições com quadra publicada pela administração, avulso, chat com denúncia e remoção, placar com relato cego, presença, estatísticas com contestação e revisão, divergência e correção, W.O. contestado e decidido, cancelamento, tênis com super tie-break, notificações e filas), em 320, 390 e 1440 px. Os prazos de 24 h, 2 h e 48 h foram observados só ajustando horários no banco de verificação e rodando a varredura. **Pendências:** o Expo (última etapa, com tudo); campeonatos (chaveamento, agenda e divergência decidida pelo organizador, que reaproveitam a partida e o chat) e corrida (fases 6 e 7 de Times e campeonatos e fase 6 do Jogar) ainda sem tela de partida na web; a calibragem dos cortes de elo com dados reais; o agendamento da varredura em produção; e as atualizações em tempo real (a placa relê a cada 15 s enquanto há atenção e o chat, a cada 4 s).

Seguir as fases do [plano](plano-jogar.md#fases-de-entrega), cada uma demonstrável de ponta a ponta, com persistência após recarregar:

1. Elos e linha de classificação. **Concluída na etapa 1 da execução** (backend e web), junto com os times mínimos.
2. Pareamento de amistosos (time e tênis), com a fila no PostgreSQL e a varredura periódica. **Concluída na etapa 3 da execução** (backend e web).
3. Partida: condições, quadras, reserva, chat, cancelamento e W.O. **Concluída na etapa 3 da execução** (backend e web).
4. Avulso: qualquer formato, posição específica ou qualquer posição, entrada direta. **Concluída na etapa 3 da execução** (backend e web).
5. Resultado, estatísticas, contestação e ranking. **Concluída na etapa 3 da execução** (backend e web).
6. Corrida.
7. Campeonatos e provas (inscrição e comprovante). **Concluída na etapa 2 da execução** (backend e web): a inscrição, a reserva, o Pix, o comprovante, a devolução e os avisos já funcionam; o chaveamento e a tabela dependem de Times e campeonatos, fase 6.

Em cada fase:
- migração Alembic e `alembic check`;
- contratos documentados em `docs/decisoes/0002-jogar.md`;
- testes de unidade e de integração;
- checks da web (lint, build, cobertura) e conferência no navegador a 320, 390 e 1440 px;
- registro em `situacao-fundacao.md`.

## Decisões fechadas em 11 de outubro de 2026

Já incorporadas ao plano. As que mudam regras de negócio também foram aplicadas ao roteiro.

- **Ranking:** rankings, elos e Lendário são gerais; a cidade serve só para o pareamento.
- **Componentes:** `Tabs` nas seções do detalhe do evento; `react-day-picker` aprovado para o Calendar.
- **Fila de pareamento:** PostgreSQL, com trava por balde e varredura a cada minuto. Redis fica como possibilidade futura.
- **Cancelamento e W.O.:** qualquer representante cancela a partida agendada até 24 h antes. Depois disso, quem não comparece perde por W.O., e os avulsos escalados são avisados.
- **Placar do tênis:** melhor de 3 sets, tie-break em 6-6 e super tie-break opcional no terceiro set, com validação no servidor.
- **Avulso:** aceita qualquer formato e escolhe entre uma posição específica e **qualquer posição** (preenchimento automático). O elo é comparado na posição e no formato da vaga.
- **Pix na inscrição paga:** bloco com a chave e botão de copiar só com ícone, "Copiar Pix Copia e Cola" e ícone ⓘ com "Pagamento e informações".

## Decisões fechadas em 12 de outubro de 2026 (etapa 1)

Detalhadas no [plano de Times e campeonatos](plano-times-campeonatos.md#decisões-de-produto):

- **Organizador é uma permissão.** O atleta pede no Menu e a administração aprova ou recusa com motivo.
- **Times:**
  - sempre há pelo menos um representante;
  - o convite tem mensagem opcional;
  - o **link do time** não expira (vale até gerar outro), e quem entra por ele pede e aguarda um representante.
- **Partidas de campeonato:** têm chat, **com o organizador participando**. Usam o **mesmo cartão de resultado** dos amistosos, e a **divergência vai ao organizador**, que decide com justificativa registrada.
- **Agendamento:** o organizador informa data, **horário livre** e quadra. Há bloqueio quando a mesma quadra tem jogo a menos de **2 h**.
- **Chaveamento** com menos confirmados segue com **folgas**. Um representante pode **encerrar o time**. **Evento cancelado** exige a devolução por Pix, com comprovante por inscrição e aviso no chat do campeonato. **Revogar organizador** é com a administração. **QR:** `qrcode.react` (web) e `react-native-qrcode-svg` (Expo).
- **Comprovante recusado:** o time pode reenviar até o fim da reserva, com os envios anteriores preservados.
- **Evento pago recusado** pela administração volta a rascunho com o motivo.

## Decisões fechadas em 12 de outubro de 2026 (execução)

Tomadas ao iniciar a implementação da etapa 1; os contratos estão em [0003-times-campeonatos.md](decisoes/0003-times-campeonatos.md) e [0002-jogar.md](decisoes/0002-jogar.md).

- **W.O.:** placar 3×0 no futebol e 6-0 6-0 no tênis. Sem restrição automática por W.O. repetido no MVP; fica no histórico.
- **Moderação do chat:** denúncia de mensagem pelo `ContentReport` (`target_type = 'match_message'`), na fila de Denúncias existente.
- **Varredura de cada minuto:** `python -m app.admin_cli sweep [--loop 60]`, rodado num terminal em desenvolvimento e documentado no README. As leituras continuam tratando os vencimentos. O agendamento em produção fica para a implantação.
- **Canal do campeonato:** canal de **avisos** do evento; o organizador escreve e os inscritos leem. O cancelamento entra como aviso automático.
- **Devolução não confirmada:** o participante confirma ou contesta o recebimento. Sem resposta em 7 dias, conta como recebida; a contestação vai à administração.
- **Expo:** última etapa, com **todas** as telas, inclusive organizador e administração.

## Decisões fechadas em 12 de outubro de 2026 (integração da etapa 3)

- **Relato cego do placar:** a API só mostra o placar do outro lado depois que o meu lado informou o meu (ou na divergência, ou com o resultado decidido); antes, mostra só que o outro lado já informou. Revê a decisão anterior de manter o placar visível ([0002, seção 12.3](decisoes/0002-jogar.md#123-placar-rn09-rn15)).
- **Vagas declaradas:** `MatchSideOut.declared_slots` mostra o declarado na busca enquanto a partida é proposta ou está sendo combinada.
- **Quadra sugerida:** só até o início da partida.

## Ainda a decidir

| Tema | Quando decidir |
| --- | --- |
| Calibragem dos cortes de elo com dados reais | Depois das primeiras partidas confirmadas |
| Agendamento da varredura em produção | Na implantação |
| Migração da fila para Redis | Só se aparecerem os sinais listados no plano |

## Referências

- [Plano da tela Jogar](plano-jogar.md)
- [Plano de Times e campeonatos](plano-times-campeonatos.md), com o protótipo consolidado (artefato privado do usuário): https://claude.ai/artifact/G3xgALgdMGPsQ4YneJPGv7. A fonte local, não versionada, fica em `artifacts/prototipos/times.src.html`.
- Protótipo consolidado (artefato privado do usuário): https://claude.ai/artifact/U6RqvawwGLiUSPMst8haN4. A fonte local, não versionada, fica em `artifacts/prototipos/jogar.src.html`.
- [Roteiro do projeto](roteiro-projeto.docx), com as regras revistas como requisitos planejados.
