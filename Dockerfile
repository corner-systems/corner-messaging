FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# data/ 가 없는 프로젝트에서도 runner stage 의 COPY 가 성공하도록 빈 디렉토리 보장.
# 실제로 data/ 가 있던 프로젝트는 COPY . . 가 이미 채워뒀으므로 mkdir -p 는 no-op.
RUN mkdir -p data && npm run build

FROM node:20-alpine
WORKDIR /app


COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
# data/ 자동 처리:
#   · 프로젝트에 data/ 가 있으면 그 내용이 그대로 컨테이너에 복사됨.
#   · 프로젝트에 data/ 가 없으면 builder 에서 만든 빈 디렉토리만 복사된 뒤 rmdir 로 즉시 제거 →
#     운영 컨테이너 안에 data/ 디렉토리 자체가 존재하지 않게 된다 (코드의 fs.existsSync 가 정확히 동작).
COPY --from=builder /app/data ./data
RUN [ -z "$(ls -A ./data 2>/dev/null)" ] && rmdir ./data || true

# 컨테이너 내부 포트 고정 (3000). 외부 host 포트는 docker-compose.yml 의 ports 매핑이 결정.
EXPOSE 3000
CMD ["node", "dist/index.js"]
