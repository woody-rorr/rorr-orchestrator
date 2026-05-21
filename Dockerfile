FROM node:20-bookworm-slim

# AWS CLI (entrypoint이 SSM 호출에 사용) + Claude Code CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip ca-certificates awscli \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY index.js chat.js mcpRegistry.js mcpProbe.js auth.js session.js ssm.js entrypoint.sh ./
COPY public ./public

RUN chmod +x entrypoint.sh && chown -R node:node /app

USER node
EXPOSE 4000
CMD ["/bin/sh", "/app/entrypoint.sh"]
