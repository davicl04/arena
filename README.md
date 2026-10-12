# Arena

Plataforma web e mobile para futebol, tênis e corrida amadores. A fundação implementa cadastro de adultos, autenticação e perfis esportivos privados com PostgreSQL. A etapa 1 de Times e campeonatos acrescentou, no backend e na web, Meus times (convites, link do time, papéis e encerramento), o pedido de organizador com a fila da administração, as notificações da conta e a linha do elo na placa do Jogar, ainda sem partidas. Partidas, eventos, resultados e rankings calculados pertencem às próximas entregas do MVP; o Expo ainda não tem as telas da etapa 1.

Leia o [plano inicial](docs/plano-criacao-inicial.md), as [decisões adotadas](docs/decisoes/0001-fundacao.md) e a [situação verificada](docs/situacao-fundacao.md).

## Pré-requisitos

- Python 3.13 e Node.js 24 LTS com npm.
- Docker Desktop funcionando, para PostgreSQL 16.
- Expo Go compatível com SDK 57 no aparelho, ou ambiente Android configurado. iOS pode ser aberto em aparelho físico; simulador iOS exige macOS.

## Banco e API

Comandos abaixo em PowerShell, começando na raiz:

```powershell
docker compose up -d
docker compose ps
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.lock.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Espere o banco aparecer como `healthy`. A API não cria tabelas automaticamente: aplique migrações antes de iniciar. A migração `0004` aplicada por `alembic upgrade head` cria o nome de usuário (@) e gera um @ para cada conta existente, a partir do nome; contas com nomes parecidos recebem número no final. Também adiciona a referência da capa de perfil. A `0005` cria as tabelas de times, convites, pedidos de entrada, organizador, notificações, auditoria e elos (cortes e classificação, vazia até as partidas existirem). Nenhuma das duas apaga contas nem volumes. Em Linux/macOS, substitua `.venv/Scripts/python.exe` por `.venv/bin/python` e use `cp` para copiar arquivos.

API: [localhost:8000/docs](http://localhost:8000/docs). Saúde do processo: `/health/live`; prontidão do banco e esquema: `/health/ready`. O OpenAPI é gerado em `/openapi.json`.

### Imagens e avatar local

O Compose também fornece MinIO local, construído do código na versão fixada no `docker-compose.yml`, com API S3 em `localhost:9000`, console em `localhost:9001` e volume persistente `miniodata`. Inicie o serviço sem recriar nem apagar o PostgreSQL:

```powershell
docker compose up -d --build --wait minio
```

Configure no `backend/.env` `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY` e `MEDIA_S3_SECRET_KEY`. Os valores de acesso precisam corresponder a `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD` usados pelo Compose; se forem alterados, mantenha ambos os arquivos locais alinhados. Os valores de exemplo servem somente para desenvolvimento local. Depois que o MinIO estiver healthy e o ambiente do backend estiver configurado, crie o bucket privado explicitamente:

```powershell
cd backend
.venv/Scripts/python.exe -m app.media_admin ensure-bucket
```

O bucket não é criado no startup da API. Para remover objetos com mais de 24 horas que não estejam vinculados a avatar, capa, post ou brasão de time, execute `.venv/Scripts/python.exe -m app.media_admin reconcile`. O comando preserva as imagens em uso, inclusive os brasões (`crests/{id}.webp`) dos times. As imagens passam pela API autenticada; não compartilhe credenciais ou links públicos. A implementação aceita JPEG, PNG e WebP estáticos até 5 MiB e 25 megapixels. Avatares são armazenados como WebP quadrado de até 512 px. Brasões de time seguem as mesmas regras, mas preservam a transparência (WebP com alfa), e são lidos por `GET /api/v1/teams/{id}/crest` com sessão. A capa de perfil (`/api/v1/me/cover`) usa recorte 5:2 de no máximo 1500×600 px, com os mesmos formatos e limites; na web ela é ajustada em Editar perfil › Foto de capa. A configuração de produção, provedor, HTTPS, política de backup e suporte do storage ainda precisa ser decidida.

### Link do time

O link e o QR do time apontam para `{PUBLIC_WEB_URL}/entrar/{token}`. Configure no `backend/.env`:

- `PUBLIC_WEB_URL`: endereço público da web, sem barra final (padrão `http://localhost:5173`). Fora de `ENVIRONMENT=development`, precisa usar `https`. Para abrir o link pelo celular na rede local, use o mesmo endereço da web aberto no aparelho.
- `TEAM_LINK_SECRET`: chave que deriva os tokens dos links; o banco guarda só um nonce e o hash. Em desenvolvimento, vazio usa um valor fixo de desenvolvimento; fora dele, é obrigatório, com pelo menos 32 caracteres e exclusivo do ambiente. Trocar o segredo invalida todos os links existentes. Não registre o valor real em arquivos versionados.

