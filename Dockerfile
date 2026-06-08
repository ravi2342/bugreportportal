FROM node:24-alpine AS deps

WORKDIR /app

COPY package*.json ./

# Install only production dependencies, then add Prisma CLI required for generate/migrate.
RUN npm ci --omit=dev && \
	npm install --no-save prisma@7.8.0 && \
	npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node app.js"]
