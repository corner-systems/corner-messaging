#!/usr/bin/env bash
# up.sh
# 로컬 dev 컨테이너 기동 + 접속 URL 안내.
# `docker compose up -d --build` 의 단순 wrapper — 종료 후 .env.deploy.local 의 HOST_PORT 를 읽어 URL 표시.
#
# 사용:
#   bash up.sh              # 기동 + URL 안내
#   bash up.sh --no-build   # build 생략 (이미 이미지 있음)
#
# 종료/로그 는 docker compose 직접:
#   docker compose down
#   docker compose logs -f
#
# 생성: project-init.sh

set -euo pipefail
cd "$(dirname "$0")"

# --no-build 인자 처리 (그 외 인자는 그대로 전달)
BUILD_FLAG="--build"
ARGS=()
for _a in "$@"; do
  case "$_a" in
    --no-build) BUILD_FLAG="" ;;
    *)          ARGS+=("$_a") ;;
  esac
done
unset _a

# .env.deploy.local 의 HOST_PORT 추출 후 export — docker-compose.yml 이 환경변수로 받아 host 포트 결정
HOST_PORT=8080
if [ -f .env.deploy.local ]; then
  _v=$(awk -F= '/^HOST_PORT=/{gsub(/["'"'"']/,"",$2); print $2; exit}' .env.deploy.local 2>/dev/null)
  HOST_PORT="${_v:-8080}"
  unset _v
fi
APP_PORT=3000
export HOST_PORT
export APP_PORT

# shellcheck disable=SC2086
docker compose up -d $BUILD_FLAG "${ARGS[@]+"${ARGS[@]}"}"

# container 상태 한 줄
_state=$(docker compose ps --status running --format '{{.Name}} ({{.Status}})' 2>/dev/null | head -1)

_ip=$(route get default 2>/dev/null | awk '/interface:/{print $2}' \
  | xargs -I{} ipconfig getifaddr {} 2>/dev/null \
  || hostname -I 2>/dev/null | awk '{print $1}' \
  || true)

echo ""
echo "  ✅  컨테이너 기동 완료${_state:+ — $_state}"
echo "  🌐  http://localhost:${HOST_PORT}"
[ -n "$_ip" ] && echo "  🌐  http://${_ip}:${HOST_PORT}  (같은 네트워크)"
echo "  📋  로그:  docker compose logs -f"
echo "  🛑  종료:  docker compose down"
echo ""
unset _ip
