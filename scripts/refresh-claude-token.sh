#!/usr/bin/env bash
# Claude OAuth 토큰을 macOS Keychain → SSM(여러 경로)에 업로드하고
# Claude를 쓰는 모든 MCP 서비스를 재배포.
#
# 전제:
#   1. 사전에 로컬에서 `claude`를 한 번 실행해 OAuth 갱신을 완료한 상태일 것.
#   2. AWS profile `rorr-dev` 가 설정되어 있을 것 (account 239460481239).
#
# 사용:
#   ./refresh-claude-token.sh

set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-rorr-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER="${ECS_CLUSTER:-mcp-agents-staging-cluster}"

# 동일한 Claude OAuth credentials를 동기화할 SSM 경로 목록
SSM_PATHS=(
  "/rorr-mcp-infra/claude-credentials"
  "/backend-migration-mcp/claude-credentials"
)

# (service, task-family) 쌍
SERVICES=(
  "rorr-mcp-orchestrator-service:rorr-mcp-orchestrator-task"
  "rorr-mcp-infra-service:rorr-mcp-infra-task"
  "backend-migration-mcp-service:backend-migration-mcp-task"
)

export AWS_PROFILE AWS_REGION

echo "▶ AWS account 확인"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "  → $ACCOUNT (profile=$AWS_PROFILE region=$AWS_REGION)"
if [[ "$ACCOUNT" != "239460481239" ]]; then
  echo "✖ 잘못된 계정. rorr-dev (239460481239)에 로그인되어 있어야 합니다." >&2
  exit 1
fi

echo "▶ Keychain에서 Claude credentials 읽기"
CREDS=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true)
if [[ -z "$CREDS" ]]; then
  echo "✖ Keychain에 'Claude Code-credentials' 항목이 없습니다." >&2
  echo "  먼저 로컬에서 'claude' 한번 실행해 로그인하세요." >&2
  exit 1
fi

EXPIRES_AT=$(echo "$CREDS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["claudeAiOauth"]["expiresAt"])' 2>/dev/null || echo "")
if [[ -n "$EXPIRES_AT" ]]; then
  NOW_MS=$(($(date +%s) * 1000))
  if (( EXPIRES_AT < NOW_MS )); then
    echo "✖ Keychain의 토큰이 이미 만료되었습니다 (expiresAt=$EXPIRES_AT)." >&2
    echo "  로컬에서 'claude' 한번 실행해 OAuth 갱신 후 다시 시도하세요." >&2
    exit 1
  fi
  echo "  → expiresAt=$EXPIRES_AT (유효)"
fi

for SSM_PATH in "${SSM_PATHS[@]}"; do
  echo "▶ SSM put-parameter: $SSM_PATH"
  aws ssm put-parameter \
    --name "$SSM_PATH" \
    --type SecureString \
    --value "$CREDS" \
    --overwrite \
    --region "$AWS_REGION" \
    --query '{Version:Version,Tier:Tier}' \
    --output table
done

SERVICE_NAMES=()
for ENTRY in "${SERVICES[@]}"; do
  SVC="${ENTRY%%:*}"
  SERVICE_NAMES+=("$SVC")
  echo "▶ ECS update-service: $SVC (force-new-deployment)"
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SVC" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --query 'service.{name:serviceName,td:taskDefinition,desired:desiredCount}' \
    --output table
done

echo "▶ 배포 진행 상태 (1회 스냅샷)"
aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "${SERVICE_NAMES[@]}" \
  --region "$AWS_REGION" \
  --query 'services[].{name:serviceName,deployments:deployments[].{status:status,rollout:rolloutState,running:runningCount,desired:desiredCount}}' \
  --output json

echo "✅ 완료. 2~3분 후 채팅 재시도하세요."
echo "   상태 재확인:"
echo "   aws ecs describe-services --cluster $CLUSTER --services ${SERVICE_NAMES[*]} --region $AWS_REGION --query 'services[].{name:serviceName,rollout:deployments[0].rolloutState,running:deployments[0].runningCount}'"
