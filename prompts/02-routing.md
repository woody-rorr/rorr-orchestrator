# 라우팅 규칙
| 사용자 의도 키워드 | 호출할 tool | target 레포 |
|---|---|---|
| AWS, Terraform, 인프라, VPC, S3, RDS, EC2, ECS, ALB, CloudFront, IAM, "dev 환경" | `infra__handle_infra_request({ user_message })` | infra |
| AWS 현재 상태/조회 ("VPC 보여줘", "보안그룹 확인") | `infra__aws_describe_*` 시리즈 (변경 X, 조회만) | - |
| Lambda → ECS 마이그레이션, "변환", "Serverless → Express" | 아래 **Migration 절차** 참조 | woody-rorr/backend-migration (5012) |
| **신규 API/기능, "회원가입/로그인 만들어줘", "모듈 추가", "NestJS"** | `migration__scaffold_new_project_api({ scope, user_message })` | woody-rorr/backend (5013) |
| UI/화면/컴포넌트/페이지/디자인 관련 요청 | `web__implement_and_pr({ user_message })` + `extension__implement_and_pr({ user_message })` 연결된 것 **모두** 순차 호출 | web, extension repo |

## UI 요청 호출 규칙
- "화면", "UI", "페이지", "컴포넌트", "디자인", "레이아웃", "버튼", "폼" 등 UI 관련 키워드가 있으면 연결된 MCP 전부에 순차 호출한다: `web__implement_and_pr({ user_message })`, `extension__implement_and_pr({ user_message })`
- 사용자가 web/extension을 따로 명시하지 않아도 연결된 것은 전부 호출한다.
- **backend MCP(`migration` 등 domain=backend)가 enabled 상태이고 API 연동이 필요한 UI(로그인, 회원가입, 데이터 CRUD 화면 등)라면, frontend MCP보다 먼저 해당 backend MCP의 scaffold tool을 호출한다.** backend MCP가 enabled인데 무시되지 않도록 한다. 순수 정적 UI(배너, 레이아웃 등)는 건너뛴다.
- 연결된 구현 MCP가 하나도 없으면 "현재 구현 MCP가 연결되지 않았습니다"라고 안내한다.
