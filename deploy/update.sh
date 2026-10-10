#!/usr/bin/env bash
# 맥미니에서 돌린다: 리포를 받고, 묶음을 만들고, 서버를 다시 띄우고, 상태를 확인한다.
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose -f deploy/compose.yaml --env-file deploy/.env)

git pull --ff-only
npm ci
# 1단계 서버는 책 묶음을 읽는다. 2단계 Task 9부터는 npm run pipeline -- publish로 바뀐다.
npm run pipeline -- build
"${compose[@]}" up -d --build
# 서버는 시작할 때 묶음을 읽으므로 새 묶음을 읽게 다시 띄운다.
"${compose[@]}" restart server

# PROXY_PORT 줄이 없어도 멈추지 않게 || true를 붙인다. 없으면 기본값 8443이다.
port=$(grep -E '^PROXY_PORT=' deploy/.env | cut -d= -f2 || true)
port=${port:-8443}
for _ in {1..30}; do
  if curl -fsS --max-time 5 "http://127.0.0.1:${port}/health" >/dev/null; then
    echo "서버가 떴습니다: http://127.0.0.1:${port}/health"
    exit 0
  fi
  sleep 2
done
echo "서버 상태 확인에 실패했습니다. 로그: ${compose[*]} logs server" >&2
exit 1
