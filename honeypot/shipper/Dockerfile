# Hunang log shipper — tails Cowrie's JSON log, POSTs to the ingest API.
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src

# A newly-created named volume inherits this directory's ownership, allowing
# the non-root process to persist its retry queue and Cowrie read checkpoint.
RUN mkdir -p /state && chown node:node /state

# Runs as non-root; reads Cowrie logs and writes only its dedicated state volume.
USER node

# Invoke the local tsx binary directly rather than through npx. npx reaches
# out to the npm registry on startup, and on the locked-down sensor those
# connections are dropped by the egress firewall — harmless in itself, but it
# floods the kernel drop log with our own traffic, which is exactly the log an
# operator reads to spot an attacker attempting to pivot.
CMD ["node_modules/.bin/tsx", "src/shipper.ts"]
