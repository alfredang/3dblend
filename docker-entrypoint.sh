#!/bin/sh
set -e
echo "[3dblend] syncing database schema…"
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss
echo "[3dblend] starting (sample models are seeded on first page view unless SEED_ON_BOOT=0)"
exec "$@"
