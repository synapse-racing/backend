#!/bin/sh
# Pterodactyl startup for the Synapse Racing monorepo, per deployable app.
#
# Upload the repo contents to /home/container and set SYNAPSE_APP to one of:
#   api         -> monolithic REST + multiplayer backend (default)
#   core-api    -> stateless REST service (auth, users, garage, training)
#   multiplayer -> stateful Socket.IO race service

set -eu

cd /home/container
export CI=true
export PORT="${SERVER_PORT:-${PORT:-3000}}"

# DATABASE_URL is read from .env by Prisma and NestJS.

# VortexSpace may save its pnpm bootstrap as an application dependency.
node <<'NODE'
const fs = require('node:fs');
const file = 'package.json';
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (manifest.name !== 'synapse-backend') {
  throw new Error('This startup script is only intended for synapse-backend');
}
const schemaPath = 'prisma/schema.prisma';
const apps = ['api', 'core-api', 'multiplayer'];
const app = process.env.SYNAPSE_APP ?? 'api';
if (!apps.includes(app)) {
  throw new Error(`SYNAPSE_APP must be one of: ${apps.join(', ')}`);
}
for (const candidate of apps) {
  if (!fs.existsSync(`apps/${candidate}/src/main.ts`)) {
    throw new Error(`apps/${candidate}/src/main.ts is missing. Upload the CONTENTS of the repo to /home/container: apps/, libs/, prisma/, package.json, tsconfig*.json and pnpm-workspace.yaml must be at the same level. Do not leave them inside synapse-backend-main/.`);
  }
}
if (app !== 'multiplayer' && !fs.existsSync(schemaPath)) {
  throw new Error('prisma/schema.prisma is missing. Sync it from the repo before starting any REST app.');
}
const schema = fs.existsSync(schemaPath)
  ? fs.readFileSync(schemaPath, 'utf8')
  : '';
if (schema && !/provider\s*=\s*"mongodb"/.test(schema)) {
  throw new Error('The active prisma/schema.prisma is not MongoDB. Replace it with the schema from migration/mongodb before starting.');
}
if (Object.hasOwn(manifest.dependencies ?? {}, 'pnpm')) {
  fs.copyFileSync(file, 'package.json.before-vortex-fix');
  delete manifest.dependencies.pnpm;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Removed VortexSpace pnpm dependency; preserved packageManager version.');
}
console.log(`Preparing Synapse app: ${app}`);
NODE

if [ -n "${SYNAPSE_APP:-}" ]; then
  export SYNAPSE_APP
else
  export SYNAPSE_APP=api
fi

echo "Installing workspace dependencies..."
NODE_ENV=development pnpm install --frozen-lockfile --prod=false

echo "Generating Prisma client..."
node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma

echo "Building @synapse/${SYNAPSE_APP} and its workspace libraries..."
pnpm --filter "@synapse/${SYNAPSE_APP}..." run build

if [ ! -f "apps/${SYNAPSE_APP}/dist/main.js" ]; then
  echo "Build did not produce /home/container/apps/${SYNAPSE_APP}/dist/main.js." >&2
  exit 1
fi

if [ "${SYNAPSE_APP}" != "multiplayer" ]; then
  echo "Preparing MongoDB indexes..."
  node node_modules/prisma/build/index.js db push --schema prisma/schema.prisma --skip-generate
fi

echo "Starting Synapse ${SYNAPSE_APP}..."
exec node "apps/${SYNAPSE_APP}/dist/main.js"
