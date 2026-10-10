# Situação da fundação do Arena

## Correção local da conexão de mídia — 10 de outubro de 2026

Investigado o erro `EndpointConnectionError` durante a publicação de posts. O container local do MinIO reiniciava porque `entrypoint.sh`, copiado do checkout Windows com finais CRLF, tinha um shebang inválido para Linux. O Dockerfile agora normaliza os finais de linha do entrypoint durante o build. A imagem foi reconstruída e somente o serviço MinIO foi recriado; `arena-minio` ficou healthy, `/minio/health/live` respondeu HTTP 200 e o PostgreSQL permaneceu healthy. O volume persistente `miniodata` foi preservado. Não foi possível executar `ensure-bucket` pela CLI, pois `backend/.venv` não existe neste checkout; nenhum post foi criado para teste.

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
- Consulta e edição do nome e dos perfis privados de futebol, tênis e corrida, com autorização pelo titular.
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
| Foto de perfil (avatar) | Integrada à API e ao armazenamento privado, com recorte, troca e remoção na web e no mobile. |
| Posts, comunidade e perfis sociais | Integrados à API: feed cronológico, foto/legenda, curtidas, comentários, busca, privacidade social, seguidores, bloqueios e denúncias. Painel administrativo web e histórico de decisões implementados. |
| Partidas, ranking, estatísticas e notificações | Estrutura visual e estados vazios ou indicação de disponibilidade futura; sem dados demonstrativos ou integração de domínio. |
| Moedas e carteira | Removidas da interface web e fora da direção atual do produto; não implementar sem nova solicitação. |
| Botão Jogar | Abre a preparação dos perfis esportivos; busca e agendamento ainda pendentes. |
| Cliente Expo | Comunidade e recursos sociais implementados; a revisão visual do Figma foi aplicada somente à web. |

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
