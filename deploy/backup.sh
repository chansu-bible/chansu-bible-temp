#!/usr/bin/env bash
# DB 전체(동기화 기록과 키클락 계정)를 압축해 백업하고 14일보다 오래된 것은 지운다.
set -euo pipefail
# launchd의 PATH에는 docker가 없을 수 있다. OrbStack, Docker Desktop, Homebrew의 자리를 더한다.
export PATH="$HOME/.orbstack/bin:$HOME/.docker/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
# 백업에는 계정 정보가 들어 있으니 만든 사람만 읽게 한다.
umask 077
dir="${BACKUP_DIR:-$HOME/chansu-backups}"
mkdir -p "$dir"
# find에는 "$dir/"를 넘긴다. 백업 폴더가 다른 곳을 가리키는 링크여도 그 안을 본다.
# 전에 끊긴 백업이 남긴 임시 파일 중 하루(1440분)가 넘은 것을 지운다. 지금 도는 다른 백업의 것은 건드리지 않는다.
find "$dir/" -maxdepth 1 -type f -name 'chansu-*.sql.gz.tmp' -mmin +1440 -delete || echo '주의: 끊긴 백업의 임시 파일을 지우지 못했습니다.' >&2
file="$dir/chansu-$(date +%Y%m%d-%H%M%S).sql.gz"
# 도중에 실패하면 덜 쓴 임시 파일을 지운다. 성공했으면 이름이 이미 바뀌어 지울 것이 없다.
trap 'rm -f "$file.tmp"' EXIT
docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db pg_dumpall -U chansu | gzip > "$file.tmp"
mv "$file.tmp" "$file"
# 정리하다 실패해도 백업이 된 것은 보이게 먼저 알린다.
echo "백업: $file"
# 이번 백업이 성공했을 때만 지운다. 이 폴더 바로 아래의 일반 파일만 지운다.
find "$dir/" -maxdepth 1 -type f -name 'chansu-*.sql.gz' -mtime +14 -delete
