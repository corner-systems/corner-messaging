#!/usr/bin/env bash
# rollback.sh
# ECR 의 이미지 태그를 인터랙티브로 선택해 서버에 롤백 배포한다.
# 빌드/푸시 없음 — 이미 ECR 에 있는 이미지만 적용한다.
#
# 사용법:
#   bash rollback.sh           # 인터랙티브 picker (↑/↓ 선택, Enter 확인, q/ESC 취소)
#   bash rollback.sh <TAG>     # 지정 태그로 즉시 롤백 (picker 생략)

set -euo pipefail
IFS=$'\n\t'

# ─── 설정 로드 ───────────────────────────────────────────────────────────────
_env_deploy="$(cd "$(dirname "$0")" && pwd)/.env.deploy"
[ ! -f "$_env_deploy" ] && { echo "FAIL .env.deploy 없음: $_env_deploy" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$_env_deploy"
set +a
unset _env_deploy

SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
CONTAINER_NAME="${DOMAIN//./-}"   # api5.corneropen.com → api5-corneropen-com
APP_DIR="$APP_PATH"
MAX_TAGS=30                       # picker 에 표시할 최대 태그 수

export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY

C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'; C_DIM='\033[2m'; C_RESET='\033[0m'
log()  { echo -e "\n${C_BLUE}[$(date +%H:%M:%S)] $*${C_RESET}" >&2; }
ok()   { echo -e "  ${C_GREEN}OK${C_RESET}  $*" >&2; }
warn() { echo -e "  ${C_YELLOW}WARN${C_RESET} $*" >&2; }
err()  { echo -e "  ${C_RED}FAIL${C_RESET} $*" >&2; exit 1; }

# ─── SSH 연결 재사용 ─────────────────────────────────────────────────────────
_SSH_CTRL="/tmp/rollback-ssh-ctrl-$$"
_SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o ServerAliveInterval=15
  -o ControlMaster=auto
  -o ControlPath="$_SSH_CTRL"
  -o ControlPersist=60
)
_ssh() { ssh "${_SSH_OPTS[@]}" -p "$SERVER_SSH_PORT" -i "$SSH_KEY_PATH" "${SERVER_ADMIN}@${DOMAIN}" "$@"; }
_ssh_close() {
  tput cnorm 2>/dev/null || true
  ssh -O exit -o ControlPath="$_SSH_CTRL" -p "$SERVER_SSH_PORT" "${SERVER_ADMIN}@${DOMAIN}" 2>/dev/null || true
}
trap _ssh_close EXIT

# ─── 인자 ───────────────────────────────────────────────────────────────────
TARGET_TAG="${1:-}"

# ─── 현재 운영 중인 태그 확인 ────────────────────────────────────────────────
log "현재 운영 중 이미지 확인"
CURRENT_IMAGE=$(_ssh "sudo docker inspect --format '{{.Config.Image}}' ${CONTAINER_NAME} 2>/dev/null" 2>/dev/null || true)
if [ -n "$CURRENT_IMAGE" ]; then
  CURRENT_TAG="${CURRENT_IMAGE##*:}"
  ok "현재: $CURRENT_TAG"
else
  warn "컨테이너 $CONTAINER_NAME 정보 조회 실패 (미실행 / 권한 이슈)"
  CURRENT_TAG=""
fi

# ─── ECR 태그 목록 조회 ──────────────────────────────────────────────────────
log "ECR 태그 목록 조회 ($ECR_REPO)"
TAGS_JSON=$(aws ecr describe-images \
  --repository-name "$ECR_REPO" \
  --region "$AWS_REGION" \
  --query 'reverse(sort_by(imageDetails[?imageTags!=`null`],&imagePushedAt))[].{tag:imageTags[0],pushed:imagePushedAt,size:imageSizeInBytes}' \
  --output json 2>/dev/null) || err "ECR describe-images 실패 (AWS 권한·리전·저장소명 확인)"

# JSON → "tag\tpushed\tsize" 라인 (push 시간 내림차순, 로컬 시간으로 변환)
mapfile -t TAGS_LINES < <(MAX_TAGS=$MAX_TAGS python3 -c "
import json, os, sys, datetime
data = json.loads(sys.stdin.read())
limit = int(os.environ.get('MAX_TAGS', '30'))
for entry in data[:limit]:
    tag = entry.get('tag') or '<none>'
    ts = entry['pushed']
    size = entry['size'] // (1024*1024)
    dt = datetime.datetime.fromisoformat(ts.replace('Z','+00:00'))
    local = dt.astimezone().strftime('%Y-%m-%d %H:%M')
    print(f'{tag}\t{local}\t{size}MB')
" <<<"$TAGS_JSON")

[ ${#TAGS_LINES[@]} -eq 0 ] && err "ECR 에 태그된 이미지가 없습니다"
ok "${#TAGS_LINES[@]} 개 태그 확인 (최근 push 순, 최대 $MAX_TAGS 개)"

# ─── 태그 선택 ───────────────────────────────────────────────────────────────

if [ -n "$TARGET_TAG" ]; then
  # 인자로 받은 태그 — 존재 검증만
  found_line=""
  for line in "${TAGS_LINES[@]}"; do
    IFS=$'\t' read -r t _ _ <<<"$line"
    if [ "$t" = "$TARGET_TAG" ]; then found_line="$line"; break; fi
  done
  [ -z "$found_line" ] && err "ECR 에 태그 '$TARGET_TAG' 없음. 인자 없이 실행해 목록을 확인하세요."
  SELECTED_TAG="$TARGET_TAG"
else
  # 인터랙티브 picker
  if [ ! -t 1 ] || [ ! -r /dev/tty ]; then
    err "인터랙티브 선택을 위해 TTY 가 필요합니다. 인자로 태그를 전달하세요: bash rollback.sh <TAG>"
  fi

  pick_tag() {
    local options=("$@")
    local count=${#options[@]}
    local current=0
    local key key2 i line tag ts size suffix

    # 헤더 + 초기 항목 출력 (stderr — stdout 은 최종 선택 결과 전용)
    {
      echo ""
      echo -e "  ${C_DIM}↑/↓ 선택  ·  Enter 확인  ·  q/ESC 취소${C_RESET}"
      echo ""
      printf "  %-20s  %-16s  %s\n" "TAG" "PUSHED (로컬시간)" "SIZE"
      printf "  %-20s  %-16s  %s\n" "────────────────────" "────────────────" "──────"
      for ((i=0; i<count; i++)); do
        line="${options[$i]}"
        IFS=$'\t' read -r tag ts size <<<"$line"
        suffix=""
        [ "$tag" = "$CURRENT_TAG" ] && suffix="  ← 현재 운영 중"
        if [ $i -eq $current ]; then
          printf "\033[7m> %-20s  %-16s  %s%s\033[0m\n" "$tag" "$ts" "$size" "$suffix"
        else
          printf "  %-20s  %-16s  %s%s\n" "$tag" "$ts" "$size" "$suffix"
        fi
      done
    } >&2

    tput civis >&2  # 커서 숨김
    trap 'tput cnorm 2>&2 || true; echo "" >&2; exit 130' INT TERM

    while true; do
      IFS= read -rsn1 key </dev/tty
      if [ "$key" = $'\x1b' ]; then
        # ESC sequence (arrow key) 또는 단독 ESC
        if read -rsn2 -t 0.1 key2 </dev/tty; then
          case "$key2" in
            '[A') [ $current -gt 0 ] && current=$((current-1)) ;;
            '[B') [ $current -lt $((count-1)) ] && current=$((current+1)) ;;
            *) continue ;;
          esac
        else
          # 단독 ESC = 취소
          tput cnorm >&2; echo "" >&2; warn "취소"; exit 1
        fi
      elif [ -z "$key" ]; then
        # Enter
        break
      elif [ "$key" = "q" ] || [ "$key" = "Q" ]; then
        tput cnorm >&2; echo "" >&2; warn "취소"; exit 1
      else
        continue
      fi

      # 옵션 영역만 재렌더링
      tput cuu $count >&2
      for ((i=0; i<count; i++)); do
        tput el >&2
        line="${options[$i]}"
        IFS=$'\t' read -r tag ts size <<<"$line"
        suffix=""
        [ "$tag" = "$CURRENT_TAG" ] && suffix="  ← 현재 운영 중"
        if [ $i -eq $current ]; then
          printf "\033[7m> %-20s  %-16s  %s%s\033[0m\n" "$tag" "$ts" "$size" "$suffix" >&2
        else
          printf "  %-20s  %-16s  %s%s\n" "$tag" "$ts" "$size" "$suffix" >&2
        fi
      done
    done

    tput cnorm >&2
    echo "${options[$current]}"  # stdout 으로 결과
  }

  SELECTED_LINE=$(pick_tag "${TAGS_LINES[@]}")
  IFS=$'\t' read -r SELECTED_TAG _ _ <<<"$SELECTED_LINE"
fi

echo "" >&2
ok "선택된 태그: $SELECTED_TAG"

# ─── 확인 ────────────────────────────────────────────────────────────────────
if [ -n "$CURRENT_TAG" ] && [ "$SELECTED_TAG" = "$CURRENT_TAG" ]; then
  warn "선택한 태그가 현재 운영 중과 동일합니다 ($CURRENT_TAG)."
  read -r -p "  → 그래도 재배포(force-recreate)하시겠습니까? [y/N]: " _conf </dev/tty
else
  echo "  → 변경: ${CURRENT_TAG:-<unknown>} → $SELECTED_TAG" >&2
  read -r -p "  → 진행하시겠습니까? [y/N]: " _conf </dev/tty
fi
case "${_conf:-N}" in
  [Yy]*) ;;
  *) warn "취소"; exit 0 ;;
esac

# ─── PROXY_PORT 추출 ─────────────────────────────────────────────────────────
log "nginx 설정에서 PROXY_PORT 추출"
PROXY_PORT_REMOTE=$(_ssh "sudo grep -oE 'proxy_pass[[:space:]]+http://localhost:[0-9]+' /etc/nginx/sites-available/${DOMAIN} 2>/dev/null | head -1 | grep -oE '[0-9]+\$'" 2>/dev/null || true)
[ -z "$PROXY_PORT_REMOTE" ] && err "PROXY_PORT 추출 실패 — /etc/nginx/sites-available/${DOMAIN} 의 proxy_pass 확인 필요"
ok "PROXY_PORT=$PROXY_PORT_REMOTE"

# ─── 서버 측 server-deploy.sh 호출 (빌드/푸시 없음 — pull + compose up 만) ──
log "서버 배포 트리거 ($SELECTED_TAG)"
_ssh "sudo -u $SERVER_USER bash ${APP_DIR}/server-deploy.sh ${SELECTED_TAG} ${PROXY_PORT_REMOTE}"

log "롤백 완료"
echo "  이미지: $ECR_REGISTRY/$ECR_REPO:$SELECTED_TAG" >&2
echo "  URL:    https://$DOMAIN" >&2
