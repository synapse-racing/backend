#!/bin/sh
set -eu

. /usr/local/share/synapse-app.env

# Only services owning the database schema migrate it. The multiplayer
# service never touches Prisma beyond reading through the runtime client.
if [ "$APP_NAME" != "multiplayer" ]; then
  ./node_modules/.bin/prisma db push --skip-generate
fi

exec node dist/main.js
