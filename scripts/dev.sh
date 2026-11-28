#!/usr/bin/env bash
# Sobe o ambiente local do Arena com um comando, a partir de qualquer pasta, pronto para o celular na mesma rede, seja
# Wi-Fi ou hotspot do telefone:
#   1. PostgreSQL e MinIO pelo Docker Compose (projeto `arena`), com os volumes de sempre (`arena_pgdata` e
#      `arena_miniodata`): o banco já populado continua o mesmo, nada é recriado nem apagado;
#   2. as migrações pendentes (`alembic upgrade head`, que não apaga dados) e o backend (uvicorn com --reload, porta 8000);
#   3. a web (Vite, porta 5173);
#   4. o Expo (Metro, porta 8081), em primeiro plano, com o QR e os atalhos do terminal.
#
# Endereço do celular: o script descobre o IP do computador na rede atual e entrega a web, a API e o QR do Expo nesse
# endereço, sem editar os `.env` (vai tudo por variável de ambiente, que vence o `.env`):
#   - Wi-Fi ou hotspot com IPv4: o IPv4 do computador (ex.: 192.168.0.24);
#   - hotspot só IPv6 (o do iPhone em algumas operadoras, onde o Mac fica com 192.0.0.2): o IPv6 global escrito como nome
#     no sslip.io (ex.: 2804-18-…-da96.sslip.io), porque o Expo Go fecha com um IPv6 literal. O sslip.io é um DNS público
#     que só devolve o IP escrito no próprio nome.
# Os serviços escutam em IPv4 e IPv6 (`::`). Para fixar o endereço: `ARENA_HOST=meu-host scripts/dev.sh`; só nesta
# máquina (simulador): `ARENA_HOST=localhost scripts/dev.sh`. Quando o endereço muda desde a última vez, o Metro sobe com
# --clear, porque a URL da API fica gravada no bundle.
#
# O que já estiver no ar (porta ocupada) é mantido; se não responder no endereço da rede, o script avisa. Ctrl+C encerra
# o que o script subiu (backend, web e Expo); os bancos continuam no ar (`docker compose -p arena stop` os para).
# Argumentos vão para o `expo start`, por exemplo `scripts/dev.sh --clear`. Logs do backend e da web: .local/logs/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.local/logs"
mkdir -p "$LOGS"
PIDS=()
KEPT=()

say() { printf '\033[1;32m[arena]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[arena]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[arena]\033[0m %s\n' "$*" >&2; exit 1; }
# Porta local em uso? (bash puro, sem lsof)
busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
# O serviço da porta responde no endereço da rede?
reachable() { curl -s -m 3 -o /dev/null "http://$HOST:$1/"; }

stop_children() {
  trap - EXIT INT TERM
  if ((${#PIDS[@]})); then
    say "Encerrando backend e web (os bancos continuam no ar)…"
    kill "${PIDS[@]}" 2>/dev/null || true
    wait "${PIDS[@]}" 2>/dev/null || true
  fi
}
trap stop_children EXIT INT TERM

# ----- Endereço da rede -----
default_interface() {
  route -n get default 2>/dev/null | awk '/interface:/ { print $2 }' \
    || ip route show default 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1) }'
}
ipv4_of() {
  # 192.0.0.x é o endereço da tradução IPv4/IPv6 (CLAT) do hotspot só IPv6: o celular não o alcança.
  { ipconfig getifaddr "$1" 2>/dev/null || ip -4 addr show "$1" 2>/dev/null | awk '/inet / { sub("/.*", "", $2); print $2 }'; } \
    | grep -v '^192\.0\.0\.' | head -1 || true
}
ipv6_of() {
  # IPv6 global estável: sem os temporários, os de link local (fe80) e o da tradução (clat46).
  { ifconfig "$1" 2>/dev/null || ip -6 addr show "$1" scope global 2>/dev/null; } \
    | awk '/inet6/ && !/temporary/ && !/clat46/ && !/deprecated/ { sub("/.*", "", $2); print $2 }' \
    | grep -iv '^fe80' | head -1 || true
}
detect_host() {
  local iface v4 v6
  iface="$(default_interface | head -1)"
  [[ -n "$iface" ]] || { echo localhost; return; }
  v4="$(ipv4_of "$iface")"
  if [[ -n "$v4" ]]; then echo "$v4"; return; fi
  v6="$(ipv6_of "$iface")"
  if [[ -n "$v6" ]]; then echo "${v6//:/-}.sslip.io"; return; fi
  echo localhost
}
HOST="${ARENA_HOST:-$(detect_host)}"
API_URL="http://$HOST:8000"
WEB_ORIGIN="http://$HOST:5173"

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
  KEPT+=(8000)
else
  say "Aplicando migrações pendentes…"
  "$PY" -m alembic upgrade head
  # Origens da web aceitas pela API (cookie de sessão): as do backend/.env mais a da rede atual.
  ORIGINS="$(WEB_ORIGIN="$WEB_ORIGIN" "$PY" - <<'PYTHON'
import json, os, re
origins = ['http://localhost:5173', 'http://127.0.0.1:5173']
try:
    match = re.search(r'^ALLOWED_ORIGINS=(.*)$', open('.env', encoding='utf-8').read(), re.M)
    if match:
        origins = json.loads(match.group(1))
except (OSError, ValueError):
    pass
if os.environ['WEB_ORIGIN'] not in origins:
    origins.append(os.environ['WEB_ORIGIN'])
print(json.dumps(origins))
PYTHON
)"
  say "Subindo o backend em $API_URL (log: .local/logs/backend.log)…"
  ALLOWED_ORIGINS="$ORIGINS" "$PY" -m uvicorn app.main:app --reload --host :: --port 8000 >"$LOGS/backend.log" 2>&1 &
  PIDS+=($!)
