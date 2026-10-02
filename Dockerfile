# Yggdrasil MCP server (stdio transport).
#
#   docker build -t yggdrasil-mcp .
#   docker run -i --rm yggdrasil-mcp        # -i is required: MCP speaks over stdin/stdout
#
# Plans are written to /home/node/.claude/plans inside the container (or to
# YGGDRASIL_PLANS_DIR when set); mount a volume there to keep them.

# Major tag: tracks Node 24 patch and security releases (matches .node-version / engines).
FROM node:24-alpine AS builder
WORKDIR /app

# Pinned Corepack, installed from npm: it downloads the pnpm version named in
# package.json "packageManager" and refuses it if the sha512 does not match.
RUN npm install -g corepack@0.36.0 && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# All sources are top-level *.ts files (tsconfig excludes vitest.config.ts and tests).
COPY tsconfig.json *.ts ./
RUN pnpm build && pnpm prune --prod --ignore-scripts

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# package.json is needed at runtime: "type": "module" makes dist/*.js load as ESM.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER node
ENTRYPOINT ["node", "dist/index.js"]
