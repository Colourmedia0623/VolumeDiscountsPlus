FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

COPY package.json package-lock.json ./
COPY extensions/volume-discount-function/package.json ./extensions/volume-discount-function/

# Build needs dev dependencies (Vite), so install everything, build, then prune.
RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

# The SQLite database lives on a persistent volume mounted at /data, so offers
# and sessions survive redeploys. prisma/dev.sqlite points there.
RUN mkdir -p /data && ln -sf /data/dev.sqlite /app/prisma/dev.sqlite
VOLUME /data

CMD ["npm", "run", "docker-start"]
