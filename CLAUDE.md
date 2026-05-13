# rorr-orchestrator

회사 자체 ChatGPT-스타일 웹 UI + Bedrock(Claude) + 여러 MCP 서버 연결 백엔드.
브라우저에서 자연어 프롬프트를 받아 적절한 MCP의 tool을 호출, GitHub PR을 자동 생성합니다.

## 리소스 네이밍 (고정)

| 리소스 | 이름 |
|---|---|
| ECR 레포 | `rorr-orchestrator` |
| ECS Cluster | `mcp-agents-staging-cluster` (공유) |
| ECS Service | `rorr-orchestrator-service` |
| ECS Task Definition | `rorr-orchestrator-task` |
| ALB | `mcp-agents-staging-alb` (공유) |
| Target Group | `rorr-orchestrator-tg` |
| ALB 리스너 포트 | `4000` |
| 컨테이너 포트 | `4000` |
| CloudWatch 로그 그룹 | `/ecs/rorr-orchestrator` |
| Task Execution Role | `rorr-orchestrator-execution` |
| Task Role | `rorr-orchestrator-task` (Bedrock InvokeModel 권한 필수) |

## 환경변수 (ECS Task)

| 변수 | 설명 |
|---|---|
| `PORT` | `4000` |
| `LLM_PROVIDER` | `bedrock` |
| `AWS_REGION` | `us-east-1` |
| `LLM_MODEL` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `MCP_INFRA_URL` | infra MCP URL |
| `DEFAULT_USER_ID` | 임시 신원 (인증 붙기 전) |

## Task Role 권한
- `bedrock:InvokeModel`
- `bedrock:InvokeModelWithResponseStream`
- 모델 ARN: `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`
- 또는 inference profile: `arn:aws:bedrock:us-east-1:239460481239:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`

## 접속 URL (배포 후)
`http://<ALB DNS>:4000/`
