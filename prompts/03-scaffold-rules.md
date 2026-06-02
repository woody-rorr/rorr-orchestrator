## scaffold_new_project_api 호출 원칙 (Critical)
- 한 호출 = 하나의 scope. 순서: `bootstrap → app-shell → database → module:<x> → (필요 시 auth) → publish`
- 결과 JSON의 `todo: ["next: <scope>"]` 가 오면 다음 scope를 **자동·즉시** 연속 호출. 사용자에게 묻지 않는다.
- 매 `module:<name>` 호출 시 누적 모듈 목록을 `extra_spec` 안에 `accumulated_modules: <콤마 구분>` 으로 넘긴다 (app.module.ts 자동 통합용).
- **마지막은 반드시 `scope: "publish"` 호출**. 이 호출 1회로 brand 생성·push·PR 생성까지 MCP가 다 한다.
  - `publish` 호출 시 `extra_spec` 에 이전 scope들에서 누적된 `files` 맵 전체를 JSON 으로 넣어 전달.
  - 응답의 `publish.pr_url` 을 사용자에게 그대로 보여준다.
- **orchestrator에는 github MCP가 등록돼 있지 않다**. PR 생성은 backend-migration-mcp 내부의 `publish` scope가 (자체 github MCP 연결로) 처리한다. orchestrator는 `publish` 호출만 하면 끝.
- **파일 개수·길이·복잡도를 이유로 publish 호출을 거부하지 않는다**. "수동으로 복사하시겠어요?", "핵심 파일만 먼저 올릴까요?", "전체 내용 제공할까요?" 같은 후퇴 제안 금지. publish 한 번이면 끝.
- 도중에 MCP 호출이 실패하면 정확한 에러를 그대로 전달하고 **같은 인자로 한 번만 재시도**. 사용자에게 우회 작업을 제안하지 않는다.
- "신규" vs "마이그레이션" 키워드 모호하면 사용자에게 한 번만 도메인 확인.

### publish 호출 사전 게이트 (Hard Rule — 위반 절대 금지)
publish scope 호출 직전, **아래 4가지 모두 충족해야** publish 호출 가능. 하나라도 불충족이면 publish 호출 금지하고 누락 scope를 먼저 호출.

1. **사용자 의도 모듈 ⊆ 누적 files** — 사용자 요청 ("Quiz API 만들어줘" → quiz)에서 추출한 모듈명마다 누적 `files` 맵 안에 `src/modules/<name>/` 경로 파일이 1개 이상 존재해야 함.
2. **module:* scope 1회 이상 실행** — 누적 호출 이력에 `module:<name>` 호출이 0건이면 publish 금지. 무조건 module:* 먼저.
3. **사용자가 "auth/로그인/회원가입" 언급 시** → 누적 files에 `src/modules/auth/` 가 있어야 함.
4. **누적 파일 수 ≥ 8** — 부트스트랩만(7~9개)으로 publish 되는 것 차단. 진짜 코드가 있으면 자연히 8개 이상.

위반 시 사용자에 "scope 누락: <X> 먼저 호출" 보고하고 누락 scope 호출로 복귀. 절대 publish로 점프 금지.

### single-shot 환각 차단 (Critical)
- "Quiz API 만들어줘" 같은 한 줄 요청도 **반드시 7단계 체인** (`bootstrap → app-shell → database → module:<name> → auth → tests:<name> → publish`) 전부 호출.
- "한 번에 끝내고 싶다"는 이유로 scope 건너뛰기 금지. 사용자가 "빨리"를 요구해도 단계 압축 금지.
- bootstrap 호출 응답에 `todo: ["next: app-shell"]` 가 오면 **반드시 app-shell 호출**. todo를 무시하고 publish 점프 금지.
- 각 scope 호출 후 응답의 `todo` 배열을 명시적으로 읽고 다음 scope 결정. todo 없으면 publish.

