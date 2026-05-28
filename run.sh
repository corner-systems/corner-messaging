#!/bin/bash
# manage.sh

set -e

APP_NAME="messaging"
DEBUG_APP_NAME="messaging-debug"
ECO_FILE="ecosystem.config.cjs"

case "$1" in
  start-real)
    echo "==> ${DEBUG_APP_NAME} 선(先)중지"
    pm2 stop "${DEBUG_APP_NAME}" || echo "⚠️ ${DEBUG_APP_NAME} 프로세스가 실행 중이지 않습니다."

    echo "==> TypeScript 컴파일"
    npx tsc

    echo "==> PM2로 ${APP_NAME} 시작"
    # 이미 실행 중이면 restart, 없으면 start
    if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
      pm2 restart "${APP_NAME}" --update-env
    else
      pm2 start dist/index.js --name "${APP_NAME}"
    fi
    pm2 save
    ;;

  start-debug)
    # 개발용: eco 파일의 ${DEBUG_APP_NAME}만 시작
    if [ ! -f "${ECO_FILE}" ]; then
      echo "에러: ${ECO_FILE} 파일이 없습니다."
      exit 2
    fi

    echo "==> ${APP_NAME} 선(先)중지"
    pm2 stop "${APP_NAME}" || echo "⚠️ ${APP_NAME} 프로세스가 실행 중이지 않습니다."

    echo "==> PM2로 ${DEBUG_APP_NAME} 시작 (ecosystem)"
    pm2 start "${ECO_FILE}" --only "${DEBUG_APP_NAME}"
    pm2 save
    ;;

  reload-debug)
    pm2 reload "${DEBUG_APP_NAME}"
    ;;

  log-debug)
    pm2 logs "${DEBUG_APP_NAME}" --lines 200 --time
    ;;

  stop-real)
    echo "==> ${APP_NAME} 중지"
    pm2 stop "${APP_NAME}" || echo "⚠️ ${APP_NAME} 프로세스가 실행 중이지 않습니다."
    ;;

  stop-debug)
    echo "==> ${DEBUG_APP_NAME} 중지"
    pm2 stop "${DEBUG_APP_NAME}" || echo "⚠️ ${DEBUG_APP_NAME} 프로세스가 실행 중이지 않습니다."
    ;;

  delete-real)
    echo "==> ${APP_NAME} 삭제"
    pm2 delete "${APP_NAME}" || echo "⚠️ ${APP_NAME} 프로세스가 없습니다."
    ;;

  delete-debug)
    echo "==> ${DEBUG_APP_NAME} 삭제"
    pm2 delete "${DEBUG_APP_NAME}" || echo "⚠️ ${DEBUG_APP_NAME} 프로세스가 없습니다."
    ;;

  *)
    echo "사용법:"
    echo "  $0 start-real     - (선중지: ${DEBUG_APP_NAME}) TypeScript 빌드 후 ${APP_NAME} 실행(있으면 restart, 없으면 start)"
    echo "  $0 start-debug     - (선중지: ${APP_NAME}) ${ECO_FILE}의 ${DEBUG_APP_NAME} 실행"
    echo "  $0 reload-debug    - ${DEBUG_APP_NAME} 무중단 리로드"
    echo "  $0 log-debug       - ${DEBUG_APP_NAME} 로그 200줄 출력"
    echo "  $0 stop-real      - ${APP_NAME} 중지"
    echo "  $0 stop-debug      - ${DEBUG_APP_NAME} 중지"
    echo "  $0 delete-real    - ${APP_NAME} 삭제"
    echo "  $0 delete-debug    - ${DEBUG_APP_NAME} 삭제"
    exit 1
    ;;
esac
