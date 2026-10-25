# syntax=docker/dockerfile:1
# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts --legacy-peer-deps && npx prisma generate

# ---- build ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy values so `next build` can evaluate server modules; real ones come from the runtime env.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" AUTH_SECRET="build-time-secret"
RUN npx prisma generate && npm run build

# ---- prisma cli (self-contained, for the boot-time schema sync) ----
FROM node:22-alpine AS prisma-cli
WORKDIR /opt/prisma
RUN apk add --no-cache libc6-compat openssl && npm init -y >/dev/null && npm i prisma@6.19.3 --no-audit --no-fund

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Generated Prisma client + engines for the app, and a self-contained Prisma CLI
# (with its own node_modules) so the entrypoint can sync the schema on boot.
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/manifold-3d ./node_modules/manifold-3d
COPY --from=prisma-cli /opt/prisma/node_modules /opt/prisma/node_modules
COPY docker-entrypoint.sh ./
RUN mkdir -p /data/storage && chown -R app:app /data /app && chmod +x docker-entrypoint.sh
USER app
EXPOSE 3000
VOLUME ["/data/storage"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
