# Plano de criação inicial do Arena

Data: 9 de outubro de 2026. Situação inicial: proposta de execução. A fundação foi posteriormente implementada; veja a [situação verificada](situacao-fundacao.md) para os checks concluídos e pendências de aparelho mobile e documentação Word. As tarefas e critérios abaixo permanecem como referência de aceite.

O objetivo desta etapa é transformar a estrutura existente em uma aplicação executável com PostgreSQL, API FastAPI, cliente web e cliente mobile integrados. A primeira entrega termina quando um atleta adulto consegue criar conta, entrar, manter seus perfis esportivos e consultar os mesmos dados nos dois clientes após reiniciar a aplicação.

Este plano detalha a entrega 1 de [iniciação do projeto](iniciacao-projeto.md). O [roteiro de desenvolvimento](roteiro-projeto.docx) permanece como fonte das regras; o protótipo orienta a interface. As demais entregas do MVP permanecem no escopo, conforme a sequência do documento de iniciação.

## 1. Base existente e limite da primeira entrega

O repositório já contém PostgreSQL 16 no Docker Compose, dependências previstas do backend, diretórios Python iniciais, diagramas e wireframes. As pastas `web/` e `mobile/` estão reservadas, mas não contêm aplicações. Não há API executável, migrações ou fluxo integrado de conta.

Esta entrega cobre HU01, RN01 e a seleção das modalidades de RN02, além dos requisitos não funcionais aplicáveis de RNF01, RNF02, RNF04, RNF05, RNF07 e RNF08. A privacidade prevista em RN22 deve orientar a modelagem desde o início; a publicação de perfis e fotos será construída na entrega 7.

O percurso será: cadastro → login → perfil pessoal → inclusão ou edição dos perfis de futebol, tênis e corrida → logout → novo login. Uma pessoa poderá manter um perfil por modalidade. O backend será a autoridade sobre validação e autorização.

## 2. Decisões necessárias antes de implementar conta e perfil

Registrar as escolhas em `docs/decisoes/`, diferenciando recomendações técnicas de requisitos aprovados.

| Decisão | Proposta para a etapa inicial | Momento |
| --- | --- | --- |
| Dados de conta | Nome, e-mail, data de nascimento e senha; documentar campos obrigatórios e limites. | Antes de criar a primeira migração. |
| Maioridade | Validar idade pelo calendário no backend, incluindo aniversário de 18 anos e nascimento em 29 de fevereiro. Definir data de referência. | Antes do cadastro. |
| E-mail | Definir normalização e unicidade; impor restrição no banco e tratar colisões sem erro interno. | Antes do cadastro. |
| Cidade | Escolher identificador estável e fonte do catálogo; usar o mesmo contrato nos dois clientes. | Antes do formulário de perfil. |
| Perfil esportivo | Definir campos editáveis, posição preferida no futebol e status de procura. Nível será derivado em entregas futuras. | Antes do contrato do perfil. |
| Sessão | Definir duração, renovação, expiração e efeito do logout; na web, considerar cookie HttpOnly; no mobile, armazenamento seguro. Documentar diferenças de transporte e proteção. | Antes do login. |
| Ferramentas | Proposta: Vite na web, Expo no mobile, lint e verificação de tipos. Escolher versões compatíveis e fixar dependências e arquivos de lock. | Antes de gerar os clientes. |

As faixas de nível, duração de propostas, distâncias padrão de corrida, disputas, comprovantes, armazenamento de arquivos e chat não bloqueiam esta entrega. Devem ser resolvidas antes dos módulos correspondentes, sem inventar regras a partir dos exemplos do protótipo.

## 3. Tarefas e dependências

Os responsáveis são papéis sugeridos e devem ser atribuídos aos integrantes antes de iniciar. A distribuição abaixo não representa atribuição já acordada.

