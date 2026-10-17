# API de RegalaleBitcoin para Cloud Run. Se construye desde la raíz del repo:
#   docker build -f apps/api/Dockerfile .
FROM node:24-slim
WORKDIR /app
RUN corepack enable
# Manifiestos de todo el workspace: el lockfile los referencia.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
RUN pnpm install --frozen-lockfile --prod --filter "@regalale/api..."
COPY packages/core/src packages/core/src
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
ENV NODE_ENV=production
USER node
CMD ["node", "apps/api/src/main.ts"]
