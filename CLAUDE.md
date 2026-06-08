# rorr-orchestrator

회사 자체 ChatGPT-스타일 웹 UI + Claude Code CLI (OAuth) + 여러 MCP 서버 연결 백엔드.
브라우저에서 자연어 프롬프트를 받아 적절한 MCP의 tool을 호출, GitHub PR을 자동 생성합니다.

> ## 🧭 구조
> 사용자(GitHub OAuth 로그인) → 오케스트레이터(이 서버, claude CLI 라우터) → 각 도메인 MCP(자체 LLM 내장) → GitHub PR
>
> LLM은 Claude OAuth credentials(SSM SecureString)을 entrypoint가 컨테이너에 주입 → `claude` CLI가 사용. **Bedrock 미사용.**

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
| **Task Role** | **`rorr-mcp-orchestrator-task`** (SSM GetParameter 권한 — Claude OAuth + 사용자별 GitHub 토큰) |

## 환경변수 (ECS Task)

| 변수 | 값/설명 |
|---|---|
| `PORT` | `4000` |
| `AWS_REGION` | `us-east-1` |
| `SSM_CLAUDE_PATH` | (선택) Claude OAuth credentials SSM 경로. 기본 `/rorr-mcp-infra/claude-credentials` |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App (Sign in with GitHub) |
| `MCP_INFRA_URL` | `http://mcp-agents-staging-alb-249976027.us-east-1.elb.amazonaws.com:5010/mcp` |
| `MCP_FRONTEND_WEB_URL` | `http://...:5007/mcp` (웹) |
| `MCP_FRONTEND_EXT_URL` | `http://...:5006/mcp` (extension) |
| `MCP_BACKEND_NEW_URL` | `http://...:5019/mcp` (신규 API 서버) |
| `RORR_BOT_GATEWAY_URL` | RORR-Bot Gateway invoke 엔드포인트 (있어야 Teams 알림 활성). 예 `https://bot.rorr.club/tools/invoke` |
| `RORR_BOT_AGENT_ID` | (선택) `sessions_send` 대상 agentId. 기본 `main` |
| `SSM_RORR_BOT_TOKEN_PATH` | (선택) 게이트웨이 Bearer 토큰 SSM 경로. 기본 `/rorr/teams/bot-token` |

## DB (참고 — orchestrator는 직접 사용 안 함, 도메인 MCP/타깃 레포가 사용)

| 항목 | 값 |
|---|---|
| Aurora PostgreSQL (테스트) 엔드포인트 | `mcp-test.cluster-cwjiw4y08fiq.us-east-1.rds.amazonaws.com:5432` |

자격증명은 **SSM Parameter Store**에서 ECS task def `secrets`로 주입 (코드/파일에 박지 말 것):

**`backend` (신규 API, ECS :5019) 용**
| SSM 파라미터 | 매핑 환경변수 | 비고 |
|---|---|---|
| `/backend-api-service/db-host` | `DB_HOST` | String |
| `/backend-api-service/db-port` | `DB_PORT` | String (`5432`) |
| `/backend-api-service/db-name` | `DB_NAME` | String (`backend`) |
| `/backend-api-service/db-user` | `DB_USER` | String (`postgres`) |
| `/backend-api-service/db-password` | `DB_PASSWORD` | **SecureString** |
| `/backend-api-service/db-ssl` | `DB_SSL` | String (`true`) |
| `/backend-api-service/jwt-secret` | `JWT_SECRET` | **SecureString** |
| `/backend-api-service/jwt-expires-in` | `JWT_EXPIRES_IN` | String |

**`backend-migration` (Express, ECS :5012) 용**
| SSM 파라미터 | 매핑 환경변수 |
|---|---|
| `/backend-migration-api/database-url` | `DATABASE_URL` (통합 URL, SecureString) |
| `/backend-migration-api/db-host` / `db-port` / `db-name` / `db-user` / `db-pass` | 개별 변수 (택일) |

