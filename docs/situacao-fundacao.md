# Situação da fundação do Arena

Data: 9 de outubro de 2026. Implementação inicial de conta e perfis, referente à entrega 1. Este registro complementa o roteiro e não declara o MVP completo.

## Implementado

- API FastAPI com saúde, configuração, erros sem valores sensíveis e OpenAPI.
- Cadastro adulto, e-mail normalizado e único, hash de senha Argon2, login, expiração e logout revogável.
- Consulta e edição do nome e dos perfis privados de futebol, tênis e corrida, com autorização pelo titular.
- Migração Alembic com integridade relacional, catálogo inicial de seis municípios e seed idempotente de desenvolvimento.
- Cliente React/Vite responsivo e cliente React Native/Expo consumindo a mesma API.
- Frontend web aproximado do protótipo Figma Make: símbolo atualizado do Coliseu enviado pelo usuário, marca `arena.` com ponto verde, fontes Inter/Sora, cores, cards compactos, carrossel, capa e avatar do perfil e navegação inferior com Início, Ranking, Jogar, Comunidade e Perfil. Detalhes em [fidelidade ao Figma](fidelidade-figma.md).
- Estados de carregamento, erro recuperável, sucesso e sessão expirada; labels e foco na web, controles acessíveis e adaptação ao teclado no mobile.
- Arquivos de lock, exemplos de ambiente, comandos de execução e workflow CI.

## Diretriz para esta fase inicial

Em 9 de outubro de 2026, o usuário aprovou a interface como está e esclareceu que não é necessário acrescentar mocks. Manter os dados reais nas funcionalidades integradas e os estados vazios ou indicações de disponibilidade futura nas demais áreas. Essa preferência substitui a orientação anterior sobre o uso de dados demonstrativos.

Atualizar este Markdown a cada entrega ou alteração no projeto, registrando implementação, validações e pendências de integração. A orientação também está em `AGENTS.md` para as próximas tarefas. Na atualização mais recente, moedas e carteira foram removidas da interface web por solicitação do usuário. Os símbolos do logo e dos elos foram extraídos de `Resumo Arena.html`; a marca voltou a `arena.` com ponto verde. A tela de ranking apresenta Bronze, Prata, Ouro, Diamante e Lendário como referência visual de progressão, sem atribuir classificação ou pontuação fictícia à conta. O símbolo de parede alta foi aplicado ao botão central. Build, TypeScript e ESLint aprovados; no navegador, ilustrações carregadas, navegação e perfil sem carteira conferidos, sem overflow horizontal na viewport de 390 px.

### Estado atual das áreas da interface

| Área | Estado |
| --- | --- |
| Cadastro, login, sessão e logout | Integrados à API. |
| Nome, cidade, posição e disponibilidade esportiva | Integrados à API, com persistência. |
| Saudação, iniciais do avatar e chips de modalidades | Derivados dos dados reais da conta. |
| Partidas, ranking, estatísticas, comunidade, fotos e notificações | Estrutura visual e estados vazios ou indicação de disponibilidade futura; sem dados demonstrativos preenchidos e sem integração de domínio. Manter essa apresentação até as integrações ou uma nova solicitação do usuário. |
| Moedas e carteira | Removidas da interface web e fora da direção atual do produto; não implementar sem nova solicitação. |
| Botão Jogar | Abre a preparação dos perfis esportivos; busca e agendamento ainda pendentes. |
| Cliente Expo | Mantém a interface anterior; a revisão visual do Figma foi aplicada somente à web. |

## Evidências e limites

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
| Meta de desempenho RNF03 | Não medida; carga e matriz de ensaio pendentes. |

O Docker Desktop falhou ao iniciar seu serviço de inferência. Os testes usaram PostgreSQL isolado na porta 55432; o Compose permanece configurado para porta 5432. Testes de integração precisam de `TEST_DATABASE_URL`; sem essa variável ficam explicitamente pulados e não comprovam persistência.

Ambiente de execução dos checks: Windows, Python 3.13.0, Node.js 25.9.0, npm 11.12.1 e Expo SDK 57. O CI propõe Node 24 LTS e Linux; essa execução remota ainda está pendente.

O audit inicial do mobile apontou 22 alertas transitivos em ferramentas Expo/Metro/Xcode, ligados a `braces`, `node-forge` e `uuid`. A atualização compatível não os eliminou; a sugestão automática exige regressão para Expo 44 e não foi aplicada. Rever versões corrigidas antes de publicar ou usar fluxos de assinatura; a web apresentou zero alertas no audit inicial. O relatório bruto local não é versionado.

## Relação com as especificações

HU01, RN01 e a seleção de modalidades em RN02 possuem implementação; RN22 é respeitada pelo padrão privado, mas publicação opt-in/fotos ainda não está construída. TI01 e a parte de perfis de TI05 foram exercitados; busca e inscrições de TI05 permanecem futuras.

O roteiro original contém propostas e diagramas para o MVP completo. A modelagem implementada nesta entrega corresponde somente a cidades, usuários, sessões e perfis; o [diagrama da fundação](diagramas/fundacao.md) registra essas tabelas. Os diagramas anteriores continuam como desenho futuro e não devem ser apresentados como banco já implementado.

A primeira entrega ainda exige demonstração em aparelho mobile para satisfazer todos os critérios de aceite do plano. Times, vagas, partidas, chat, resultados, rankings, corrida, eventos e revisão administrativa não estão implementados nesta etapa.

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
