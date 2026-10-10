#!/usr/bin/env bash
# 처음 띄운 뒤 한 번 돌린다: 관리자 realm(master)을 SSH 포트 전달 주소에서만 쓰게 한다.
# 관리 화면의 로그인은 master realm의 주소로 가는데, 그 주소는 밖(입구)에서 막혀 있기 때문이다.
# 임시 관리자를 지운 뒤에 다시 돌릴 때는 영구 관리자 이름을 붙인다(비밀번호는 묻는다): deploy/keycloak-admin.sh <이름>
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f deploy/.env ] || { echo 'deploy/.env가 없습니다. deploy/README.md의 설정부터 하세요.' >&2; exit 1; }
compose=(docker compose -f deploy/compose.yaml --env-file deploy/.env)

# 키클락이 맥미니에 연 포트(KC_ADMIN_PORT)를 Compose에게 묻는다.
port=$("${compose[@]}" port keycloak 8080 | sed 's/.*://') || port=
case "$port" in
  '' | *[!0-9]*) echo '키클락이 떠 있지 않습니다. deploy/README.md 6절대로 먼저 띄우세요.' >&2; exit 1 ;;
esac

user=${1:-}
password=
if [ -n "$user" ]; then
  IFS= read -rsp "${user}의 비밀번호: " password
  echo >&2
fi

# 비밀번호는 표준 입력으로 넘긴다. 명령줄과 화면에는 남기지 않는다.
printf '%s\n' "$password" | "${compose[@]}" exec -T -e "LOGIN_USER=$user" -e "FRONTEND_URL=http://127.0.0.1:${port}/auth" keycloak bash -c '
  set -euo pipefail
  IFS= read -r KC_CLI_PASSWORD || true
  if [ -z "$LOGIN_USER" ]; then
    # 처음에는 Compose가 넘긴 임시 관리자로 들어간다.
    LOGIN_USER=$KC_BOOTSTRAP_ADMIN_USERNAME
    KC_CLI_PASSWORD=$KC_BOOTSTRAP_ADMIN_PASSWORD
  fi
  export KC_CLI_PASSWORD
  kc=/opt/keycloak/bin/kcadm.sh
  conf=$(mktemp)
  trap "rm -f $conf" EXIT
  "$kc" config credentials --config "$conf" --server http://localhost:8080/auth --realm master --user "$LOGIN_USER" >/dev/null
  # master는 밖에 열리지 않으므로 HTTPS를 요구하지 않는다(SSH 포트 전달은 HTTP다).
  "$kc" update realms/master --config "$conf" -s "attributes.frontendUrl=$FRONTEND_URL" -s sslRequired=none -s bruteForceProtected=true
'
echo "관리자 realm의 주소를 http://127.0.0.1:${port}/auth로 바꿨습니다."
echo "PC에서 ssh -L ${port}:127.0.0.1:${port} mainserver로 연결하고 http://127.0.0.1:${port}/auth/admin을 여세요."
