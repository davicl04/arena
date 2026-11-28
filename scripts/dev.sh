#!/usr/bin/env bash
# Sobe o ambiente local do Arena com um comando, a partir de qualquer pasta:
#   1. PostgreSQL e MinIO pelo Docker Compose (projeto `arena`), com os volumes de sempre (`arena_pgdata` e
#      `arena_miniodata`): o banco já populado continua o mesmo, nada é recriado nem apagado;
#   2. as migrações pendentes (`alembic upgrade head`, que não apaga dados) e o backend (uvicorn com --reload, porta 8000);
#   3. a web (Vite, porta 5173);
#   4. o Expo (Metro, porta 8081), em primeiro plano, com o QR e os atalhos do terminal.
# O que já estiver no ar (porta ocupada) é mantido e não sobe de novo. Ctrl+C encerra o que o script subiu (backend, web
# e Expo); os bancos continuam no ar (`docker compose -p arena stop` os para).
# Argumentos vão para o `expo start`, por exemplo `scripts/dev.sh --clear` para limpar o cache do Metro.
# Logs do backend e da web: .local/logs/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.local/logs"
mkdir -p "$LOGS"
PIDS=()

say() { printf '\033[1;32m[arena]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[arena]\033[0m %s\n' "$*" >&2; exit 1; }
# Porta local em uso? (bash puro, sem lsof)
busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

stop_children() {
  trap - EXIT INT TERM
  if ((${#PIDS[@]})); then
    say "Encerrando backend e web (os bancos continuam no ar)…"
    kill "${PIDS[@]}" 2>/dev/null || true
    wait "${PIDS[@]}" 2>/dev/null || true
  fi
}
trap stop_children EXIT INT TERM

# ----- 1. Bancos -----
command -v docker >/dev/null || fail "Docker não encontrado. Instale o Docker Desktop (ou OrbStack) e tente de novo."
docker info >/dev/null 2>&1 || fail "O Docker não está rodando. Abra o Docker Desktop e tente de novo."
say "Subindo PostgreSQL e MinIO (volumes arena_pgdata e arena_miniodata)…"
docker compose -p arena -f "$ROOT/docker-compose.yml" up -d --wait db minio

# ----- 2. Backend -----
cd "$ROOT/backend"
if [[ -x .venv/bin/python ]]; then PY=.venv/bin/python
elif [[ -x .venv/Scripts/python.exe ]]; then PY=.venv/Scripts/python.exe
else fail "backend/.venv não existe. Crie o ambiente como no README (seção Instalação) e rode de novo."
fi
[[ -f .env ]] || { cp .env.example .env; say "backend/.env criado a partir do .env.example."; }
if busy 8000; then
  say "Backend já está no ar na porta 8000; mantido."
else
  say "Aplicando migrações pendentes…"
  "$PY" -m alembic upgrade head
  say "Subindo o backend em http://localhost:8000 (log: .local/logs/backend.log)…"
  "$PY" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 >"$LOGS/backend.log" 2>&1 &
  PIDS+=($!)
fi

# ----- 3. Web -----
cd "$ROOT/web"
[[ -d node_modules ]] || { say "Instalando dependências da web (npm ci)…"; npm ci; }
[[ -f .env ]] || { cp .env.example .env; say "web/.env criado a partir do .env.example."; }
if busy 5173; then
  say "Web já está no ar na porta 5173; mantida."
else
  say "Subindo a web em http://localhost:5173 (log: .local/logs/web.log)…"
  # O mesmo do `npm run dev`, chamando o Vite direto: sem o npm no meio, o Ctrl+C não deixa processo órfão.
  ./node_modules/.bin/vite --host 0.0.0.0 >"$LOGS/web.log" 2>&1 &
  PIDS+=($!)
fi

# Espera a API responder antes de abrir o app.
for _ in $(seq 1 60); do
  curl -fsS -m 2 http://localhost:8000/health/ready >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS -m 2 http://localhost:8000/health/ready >/dev/null 2>&1 \
  && say "API pronta (http://localhost:8000/health/ready)." \
  || say "A API ainda não respondeu; confira .local/logs/backend.log."

# ----- 4. Mobile -----
cd "$ROOT/mobile"
[[ -d node_modules ]] || { say "Instalando dependências do mobile (npm ci)…"; npm ci; }
[[ -f .env ]] || { cp .env.example .env; say "mobile/.env criado a partir do .env.example."; }
if busy 8081; then
  say "O Metro já está no ar na porta 8081; mantido. Ctrl+C encerra o backend e a web que este script subiu."
  wait
else
  say "Subindo o Expo (Metro na porta 8081, rede local). Ctrl+C encerra tudo o que este script subiu."
  npx expo start --lan "$@"
fi
