# 라우팅 규칙

## 최상위 원칙 — 토글 기준 전면 호출 (Top-Level Rule)

**사용자가 UI에서 ON 상태로 토글해놓은 MCP는 모든 작업 요청에 대해 빠짐없이 호출한다.** 키워드 매칭으로 일부 MCP를 임의로 제외하지 말 것.

- 단, "안녕", "고마워", "테스트" 같이 작업 의도가 없는 단순 대화/인사는 호출하지 않는다 (LLM이 작업 요청인지 1차 판단).
- 작업 의도가 인정되는 모든 프롬프트는 토글 ON인 MCP 전부에 순차 호출한다 — backend, web, extension, infra, migration 등.
- 각 MCP는 자기 도메인이 아닌 작업을 받으면 자체적으로 "해당 없음/스킵" 응답을 반환할 수 있다. 그건 MCP 자율로 둔다.
- 도메인 매칭이 모호해서 분석기가 망설여지면 **호출하는 쪽을 택한다.** 호출 누락 > 과호출.

## 도메인별 도구 매핑 (참고)

| 도메인 | 호출할 tool | target 레포 |
|---|---|---|
| AWS/Terraform/인프라 | `infra__handle_infra_request({ user_message })` | infra |
| AWS 상태 조회 | `infra__aws_describe_*` (read-only) | - |
| Lambda → ECS 마이그레이션 | Migration 절차 (별도 문서) | woody-rorr/backend-migration |
| 신규 API/모듈/기능 | `migration__scaffold_new_project_api({ scope, user_message })` | woody-rorr/backend (5013) |
| UI/페이지/컴포넌트 | `web__implement_and_pr({ user_message })`, `extension__implement_and_pr({ user_message })` | web, extension |

위 표는 **어느 MCP가 무엇을 하는지 안내용**이지, "이 키워드가 없으면 부르지 마라"는 의미가 아니다. 토글 ON이면 부른다.

## 외부 문서 링크 처리

### Notion MCP가 토글 ON인 경우 (2단계 파이프라인)
1. 사용자 프롬프트에 Notion 링크가 있거나, 명세가 모호하거나 ("그냥 만들어줘" 등), 사용자가 명시적으로 Notion 참조를 요청하면 → **Notion MCP를 먼저 호출해 페이지 내용을 가져온다.**
2. Notion MCP 응답에서 핵심 명세를 추출:
   - 백엔드 명세(엔드포인트/엔티티/마이그레이션/JWT/OAuth 등) 발견 → 토글 ON인 **backend MCP를 호출**할 user_message에 그 명세를 풀어 넣는다.
   - 프론트엔드 명세(페이지/컴포넌트/디자인) 발견 → 토글 ON인 **web/extension MCP**의 user_message에 풀어 넣는다.
   - 인프라 명세 발견 → infra MCP에 동일하게 풀어 넣는다.
3. 사용자가 "그냥 해줘"라고만 했어도 Notion에 백엔드 내용이 있으면 backend MCP를 자동 호출한다. **Notion 내용이 곧 명세**다.

### Notion MCP가 토글 OFF인 경우
- 도메인 MCP가 Notion을 직접 fetch 못 한다.
- 사용자에게 "Notion 페이지 내용을 본문에 풀어서 다시 요청해주세요" 안내, 또는 Notion MCP 토글을 켜달라고 안내.

### Confluence / Figma 등 기타 외부 문서
- 전용 MCP가 토글 ON이면 위 Notion 패턴과 동일하게 처리.
- 없으면 사용자에게 본문에 풀어 적어달라고 안내.

## 호출 순서
- 백엔드 → 프론트엔드 순으로 호출 (스키마/API 먼저 확정 후 UI가 그것을 참조하면 깔끔).
- 인프라가 포함되면 인프라 → 백엔드 → 프론트엔드.
- 단, 각 MCP는 독립적으로 자기 PR을 생성하므로 순서가 결과에 큰 영향을 주진 않는다.

## 결과 전달
- 각 MCP 응답은 가공 없이 사용자에게 그대로 보여준다.
- 일부 MCP가 실패해도 다른 MCP 결과는 표시한다.

## 절대 금지
- 분석기가 "이건 frontend만 필요해 보이니 backend는 빼자" 같은 임의 판단으로 토글 ON MCP 생략 금지.
- 코드(.tf/.ts 등) 직접 생성 금지 — 도메인 MCP에 위임.
- GitHub API/PR 직접 호출 금지 — 도메인 MCP가 처리.
