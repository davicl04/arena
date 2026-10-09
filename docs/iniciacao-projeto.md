# Iniciação do projeto Arena

Documento de referência para iniciar a construção do Arena a partir do protótipo navegável, conciliando interface, requisitos e arquitetura.

| Informação | Definição |
| --- | --- |
| Data | 9 de outubro de 2026 |
| Situação | Planejamento e estrutura inicial do repositório |
| Repositório | <https://github.com/davicl04/arena> |
| Roteiro de desenvolvimento | [roteiro-projeto.docx](./roteiro-projeto.docx) |
| Protótipo Figma Make | [Protótipo aplicativo ARENA](https://www.figma.com/make/JnbL2xvTf7xyhATwVbWcBm/Prototipo-aplicativo-ARENA?p=f&t=D4izIexcssVls1bD-0) |
| Base da análise visual | Prévia navegável inspecionada em 8 de outubro de 2026 |

## 1. Objetivo e resultado esperado

O Arena deve reunir a organização de futebol, tênis e corrida amadores em aplicações web e mobile. A solução permitirá encontrar adversários e vagas, organizar times e eventos, confirmar resultados e acompanhar a evolução esportiva com regras conhecidas.

O resultado esperado é um MVP integrado, com dados persistidos e fluxos demonstráveis nos dois clientes. O percurso principal começa no cadastro, passa pela participação em uma partida ou evento e termina no resultado validado, histórico e ranking correspondente.

O protótipo orienta a composição visual, a linguagem e a navegação. O roteiro Word do repositório define os requisitos e as regras do MVP. Quando houver divergência, a implementação seguirá o roteiro, e a adaptação necessária na interface deverá ser registrada. Mudanças de escopo precisam atualizar esta especificação, o Word e os critérios de aceite.

## 2. Pessoas e responsabilidades

| Papel | Ações previstas |
| --- | --- |
| Atleta adulto | Manter perfis esportivos, participar de partidas e eventos, registrar dados e consultar evolução. |
| Representante de time | Gerenciar elenco, publicar vagas, aceitar candidatos, buscar adversários e confirmar resultados do time. |
| Organizador | Criar campeonatos ou provas, controlar inscrições, revisar comprovantes e administrar resultados conforme a modalidade. |
| Administrador | Revisar quadras sugeridas e eventos pagos, com registro das decisões. |
| Visitante | Consultar apenas informações de perfis que seus titulares tenham tornado públicos. |

Uma conta pessoal pode acumular papéis conforme seus vínculos. A autorização deve considerar o time, a partida ou o evento envolvido, sem conceder acesso geral apenas porque o usuário exerce um papel em outro contexto.

Equipe indicada no roteiro: Ricardo Cezar de Moura Juca Junior, Rafael Rodrigues Martins, Renan Augusto Barbosa Inácio da Silva e Davi Castilho Lopes. A distribuição de responsáveis por entregas e a data de apresentação ainda precisam ser definidas.

## 3. Ponto de partida

O repositório contém o roteiro Word, diagramas, quatro wireframes, dependências previstas do backend e uma configuração Docker Compose para PostgreSQL 16. As pastas `web/` e `mobile/` estão reservadas para os clientes. O backend possui diretórios iniciais de módulos e testes, mas ainda não oferece um fluxo de aplicação executável.

A prévia do Figma apresenta Início, Ranking, Jogar, Comunidade e Perfil, além de telas de partida, campeonatos, carteira, organizador e configurações. O fluxo de busca chega a uma partida encontrada por meio de uma ação explícita de simulação. Algumas ações essenciais não avançaram durante a inspeção, como registrar resultado, editar perfil, criar ou gerenciar campeonato e inscrever-se.

Essas telas são referência de projeto. Sua presença não comprova autenticação, persistência, autorização, cálculo de ranking ou integração com serviços.

## 4. Escopo inicial

O MVP planejado mantém todas as frentes previstas no roteiro, implementadas em entregas progressivas:

- Contas de pessoas com 18 anos ou mais, autenticação e perfis por modalidade.
- Times de futebol, representantes, elencos, convites e convidados por partida.
- Pareamento de times de futebol e tenistas por cidade e faixa de nível.
- Proposta temporária, aceite bilateral, chat e confirmação de horário e quadra.
- Vagas avulsas de futebol por posição, candidatura e decisão do representante.
- Campeonatos de futebol e tênis e provas de corrida, com capacidade e elegibilidade.
- Inscrições gratuitas e pagas, com pagamento externo e análise manual de comprovante privado.
- Resultados confirmados, estatísticas de futebol e rankings específicos por modalidade.
- Registro de treinos e marcas de corrida com origem identificada.
- Sugestão e aprovação de quadras, com uso provisório restrito à partida de origem.
- Perfis públicos opcionais com fotos, histórico, ranking e status de procura.
- Clientes web e mobile consumindo a mesma API.

Ficam fora do MVP: outras modalidades, contas de menores, assinatura premium, vídeos, integração com Strava ou relógios, cobrança eletrônica dentro do Arena e reserva automática de quadras. Feed social, seguidores, moedas e desafios com moeda virtual aparecem no protótipo, mas não constituem requisitos aprovados no roteiro atual; sua inclusão depende de decisão explícita e modelagem adicional.

## 5. Aproveitamento do protótipo

| Tela ou fluxo | Referência aproveitável | Adaptação necessária para o MVP | Rastreabilidade no Word |
| --- | --- | --- | --- |
| Início | Resumo esportivo, próxima partida e eventos próximos. | Mostrar dados reais, pendências de aceite e estados sem histórico; substituir elos decorativos por níveis e métricas definidos no domínio. | HU01, HU03–HU05; RN04–RN05 |
| Jogar — futebol | Escolha de modalidade, busca e detalhe da partida. | Distinguir busca entre times de descoberta de vagas individuais; incluir posição, candidatura, decisão e contexto do time representado. | HU02–HU03, HU06–HU07; RN02–RN06 |
| Jogar — tênis | Entrada específica e proposta de partida. | Parear atletas pela cidade e nível; confirmar bilateralmente condições e placar. A opção Duplas depende de validação, pois sua composição não está detalhada no roteiro. | HU04–HU05, HU13; RN04–RN05, RN15–RN16 |
| Corrida | Entrada por modalidade e acesso ao ranking. | Criar formulário de tempo, distância e data; separar treino de prova; remover a passagem pelo fluxo de busca de adversário. | HU09, HU14; RN17 |
| Ranking | Abas por esporte, lista e destaque do próprio usuário. | Futebol individual por posição e ranking de times; tênis por pontos; corrida por distância e melhor tempo. Mostrar janela de 52 semanas e estado provisório. | HU11–HU14; RN11–RN17 |
| Perfil | Identidade, modalidades e histórico. | Incluir visibilidade opt-in, fotos e status de procura; tornar edição navegável e proteger informações privadas. | HU01, HU16; RN22 |
| Campeonatos e provas | Lista, detalhes, vagas, preço e organizador. | Criar fluxos de evento, elegibilidade, inscrição e acompanhamento; representar também evento gratuito e prova de corrida. | HU08–HU10; RN18–RN21 |
| Organizador | Visão geral de participantes e vagas. | Conectar criação e gestão; oferecer todos contra todos ou eliminação simples; incluir revisão de comprovantes e resultados. Retirar ARENA PRO do percurso do MVP. | HU08–HU10; RN19–RN21 |
| Quadras e agendamento | Local no detalhe da partida. | Mostrar sugestão, aprovação, uso provisório e reserva externa; alterações de horário ou quadra exigem novos aceites. | HU05, HU15; RN05, RN07–RN08 |

Na inspeção, a opção Registrar corrida conduziu à etapa Quando e onde e ao botão Buscar partida. A aba Corrida do ranking manteve a mesma lista de pontos e vitórias apresentada para futebol. Esses dois comportamentos precisam ser corrigidos para representar o domínio de corrida.

O botão Registrar resultado não abriu um formulário na prévia. Por isso, a atualização de ranking após confirmação deve ser especificada e construída como um fluxo completo, sem adotar os números de exemplo do protótipo como fórmula.

## 6. Direção de interface

A referência visual mais recente usa fundo cinza claro `#e2e4e9`, superfícies brancas, texto grafite `#495057` e ações verdes `#005a36`. Essa composição pode orientar os tokens dos clientes, sujeita à verificação de contraste e legibilidade. As instruções do protótipo indicam Sora para títulos e Inter para corpo; disponibilidade e aplicação deverão ser verificadas na implementação.

A navegação deverá preservar o acesso fácil ao início, rankings, participação esportiva e perfil. O destino Comunidade precisará ser conciliado com o escopo aprovado; times, vagas e eventos exigem caminhos visíveis mesmo que a composição final da barra seja ajustada.

Cada fluxo deve prever carregamento, estado vazio, erro recuperável, sucesso e situação pendente. Controles precisam ter rótulos compreensíveis, foco visível e retorno após a ação. Cor não pode ser a única indicação de nível ou estado.

A experiência mobile do Figma serve como ponto de partida para React Native/Expo. A web precisa de composição responsiva adequada a computador e smartphone, incluindo navegação por teclado. Não se deve presumir que o frame de telefone já define a experiência desktop.

## 7. Arquitetura e organização inicial

| Parte | Tecnologia e responsabilidade |
| --- | --- |
| Web | React e TypeScript; apresentação responsiva e consumo da API. |
| Mobile | React Native e Expo; aplicativo Android/iOS consumindo a mesma API. |
| Backend | Python e FastAPI; autenticação, autorização, validação, transições de estado e regras esportivas. |
| Banco | PostgreSQL; integridade dos vínculos, resultados, inscrições e registros esportivos. |
| Persistência | SQLAlchemy e migrações Alembic, conforme dependências já previstas. |
| Arquivos | Fotos e comprovantes com políticas distintas; provedor ainda a definir. |
| Ambiente local | PostgreSQL no Docker Compose existente; serviços de aplicação configurados durante a construção. |

As regras autoritativas de ranking, elegibilidade, vagas e confirmação pertencem ao backend. Ambos os clientes devem apresentar os estados devolvidos pela API. Reenvios de aceite, resultado ou inscrição devem evitar duplicidade e preservar capacidade e consistência.

```text
arena/
  docs/                     documentação, diagramas e wireframes
  backend/
    app/
      core/                 configuração, autenticação e permissões
      models/               entidades persistidas
      schemas/              contratos de entrada e saída
      routers/              endpoints
      services/             regras e transições de domínio
      repositories/         acesso ao banco
    tests/
      unit/
      integration/
  web/                      cliente React
  mobile/                   cliente Expo
  docker-compose.yml        PostgreSQL local
```

Os diretórios existentes serão a base. O roteiro menciona `api/` na organização proposta; a pasta real é `backend/`. Essa diferença deverá ser atualizada no Word quando a organização do código for consolidada. O diretório de migrações será criado dentro do backend ao configurar o Alembic.

## 8. Regras que orientam a construção

- Conta adulta e e-mail único; participação em vários times permitida, com representação de um só por partida ou campeonato.
- Busca de amistoso entre times ou tenistas da mesma cidade. Sem ranking, qualquer nível; após três partidas confirmadas, pareamento na mesma faixa relativa.
- Proposta e agenda exigem aceite dos dois lados. Uma alteração de horário ou quadra invalida o acordo anterior até nova confirmação.
- Vaga avulsa vincula o convidado apenas à partida; entrada permanente no elenco exige convite separado.
- Resultado de futebol exige placares idênticos confirmados pelos representantes. Estatísticas opcionais passam por revisão e podem ser contestadas; campo vazio não penaliza.
- Futebol individual usa média por partida na posição, com mínimo de três jogos na classificação principal; futebol de times usa 3/1/0 por vitória/empate/derrota e os desempates do roteiro.
- Tênis exige confirmação bilateral; vitória vale 10 pontos. Bônus de campeonato depende de ao menos quatro inscritos confirmados, conforme RN16.
- Corrida ordena melhor tempo por distância padrão e mantém a origem autodeclarada ou verificada visível.
- Rankings consideram as últimas 52 semanas. Fórmulas e versão do cálculo precisam ser rastreáveis.
- Evento pago só é publicado após revisão administrativa. Pagamento externo, comprovante privado e decisão manual substituem Pix ou cartão processados dentro do app.
- A reserva da inscrição paga termina no primeiro limite entre 48 horas após a inscrição e 12 horas antes do evento, conforme RN21.
- Perfil público depende de ativação do titular; conversa, contato e comprovantes permanecem privados.

As fórmulas completas e os detalhes normativos estão em RN01–RN22 do Word. Este documento não substitui essas regras.

## 9. Sequência proposta de entregas

Cada entrega deve integrar cliente, API e persistência, com dados fictícios de demonstração e verificação do comportamento. A ordem abaixo organiza a construção sem reduzir o escopo final planejado.

| Entrega | Resultado demonstrável | Critério de conclusão |
| --- | --- | --- |
| 1. Fundação e conta | Ambiente local, migrações, API, web e mobile; cadastro, sessão e perfil esportivo. | Conta adulta persistida; e-mail duplicado rejeitado; operações protegidas e acessíveis nos dois clientes. |
| 2. Times e vagas | Elenco, convites, publicação e candidatura por posição. | Representante decide candidatura e convidado participa apenas da partida indicada. |
| 3. Amistoso completo | Busca futebol/tênis, proposta bilateral, chat, horário e quadra. | Partida só agenda com condições aceitas por ambos; alteração exige novo acordo. |
| 4. Resultado e classificação | Placar, confirmações, estatísticas e rankings futebol/tênis. | Dados pendentes não pontuam; confirmações válidas atualizam histórico e ranking corretamente. |
| 5. Corrida | Registro de treino, histórico, origem e ranking por distância. | Melhor marca dentro da janela aparece na categoria correta; outra distância permanece no histórico. |
| 6. Eventos e inscrições | Campeonatos, provas, vagas, formatos e pagamento manual. | Elegibilidade e capacidade respeitadas; comprovante restrito e prazo liberando vaga conforme RN21. |
| 7. Revisão administrativa e perfil público | Aprovação de quadras/eventos pagos, fotos e visibilidade. | Quadra pendente não entra no catálogo; perfil privado e arquivos restritos não são expostos. |
| 8. Validação do MVP | Fluxos web/mobile, acessibilidade e demonstração de persistência. | Cenários do roteiro executados com evidências e limitações documentadas. |

## 10. Critérios gerais de aceite

Uma funcionalidade só será considerada entregue quando:

1. O usuário concluir o fluxo previsto, com estados e retorno visível após as ações.
2. A API validar regras e permissões independentemente do cliente.
3. Os dados necessários persistirem após reiniciar os clientes e a aplicação.
4. Casos críticos de confirmação, ranking, vagas e privacidade tiverem verificação registrada.
5. Web e mobile aplicarem as mesmas regras e apresentarem resultados consistentes.
6. O roteiro, os diagramas e a situação do MVP refletirem a entrega real.

Os testes devem usar os cenários já planejados no Word e cobrir reenvio, divergência de placar, falta de permissão, capacidade esgotada e prazo expirado quando aplicáveis. Não há testes executados ou funcionalidades concluídas declarados por este documento.

## 11. Decisões pendentes e riscos

| Item | Decisão ou tratamento necessário |
| --- | --- |
| Faixas de nível | Definir limites e método das faixas relativas; não substituir automaticamente por Bronze/Prata/Ouro do protótipo. |
| Proposta temporária | Definir duração, expiração, cancelamento e retorno à busca. A contagem ilustrativa do Figma não estabelece uma regra. |
| Corrida | Fechar distâncias padrão e critérios de equivalência antes de implementar classificação; 5, 10 e 21 km são exemplos do protótipo. |
| Tênis em duplas | Validar inclusão e modelo de participantes; o Word atual detalha ranking individual e pareamento de tenistas. |
| Estatísticas contestadas | Definir prazo e tratamento de amistosos em disputa, preservando histórico de decisões. |
| Inscrição com comprovante | Definir efeito do comprovante enviado no prazo sobre a reserva enquanto aguarda análise e sobre reenvios/rejeições. |
| Arquivos | Escolher armazenamento, formatos, limites e política de acesso/remoção de fotos e comprovantes. |
| Chat e notificações | Definir transporte e comportamento de atualização, reconexão e entrega. |
| Dados territoriais | Definir fonte e representação de cidades; regiões do DF no protótipo são dados de exemplo. |
| Escopo visual excedente | Resolver destino Comunidade, moedas, seguidores, desafios virtuais e ARENA PRO antes de tratá-los como funcionalidades do MVP. |
| Prazo e equipe | Definir responsáveis e estimativas por entrega, após decompor as histórias. |
| Hospedagem | Escolher fornecedores, custos, backups e monitoramento antes da implantação. |

O risco principal é construir primeiro as telas de exemplo e adiar os estados que dão confiabilidade ao sistema. A sequência de entregas deve comprovar fluxos integrados desde o início, incluindo confirmações e persistência. Outro risco é adotar elos ou pontuações ilustrativos que conflitem com as fórmulas aprovadas no roteiro.

## 12. Próximas ações

1. Registrar as decisões de domínio pendentes que bloqueiam o primeiro fluxo.
2. Decompor as entregas em tarefas rastreáveis às histórias e regras do Word.
3. Configurar backend, migrações, clientes e dados fictícios de demonstração.
4. Construir a primeira entrega integrada de conta e perfil.
5. Revisar as telas necessárias para a entrega seguinte com base na matriz de aproveitamento do protótipo.
6. Atualizar o roteiro com o endereço do repositório, organização real, evidências e situação das entregas conforme o desenvolvimento avançar.

Mudanças futuras devem preservar a rastreabilidade entre protótipo, roteiro, banco, API, clientes e testes. Este documento registra a iniciação e a sequência proposta; não constitui declaração de implementação concluída.