A web lê `/entrar/{token}` ao abrir, guarda o token em memória e limpa o endereço; quem não está logado entra (ou cria a conta) e segue para o pedido. Em desenvolvimento o Vite já serve o `index.html` nesse caminho; em produção, a hospedagem precisa devolver o `index.html` para `/entrar/*`, como em qualquer rota da aplicação de página única.

Por padrão, banco `arena`, usuário/senha `arena` e porta `5432` são exclusivos de desenvolvimento. Para trocar, configure `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB` no `.env` da raiz e ajuste `DATABASE_URL` no `.env` do backend. O driver da URL é explícito: `postgresql+psycopg2://`.

No Windows, se o Docker não iniciar, corrija a instalação ou use uma instância PostgreSQL própria e ajuste `DATABASE_URL`; não será possível usar o Compose até o engine estar disponível. A validação desta implementação usou uma instância isolada na porta 55432 devido a um erro local do Docker Desktop. Esse ambiente auxiliar não faz parte da instalação padrão.

Se o Compose estiver `healthy`, mas o Alembic tentar conectar à porta `55432`, o `backend/.env` ainda aponta para o ambiente auxiliar. Ajuste a porta de `DATABASE_URL` para `5432`, mantendo as credenciais do banco do Compose. O comando `if (!(Test-Path .env))` apenas cria o arquivo quando ele não existe; não atualiza configurações anteriores. Reinicie a API após alterar o `.env`. Os bancos de 5432 e 55432 têm dados independentes; trocar a conexão não transfere contas e perfis.

## Web

Em outro terminal, a partir da raiz:

```powershell
cd web
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Abra [localhost:5173](http://localhost:5173). Em desenvolvimento, `VITE_API_URL` vazio usa o protocolo e o hostname da página, com a API na porta 8000. Assim, abrir por `localhost`, `127.0.0.1` ou pelo IP do computador mantém web e API no mesmo site. Uma URL explícita em `VITE_API_URL` tem precedência; se o `.env` existente ainda aponta para `localhost`, deixe o valor vazio para usar esse comportamento. Em produção, configure a URL apropriada da API. A configuração padrão autoriza ambas as origens locais da web; outros endereços exigem atualizar `ALLOWED_ORIGINS` no backend e reiniciá-lo.

### Acesso pelo celular na mesma rede

Identifique o IPv4 da interface de rede do computador (PowerShell: `Get-NetIPConfiguration`). Em `backend/.env`, acrescente `http://IP_DO_COMPUTADOR:5173` à lista JSON de `ALLOWED_ORIGINS`, mantendo as origens existentes; use endereços explícitos. Reinicie a API e mantenha o comando com `--host 0.0.0.0`. Com `VITE_API_URL=` em `web/.env` e o Vite reiniciado, abra `http://IP_DO_COMPUTADOR:5173` no navegador do celular. As portas 5173 e 8000 precisam estar acessíveis entre os dispositivos.

Para Expo Go, configure `EXPO_PUBLIC_API_URL=http://IP_DO_COMPUTADOR:8000` em `mobile/.env` e inicie ou reinicie com `npm start -- --lan`, em `mobile/`. Ao trocar a URL, use `npm start -- --lan --clear` para descartar transformações que ainda contenham o endereço anterior. Abra o endereço `exp://IP_DO_COMPUTADOR:8081` pelo Expo Go, ou o QR exibido pelo Expo. O cliente nativo usa Bearer e não envia `Origin`; CORS se aplica ao navegador. A porta do Metro pode variar se 8081 já estiver ocupada. Se o IP do computador mudar, atualize a origem autorizada e a URL do Expo. Essas configurações são para desenvolvimento local; produção mantém HTTPS, cookie seguro e as políticas de sessão documentadas.

## Comunidade, posts e moderação

