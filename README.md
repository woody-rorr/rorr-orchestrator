# rorr-orchestrator

회사 자체 ChatGPT-스타일 채팅 UI + Claude Code CLI (OAuth) + 여러 MCP 서버 라우팅 백엔드.

## 역할
- 사용자 프롬프트 수신 (브라우저 → 이 서버)
- GitHub OAuth 로그인 + 세션 쿠키 (DB 없음, SSM에 사용자별 토큰 저장)
- `claude` CLI 호출 (Claude OAuth credentials, **Bedrock 미사용**)
- 여러 도메인 MCP를 `--mcp-config`로 동시 연결, 사용자 토큰을 `Authorization` 헤더로 전파
- Claude가 도메인 MCP의 `handle_<domain>_request` tool로 라우팅, 결과를 그대로 사용자에게 반환
- **GitHub API/PR 작업은 도메인 MCP가 자기 repo와 1:1로 처리** (orchestrator는 GitHub 직접 호출 안 함)

## 구조
```
.
├── index.js          ← Express 엔트리 (/, /me, /chat, /auth/*)
├── auth.js           ← GitHub OAuth (로그인/콜백/로그아웃)
├── session.js        ← HMAC 서명 쿠키 (DB 없음)
├── ssm.js            ← SSM Parameter Store 헬퍼 (60s 캐시)
├── chat.js           ← claude CLI spawn + --mcp-config 생성
├── mcpRegistry.js    ← env에서 도메인 MCP URL 카탈로그
├── entrypoint.sh     ← SSM → ~/.claude/.credentials.json 주입
├── Dockerfile        ← node:20 + claude CLI + AWS CLI, USER node
└── public/
    ├── login.html
    └── index.html
```

## 로컬 실행

```bash
cp .env.example .env
# .env에 GITHUB_OAUTH_CLIENT_ID / SECRET 등 채우기
# 로컬에서 한 번 `claude` 실행해 OAuth 토큰 준비 (Keychain 또는 ~/.claude/.credentials.json)

npm install
npm start
```

## 테스트

```bash
# 헬스
curl localhost:4000/health

# 로그인 (브라우저)
open http://localhost:4000/

# 채팅 (로그인 세션 쿠키 필요)
curl -X POST localhost:4000/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: rorr_session=..." \
  -d '{"messages":[{"role":"user","content":"dev에 테스트 S3 버킷 만들어줘"}]}'
```

## 운영
배포/네이밍/Task Role 권한 등 자세한 내용은 [CLAUDE.md](./CLAUDE.md) 참조.