| ID | Tarefa | Depende de | Responsável sugerido | Critério de conclusão |
| --- | --- | --- | --- | --- |
| INI-01 | Registrar decisões de conta, cidade, perfil, sessão e ferramentas. | — | Equipe | Campos, contratos e escolhas registrados com pendências explícitas. |
| INI-02 | Padronizar ambiente, dependências, variáveis e comandos. | Escolha de ferramentas em INI-01 | Backend e clientes | Instalação reproduzível; exemplos de configuração sem segredos; dependências fixadas. |
| INI-03 | Criar aplicação FastAPI, configuração, conexão e tratamento de erros. | INI-02 | Backend | API inicia; endpoints de saúde distinguem processo ativo de banco disponível; CORS configurado para a web. |
| INI-04 | Configurar Alembic e modelo inicial de usuários e perfis. | INI-01, INI-03 | Backend | Banco vazio recebe migrações; restrições de e-mail e perfil por modalidade verificadas no PostgreSQL. |
| INI-05 | Implementar cadastro, autenticação, sessão e autorização do titular. | INI-04 | Backend | Conta adulta persistida, senha protegida, duplicidade tratada e acessos indevidos rejeitados. |
| INI-06 | Implementar consulta e edição de conta e perfis esportivos. | INI-05 | Backend | Titular edita somente seus dados; modalidade inválida e perfil duplicado rejeitados; nível não pode ser digitado pelo cliente. |
| INI-07 | Criar cliente web e base visual responsiva. | INI-02 | Web | Aplicação inicia; navegação e componentes básicos têm foco, rótulos e estados de interação. |
| INI-08 | Criar cliente Expo e navegação inicial. | INI-02 | Mobile | Aplicação inicia em dispositivo Android; configuração de API funciona na rede local; plano de validação iOS registrado. |
| INI-09 | Integrar cadastro, login, sessão e perfis na web. | INI-06, INI-07 | Web | Fluxo completo usa dados reais da API e trata carregamento, erro, vazio, sucesso e sessão expirada. |
| INI-10 | Integrar os mesmos fluxos no mobile. | INI-06, INI-08 | Mobile | Dados consistentes com a web; sessão armazenada conforme decisão; formulários utilizáveis com teclado aberto. |
| INI-11 | Criar dados fictícios e verificações automatizadas da entrega. | INI-05, INI-06 | Backend e validação | Seed de desenvolvimento reproduzível; testes de idade, unicidade, autorização e persistência passam. |
| INI-12 | Validar fluxo integrado e documentar execução. | INI-09, INI-10, INI-11 | Equipe | Evidências dos dois clientes, reinício sem perda de dados, comandos e limitações documentados. |

A fundação da API e a preparação dos clientes podem avançar em paralelo após as decisões técnicas. As telas integradas dependem dos contratos definidos; a validação final depende dos dois clientes.

## 4. Organização e contratos propostos

Preservar a estrutura real `backend/`, com `core`, `models`, `schemas`, `routers`, `services` e `repositories`; criar as migrações no backend. Regras de idade, normalização e autorização ficam nos serviços e na configuração de segurança, com restrições complementares no banco.

No cliente web, organizar páginas, componentes, acesso à API e funcionalidades de autenticação/perfil. No mobile, separar navegação, telas, componentes e acesso à API. Não compartilhar componentes visuais entre React e React Native nesta fundação; manter os contratos alinhados à mesma especificação OpenAPI.

Contratos abaixo são propostas a consolidar em INI-01. Definir respostas, erros e estratégia de sessão antes de integrar formulários.

| Contrato | Finalidade |
| --- | --- |
| `GET /health/live` e `GET /health/ready` | Verificar processo e disponibilidade do banco. |
| `POST /api/v1/auth/register` | Criar conta adulta. |
| `POST /api/v1/auth/login` | Iniciar sessão. |
| `POST /api/v1/auth/logout` | Encerrar sessão conforme política definida. |
| `POST /api/v1/auth/refresh` | Renovar sessão, caso a estratégia escolhida exija. |
| `GET /api/v1/me` e `PATCH /api/v1/me` | Consultar e editar os campos pessoais permitidos. |
| `GET /api/v1/me/sports-profiles` | Consultar perfis do titular. |
| `PUT /api/v1/me/sports-profiles/{modalidade}` | Criar ou atualizar o perfil da modalidade, sem duplicação. |
| `GET /api/v1/cities` | Oferecer seleção de cidades conforme fonte e modelo escolhidos. |

O modelo inicial deve conter identidade, senha protegida, data de nascimento, estado da conta, datas de criação/alteração e perfis vinculados a usuário e modalidade. A modelagem de visibilidade deve respeitar RN22 e permanecer privada por padrão; sem rotas públicas nesta entrega. Contato e data de nascimento não devem ser preparados como campos de resposta pública. Não criar antecipadamente todas as tabelas de partidas, eventos e rankings: cada domínio terá suas migrações na entrega correspondente.

## 5. Ambiente e qualidade

Manter o PostgreSQL existente e documentar o uso de ambiente virtual Python, instalação dos clientes, migrações, execução e seed. Definir versões dos runtimes, gerenciador de pacotes e comandos verificáveis de lint, tipos e testes. Atualizar `.gitignore` para ambientes, segredos, caches e builds conforme os clientes forem criados.