fi

# ----- 3. Web -----
cd "$ROOT/web"
[[ -d node_modules ]] || { say "Instalando dependências da web (npm ci)…"; npm ci; }
[[ -f .env ]] || { cp .env.example .env; say "web/.env criado a partir do .env.example."; }
if busy 5173; then
  say "Web já está no ar na porta 5173; mantida."
  KEPT+=(5173)
else
  say "Subindo a web em $WEB_ORIGIN (log: .local/logs/web.log)…"
  # O mesmo do `npm run dev`, chamando o Vite direto (sem o npm no meio, o Ctrl+C não deixa processo órfão), em IPv4 e
  # IPv6, com a API no endereço da rede e o nome do sslip.io liberado no Vite.
  __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$HOST" VITE_API_URL="$API_URL" \
    ./node_modules/.bin/vite --host :: >"$LOGS/web.log" 2>&1 &
  PIDS+=($!)
fi

# Espera a API responder antes de abrir o app.
for _ in $(seq 1 60); do
  curl -fsS -m 2 http://localhost:8000/health/ready >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS -m 2 http://localhost:8000/health/ready >/dev/null 2>&1 \
  && say "API pronta." \
  || warn "A API ainda não respondeu; confira .local/logs/backend.log."

# Serviços que já estavam no ar podem escutar só em IPv4 ou não aceitar o endereço da rede.
if [[ "$HOST" != localhost ]] && ((${#KEPT[@]})); then
  for port in "${KEPT[@]}"; do
    reachable "$port" || warn "A porta $port não responde em $HOST (o celular não vai alcançá-la). Pare o processo dela e rode o script de novo."
  done
fi

# ----- 4. Mobile -----
cd "$ROOT/mobile"
[[ -d node_modules ]] || { say "Instalando dependências do mobile (npm ci)…"; npm ci; }
[[ -f .env ]] || { cp .env.example .env; say "mobile/.env criado a partir do .env.example."; }
EXPO_ARGS=("$@")
LAST_HOST_FILE="$ROOT/.local/dev-host"
if [[ "$(cat "$LAST_HOST_FILE" 2>/dev/null)" != "$HOST" ]]; then
  # A URL da API (EXPO_PUBLIC_API_URL) fica no bundle: endereço novo pede o cache do Metro limpo.
  [[ " $* " == *" --clear "* ]] || EXPO_ARGS+=(--clear)
  echo "$HOST" >"$LAST_HOST_FILE"
fi

say "Endereço da rede: $HOST"
say "  Web:  $WEB_ORIGIN"
say "  API:  $API_URL"
say "  Expo: exp://$HOST:8081 (QR abaixo)"
if busy 8081; then
  warn "O Metro já está no ar na porta 8081; mantido (ele usa o endereço com que foi aberto). Ctrl+C encerra o backend e a web que este script subiu."
  wait
else
  say "Subindo o Expo. Ctrl+C encerra tudo o que este script subiu."
  REACT_NATIVE_PACKAGER_HOSTNAME="$HOST" EXPO_PUBLIC_API_URL="$API_URL" npx expo start --lan "${EXPO_ARGS[@]+"${EXPO_ARGS[@]}"}"
fi
