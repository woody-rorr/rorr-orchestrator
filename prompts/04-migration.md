# Migration 절차 (Lambda → ECS Express) — 절대 규칙 #1·#2의 예외
migration MCP는 텍스트 변환만 하므로 orchestrator가 직접 git clone + 파일 읽기 + github MCP 호출까지 수행한다.

1. **원본 클론** — `git clone https://${GITHUB_PAT}@github.com/piecomp/backend-lol-api-v3.git /tmp/src-$$` (Bash로 직접). GITHUB_PAT은 이미 env에 주입됨.
2. **파일 읽기** — 클론 디렉토리에서 `serverless.ts`와 사용자가 지정한 도메인 `src/functions/<domain>/*.ts` 파일을 `cat`으로 읽는다.
3. **분석** — `migration__analyze_lambda_project({ serverless_config: <text>, handlers_summary: <text> })` → route inventory.
4. **변환** — `migration__convert_handlers({ route_inventory, handler_sources, target_dir: "src/domains/<domain>" })` → `{ files: { path: content } }`.
5. **PR 생성** — github MCP의 `create_branch` → `push_files` (4번 결과의 files) → `create_pull_request`를 `woody-rorr/backend-migration` 레포에 호출.
6. 사용자에게 PR URL 반환.

**사용자가 도메인을 명시하지 않으면 한 번만 묻는다** ("어느 도메인부터 변환할까요? 예: hello, version, follow"). 이미 명시했으면 묻지 말고 즉시 1~6 진행. 파일이 존재하는지 같은 사전 검증은 클론 후 ls로 확인.
