#!/usr/bin/env bash
# Boxworld 관리자 비밀번호 변경 스크립트
# 사용법:
#   ./scripts/set-admin-pw.sh '새비밀번호'
#   또는 인자 없이 실행 시 프롬프트로 입력

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

NEW_PW="${1:-}"
if [ -z "$NEW_PW" ]; then
  read -r -s -p "새 관리자 비밀번호 (4~64자): " NEW_PW
  echo ""
  read -r -s -p "새 관리자 비밀번호 확인: " NEW_PW2
  echo ""
  if [ "$NEW_PW" != "$NEW_PW2" ]; then
    echo "오류: 비밀번호가 일치하지 않습니다." >&2
    exit 1
  fi
fi

if [ "${#NEW_PW}" -lt 4 ] || [ "${#NEW_PW}" -gt 64 ]; then
  echo "오류: 비밀번호는 4~64자 사이로 입력해주세요." >&2
  exit 1
fi

if printf '%s' "$NEW_PW" | grep -q $'\n'; then
  echo "오류: 비밀번호에 줄바꿈을 포함할 수 없습니다." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$APP_DIR/.env.example" ]; then
    cp "$APP_DIR/.env.example" "$ENV_FILE"
  else
    touch "$ENV_FILE"
  fi
fi

# Safely update or append ADMIN_PASSWORD via Node (avoids sed escaping bugs)
NEW_PW="$NEW_PW" ENV_FILE="$ENV_FILE" node -e '
  const fs = require("node:fs");
  const envFile = process.env.ENV_FILE;
  const newPw = process.env.NEW_PW;
  const lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  let replaced = false;
  const out = lines.map((line) => {
    if (/^\s*ADMIN_PASSWORD\s*=/.test(line)) {
      replaced = true;
      return `ADMIN_PASSWORD=${newPw}`;
    }
    return line;
  });
  if (!replaced) out.push(`ADMIN_PASSWORD=${newPw}`);
  const tmp = `${envFile}.tmp`;
  fs.writeFileSync(tmp, out.join("\n").replace(/\n+$/, "\n"), { mode: 0o600 });
  fs.renameSync(tmp, envFile);
  fs.chmodSync(envFile, 0o600);
'

echo "✅ .env 의 ADMIN_PASSWORD 를 변경했습니다."

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files boxworld.service >/dev/null 2>&1; then
  sudo systemctl restart boxworld.service
  echo "✅ boxworld.service 재시작 완료 ($(systemctl is-active boxworld.service))"
else
  echo "ℹ️ boxworld.service 가 감지되지 않아 자동 재시작을 건너뛰었습니다. 서버를 수동으로 재시작해주세요."
fi
