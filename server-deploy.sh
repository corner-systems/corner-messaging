#!/usr/bin/env bash
# server-deploy.sh
# 서버: ECR에서 이미지를 pull하고 Docker Compose를 재시작한다.
# 생성: project-init.sh
#
# 서버 위치: /home/corner/sites/messaging.corneropen.com/server-deploy.sh
#
# 실행:
#   직접: bash /home/corner/sites/messaging.corneropen.com/server-deploy.sh [tag]
#   원격: deploy-ecr.sh 에서 자동 호출

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 설정 로드
_env_deploy="$SCRIPT_DIR/.env.deploy"
[ ! -f "$_env_deploy" ] && { echo "  FAIL .env.deploy 파일을 찾을 수 없습니다: $_env_deploy"; exit 1; }
set -a
# shellcheck disable=SC1090
source "$_env_deploy"
set +a
unset _env_deploy

IMAGE_TAG="${1:-latest}"
PROXY_PORT="${2:-${PROXY_PORT:-}}"   # $2 우선, 없으면 .env.deploy 의 PROXY_PORT
FULL_IMAGE="${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"
APP_DIR="$SCRIPT_DIR"

C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_RESET='\033[0m'
log()  { echo -e "\n${C_BLUE}[$(date +%H:%M:%S)] $*${C_RESET}"; }
ok()   { echo -e "  ${C_GREEN}OK${C_RESET}  $*"; }
warn() { echo -e "  ${C_YELLOW}WARN${C_RESET} $*"; }
err()  { echo -e "  ${C_RED}FAIL${C_RESET} $*"; exit 1; }

# ─── PROXY_PORT 결정 ──────────────────────────────────────────────────────────
# 우선순위: $2 인자 (deploy-ecr.sh 전달) → .env.deploy 의 PROXY_PORT → nginx 직접 추출
log "=== PROXY_PORT 결정 ==="
if [ -n "$PROXY_PORT" ]; then
  ok "PROXY_PORT=$PROXY_PORT"
else
  warn "PROXY_PORT 미설정 — nginx config 에서 직접 추출 시도"
  NGINX_CONF="/etc/nginx/sites-available/messaging.corneropen.com"
  if [ ! -r "$NGINX_CONF" ]; then
    err "PROXY_PORT 미설정 + nginx config 읽기 불가: $NGINX_CONF
        직접 실행: PROXY_PORT=N bash $0 $IMAGE_TAG N
        또는 .env.deploy 의 PROXY_PORT 를 확인하세요"
  fi
  PROXY_PORT=$(grep -oE 'proxy_pass[[:space:]]+http://localhost:[0-9]+' "$NGINX_CONF" \
             | head -1 | grep -oE '[0-9]+$' || true)
  if [ -z "$PROXY_PORT" ]; then
    err "$NGINX_CONF 에서 proxy_pass 포트 추출 실패"
  fi
  ok "PROXY_PORT=$PROXY_PORT (nginx 에서 추출)"
fi
export PROXY_PORT

log "=== 이미지 Pull ==="
# set -e 환경에서 `var=$(failing_cmd)` 는 즉시 스크립트를 종료시키므로
# if cmd; then ... else ... fi 패턴으로 실패 경로를 명시적으로 처리한다.
# 출력은 한 번만 (실패/성공 모두) 띄우기 위해 임시 파일로 캡처.
_pull_log=$(mktemp)
if docker pull "$FULL_IMAGE" >"$_pull_log" 2>&1; then
  cat "$_pull_log"
  rm -f "$_pull_log"
  ok "Pull: $FULL_IMAGE"
else
  _pull_rc=$?
  cat "$_pull_log" >&2
  if grep -qE 'no basic auth credentials|authorization failed|pull access denied' "$_pull_log"; then
    cat >&2 <<'HINT'

  ❌  ECR 인증 실패 — EC2 IAM Role 에 AmazonEC2ContainerRegistryReadOnly 정책 부착 확인 필요

  진단 (서버에서):
    TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
    curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
      http://169.254.169.254/latest/meta-data/iam/security-credentials/
    # 빈 출력 또는 404 → IAM Role 미부착

  해결 (AWS Console):
    1) IAM → Roles → Create role
       Trusted entity: AWS service → EC2
       Permissions: AmazonEC2ContainerRegistryReadOnly
       Role name: 예) corner-ec2-ecr-read
    2) EC2 → Instances → 해당 인스턴스 → Actions → Security → Modify IAM role
       위에서 만든 role 선택 → Update
    3) 약 30초 후 deploy-ecr.sh 재실행 (IMDS 가 새 토큰 노출)

  Role 이 이미 부착돼 있는데도 실패하면 — corner 사용자의 helper 설정 점검:
    sudo cat /home/corner/.docker/config.json
    sudo -u corner sh -c 'echo <ecr_registry> | docker-credential-ecr-login get'
HINT
  fi
  rm -f "$_pull_log"
  err "이미지 pull 실패 (exit $_pull_rc)"
fi

log "=== Docker Compose 재시작 ==="
cd "$APP_DIR"
IMAGE_TAG="$IMAGE_TAG" PROXY_PORT="$PROXY_PORT" docker compose -f docker-compose.prod.yml up -d --remove-orphans
ok "서비스 재시작 완료 (host:$PROXY_PORT → container:3000)"

log "=== 상태 확인 ==="
docker compose -f docker-compose.prod.yml ps
