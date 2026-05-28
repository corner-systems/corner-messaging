#!/usr/bin/env bash
# deploy-ecr.sh
# 로컬: Docker 이미지를 빌드하여 ECR에 푸시하고 서버에 배포한다.
# 생성: project-init.sh
#
# 사용법:
#   bash deploy-ecr.sh                  # 태그 자동 = 현재 시각 (예: 2026.05.20_15-40)
#   bash deploy-ecr.sh v1.2.3           # 명시적 태그
#   bash deploy-ecr.sh latest           # latest 태그
#
# 실행 위치: Dockerfile 이 있는 프로젝트 루트

set -euo pipefail
IFS=$'\n\t'

# 설정 로드
_script_dir="$(cd "$(dirname "$0")" && pwd)"
_env_deploy="$_script_dir/.env.deploy"
_env_deploy_local="$_script_dir/.env.deploy.local"
[ ! -f "$_env_deploy" ] && { echo "  FAIL .env.deploy 파일을 찾을 수 없습니다: $_env_deploy"; exit 1; }
[ ! -f "$_env_deploy_local" ] && { echo "  FAIL .env.deploy.local 파일을 찾을 수 없습니다: $_env_deploy_local
      (AWS_PROFILE 로컬 전용 파일 — project-init.sh 재실행으로 생성). 실제 자격증명은 ~/.aws/credentials"; exit 1; }
set -a
# shellcheck disable=SC1090
source "$_env_deploy"              # HOST_PORT(서버 외부 포트), PROXY_PORT 등 서버 변수 로드
_SERVER_HOST_PORT="${HOST_PORT:-}"
# shellcheck disable=SC1090
source "$_env_deploy_local"        # HOST_PORT (로컬 docker host 포트) + AWS_PROFILE 로드
LOCAL_HOST_PORT="${HOST_PORT:-}"
HOST_PORT="$_SERVER_HOST_PORT"
set +a
unset _SERVER_HOST_PORT _env_deploy _env_deploy_local _script_dir

SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"  # ~ 확장 (실제 ssh 호출용)
_SSH_KEY_DISPLAY="${SSH_KEY_PATH/#$HOME/~}"  # 표시용 (~ 형태)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# AWS 자격증명은 ~/.aws/credentials 의 [$AWS_PROFILE] 에서 자동 로드됨 (set -a 로 export 됨).
# .env.deploy.local 에 AWS_PROFILE 이 없으면 default profile 사용.

# IMAGE_TAG 기본값 — 인자 없으면 현재 시각 (Docker 태그 허용 문자만 사용: ':' → '-')
# 형식 예: 2026.05.20_15-40
IMAGE_TAG="${1:-$(date +%Y.%m.%d_%H-%M)}"
FULL_IMAGE="${ECR_REGISTRY}/${ECR_REPO}:${IMAGE_TAG}"

# APP_PATH = 서버 앱 디렉토리 full path (예: /home/corner/test/api7)
# 옛 .env.deploy 호환: APP_PATH 가 없거나 상대경로면 /home/${SERVER_USER}/ 결합
if [ -z "${APP_PATH:-}" ]; then
  if [ -n "${SERVICE_GROUP:-}" ] && [ -n "${DOMAIN:-}" ]; then
    APP_PATH="/home/${SERVER_USER}/${SERVICE_GROUP}/${DOMAIN}"
    echo "  ⚠️  .env.deploy 에 APP_PATH 가 없어 SERVICE_GROUP/DOMAIN 으로 폴백: $APP_PATH" >&2
    echo "  ⚠️  project-init.sh 를 다시 실행해 .env.deploy 를 갱신하세요." >&2
  else
    echo "  ❌  .env.deploy 에 APP_PATH / SERVICE_GROUP / DOMAIN 모두 누락 — project-init.sh 재실행 필요" >&2
    exit 1
  fi
fi

# APP_PATH 가 상대경로면 /home/${SERVER_USER}/ 자동 prefix (구 형식 호환)
case "$APP_PATH" in
  /*) ;;
  *)  APP_PATH="/home/${SERVER_USER}/${APP_PATH}" ;;
esac

APP_DIR="$APP_PATH"

# 배포 인프라 서브폴더 — project-init 의 DEPLOY_SUBDIR 값. 비어 있으면 APP_DIR 그대로 사용.
# 모든 인프라 파일(server-deploy.sh / docker-compose.prod.yml / .env / .env.deploy) 은 이 경로에 위치.
DEPLOY_SUBDIR=""
if [ -n "$DEPLOY_SUBDIR" ]; then
  DEPLOY_PATH="$APP_DIR/$DEPLOY_SUBDIR"
else
  DEPLOY_PATH="$APP_DIR"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_DIM='\033[2m'; C_RESET='\033[0m'
log()  { echo -e "\n${C_BLUE}[$(date +%H:%M:%S)] $*${C_RESET}"; }
ok()   { echo -e "  ${C_GREEN}OK${C_RESET}  $*"; }
warn() { echo -e "  ${C_YELLOW}WARN${C_RESET} $*"; }
err()  { echo -e "  ${C_RED}FAIL${C_RESET} $*"; exit 1; }

project_type_uses_proxy_port() {
  [ "${1:-}" = "web" ]
}

_SSH_CTRL="/tmp/deploy-ssh-ctrl-$$"
_SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ControlMaster=auto
  -o ControlPath="$_SSH_CTRL"
  -o ControlPersist=60
  -o IdentitiesOnly=yes
)
# SSH 대상은 SERVER (호스트/IP). 옛 .env.deploy 호환: SERVER 미정의면 DOMAIN 으로 fallback.
SERVER="${SERVER:-$DOMAIN}"
_ssh() { ssh "${_SSH_OPTS[@]}" -p "$SERVER_SSH_PORT" -i "$SSH_KEY_PATH" "${SERVER_ADMIN}@${SERVER}" "$@"; }
_scp() { scp "${_SSH_OPTS[@]}" -P "$SERVER_SSH_PORT" -i "$SSH_KEY_PATH" "$@"; }
_ssh_close() { ssh -O exit -o ControlPath="$_SSH_CTRL" -p "$SERVER_SSH_PORT" "${SERVER_ADMIN}@${SERVER}" 2>/dev/null || true; }
trap _ssh_close EXIT

# 사용 태그 안내 (인자 미지정 시 자동 생성된 타임스탬프 명시)
if [ -z "${1:-}" ]; then
  log "=== 이미지 태그 자동 지정 ==="
  ok "IMAGE_TAG=$IMAGE_TAG (현재 시각 — 인자 미지정)"
else
  log "=== 이미지 태그 ==="
  ok "IMAGE_TAG=$IMAGE_TAG (인자로 지정)"
fi

# Dockerfile 위치 확인
[ ! -d "$PROJECT_DIR" ] && err "PROJECT_DIR를 찾을 수 없습니다: $PROJECT_DIR"
[ ! -f "$PROJECT_DIR/Dockerfile" ] && err "Dockerfile을 찾을 수 없습니다: $PROJECT_DIR/Dockerfile"

# ─── 프로젝트 구조 자동 점검 (PHP / CI4) ─────────────────────────────────────
# 빌드 전에 프로젝트 구조를 한 번 훑어, 흔한 런타임 사고를 예방한다.
#   - public/index.php 존재 → Dockerfile 이 DocumentRoot 를 /var/www/html/public 으로 자동 전환.
#   - app/Config/Paths.php 존재 (CodeIgniter 4) → 로컬 writable/ 디렉토리 보장.
#     (Dockerfile 도 이미지 빌드 시 동일하게 생성하지만, 로컬 dev compose 가
#      현재 폴더를 bind-mount 하므로 호스트에도 디렉토리가 있어야 cache/logs/session 이 작동한다.)
log "=== 프로젝트 구조 자동 점검 ==="

if [ -f "$PROJECT_DIR/public/index.php" ]; then
  ok "DocumentRoot = /var/www/html/public  (public/index.php 감지 — Dockerfile 자동 전환)"
else
  ok "DocumentRoot = /var/www/html  (public/index.php 없음 — 기본 유지)"
fi

if [ -f "$PROJECT_DIR/app/Config/Paths.php" ]; then
  _writable="$PROJECT_DIR/writable"
  _created=0
  for _d in cache logs session uploads debugbar; do
    if [ ! -d "$_writable/$_d" ]; then
      mkdir -p "$_writable/$_d"
      _created=1
    fi
  done
  if [ $_created -eq 1 ]; then
    ok "CodeIgniter 4 writable/{cache,logs,session,uploads,debugbar} 로컬 디렉토리 생성"
  else
    ok "CodeIgniter 4 writable/ 디렉토리 OK"
  fi
  unset _writable _created _d
fi

# ─── 서버 초기 설정 (첫 실행 시 자동 처리) ───────────────────────────────────

log "=== 서버 초기 설정 확인 ==="

# 서버 접속 확인
log "=== 서버 접속 확인 ==="
_SSH_CMD="ssh -p $SERVER_SSH_PORT -i $_SSH_KEY_DISPLAY ${SERVER_ADMIN}@${SERVER}"

# 첫 시도 — stderr 캡처 (host key 충돌 / 접속 실패 진단용)
_ssh_err=$(_ssh "exit" 2>&1) || _ssh_failed=1

# host key 충돌이면 known_hosts 정리 후 재시도
if [ -n "${_ssh_failed:-}" ] && printf '%s' "$_ssh_err" | grep -qE 'REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed'; then
  warn "host key 충돌 — known_hosts 정리 후 재시도"
  ssh-keygen -R "[$SERVER]:$SERVER_SSH_PORT" >/dev/null 2>&1 || true
  ssh-keygen -R "$SERVER" >/dev/null 2>&1 || true
  unset _ssh_failed
  _ssh_err=$(_ssh "exit" 2>&1) || _ssh_failed=1
fi

if [ -n "${_ssh_failed:-}" ]; then
  echo "$_ssh_err" | sed 's/^/      /' >&2
  err "서버 접속 실패 — 수동 확인: $_SSH_CMD"
fi
unset _ssh_err _ssh_failed
ok "접속 성공: ${SERVER_ADMIN}@${SERVER}:${SERVER_SSH_PORT}"

# ─── 앱 디렉토리 보장 ───────────────────────────────────────────────────────
# /home/$SERVER_USER 는 chroot 루트(root:root 755) — corner 가 직접 mkdir 불가.
# ubuntu(sudo) 로 그룹 디렉토리와 앱 디렉토리를 생성하고 소유권 설정 (멱등 — 이미 있으면 무동작).
log "=== 앱 디렉토리 확인 ==="
_APP_PARENT="$(dirname "${APP_DIR}")"
_ssh "sudo mkdir -p '${_APP_PARENT}' '${APP_DIR}' && \
      sudo groupadd -f cornergroup && \
      sudo usermod -aG cornergroup '${SERVER_USER}' && \
      sudo chown '${SERVER_USER}:cornergroup' '${_APP_PARENT}' '${APP_DIR}' && \
      sudo chmod 775 '${_APP_PARENT}' '${APP_DIR}'"
ok "앱 디렉토리: $APP_DIR"
unset _APP_PARENT

# git clone 여부 확인
log "=== Git 상태 확인 ==="
_GIT_CHECK_CMD="$_SSH_CMD \"sudo -u $SERVER_USER bash -c 'test -d ${APP_DIR}/.git && echo has_git || echo no_git'\""
_git_status=$(_ssh "sudo -u $SERVER_USER bash -c 'test -d ${APP_DIR}/.git && echo has_git || echo no_git'" 2>/dev/null) || {
  err "Git 상태 확인 실패\n  수동 확인: $_GIT_CHECK_CMD"
}

if [ "$_git_status" = "no_git" ]; then
  if [ -n "$GIT_REPO" ]; then
    # 저장소 단위 정확한 접근 테스트 — ssh -T git@github.com 은 corner 계정에 어떤 repo 든
    # 등록돼 있으면 통과되어 false positive 가 발생하므로 git ls-remote 로 해당 repo 직접 확인.
    log "=== GitHub Deploy Key 접근 확인 ($GIT_REPO) ==="
    _LS_CMD="GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new' git ls-remote ${GIT_REPO} HEAD"
    _GH_CHECK_CMD="$_SSH_CMD \"sudo -u $SERVER_USER $_LS_CMD\""
    _gh_test=$(_ssh "sudo -u $SERVER_USER $_LS_CMD 2>&1 || true")
    if echo "$_gh_test" | grep -qE '^[0-9a-f]{40,}[[:space:]]+HEAD'; then
      ok "GitHub 접근 OK (이 저장소의 Deploy Key 등록됨)"
    else
      # 어떤 키를 등록해야 하는지 판별:
      #   - GIT_REPO 가 별칭 URL (git@github-<base>:...) 이면 per-repo 키 → github_deploy_<base>.pub
      #   - 일반 github.com URL 이면 default 키 → github_deploy.pub
      _gh_alias=$(printf '%s' "$GIT_REPO" | sed -nE 's|^git@(github-[^:]+):.*$|\1|p')
      if [ -n "$_gh_alias" ]; then
        _repo_base="${_gh_alias#github-}"
        _pubkey_path="/home/${SERVER_USER}/.ssh/github_deploy_${_repo_base}.pub"
      else
        _repo_base=""
        _pubkey_path="/home/${SERVER_USER}/.ssh/github_deploy.pub"
      fi

      _pubkey_content=$(_ssh "sudo -u $SERVER_USER cat $_pubkey_path 2>/dev/null" 2>/dev/null || true)

      _repo_path=$(printf '%s' "$GIT_REPO" \
        | sed -E -e 's|^git@github[._-][^:]*:|github.com/|' \
                 -e 's|^https?://github\.com/|github.com/|' \
                 -e 's|^github\.com/|github.com/|' \
                 -e 's|\.git/?$||' -e 's|/$||')
      _deploy_keys_url=""
      if printf '%s' "$_repo_path" | grep -qE '^github\.com/'; then
        _deploy_keys_url="https://${_repo_path}/settings/keys"
      fi

      _key_title="${SERVER_USER}-${DOMAIN%%.*}-${_repo_base:-$(basename "$_repo_path")}"
      _pubkey_short="${_pubkey_path/#\/home\/${SERVER_USER}/~}"

      echo ""
      echo -e "  ${C_BLUE}GitHub Deploy Key${C_RESET}"
      echo -e "  ${C_BLUE}─────────────────────────────────────────────────────────────${C_RESET}"
      echo ""
      echo "  이 저장소 전용 키를 서버에 자동 생성했습니다 (다른 repo 의 키와 충돌 회피)."
      echo "  같은 키가 다른 repo 에 이미 등록돼 있어 'Key is already in use' 가 나는 경우 사용."
      echo ""
      echo "  1️⃣  GitHub Deploy Keys 페이지로 이동:"
      [ -n "$_deploy_keys_url" ] && echo -e "       ${C_GREEN}$_deploy_keys_url${C_RESET}"
      echo ""
      echo "  2️⃣  'Add deploy key' 클릭 후 입력:"
      echo "     · Title : $_key_title"
      echo "     · Key   : 아래 한 줄 전체 복사·붙여넣기"
      echo "     · Allow write access : 체크 해제 (읽기 전용 권장)"
      echo ""
      if [ -n "$_pubkey_content" ]; then
        echo "  ┌─ Public Key (server: $_pubkey_short) ────"
        echo -e "${C_GREEN}$_pubkey_content${C_RESET}" | sed 's/^/  │ /'
        echo "  └─────────────────────────────────────────────────────────────"
        echo ""
        if [ -n "$_gh_alias" ]; then
          echo -e "  ${C_YELLOW}ℹ️  서버 ssh config 별칭 자동 등록됨: Host $_gh_alias → ~/.ssh/github_deploy_${_repo_base}${C_RESET}"
          echo -e "  ${C_YELLOW}ℹ️  GIT_REPO 자동 치환됨 (별칭 URL): $GIT_REPO${C_RESET}"
          echo ""
        fi
        echo "  3️⃣  등록 후 검증:"
        echo -e "     ${C_GREEN}$_SSH_CMD \\"
        echo -e "         \"sudo -u $SERVER_USER $_LS_CMD\"${C_RESET}"
        echo "     # 커밋 해시가 출력되면 OK (Permission denied 면 등록 누락)"
      else
        echo -e "  ${C_YELLOW}⚠️  서버에서 공개키 읽기 실패 — 경로 확인 필요: $_pubkey_path${C_RESET}"
        echo "  수동: $_SSH_CMD \"sudo -u $SERVER_USER cat $_pubkey_path\""
        echo "  공개키 자체가 없으면 새로 생성:"
        echo -e "    ${C_GREEN}$_SSH_CMD \"sudo -u $SERVER_USER ssh-keygen -t ed25519 -f ${_pubkey_path%.pub} -N '' -C 'deploy:${DOMAIN}'\"${C_RESET}"
      fi
      echo ""

      unset _gh_alias _repo_base _pubkey_path _pubkey_content _repo_path _deploy_keys_url _key_title _pubkey_short
      err "Deploy Key 등록 후 재실행하세요"
    fi

    log "=== Git Clone ==="
    _ssh "sudo -u $SERVER_USER bash -c 'mkdir -p ${APP_DIR} && cd ${APP_DIR} && git clone ${GIT_REPO} .'"
    ok "Git Clone: $GIT_REPO → $APP_DIR"
  else
    warn "GIT_REPO 미설정 — git clone 건너뜀"
  fi
else
  ok "Git 저장소 이미 존재 — clone 건너뜀"
fi

# ~/.ecr 디렉토리 생성 (ECR credential helper 로그 경로 — chroot로 인해 corner가 직접 생성 불가)
_ssh "sudo mkdir -p /home/${SERVER_USER}/.ecr && \
      sudo chown ${SERVER_USER}:${SERVER_USER} /home/${SERVER_USER}/.ecr && \
      sudo chmod 700 /home/${SERVER_USER}/.ecr"
ok "~/.ecr 디렉토리 확인"

# DEPLOY_PATH 디렉토리 보장 (저장소에 인프라 서브폴더가 비어 있는 경우 대비)
if [ "$DEPLOY_PATH" != "$APP_DIR" ]; then
  _ssh "sudo -u $SERVER_USER mkdir -p ${DEPLOY_PATH}"
fi

# server-deploy.sh 업로드 (항상 최신 버전으로 덮어쓰기)
_scp "$SCRIPT_DIR/server-deploy.sh" "${SERVER_ADMIN}@${SERVER}:/tmp/_server-deploy.sh"
_ssh "sudo mv /tmp/_server-deploy.sh ${DEPLOY_PATH}/server-deploy.sh && \
      sudo chown ${SERVER_USER}:${SERVER_USER} ${DEPLOY_PATH}/server-deploy.sh && \
      sudo chmod +x ${DEPLOY_PATH}/server-deploy.sh"
ok "server-deploy.sh 업로드"

# .env.deploy 업로드 (항상 최신 버전으로 덮어쓰기)
_scp "$SCRIPT_DIR/.env.deploy" "${SERVER_ADMIN}@${SERVER}:/tmp/_env_deploy"
_ssh "sudo mv /tmp/_env_deploy ${DEPLOY_PATH}/.env.deploy && \
      sudo chown ${SERVER_USER}:${SERVER_USER} ${DEPLOY_PATH}/.env.deploy && \
      sudo chmod 600 ${DEPLOY_PATH}/.env.deploy"
ok ".env.deploy 업로드"

# docker-compose.prod.yml 업로드 (항상 덮어쓰기 — 템플릿이 변경되면 서버 측도 같이 최신화)
# 서버는 prod compose 파일만 사용한다. 로컬 dev 용 docker-compose.yml 은 서버에 올리지 않는다.
_scp "$SCRIPT_DIR/docker-compose.prod.yml" "${SERVER_ADMIN}@${SERVER}:/tmp/_docker-compose.prod.yml"
_ssh "sudo mv /tmp/_docker-compose.prod.yml ${DEPLOY_PATH}/docker-compose.prod.yml && \
      sudo chown ${SERVER_USER}:${SERVER_USER} ${DEPLOY_PATH}/docker-compose.prod.yml"
ok "docker-compose.prod.yml 업로드 (항상 최신)"

# cron-run.sh 업로드 (job 타입만 — 서버 crontab 실행 wrapper)
if [ "${PROJECT_TYPE:-web}" = "job" ] && [ -f "$SCRIPT_DIR/cron-run.sh" ]; then
  _scp "$SCRIPT_DIR/cron-run.sh" "${SERVER_ADMIN}@${SERVER}:/tmp/_cron-run.sh"
  _ssh "sudo mv /tmp/_cron-run.sh ${DEPLOY_PATH}/cron-run.sh && \
        sudo chown ${SERVER_USER}:${SERVER_USER} ${DEPLOY_PATH}/cron-run.sh && \
        sudo chmod +x ${DEPLOY_PATH}/cron-run.sh"
  ok "cron-run.sh 업로드"
fi

# .env 업로드 (설치 폴더의 .env가 있으면 항상 덮어쓰기)
# 모드 0644 — 컨테이너의 비-root 사용자(www-data 등)가 bind-mount 된 파일을 읽을 수 있도록.
# 디렉토리(/home/<USER>/sites/<DOMAIN>) 자체가 chroot 격리되어 있으므로 호스트 측 노출은 제한된다.
if [ -f "$SCRIPT_DIR/.env" ]; then
  _scp "$SCRIPT_DIR/.env" "${SERVER_ADMIN}@${SERVER}:/tmp/_app.env"
  _ssh "sudo mv /tmp/_app.env ${DEPLOY_PATH}/.env && \
        sudo chown ${SERVER_USER}:${SERVER_USER} ${DEPLOY_PATH}/.env && \
        sudo chmod 644 ${DEPLOY_PATH}/.env"
  ok ".env 업로드 (mode 0644 — 컨테이너 bind-mount 가독성 보장)"
else
  _ssh "[ -f ${DEPLOY_PATH}/.env ] || (sudo touch ${DEPLOY_PATH}/.env && \
        sudo chown ${SERVER_USER}:${SERVER_USER} ${DEPLOY_PATH}/.env && \
        sudo chmod 644 ${DEPLOY_PATH}/.env)"
  ok ".env 없음 — 서버에 빈 파일 보장 (docker-compose env_file 오류 방지)"
fi

# ─── ECR 로그인 / 저장소 확인 ────────────────────────────────────────────────

log "=== ECR 로그인 ==="
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"
ok "ECR 로그인"

log "=== ECR 저장소 확인 ==="
if ! aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" >/dev/null 2>&1; then
  warn "ECR 저장소 없음 — 생성 중: $ECR_REPO"
  aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" >/dev/null
  ok "ECR 저장소 생성: $ECR_REPO"
else
  ok "ECR 저장소 확인: $ECR_REPO"
fi

# ─── 이미지 빌드 ─────────────────────────────────────────────────────────────

log "=== 이미지 빌드 ==="
cd "$PROJECT_DIR"
# DEPLOY_SUBDIR 가 비어 있으면 PROJECT_DIR 루트의 Dockerfile, 지정되어 있으면 그 안의 Dockerfile 사용.
# build context 는 PROJECT_DIR (코드 루트) — .dockerignore 도 여기 자동 인식.
_dockerfile="Dockerfile"
[ -n "$DEPLOY_SUBDIR" ] && _dockerfile="$DEPLOY_SUBDIR/Dockerfile"
docker build --platform linux/amd64 -f "$_dockerfile" -t "${ECR_REPO}:${IMAGE_TAG}" .
unset _dockerfile
docker tag "${ECR_REPO}:${IMAGE_TAG}" "$FULL_IMAGE"
ok "빌드: $FULL_IMAGE"

# ─── ECR 푸시 ────────────────────────────────────────────────────────────────

log "=== ECR 푸시 ==="
docker push "$FULL_IMAGE"
ok "푸시 완료: $FULL_IMAGE"

# ─── 서버 배포 ───────────────────────────────────────────────────────────────

# web 타입만 PROXY_PORT 확인 및 nginx 비교
if project_type_uses_proxy_port "${PROJECT_TYPE:-web}"; then
  log "=== PROXY_PORT 확인 ==="
  if [ -z "${PROXY_PORT:-}" ]; then
    err ".env.deploy 에 PROXY_PORT 가 없습니다 — project-init.sh 재실행으로 설정하세요"
  fi
  ok "PROXY_PORT=$PROXY_PORT (.env.deploy 기준)"
  _PROXY_PORT_NGINX=$(_ssh "sudo grep -oE 'proxy_pass[[:space:]]+http://localhost:[0-9]+' /etc/nginx/sites-available/${DOMAIN} 2>/dev/null | head -1 | grep -oE '[0-9]+\$'" 2>/dev/null || true)
  if [ -n "$_PROXY_PORT_NGINX" ] && [ "$_PROXY_PORT_NGINX" != "$PROXY_PORT" ]; then
    warn "nginx proxy_pass 포트($_PROXY_PORT_NGINX) 와 .env.deploy PROXY_PORT($PROXY_PORT) 불일치"
    warn "nginx config 를 PROXY_PORT=$PROXY_PORT 으로 맞추거나 .env.deploy 를 $_PROXY_PORT_NGINX 으로 수정하세요"
  fi
  unset _PROXY_PORT_NGINX
fi

log "=== 서버 배포 ==="
if project_type_uses_proxy_port "${PROJECT_TYPE:-web}"; then
  _ssh "sudo -u $SERVER_USER bash ${DEPLOY_PATH}/server-deploy.sh ${IMAGE_TAG} ${PROXY_PORT}"
else
  _ssh "sudo -u $SERVER_USER bash ${DEPLOY_PATH}/server-deploy.sh ${IMAGE_TAG}"
fi
ok "서버 배포 완료"

log "=== 완료 ==="
echo "  이미지: $FULL_IMAGE"
if project_type_uses_proxy_port "${PROJECT_TYPE:-web}"; then
  printf "  URL:    ${C_YELLOW}https://%s${C_RESET}\n" "$DOMAIN"
else
  echo ""
  echo "  ─── 작동 확인 ───────────────────────────────────────────────────────"
  echo "  수동 실행 (즉시 테스트):"
  printf "    ${C_GREEN}ssh -p %s -i %s %s@%s %s\n" \
    "$SERVER_SSH_PORT" "$_SSH_KEY_DISPLAY" "$SERVER_ADMIN" "$SERVER" "\\"
  printf "      \"sudo -u %s bash %s/cron-run.sh\"${C_RESET}\n" \
    "$SERVER_USER" "$DEPLOY_PATH"
  echo ""
  echo "  로그 확인:"
  printf "    ${C_GREEN}ssh -p %s -i %s %s@%s %s\n" \
    "$SERVER_SSH_PORT" "$_SSH_KEY_DISPLAY" "$SERVER_ADMIN" "$SERVER" "\\"
  printf "      \"tail -20 %s/logs/cron-error.log\"${C_RESET}\n" \
    "$DEPLOY_PATH"
  echo ""
  echo "  crontab 등록 예시:"
  printf "    ${C_BLUE}# 매일 오전 9시 실행${C_RESET}\n"
  printf "    ${C_YELLOW}0 9 * * * bash %s/cron-run.sh 2>> %s/logs/cron-error.log${C_RESET}\n" \
    "$DEPLOY_PATH" "$DEPLOY_PATH"
  echo "  ─────────────────────────────────────────────────────────────────────"
fi
