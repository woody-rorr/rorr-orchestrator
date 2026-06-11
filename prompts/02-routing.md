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
- 연결된 구현 MCP가 하나도 없으면 "현재 구현 MCP가 연결되지 않았습니다"라고 안내한다.

## 인증/계정 요청 호출 규칙 (UI 규칙과 병행)
- "로그인", "회원가입", "소셜 로그인", "OAuth"(Google/Apple/MS/Kakao/Naver 포함), "JWT", "토큰", "비밀번호 재설정", "이메일 인증" 등 인증·계정 관련 키워드가 있으면 **항상** backend MCP(`migration__scaffold_new_project_api`)도 함께 호출한다.
- "로그인 페이지", "회원가입 화면"처럼 UI 키워드와 결합돼도 마찬가지 — UI MCP와 backend MCP를 **모두** 순차 호출한다. UI만 호출하고 끝내지 말 것.
- 이유: 인증은 본질적으로 백엔드 API(OAuth 콜백, JWT 발급, 사용자 저장)가 필요하다. 페이지만 만들면 동작하지 않는 반쪽짜리 결과가 된다.

## 다중 도메인 분기 일반 규칙
- 한 프롬프트가 여러 도메인을 포함하면 (예: UI + API, 백엔드 + 인프라) 각 도메인 MCP를 **모두** 호출한다.
- 어느 한 도메인을 임의로 생략하지 말 것 — 사용자가 명시적으로 제외하지 않은 한 모두 처리한다.
- 외부 문서 링크(Notion/Confluence/Figma 등)는 도메인 MCP가 직접 못 읽으므로 본문에서 핵심 명세를 추출해 user_message에 풀어서 전달한다.
