# 동기화·질문하기 서버 이미지. 빌드 맥락은 리포 루트다(deploy/compose.yaml).
FROM node:22-bookworm-slim
WORKDIR /app
# 작업 공간 목록이 맞아야 npm ci가 되므로 모든 작업 공간의 package.json을 넣고, 설치는 서버만 한다.
COPY package.json package-lock.json ./
COPY packages/reader-core/package.json packages/reader-core/
COPY server/package.json server/
COPY pipeline/package.json pipeline/
COPY app/package.json app/
COPY admin/package.json admin/
COPY mobile/package.json mobile/
RUN npm ci --workspace server --no-audit --no-fund
COPY packages/reader-core packages/reader-core
COPY server server
WORKDIR /app/server
EXPOSE 8790
# 서버는 지금처럼 tsx로 TypeScript를 바로 돌린다.
CMD ["../node_modules/.bin/tsx", "src/index.ts"]
