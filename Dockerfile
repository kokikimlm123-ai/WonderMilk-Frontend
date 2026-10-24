FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates gosu poppler-utils fonts-urw-base35 fonts-liberation fonts-noto-core libreoffice-writer libreoffice-calc libreoffice-impress && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/xlsx && /opt/xlsx/bin/pip install --no-cache-dir openpyxl==3.1.5 Pillow==11.3.0 reportlab==4.4.4
ENV PYTHON_BIN=/opt/xlsx/bin/python DATA_DIR=/data NODE_ENV=production
WORKDIR /app
COPY services/line-agent/package.json ./
COPY services/line-agent/src ./src
COPY services/line-agent/scripts ./scripts
RUN mkdir /data && chown -R node:node /app /data
EXPOSE 3000
ENTRYPOINT ["sh", "scripts/entrypoint.sh"]

