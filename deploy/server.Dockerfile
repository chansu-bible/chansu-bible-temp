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
# 내려받은 npm 캐시는 이미지에 남기지 않는다.
RUN npm ci --workspace server --no-audit --no-fund && npm cache clean --force && rm -rf /root/.npm/_logs /tmp/node-compile-cache
COPY packages/reader-core packages/reader-core
COPY server server
WORKDIR /app/server
EXPOSE 8790
# root가 아닌 node 사용자로 돌린다(묶음 폴더는 읽기만 한다).
USER node
# 서버는 지금처럼 tsx로 TypeScript를 바로 돌린다.
CMD ["../node_modules/.bin/tsx", "src/index.ts"]
