# rorr-orchestrator

회사 자체 ChatGPT-스타일 웹 UI + Bedrock(Claude) + 여러 MCP 서버 연결 백엔드.
브라우저에서 자연어 프롬프트를 받아 적절한 MCP의 tool을 호출, GitHub PR을 자동 생성합니다.

> ## 🧭 구조
> 사용자 → 오케스트레이터(이 서버, LLM 라우터) → 각 도메인 MCP(자체 LLM 내장) → GitHub PR

## 리소스 네이밍 (고정, 실제 배포된 값)

| 리소스 | 이름 |
|---|---|
| ECR 레포 | `rorr-orchestrator` |
| ECS Cluster | `mcp-agents-staging-cluster` (공유) |
| **ECS Service** | **`rorr-mcp-orchestrator-service`** |
| **ECS Task Definition** | **`rorr-mcp-orchestrator-task`** |
| ALB | `mcp-agents-staging-alb` (공유) |
| **Target Group** | **`rorr-mcp-orchestrator-tg`** |
| ALB 리스너 포트 | `4000` |
| 컨테이너 포트 | `4000` |
| **CloudWatch 로그 그룹** | **`/ecs/rorr-mcp-orchestrator`** |
| **Task Execution Role** | **`rorr-mcp-orchestrator-execution`** |
| **Task Role** | **`rorr-mcp-orchestrator-task`** (Bedrock InvokeModel 권한) |

## 환경변수 (ECS Task)

| 변수 | 값/설명 |
|---|---|
| `PORT` | `4000` |
| `LLM_PROVIDER` | `bedrock` |
| `AWS_REGION` | `us-east-1` |
| `LLM_MODEL` | `us.anthropic.claude-opus-4-5-20251101-v1:0` (또는 haiku) |
| `DEFAULT_USER_ID` | 임시 신원 (인증 붙기 전) |
| `MCP_INFRA_URL` | `http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com:5010/mcp` |
| `MCP_FRONTEND_WEB_URL` | `http://...:5004/mcp` (배포되면) |
| `MCP_FRONTEND_EXT_URL` | `http://...:5006/mcp` |
| `MCP_BACKEND_API_URL` | `http://...:5003/mcp` |
| `MCP_BACKEND_LOGIC_URL` | `http://...:5002/mcp` |
| `MCP_BACKEND_SCHEMA_URL` | `http://...:5001/mcp` |

## Task Role 권한 (필수)

```json
{
  "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
  "Resource": [
    "arn:aws:bedrock:*:239460481239:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
    "arn:aws:bedrock:*:239460481239:inference-profile/us.anthropic.claude-opus-4-5-20251101-v1:0",
    "arn:aws:bedrock:*::foundation-model/anthropic.claude-opus-4-5-20251101-v1:0"
  ]
}
```

⚠️ **region은 반드시 `*` (wildcard)**: cross-region inference profile (`us.*`)이 호출을 us-east-1/2/west-2 중 자동 라우팅하므로 단일 region 지정 시 거부됨.

## 네트워크 (필수 SG 규칙)

| SG | 인바운드 규칙 |
|---|---|
| `mcp-agents-staging-alb-sg` | TCP 4000 from `0.0.0.0/0` (외부 → ALB) |
| `mcp-agents-staging-ecs-sg` | TCP 4000 from `mcp-agents-staging-alb-sg` (ALB → Task) |

> 위 두 규칙이 없으면 ALB → Target 헬스체크 실패. 신규 포트 도입 시 반드시 같이 추가.

## 접속 URL

`http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com:4000/`

- `/` : 채팅 UI
- `/health` : 헬스체크
- `/mcps` : 연결된 MCP 카탈로그 + 도구 수
- `/chat` (POST) : 채팅 API

## 라우팅 동작 (chat.js 시스템 프롬프트)

- 인프라 요청 → `infra__handle_infra_request({ user_message })` 한 번만 호출 → infra MCP의 자체 LLM이 .tf + PR 처리
- 상태 조회 → `infra__aws_describe_*` 시리즈
- raw 호출 → `infra__create_pr` (직접 .tf 명시할 때)

## 향후 추가 (도메인 MCP 패턴)

각 도메인 MCP에 동일 패턴으로 `handle_<domain>_request` 추가:
- `frontend-web__handle_frontend_request`
- `backend-api__handle_backend_request`
- 등

오케스트레이터는 라우터로만, 도메인 지식/LLM은 각 MCP가 보유.

## 운영 흔히 발생하는 이슈

| 증상 | 원인 | 해결 |
|---|---|---|
| `Could not resolve credentials using profile: [rorr-dev]` | 코드에 `fromIni({profile})` 하드코딩, ECS엔 `~/.aws/credentials` 없음 | default credential chain 사용 (코드 `new BedrockRuntimeClient({ region })`만) |
| `bedrock:InvokeModel ... not authorized on ... us-east-2::...` | inference profile cross-region 라우팅, IAM region 고정 | IAM 정책 region을 `*`로 |
| `Server not initialized` (orchestrator → MCP) | MCP 재배포 후 오케스트레이터의 옛 세션 ID 무효 | 오케스트레이터 force-new-deployment |
| Target Health: unhealthy | SG에서 ALB→Task 포트 4000 차단 | Task SG에 인바운드 TCP 4000 from ALB SG 추가 |
| `LoadBalancerNotFound` (Terraform) | ARN 하드코딩 (DNS suffix와 ARN suffix 다름) | `data "aws_lb" "shared" { name = "..." }` 사용 |
| `data "aws_ecs_cluster"` 에러 | 인자 이름 잘못 (`name`) | `cluster_name`이 맞음 |
