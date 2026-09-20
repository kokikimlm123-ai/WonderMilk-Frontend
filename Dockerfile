FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates gosu && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/xlsx && /opt/xlsx/bin/pip install --no-cache-dir openpyxl==3.1.5
ENV PYTHON_BIN=/opt/xlsx/bin/python DATA_DIR=/data NODE_ENV=production
WORKDIR /app
COPY services/line-agent/package.json ./
COPY services/line-agent/src ./src
COPY services/line-agent/scripts ./scripts
RUN mkdir /data && chown -R node:node /app /data
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/entrypoint.sh"]
