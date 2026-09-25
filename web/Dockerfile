# Hunang public site. Multi-stage; ships the Next.js standalone output.
# The tier has no native dependencies — it only fetch()es the rollups API —
# so no build toolchain and no native module copying are needed.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