Depois de aplicar as migrações com `alembic upgrade head`, a Comunidade usa posts com uma foto quadrada e legenda opcional. A web permite ajustar recorte e zoom; o Expo usa o seletor nativo com recorte 1:1. Curtidas, comentários, feed cronológico, busca por nome, galerias e relações são persistidos pela mesma API. A foto original permanece no dispositivo; a versão otimizada é armazenada no bucket privado.

Contas começam privadas. Seguidores de contas privadas precisam de aprovação; tornar uma conta pública mostra os posts a usuários autenticados e aprova pedidos pendentes. As solicitações para seguir ficam, provisoriamente, em Notificações. Editar perfil reúne foto, capa, nome, nome de usuário (@), visibilidade e contas bloqueadas; as listas de conexões, abertas pelas contagens do perfil, permitem remover seguidores e deixar de seguir. Bloquear remove relações nos dois sentidos. E-mail, nascimento e perfis esportivos continuam privados. Imagens sociais não usam bucket público nem URLs presigned.

Busca, galerias, comentários e gestão de relações permitem carregar páginas adicionais. As listas da API usam `{ items, next_cursor }`, inclusive `GET /api/v1/me/blocks`, com 20 itens por padrão e máximo de 50. O cursor deve ser reenviado na próxima chamada; não é uma autorização de acesso.

Denúncias ficam em Menu (hambúrguer do perfil) → Moderação, visível apenas para administradores web. Cada decisão exige justificativa e registra administrador, alvo, ação e data.

Uma conta suspensa pode ser reativada pela fila de denúncias resolvidas, com justificativa obrigatória. A fila informa o identificador e o estado da conta responsável sem expor conteúdo privado resolvido. A reativação preserva a revogação das sessões anteriores; o titular precisa entrar novamente.

Para nomear uma conta administrativa de modo explícito, entre em `backend/` e execute, com uma conta já cadastrada:

```powershell
.venv/Scripts/python.exe -m app.admin_cli promote-admin atleta@example.com
```

Esse comando altera apenas o papel da conta indicada; não é executado durante o cadastro nem na inicialização da API. Para remover o papel, use `remove-admin` com o mesmo e-mail. Consulte [plano de posts](docs/plano-posts.md) para contratos e critérios e [situação da fundação](docs/situacao-fundacao.md) para evidências e limitações.

## Mobile

Em outro terminal, a partir da raiz:

```powershell
cd mobile
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm start
```

Abra pelo Expo Go ou use `npm run android` com emulador configurado. Defina `EXPO_PUBLIC_API_URL` antes de iniciar:

| Ambiente | URL da API |
| --- | --- |
| Emulador Android padrão | `http://10.0.2.2:8000` |
| Aparelho físico na mesma rede | `http://IP_DO_COMPUTADOR:8000` |
| Simulador iOS no computador que executa a API | `http://localhost:8000` |

O backend deve escutar em `0.0.0.0`; aparelho e computador precisam alcançar a mesma rede e porta. `localhost` no aparelho aponta para o próprio aparelho. Mudanças na variável exigem reiniciar o Expo. Não coloque segredos em `EXPO_PUBLIC_*`.

## Demonstrar a primeira entrega

1. Crie conta com nome, e-mail, nascimento elegível e senha de pelo menos 10 caracteres.
2. Entre, adicione perfis de futebol, tênis e corrida e selecione uma cidade do catálogo inicial.
3. Edite posição preferida no futebol, status de procura e nome.
4. Entre com a mesma conta no outro cliente e confira os dados.
5. Reinicie API/clientes e confirme a persistência. Saia e verifique que a sessão encerrada não funciona mais.

Opcionalmente, no diretório `backend/`, com migrações aplicadas:

```powershell
$env:ARENA_DEMO_PASSWORD='EscolhaUmaSenhaDeDemo'
.venv/Scripts/python.exe -m app.seed
```

O seed cria `atleta@example.com` com três perfis privados em Brasília. É idempotente, não redefine senha de conta existente e só roda em desenvolvimento. A senha vem da variável, não fica gravada no código. Não exponha esse ambiente de demonstração à internet.

## Demonstrar times e organizador (etapa 1, web)

Use três contas adultas com perfil de futebol e cidade (A, B e C) e promova C a administradora com `promote-admin`. Para o brasão, rode o MinIO e o `ensure-bucket` antes.

