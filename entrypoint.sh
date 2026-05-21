#!/bin/sh
set -e

REGION="${AWS_REGION:-us-east-1}"

# === Claude OAuth credentials → /root/.claude/.credentials.json ===
# 현재는 infra MCP의 SSM 경로 공유 (Option A). 향후 /rorr/claude/credentials로 마이그 가능.
SSM_CLAUDE="${SSM_CLAUDE_PATH:-/rorr-mcp-infra/claude-credentials}"
CLAUDE_DIR="${HOME:-/home/node}/.claude"
mkdir -p "$CLAUDE_DIR"
CREDS=$(aws ssm get-parameter --name "$SSM_CLAUDE" --with-decryption --region "$REGION" --query 'Parameter.Value' --output text 2>/dev/null || true)
if [ -n "$CREDS" ]; then
  printf '%s' "$CREDS" > "$CLAUDE_DIR/.credentials.json"
  chmod 600 "$CLAUDE_DIR/.credentials.json"
  echo "[entrypoint] Claude OAuth credentials installed (from $SSM_CLAUDE)"
else
  echo "[entrypoint] WARN: SSM $SSM_CLAUDE empty — claude CLI may fail"
fi

# === GitHub PAT for source repo (piecomp/backend-lol-api-v3 read) ===
SSM_SRC_PAT="/backend-migration-mcp/github-source-token"
SRC_PAT=$(aws ssm get-parameter --name "$SSM_SRC_PAT" --with-decryption --region "$REGION" --query 'Parameter.Value' --output text 2>/dev/null || true)
if [ -n "$SRC_PAT" ]; then
  export GITHUB_PAT="$SRC_PAT"
  echo "[entrypoint] GITHUB_PAT loaded (source repo PAT)"
fi

exec node /app/index.js
