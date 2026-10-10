#!/usr/bin/env bash
# DB 전체(동기화 기록과 키클락 계정)를 압축해 백업하고 14일보다 오래된 것은 지운다.
set -euo pipefail
cd "$(dirname "$0")/.."
# 백업에는 계정 정보가 들어 있으니 만든 사람만 읽게 한다.
umask 077
dir="${BACKUP_DIR:-$HOME/chansu-backups}"
mkdir -p "$dir"
file="$dir/chansu-$(date +%Y%m%d-%H%M%S).sql.gz"
# 도중에 실패하면 덜 쓴 임시 파일을 지운다. 성공했으면 이름이 이미 바뀌어 지울 것이 없다.
trap 'rm -f "$file.tmp"' EXIT
docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db pg_dumpall -U chansu | gzip > "$file.tmp"
mv "$file.tmp" "$file"
# 이번 백업이 성공했을 때만 지운다. 이 폴더 바로 아래의 일반 파일만 지운다.
find "$dir" -maxdepth 1 -type f -name 'chansu-*.sql.gz' -mtime +14 -delete
echo "백업: $file"