1. **Placa do Jogar:** com A, abra JOGAR. Em "Com meu time", sem time, a placa mostra "Você ainda não representa um time" e o botão "MEU TIME"; em "Avulso", a linha "Em classificação" com 0 de 3 partidas, sem elo, e o botão desabilitado com o aviso de que a busca chega numa próxima etapa.
2. **Criar time:** pelo botão ou por "Meu time", crie o time com nome, cidade (sugerida do perfil de futebol) e brasão (recorte quadrado; PNG com transparência mantém o fundo transparente).
3. **Convidar:** na carteirinha, "Convidar", busque B pelo nome ou @, escreva a mensagem e envie. Com B, o sino do Início mostra a não lida; em Notificações, tocar o convite abre Meus times com a folha do convite; aceite.
4. **Papéis:** com A, toque B no elenco: "Tornar representante" e "Tirar a braçadeira". O último representante não perde a braçadeira nem sai do time (o servidor responde `409`). Depois, "Remover do time".
5. **Link e QR:** na carteirinha, o ícone de QR mostra o link. Abra o link deslogado como C, entre e toque "Pedir para entrar"; A recebe a notificação, que leva a "Pedidos para entrar", e aprova. "Gerar outro link" invalida o anterior ("Este link não vale mais").
6. **Encerrar:** em Editar time, "Encerrar time" com confirmação; o time some de Meus times, o link deixa de valer e os membros recebem o aviso.
7. **Organizador:** com B, Perfil › Menu › "Quero organizar" e envie o pedido. Com C, Menu › Administração › "Pedidos de organizador" (com o contador): recuse com motivo. B vê a recusa nas notificações e no Menu, envia um novo pedido, e C aprova; o Menu de B passa a mostrar a seção Organizador, ainda sem eventos.
8. **Persistência:** recarregue a página e confira times, elenco, pedidos e o estado do organizador.

## Validação

No diretório `backend/`:

```powershell
$env:TEST_DATABASE_URL='postgresql+psycopg2://arena:arena@localhost:5432/arena'
.venv/Scripts/python.exe -m ruff check app migrations tests
.venv/Scripts/python.exe -m alembic check
.venv/Scripts/python.exe -m pytest -q
```

Os testes criam e removem somente um schema aleatório próprio no PostgreSQL indicado. A credencial precisa de permissão para criar schemas. Sem `TEST_DATABASE_URL`, testes de integração ficam pulados; isso não comprova a entrega. Para executar só unidades, use `pytest tests/unit -q` pelo Python do ambiente.

No diretório `web/`: `npm run lint`, `npm run typecheck`, `npm run build` e `npm run test:coverage`. No diretório `mobile/`: `npm run lint`, `npm run typecheck`, `npx expo install --check` e `npm run export:android`. O workflow `.github/workflows/ci.yml` executa os checks com PostgreSQL e ambos os clientes. A geração do bundle não substitui validação Android/iOS em aparelho.

Sessões expiram em 24 horas, não têm renovação automática e são revogadas no logout. Na web o token fica em cookie HttpOnly; no mobile, no SecureStore. Perfis sociais públicos são distintos dos perfis esportivos, que continuam privados. Para ambiente fora de desenvolvimento, configure `COOKIE_SECURE=true`, HTTPS, origens explícitas e infraestrutura conforme as decisões documentadas.

## Estrutura

```text
backend/app/          configuração, modelos, schemas, rotas e serviços
backend/migrations/  esquema versionado com Alembic
backend/tests/       unidades e integração PostgreSQL
web/src/             API, páginas e componentes React
mobile/src/          API, telas e componentes React Native
docs/                especificações, decisões e evidências de execução
```

Pare o banco com `docker compose down`; o volume `pgdata` mantém os dados para a próxima execução. Evite remover o volume se precisar preservar contas e perfis.

## Testes unitários e cobertura

Os clientes possuem `npm test` e `npm run test:coverage`, executados em `web/` ou `mobile/`. No backend, execute `pytest tests/unit -q --cov=app --cov-branch` pelo Python da `.venv`; para incluir integração, configure `TEST_DATABASE_URL` e execute `pytest -q --cov=app --cov-branch`.

Resultados, escopos e pisos de cobertura estão em [qualidade do código](docs/qualidade-codigo.md). O CI executa as suítes e publica relatórios em artifacts e no resumo de cada job. Relatórios locais ficam em `artifacts/coverage/`, sem versionamento. Testes isolados de SecureStore usam um double e não comprovam armazenamento seguro em aparelho.
