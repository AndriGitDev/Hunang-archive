# Hunang ingest API + aggregation, for the local demo and self-hosted
# deployments. Production runs the same src/ as Vercel functions instead.
# Hardened: non-root, no native build toolchain (the Postgres driver is pure
# JavaScript, unlike the SQLite one this replaced).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS geoip
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends gzip \
    && rm -rf /var/lib/apt/lists/*
COPY scripts ./scripts
RUN node scripts/fetch-geoip.mjs

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV GEOIP_COUNTRY_DB=/app/geoip/country.mmdb
ENV GEOIP_ASN_DB=/app/geoip/asn.mmdb
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=geoip /app/geoip ./geoip
COPY package.json tsconfig.json ./
COPY src ./src
RUN chown -R node:node /app
USER node
EXPOSE 8400 8402
CMD ["node_modules/.bin/tsx", "src/index.ts"]
