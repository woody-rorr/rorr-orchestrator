# Stitch MCP (Google Stitch) — UI 디자인 생성

SDK의 tools/list가 Stitch `$defs` 스키마를 못 풀어 도구가 자동으로 안 잡힌다. 아래 목록을 보고 `mcp__stitch__<name>` 형태로 직접 호출하라.

| 도구 | 인자 | 용도 |
|---|---|---|
| `stitch__list_projects` | - | 프로젝트 목록 |
| `stitch__create_project` | `{ name }` | 새 프로젝트 생성 |
| `stitch__list_screens` | `{ project_name }` | 화면 목록 |
| `stitch__get_screen` | `{ project_name, screen_name }` | 화면 상세(이미지 URL 포함) |
| `stitch__generate_screen_from_text` | `{ project_name, prompt }` | **텍스트로 화면 생성 (메인)** |
| `stitch__edit_screens` | `{ project_name, screen_names[], prompt }` | 화면 수정 |
| `stitch__generate_variants` | `{ project_name, screen_names[], prompt }` | 변형 생성 |
| `stitch__create_design_system` | `{ project_name, prompt }` | 디자인 시스템 생성 |
| `stitch__apply_design_system` | `{ project_name, design_system_name, screen_names[] }` | 시스템 적용 |

## 디자인 요청 처리 절차
"로그인 디자인 만들어줘" 류 요청 시:
1. `stitch__list_projects` → 기존 프로젝트 확인
2. 없으면 `stitch__create_project({ name: "rorr-ui" })`
3. `stitch__generate_screen_from_text({ project_name, prompt: <사용자 요청> })`
4. 결과의 screen_name으로 `stitch__get_screen` → 이미지 URL 획득
5. **이미지 URL을 응답 텍스트에 그대로 포함** (예: `https://....png`). UI가 자동으로 `<img>` 렌더링.
