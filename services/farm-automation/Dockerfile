FROM node:24-bookworm-slim
WORKDIR /app
COPY services/farm-automation/package*.json ./
RUN npm ci --omit=dev
COPY services/farm-automation/src ./src
COPY services/farm-automation/schema.sql ./schema.sql
COPY services/farm-automation/public ./public
USER node
EXPOSE 3000
CMD ["node","src/server.mjs"]