> Task Execution Role에 `ssm:GetParameters` + 해당 파라미터 ARN, password/jwt-secret은 `kms:Decrypt` 권한 필요.

## Task Role 권한 (필수)

```json
{
  "Action": ["ssm:GetParameter", "ssm:PutParameter"],
  "Resource": [
    "arn:aws:ssm:us-east-1:239460481239:parameter/rorr-mcp-infra/claude-credentials",
    "arn:aws:ssm:us-east-1:239460481239:parameter/rorr/session/secret",
    "arn:aws:ssm:us-east-1:239460481239:parameter/rorr/github/oauth/*",
    "arn:aws:ssm:us-east-1:239460481239:parameter/rorr/teams/bot-token"
  ]
}
```

- Claude OAuth credentials: 부팅 시 entrypoint가 SSM에서 받아 `~/.claude/.credentials.json`에 주입 → `claude` CLI 사용.
- 세션 비밀키: 쿠키 서명용 HMAC secret.
- GitHub OAuth 사용자 토큰: 로그인한 사용자별 access token을 `/rorr/github/oauth/<login>/access_token`에 저장/조회.
- Teams 봇 토큰: `/rorr/teams/bot-token`(SecureString). RORR-Bot Gateway(Mac mini) Bearer 토큰. PR 생성 성공 시 `notifyTeams.js`가 게이트웨이 `sessions_send`로 Teams 알림. 전송 시점에 `getSsm`으로 조회. 구조: 오케스트레이터(AWS) → Tailscale → RORR-Bot Gateway → Teams.

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
- 상태 조회 → `infra__aws_describe_*` 시리즈 (read-only)

### 절대 규칙 (orchestrator의 system prompt에 박혀 있음)
- 코드(.tf 등) 직접 생성 금지 → 도메인 MCP에 위임
- GitHub API/PR 직접 호출 금지 → 도메인 MCP가 내부에서 처리
- 도메인 MCP 결과는 가공 없이 사용자에게 그대로 전달
- 다중 도메인 요청은 도메인별로 순차 호출 (mega 요청 시도 금지)

## 향후 추가 (도메인 MCP 패턴)

각 도메인 MCP에 동일 패턴으로 `handle_<domain>_request` 추가:
- `frontend-web__handle_frontend_request`
- `backend-api__handle_backend_request`
- 등

오케스트레이터는 라우터로만, **도메인 지식·LLM·GitHub 클라이언트(자기 repo 1:1)는 각 도메인 MCP가 보유.**
→ orchestrator는 github MCP 직접 호출 안 함. 도메인 MCP가 자기 repo에 PR 띄움.

## 운영 흔히 발생하는 이슈

| 증상 | 원인 | 해결 |
|---|---|---|
| `claude exited 1: ... 401 Invalid authentication credentials` | SSM의 Claude OAuth access/refresh 토큰 만료 | 로컬에서 `claude` 한번 실행해 갱신 후 macOS Keychain → SSM put-parameter → ECS force-new-deployment |
| `--dangerously-skip-permissions cannot be used with root/sudo` | 컨테이너가 root로 실행 중 | Dockerfile에 `USER node` (또는 `RUN useradd ...`) 추가, credentials 경로도 `$HOME/.claude`로 |
| `Server not initialized` (orchestrator → MCP) | MCP 재배포 후 오케스트레이터의 옛 세션 ID 무효 | 오케스트레이터 force-new-deployment |
| Target Health: unhealthy | SG에서 ALB→Task 포트 4000 차단 | Task SG에 인바운드 TCP 4000 from ALB SG 추가 |
| `LoadBalancerNotFound` (Terraform) | ARN 하드코딩 (DNS suffix와 ARN suffix 다름) | `data "aws_lb" "shared" { name = "..." }` 사용 |
| `data "aws_ecs_cluster"` 에러 | 인자 이름 잘못 (`name`) | `cluster_name`이 맞음 |
