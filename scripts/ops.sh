#!/usr/bin/env bash
# rorr-mcp-orchestrator-service 운영 헬퍼.
#
# 사용:
#   ./scripts/ops.sh status     # 배포/태스크/타겟 헬스 한눈에
#   ./scripts/ops.sh logs       # 최근 5분 로그 tail
#   ./scripts/ops.sh logs 30m   # 기간 지정 tail
#   ./scripts/ops.sh follow     # 실시간 follow
#   ./scripts/ops.sh redeploy   # force-new-deployment (확인 프롬프트)
#   ./scripts/ops.sh wait       # 배포 COMPLETED 될 때까지 폴링
#   ./scripts/ops.sh url        # 접속 URL 출력
#   ./scripts/ops.sh ssm        # 사용 중인 Claude SSM 파라미터 메타 표시
#   ./scripts/ops.sh events     # 최근 ECS 서비스 이벤트 10개

set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-rorr-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
CLUSTER="${ECS_CLUSTER:-mcp-agents-staging-cluster}"
SERVICE="${ECS_SERVICE:-rorr-mcp-orchestrator-service}"
LOG_GROUP="${LOG_GROUP:-/ecs/rorr-mcp-orchestrator}"
TG_NAME="${TG_NAME:-rorr-mcp-orchestrator-tg}"
ALB_URL="http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com:4000"

export AWS_PROFILE AWS_REGION

cmd="${1:-status}"
shift || true

aws_q() { aws "$@" --region "$AWS_REGION" --profile "$AWS_PROFILE"; }

case "$cmd" in
  status)
    echo "▶ Service"
    aws_q ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
      --query 'services[0].{name:serviceName,desired:desiredCount,running:runningCount,rollout:deployments[0].rolloutState,td:deployments[0].taskDefinition,updated:deployments[0].updatedAt}' \
      --output table

    echo "▶ Running tasks"
    TASKS=$(aws_q ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --query 'taskArns' --output text)
    if [[ -n "$TASKS" && "$TASKS" != "None" ]]; then
      aws_q ecs describe-tasks --cluster "$CLUSTER" --tasks $TASKS \
        --query 'tasks[].{task:taskArn,status:lastStatus,health:healthStatus,startedAt:startedAt,cpu:cpu,mem:memory}' \
        --output table
    fi

    echo "▶ Target health"
    TG_ARN=$(aws_q elbv2 describe-target-groups --names "$TG_NAME" --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "")
    if [[ -n "$TG_ARN" && "$TG_ARN" != "None" ]]; then
      aws_q elbv2 describe-target-health --target-group-arn "$TG_ARN" \
        --query 'TargetHealthDescriptions[].{target:Target.Id,port:Target.Port,state:TargetHealth.State,reason:TargetHealth.Reason}' \
        --output table
    fi

    echo "▶ URL: $ALB_URL"
    ;;

  logs)
    SINCE="${1:-5m}"
    aws_q logs tail "$LOG_GROUP" --since "$SINCE" --format short
    ;;

  follow)
    aws_q logs tail "$LOG_GROUP" --since 1m --follow --format short
    ;;

  redeploy)
    echo "⚠ '$SERVICE' force-new-deployment 진행할까요? (y/N)"
    read -r ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "취소."; exit 0; }
    aws_q ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --force-new-deployment \
      --query 'service.{name:serviceName,desired:desiredCount,td:taskDefinition}' --output table
    echo "✅ 트리거됨. 'ops.sh wait' 로 완료 대기 가능."
    ;;

  wait)
    echo "▶ 배포 완료 대기 중 (최대 10분)..."
    for i in $(seq 1 60); do
      STATE=$(aws_q ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
        --query 'services[0].deployments[0].rolloutState' --output text)
      RUN=$(aws_q ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
        --query 'services[0].runningCount' --output text)
      printf "\r  [%2ds] rollout=%s running=%s   " $((i*10)) "$STATE" "$RUN"
      if [[ "$STATE" == "COMPLETED" ]]; then echo; echo "✅ COMPLETED"; exit 0; fi
      if [[ "$STATE" == "FAILED" ]]; then echo; echo "✖ FAILED"; exit 1; fi
      sleep 10
    done
    echo; echo "✖ 타임아웃."; exit 1
    ;;

  url)
    echo "$ALB_URL"
    ;;

  ssm)
    SSM_PATH="${SSM_CLAUDE_PATH:-/rorr-mcp-infra/claude-credentials}"
    echo "▶ Claude SSM 파라미터: $SSM_PATH"
    aws_q ssm describe-parameters --filters "Key=Name,Values=$SSM_PATH" \
      --query 'Parameters[0].{Name:Name,Version:Version,LastModified:LastModifiedDate}' --output table
    ;;

  events)
    aws_q ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
      --query 'services[0].events[:10].[createdAt,message]' --output table
    ;;

  *)
    echo "사용법: $0 {status|logs [since]|follow|redeploy|wait|url|ssm|events}"
    exit 1
    ;;
esac
