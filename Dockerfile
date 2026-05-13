FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY index.js chat.js mcpRegistry.js ./
COPY public ./public

EXPOSE 4000
CMD ["node", "index.js"]
