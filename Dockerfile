# Docker Hub rate-limits the shared GitHub runners (429), and AWS's mirror
# sometimes does too, so the workflows pick whichever mirror answers.
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-alpine
FROM ${NODE_IMAGE} AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
# npm workspaces: each extension with its own dependencies needs its package.json here.
COPY extensions/volume-discount-function/package.json extensions/volume-discount-function/
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE}
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
# The SQLite database lives on the volume mounted at /data, so offers and
# sessions survive deploys. prisma/dev.sqlite points there.
RUN mkdir -p /data && ln -sf /data/dev.sqlite /app/prisma/dev.sqlite
EXPOSE 3000
CMD ["npm", "run", "docker-start"]
