FROM node:24-alpine AS deps

# Patch OS packages to address CVEs flagged by Trivy (libcrypto3/libssl3, etc.)
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./

# Install only production dependencies, then add Prisma CLI required for generate/migrate.
RUN npm ci --omit=dev && \
	npm install --no-save prisma@7.8.0 && \
	npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

FROM node:24-alpine AS runner

# Patch OS packages and remove the globally-installed npm CLI (its bundled
# undici trips Trivy CVE-2026-12151; the runtime doesn't need npm because we
# invoke Prisma directly via its local bin).
RUN apk update && apk upgrade --no-cache && \
	rm -rf /usr/local/lib/node_modules/npm \
		   /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
		   /var/cache/apk/*

WORKDIR /app

ENV NODE_ENV=production

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 3000

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node app.js"]
