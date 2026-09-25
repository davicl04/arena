# Arena

Aplicativo para organizar futebol, tênis e corrida amadores em um mesmo ecossistema: encontrar partidas e parceiros, acompanhar a evolução por ranking e criar times e campeonatos.

## Estrutura do repositório

```
arena/
├── docs/        # roteiro do projeto, diagramas e wireframes
├── backend/     # API REST (FastAPI + PostgreSQL)
├── web/         # interface web (React + TypeScript)
├── mobile/      # aplicativo mobile (React Native + Expo)
└── docker-compose.yml
```

## Banco de dados (Docker)

O PostgreSQL roda em um container Docker definido no `docker-compose.yml`.

### Pré-requisito

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e aberto.

### Subir o banco

Na raiz do repositório:

```bash
docker compose up -d
```

### Verificar se está funcionando

```bash
docker compose ps
```

Quando o status do serviço `db` aparecer como `healthy`, o banco está pronto para receber conexões.

### Dados de conexão

| Item | Valor |
|---|---|
| Host | `localhost` |
| Porta | `5432` |
| Banco | `arena` |
| Usuário | `arena` |
| Senha | `arena` |

URL de conexão para o back-end:

```
postgresql://arena:arena@localhost:5432/arena
```

Esses valores são apenas para desenvolvimento local. Para usar outros, crie um arquivo `.env` na raiz com `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`.

### Parar o banco

```bash
docker compose down
```

Os dados ficam salvos no volume `pgdata` e continuam disponíveis na próxima vez que o banco subir. Para apagar todos os dados e começar do zero:

```bash
docker compose down -v
```
