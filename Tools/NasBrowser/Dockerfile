# First run node Tools/NasBrowser/build.mjs; the context contains only the prepared tool.
FROM node:22-bookworm-slim
WORKDIR /app
COPY dist ./dist
ENV NODE_ENV=production NAS_BROWSER_CONFIG=/config/config.json
USER node
EXPOSE 8790
CMD ["node", "dist/runtime/server.mjs"]
