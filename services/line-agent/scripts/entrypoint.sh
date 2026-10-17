#!/bin/sh
set -eu
# A new persistent volume can be root-owned after it replaces the image folder.
mkdir -p /data
chown node:node /data
chmod 700 /data
gosu node node scripts/backup-before-manual-images.mjs
exec gosu node node src/server.mjs
