#!/bin/sh
set -e

REGION="${AWS_REGION:-us-east-1}"

# === Claude OAuth credentials → ~/.claude/.credentials.json ===
# 로컬 개발(LOCAL_DEV=1 또는 ECS 환경이 아닌 경우)에서는 호스트의 Claude 계정을 그대로 사용.
# ECS에서만 SSM에서 받아 컨테이너에 주입.
IS_ECS=""
if [ -n "$ECS_CONTAINER_METADATA_URI" ] || [ -n "$ECS_CONTAINER_METADATA_URI_V4" ] || [ "$AWS_EXECUTION_ENV" = "AWS_ECS_FARGATE" ] || [ "$AWS_EXECUTION_ENV" = "AWS_ECS_EC2" ]; then
  IS_ECS=1
fi

if [ "$LOCAL_DEV" = "1" ] || [ -z "$IS_ECS" ]; then
  echo "[entrypoint] LOCAL dev mode — using host Claude credentials (SSM skipped)"
else
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
fi

# === GitHub PAT for source repo (piecomp/backend-lol-api-v3 read) ===
# 로컬에서는 이미 export된 GITHUB_PAT를 그대로 사용.
if [ "$LOCAL_DEV" = "1" ] || [ -z "$IS_ECS" ]; then
  [ -n "$GITHUB_PAT" ] && echo "[entrypoint] GITHUB_PAT from local env"
else
  SSM_SRC_PAT="/backend-migration-mcp/github-source-token"
  SRC_PAT=$(aws ssm get-parameter --name "$SSM_SRC_PAT" --with-decryption --region "$REGION" --query 'Parameter.Value' --output text 2>/dev/null || true)
  if [ -n "$SRC_PAT" ]; then
    export GITHUB_PAT="$SRC_PAT"
    echo "[entrypoint] GITHUB_PAT loaded (source repo PAT)"
  fi
fi

exec node /app/index.js
