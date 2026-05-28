# messaging.corneropen.com 배포 가이드

이 문서는 프로젝트 폴더 내에서 실행한다는 가정으로 작성되었습니다.

## 프로젝트 정보

| 항목 | 값 |
|------|-----|
| 서비스 URL | `https://messaging.corneropen.com` |
| ECR 저장소 | `471112982346.dkr.ecr.ap-northeast-2.amazonaws.com/corner-systems/corner-messaging` |
| 컨테이너 이름 | `messaging-corneropen-com` |
| 포트 매핑 | 외부: `443` → nginx / 서버 내부: nginx → host `61001` → container `3000` / 로컬: `3000` → container `3000` |
| GitHub 저장소 | `git@github-corner-messaging:corner-systems/corner-messaging.git` |
| 서버 SSH | `ubuntu@jobs.corneropen.com:1108` (key: `/Users/lynixer/.ssh/corner-prod.pem`) |
| 앱 디렉토리 (서버) | `/home/corner/sites/messaging.corneropen.com/` |

---

## 1. 로컬 실행

`.env` 작성 후:

```bash
# 백그라운드 기동 (dev 컨테이너 — 소스 bind-mount + tsx watch hot reload)
docker compose up -d
bash up.sh   # 위와 동일한 동작 (HOST_PORT export 포함)

# 로그 확인
docker compose logs -f

# 종료
docker compose down
```

브라우저: `http://localhost:3000`

동작 요약:
- `node:20-alpine` 위에 현재 폴더를 `/app` 으로 bind-mount → `src/` 변경이 즉시 반영된다.
- 첫 기동 시 컨테이너 내부에서 `npm install` 1회 실행 후 `npm run dev` (`tsx watch`) 가동.
- 호스트 `node_modules` 와 컨테이너 `node_modules` 는 격리되어 OS/아키 차이로 인한 native 모듈 충돌이 없다.
- 운영 이미지(ECR) 빌드/실행은 본 절차에 포함되지 않는다 — 그건 `deploy-ecr.sh` 가 담당한다.

> 서버 배포용 compose 설정은 별도 파일 `docker-compose.prod.yml` 에 분리되어 있다.

---

## 2. 배포

```bash
# 인자 없이 — 태그는 현재 시각 자동 부여 (예: 2026.05.20_15-40)
bash deploy-ecr.sh

# 명시적 태그 (semver / latest / 임의 이름)
bash deploy-ecr.sh v1.2.3
bash deploy-ecr.sh latest

# 또는 프로젝트 폴더 밖에서 전체 경로로 실행
bash /Users/lynixer/workspace/corner/web/messaging.corneropen.com/deploy-ecr.sh latest
```

자동 수행: 서버 접속 확인 → (첫 실행 시) git clone → 파일 업로드 → ECR 로그인/푸시 → 서버 측 `server-deploy.sh` 실행 → nginx 에서 PROXY_PORT 추출 → ECR pull → `docker compose -f docker-compose.prod.yml up -d`.

> 태그 자동 부여 형식은 `YYYY.MM.DD_HH-mm` 입니다. Docker 태그가 콜론(`:`)을 허용하지 않아 시:분 구분자만 하이픈으로 대체했습니다.

### 2-1. 이전 버전으로 롤백

```bash
# 인터랙티브 — ECR 의 태그 목록을 ↑/↓ 로 선택
bash rollback.sh

# 지정 태그로 즉시 롤백 (picker 생략)
bash rollback.sh v1.2.3
```

`rollback.sh` 는 **빌드/푸시 없이** ECR 에 이미 있는 이미지만 서버에 다시 적용합니다. 현재 운영 중인 태그를 자동으로 표시하고, 확인 단계를 거친 뒤 `server-deploy.sh` 를 호출합니다.

---

## 3. 서버 로그

```bash
# 실시간 로그 (container_name 으로 직접 — compose 불필요)
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com \
  "sudo docker logs -f --tail=200 messaging-corneropen-com"

# 특정 시점 이후
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com \
  "sudo docker logs --since 1h messaging-corneropen-com"

# nginx 액세스 / 에러
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com \
  "sudo tail -f /var/log/nginx/messaging.corneropen.com.access.log /var/log/nginx/messaging.corneropen.com.error.log"
```

---

## 4. 서버 운영

