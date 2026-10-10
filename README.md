# Arena

Plataforma web e mobile para futebol, tênis e corrida amadores. A fundação implementa cadastro de adultos, autenticação e perfis esportivos privados com PostgreSQL. Times, partidas, eventos e rankings pertencem às próximas entregas do MVP.

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

Espere o banco aparecer como `healthy`. A API não cria tabelas automaticamente: aplique migrações antes de iniciar. Em Linux/macOS, substitua `.venv/Scripts/python.exe` por `.venv/bin/python` e use `cp` para copiar arquivos.

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

O bucket não é criado no startup da API. Para remover objetos sem vínculo com avatar que tenham mais de 24 horas, execute `.venv/Scripts/python.exe -m app.media_admin reconcile`. As imagens passam pela API autenticada; não compartilhe credenciais ou links públicos. A implementação aceita JPEG, PNG e WebP estáticos até 5 MiB e 25 megapixels, e armazena versão WebP quadrada de até 512 px. A configuração de produção, provedor, HTTPS, política de backup e suporte do storage ainda precisa ser decidida.

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

Abra [localhost:5173](http://localhost:5173). Use o mesmo hostname para web e API: se abrir a web em `127.0.0.1`, configure `VITE_API_URL=http://127.0.0.1:8000`. A configuração padrão autoriza ambas as origens da web; outros endereços exigem atualizar `ALLOWED_ORIGINS` no backend e reiniciá-lo.

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

## Validação

No diretório `backend/`:

```powershell
$env:TEST_DATABASE_URL='postgresql+psycopg2://arena:arena@localhost:5432/arena'
.venv/Scripts/python.exe -m ruff check app migrations tests
.venv/Scripts/python.exe -m alembic check
.venv/Scripts/python.exe -m pytest -q
```

Os testes criam e removem somente um schema aleatório próprio no PostgreSQL indicado. A credencial precisa de permissão para criar schemas. Sem `TEST_DATABASE_URL`, testes de integração ficam pulados; isso não comprova a entrega. Para executar só unidades, use `pytest tests/unit -q` pelo Python do ambiente.

No diretório `web/`: `npm run lint`, `npm run typecheck` e `npm run build`. No diretório `mobile/`: `npm run lint`, `npm run typecheck`, `npx expo install --check` e `npm run export:android`. O workflow `.github/workflows/ci.yml` executa os checks com PostgreSQL e ambos os clientes. A geração do bundle não substitui validação Android/iOS em aparelho.

Sessões expiram em 24 horas, não têm renovação automática e são revogadas no logout. Na web o token fica em cookie HttpOnly; no mobile, no SecureStore. Perfis não possuem consulta pública nesta etapa. Para ambiente fora de desenvolvimento, configure `COOKIE_SECURE=true`, HTTPS, origens explícitas e infraestrutura conforme as decisões documentadas.

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
