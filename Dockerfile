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

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node app.js"]
