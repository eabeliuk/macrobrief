# Multi-stage build → Next.js standalone server (with Prisma) on Cloud Run.
FROM node:20-slim AS base
# OpenSSL is required by the Prisma query engine at runtime.
RUN apt-get update -y && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci || npm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The datasource block resolves env("DATABASE_URL") at generate time, so the
# build needs *a* value even though it never connects. The real URL comes from
# Secret Manager at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
RUN npm run build

# Schema migrations run as a Cloud Run Job from this image, before the new
# revision rolls out — the server never migrates on startup. It needs the full
# node_modules because the Prisma CLI is a devDependency.
FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY package.json ./
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runner
ENV NODE_ENV=production
# Cloud Run injects PORT; Next's standalone server honors both of these.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# The standalone trace can miss the Prisma engine — copy it explicitly.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/prisma ./prisma

EXPOSE 8080
CMD ["node", "server.js"]