Criar exemplos de configuração por aplicação. A API deve rejeitar configuração de segredo inadequada fora do ambiente de desenvolvimento; credenciais de banco e chaves não pertencem ao código. Configurar origens permitidas e respostas de erro que não exponham senha, token ou detalhes internos.

Documentar URLs diferentes para navegador, emulador e aparelho físico: `localhost` no telefone não aponta para o computador. Permitir configurar a URL base e comprovar conectividade sem alterar o código. No Windows, a validação local inicial pode usar Android; a validação iOS exige dispositivo ou ambiente compatível e deve permanecer pendente até ser executada.

Criar uma rotina de integração contínua para lint, tipos, testes do backend com PostgreSQL e build web. A validação mobile deve incluir tipos e inicialização; testes em dispositivos devem registrar plataforma e versão. Configurar checks conforme as ferramentas selecionadas, sem declarar suporte comprovado em plataformas não testadas.

## 6. Verificação da primeira entrega

| Cenário | Resultado esperado |
| --- | --- |
| Cadastro com 18 anos completos, menor de 18, aniversário amanhã e data inválida | Apenas a conta elegível é criada; erros são apresentados nos dois clientes. |
| E-mail repetido, inclusive variação equivalente conforme a normalização aprovada | Uma única conta, com erro controlado em tentativas comuns e concorrentes. |
| Login válido, senha incorreta, sessão ausente ou expirada | Sessão válida permite acesso; demais casos não expõem dados e oferecem próximo passo. |
| Tentativa de consultar ou alterar perfil de outro usuário | API rejeita acesso independentemente da interface. |
| Inclusão e reenvio do mesmo perfil por modalidade | Um perfil por usuário e modalidade; nenhuma duplicação. |
| Seleção das três modalidades e modalidade inválida | Futebol, tênis e corrida aceitos; outros valores rejeitados. |
| Edição na web e consulta no mobile, seguida de edição no mobile e consulta na web | Ambos refletem os dados persistidos da mesma conta. |
| Logout e nova tentativa de acesso | Comportamento corresponde à política de sessão documentada. |
| Reinício da API e clientes | Conta e perfis continuam disponíveis no PostgreSQL. |
| Navegação por teclado e uso em tela pequena | Foco e rótulos visíveis; mensagens acessíveis; formulários sem bloqueio pelo teclado mobile. |

Usar testes unitários para limites de idade e regras isoladas; integração com PostgreSQL para unicidade, autenticação e permissões; execução funcional nos clientes para o percurso completo. Os testes complementam TI01 e a parte de perfis de TI05 do roteiro. Não marcar TI05 completo, pois busca e inscrições pertencem a entregas futuras.

Registrar versão do código, ambiente, passos, resultado e evidência. Fixar a matriz de navegadores e dispositivos e definir a carga de ensaio antes de avaliar a meta de RNF03; sem medições, não declarar desempenho comprovado.

## 7. Marcos de execução

1. **Ambiente executável:** INI-01 a INI-04, INI-07 e INI-08. API, banco e clientes iniciam; migrações funcionam.
2. **Conta e perfil pela API:** INI-05 e INI-06. Regras e autorização podem ser demonstradas antes da interface.
3. **Fluxo nos dois clientes:** INI-09 e INI-10. Cadastro, login e edição usam a mesma API.
4. **Entrega inicial verificada:** INI-11 e INI-12. Evidências, persistência e instruções reproduzíveis concluídas.

Não há prazo fechado nem responsáveis individuais atribuídos nas especificações. Estimar cada tarefa com os integrantes após definir disponibilidade e decisões de INI-01; então converter os marcos em calendário. Pendências de infraestrutura iOS devem aparecer no planejamento.

## 8. Critério para iniciar a entrega seguinte

A criação inicial estará concluída quando outra pessoa conseguir seguir o README, preparar banco e migrações, iniciar os três serviços de aplicação e demonstrar conta/perfis nos dois clientes, com testes críticos aprovados e limitações registradas.

Atualizar o README com os comandos reais; revisar o roteiro Word para refletir o repositório, `backend/`, migrações, funcionalidades e evidências; atualizar diagramas quando a modelagem implementada divergir. Apenas então declarar a primeira entrega concluída e iniciar times, elencos, convites e vagas, preservando as próximas entregas de amistosos, resultados/rankings, corrida, eventos, administração e validação do MVP.
