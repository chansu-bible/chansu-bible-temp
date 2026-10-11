#!/usr/bin/env bash
# 맥미니에서 돌린다: 리포를 받고, 묶음을 만들고, 서버와 입구를 다시 띄우고, 상태를 확인한다.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f deploy/.env ] || { echo 'deploy/.env가 없습니다. deploy/README.md의 설정부터 하세요.' >&2; exit 1; }
compose=(docker compose -f deploy/compose.yaml --env-file deploy/.env)

if [ -z "${CHANSU_PULLED:-}" ]; then
  # 빌드는 작업 폴더를 그대로 쓰므로 커밋하지 않은 변경도 함께 올라간다. 멈추지는 않고 알린다.
  if [ -n "$(git status --porcelain)" ]; then
    echo '주의: 커밋하지 않은 변경이 있습니다. 이 변경도 함께 올라갑니다.' >&2
    git status --short >&2
  fi
  git pull --ff-only
  # 받은 update.sh로 처음부터 다시 돈다. 받기로 이 스크립트가 바뀌었으면 새 단계를 따른다.
  CHANSU_PULLED=1 exec bash deploy/update.sh
fi

npm ci
# 1단계 서버는 책 묶음을 읽는다. 2단계 Task 9부터는 npm run pipeline -- publish로 바뀐다.
npm run pipeline -- build
"${compose[@]}" up -d --build
# 서버는 시작할 때 묶음을 읽는다. 입구(Caddy)는 관리 API를 꺼 두어 바뀐 설정을 다시 읽을 길이 없다. 둘 다 다시 띄운다.
"${compose[@]}" restart server caddy

hint="로그: ${compose[*]} logs server caddy"
# 입구가 맥미니에 연 주소를 Compose에게 묻는다(예: 127.0.0.1:8443).
addr=$("${compose[@]}" port caddy 80) || { echo "입구(caddy)의 주소를 알 수 없습니다. $hint" >&2; exit 1; }
for i in {1..30}; do
  # 뜨는 동안의 실패는 조용히 넘긴다. 입구, 서버, DB가 모두 답해야 성공이다.
  if curl -fs --max-time 5 "http://${addr}/health" >/dev/null; then
    echo "서버가 떴습니다: http://${addr}/health"
    # 질문하기가 책 묶음을 읽었는지("질문하기: 책 N권…") 서버 로그 끝을 보여 준다.
    "${compose[@]}" logs --tail 5 server
    exit 0
  fi
  if [ "$i" -lt 30 ]; then sleep 2; fi
done
echo "서버 상태 확인에 실패했습니다. $hint" >&2
exit 1