```bash
# 컨테이너 상태
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com \
  "sudo docker ps --filter name=messaging-corneropen-com"

# 재시작 / 중지 (compose 불필요 — container_name 으로 직접 제어)
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com \
  "sudo docker restart messaging-corneropen-com"

ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com \
  "sudo docker stop messaging-corneropen-com"

# 완전 재배포 (이미지 pull 포함) — server-deploy.sh 가 nginx 에서 PROXY_PORT 추출 후 compose 호출
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com \
  "sudo -u corner bash /home/corner/sites/messaging.corneropen.com/server-deploy.sh latest"

# 컨테이너 셸 (디버깅)
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem -t ubuntu@jobs.corneropen.com \
  "sudo docker exec -it messaging-corneropen-com sh"

# 헬스 체크
curl -I https://messaging.corneropen.com/health
```

> 서버에서 직접 `docker compose` 를 호출해야 한다면 항상 `-f docker-compose.prod.yml` 를 명시한다.
> PROXY_PORT 환경변수가 nginx 설정에서 추출되어 주입되어야 하므로, 일반 운영은 `server-deploy.sh` 를 거치는 것을 권장한다.

---

## 5. 파일

| 파일 | 용도 |
|------|------|
| `.env.deploy` | 배포 설정 (AWS 자격증명 **없음**, 서버 업로드용 — **git 커밋 금지**) |
| `.env.deploy.local` | 로컬 `HOST_PORT` / `AWS_PROFILE` 보관 (서버 업로드 금지, **git 커밋 금지**). 실제 access/secret key 는 `~/.aws/credentials` 의 `[<프로파일>]` 에 저장 |
| `deploy-ecr.sh` | 로컬 → 서버 배포 (빌드 + 푸시 + 배포) |
| `rollback.sh` | ECR 에 있는 이전 태그로 롤백 (재빌드 없음, 인터랙티브 picker) |
| `server-deploy.sh` | 서버 측 배포 스크립트 (deploy-ecr.sh / rollback.sh 가 업로드 후 호출) |
| `docker-compose.yml` | **로컬 dev 컨테이너 정의** (node:20-alpine + bind-mount + tsx watch) |
| `docker-compose.prod.yml` | **서버 컨테이너 정의** (ECR 이미지, `${PROXY_PORT}:3000` 매핑) |
| `Dockerfile` | 운영 이미지 빌드 정의 (`EXPOSE 3000`) — `deploy-ecr.sh` 가 사용 |
| `.env` | 앱 환경 변수 (운영) — **git 커밋 금지** |
| `.env.example` | `.env` 작성 예시 |
| `.dockerignore` | Docker 빌드 제외 목록 |
| `DEPLOY.md` | 이 문서 |

---

## 6. 트러블슈팅

### 502 Bad Gateway

nginx 가 컨테이너에 연결 못 한 상태.

```bash
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com '
  echo "=== 컨테이너 ==="
  sudo docker ps --filter name=messaging-corneropen-com
  echo "=== 컨테이너 로그 ==="
  sudo docker logs --tail=30 messaging-corneropen-com
  echo "=== 호스트에서 직접 접근 ==="
  curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:61001/
  echo "=== nginx 에러 로그 ==="
  sudo tail -n 20 /var/log/nginx/messaging.corneropen.com.error.log
'
```

체크 포인트:
1. 컨테이너 실행 중? — 아니면 `sudo -u corner bash /home/corner/sites/messaging.corneropen.com/server-deploy.sh latest`
2. 컨테이너 내부 PORT=3000 listen 중? — `docker exec messaging-corneropen-com netstat -tlnp`
3. nginx `proxy_pass` 포트와 `docker-compose.prod.yml` `ports` host 포트 일치?

### Connection refused

- AWS Security Group 인바운드 80/443 허용 확인
- DNS A 레코드: `dig +short messaging.corneropen.com`

### 변경 사항 미반영

```bash
# 재배포 (이미지 pull + 강제 재생성 자동 수행)
bash deploy-ecr.sh latest
```

### GitHub Deploy Key 실패

```bash
ssh -p 1108 -i /Users/lynixer/.ssh/corner-prod.pem ubuntu@jobs.corneropen.com \
  "sudo -u corner ssh -T git@github.com"
```

`successfully authenticated` 메시지가 안 나오면 → GitHub Settings → Deploy keys 등록 확인.
