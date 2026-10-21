FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS build
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@11.25.0 --registry=$NPM_REGISTRY
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/console/package.json apps/console/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/channels/package.json packages/channels/package.json
COPY packages/plugin-sdk/package.json packages/plugin-sdk/package.json
COPY plugins/wecom-webhook/package.json plugins/wecom-webhook/package.json
COPY plugins/feishu-webhook/package.json plugins/feishu-webhook/package.json
COPY plugins/dingtalk-bot/package.json plugins/dingtalk-bot/package.json
COPY plugins/mock/package.json plugins/mock/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN --mount=type=cache,target=/pnpm/store pnpm install --store-dir=/pnpm/store --frozen-lockfile --registry=$NPM_REGISTRY --fetch-timeout=120000 --network-concurrency=12
COPY . .
RUN pnpm build
RUN pnpm test
RUN --mount=type=cache,target=/pnpm/store CI=true pnpm install --prod --store-dir=/pnpm/store --registry=$NPM_REGISTRY --frozen-lockfile --offline \
    && pnpm --filter @msgdock/database generate

FROM postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873 AS runtime
ARG ALPINE_MIRROR
RUN if [ -n "$ALPINE_MIRROR" ]; then sed -i "s|https://dl-cdn.alpinelinux.org/alpine|$ALPINE_MIRROR|g" /etc/apk/repositories; fi \
    && apk add --no-cache redis supervisor tini su-exec libstdc++ tzdata \
    && addgroup -g 1000 msgdock && adduser -D -u 1000 -G msgdock msgdock
WORKDIR /app
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/plugins ./plugins
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/worker ./apps/worker
COPY --from=build /app/apps/console/dist ./public
COPY --from=build /app/docs/openapi.json ./docs/openapi.json
COPY --from=build /app/LICENSE ./LICENSE
COPY deploy /app/deploy
RUN chmod +x /app/deploy/entrypoint.sh
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 CONSOLE_DIR=/app/public TZ=Asia/Shanghai
EXPOSE 3000
VOLUME ["/data"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 CMD node /app/deploy/healthcheck.cjs
ENTRYPOINT ["/sbin/tini","-g","--","/app/deploy/entrypoint.sh"]
