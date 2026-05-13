# rorr-orchestrator

회사 자체 ChatGPT 같은 채팅 UI + Claude API + 여러 MCP 서버 통합 백엔드.

## 역할
- 사용자 프롬프트 수신 (브라우저 → 이 서버)
- Claude API 호출 (Anthropic SDK)
- 여러 도메인 MCP에 동시 연결 (infra/backend/frontend)
- Claude의 tool_use를 적절한 MCP로 라우팅
- 결과를 사용자에게 반환

## 구조
\`\`\`
src/
├── index.js          ← Express 엔트리 (POST /chat)
├── mcpRegistry.js    ← 여러 MCP 연결/툴 통합
└── chat.js           ← Claude 호출 + tool_use 루프
\`\`\`

## 로컬 실행

\`\`\`bash
cp .env.example .env
# .env에 ANTHROPIC_API_KEY 등 채우기

npm install
npm run dev
\`\`\`

## 테스트

\`\`\`bash
# 헬스체크 (연결된 MCP 목록)
curl localhost:4000/health

# 채팅
curl -X POST localhost:4000/chat \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"dev에 테스트 S3 버킷 하나 만들고 PR 올려줘"}]}'
\`\`\`

## 다음 단계
1. ✅ 백엔드 동작 (MCP 호출 + Claude)
2. ⏳ Next.js 프론트엔드 (채팅 UI)
3. ⏳ GitHub OAuth 인증 → 사용자별 PAT로 MCP 호출
4. ⏳ ECS 배포 (chat.rorr.club)
