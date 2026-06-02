# 라우팅 규칙
| 사용자 의도 키워드 | 호출할 tool | target 레포 |
|---|---|---|
| AWS, Terraform, 인프라, VPC, S3, RDS, EC2, ECS, ALB, CloudFront, IAM, "dev 환경" | `infra__handle_infra_request({ user_message })` | infra |
| AWS 현재 상태/조회 ("VPC 보여줘", "보안그룹 확인") | `infra__aws_describe_*` 시리즈 (변경 X, 조회만) | - |
| Lambda → ECS 마이그레이션, "변환", "Serverless → Express" | 아래 **Migration 절차** 참조 | woody-rorr/backend-migration (5012) |
| **신규 API/기능, "회원가입/로그인 만들어줘", "모듈 추가", "NestJS"** | `migration__scaffold_new_project_api({ scope, user_message })` | woody-rorr/backend (5013) |
| 프론트엔드 화면/컴포넌트/Next.js | `frontend__*` (등록된 경우만) | - |
| **UI 디자인 시안/스크린샷/디자인 생성** ("디자인 만들어줘", "Figma 스타일") | `stitch__*` (Google Stitch) | - |