### 기존 레포 보호
- target 레포(`woody-rorr/backend`)는 **이미 부트스트랩이 존재**. 신규 API 요청에 `bootstrap` scope 호출 시 **MCP가 빈 파일에서 새로 생성한 부트스트랩이 기존 파일을 덮어쓰는 PR**이 생긴다.
- 따라서 신규 모듈 추가 요청(예: "Quiz API 추가")에서는 `bootstrap`, `app-shell`, `database` (테이블 신규일 때 제외) scope 호출 **생략**. 곧바로 `module:<name>` 부터 시작.
- `bootstrap`이 필요한 경우는 오직 **target 레포가 비어있는 첫 생성** 시점뿐. 사용자가 명시적으로 "프로젝트 처음부터 만들어줘"라고 한 경우만 bootstrap.

### publish 단일 호출 가드 (Hard Rule — 위반 시 PR 중복 생성)
한 사용자 요청(turn) 내에서 `scaffold_new_project_api({ scope: "publish" })` 호출은 **정확히 1회**만 허용. 위반 시 동일 코드가 별개 브랜치(`feature/...-<timestamp>`)로 중복 PR 생성됨 (관측 사례: 2026-05-31 PR #16, #17).

**규칙:**
1. publish 호출 후 응답에 `publish.pr_url` 또는 `pr_url` 또는 URL 문자열이 포함되면 → **즉시 종료**. 사용자에게 그 URL 그대로 전달하고 다른 도구 호출 금지.
2. publish 응답에 PR URL이 없거나 `todo: ["push failed"...]` / `todo: ["abort"...]` 가 오면 → **재호출 금지**. 사용자에게 실패 원인 그대로 보고하고 종료.
3. publish 호출 직후 "마무리 확인", "PR 잘 됐는지 검증", "한 번 더 publish해서 합치자", "다른 브랜치명으로 재시도" 등 **어떤 명목으로도 두 번째 publish 호출 금지**.
4. publish 응답이 길거나 모호해 보여도 **재호출 금지**. 그대로 사용자에 전달하고 사용자가 GitHub에서 확인하게 둔다.
5. 같은 turn 내 publish가 이미 호출됐는지 항상 자기 호출 이력을 점검. 이력에 있으면 호출 시도 자체 금지.

publish는 **idempotent하지 않다** — github_publish.md §6 retry 로직이 timestamp suffix 브랜치를 새로 만들기 때문. 한 번 호출 = 한 PR. 두 번 호출 = 두 PR.

### publish 호출 의무화 (Hard Rule — 위반 시 PR 누락)
오늘 발생한 사고: `module:user` 호출해서 코드 받은 뒤 **publish를 호출하지 않고** "PR을 직접 올리시면 됩니다"라고 사용자에게 떠넘김. 결과: 코드는 MCP 메모리에만 있고 어디에도 push되지 않음 (2026-06-01 노아님 case).

**규칙:**
1. `module:<name>` scope 호출했으면 **반드시 같은 turn 안에 `publish` scope까지 호출**. 중간에 종료 금지.
2. 사용자에게 "완료" 또는 성공 메시지 보내려면 **자기 응답 안에 실제 PR URL (https://github.com/...) 이 있어야 함**. PR URL 없이 "완료" 보고 금지.
3. **다음 문구는 절대 금지** (떠넘기 패턴):
   - "PR을 직접 올리시면 됩니다"
   - "백엔드 코드는 ... 저장소에 PR을 올리시면 됩니다"
   - "수동으로 push해주세요"
   - "사용자가 직접 github에 올리세요"
   이런 문구 자체가 publish 호출을 안 했다는 증거 — 즉시 publish 호출로 복귀.
4. publish 호출했는데 응답이 모호하거나 PR URL 없으면 → "publish 실패: <reason>" 정직 보고. 절대 "PR 생성됐다"고 환각하지 말 것.
5. 가짜/추측 PR URL (예: 실제 호출 안 한 결과의 URL) 출력 금지. github MCP의 실제 응답에 포함된 URL만 사용.
6. **사용자 의도 모듈이 1개라도 있으면 publish는 의무**. "그냥 코드만 보여달라"는 명시 요청 없는 한, scaffold 흐름은 PR 생성까지 가야 끝남.

위반 시 사용자에게 "publish 누락 감지 — PR 다시 생성합니다" 보고 후 publish 호출로 즉시 복귀.
