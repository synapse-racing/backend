<p align="center">
  <img src="https://avatars.githubusercontent.com/u/315996143?s=240&v=4" alt="Synapse Racing" width="112" />
</p>

<h1 align="center">Synapse Racing — Backend</h1>

<p align="center">
  NestJS API for authentication, vehicle customization, NEAT training persistence, and authoritative multiplayer simulation.
</p>

<p align="center">
  <a href="https://github.com/synapse-racing">github.com/synapse-racing</a>
</p>

---

## Requirements

- Node.js 24 or higher
- Corepack enabled (`corepack enable`)
- MongoDB 8 with a replica set (required for multi-document transactions)

For local development, Docker Compose provides a single-node replica set:

```bash
docker compose up -d mongo
```

## Installation

```bash
corepack enable
pnpm install
```

Copy the environment template:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `SWAGGER_ENABLED` | `true` or `false`; defaults to enabled outside production |
| `PORT` | HTTP port (default `3000`) |
| `FRONTEND_URL` | Allowed CORS origin |
| `DATABASE_URL` | MongoDB connection string (must include replica set) |
| `JWT_ACCESS_SECRET` | At least 32 characters |
| `JWT_REFRESH_SECRET` | At least 32 characters, different from the access secret |
| `JWT_ACCESS_TTL_SECONDS` | Access token lifetime in seconds (default `900`) |
| `JWT_REFRESH_TTL_DAYS` | Refresh token lifetime in days (default `30`) |
| `REDIS_URL` | Optional; enables the Redis event bus across services |

## Database Setup

Generate the Prisma client after installing dependencies:

```bash
pnpm prisma:generate
```

Push the schema and create indexes on a fresh database:

```bash
pnpm db:push
```

> Synapse uses **MongoDB** as its database. Prisma Migrate is not used — schema changes are applied with `db push`. The `DATABASE_URL` must point to a MongoDB replica set; standalone instances do not support multi-document transactions.

### Collections

| Collection | Description |
|---|---|
| `users` | Accounts with hashed passwords and vehicle appearance |
| `refresh_sessions` | Active refresh tokens (stored as Argon2id hashes) |
| `training_runs` | NEAT run metadata, best genome, and NEAT config |
| `training_checkpoints` | Full population snapshots per generation |
| `generation_metrics` | Per-generation fitness, average, species count, duration |

Full example documents are available in [`docs/mongodb-examples.json`](docs/mongodb-examples.json).

## Running

```bash
pnpm dev:api        # Development (watch mode): monolithic API on :3000
pnpm start          # Production: compiled apps/api/dist/main.js
```

Each app can also run standalone:

```bash
pnpm dev:core-api   # REST service (auth, users, garage, training) on :3001
pnpm dev:multiplayer # Socket.IO race service on :3002
```

| Endpoint | URL |
|---|---|
| REST API | `http://localhost:3000/api` |
| Swagger UI | `http://localhost:3000/api/docs` _(production requires `SWAGGER_ENABLED=true`)_ |
| Health check | `http://localhost:3000/api/health` |
| Liveness | `http://localhost:3000/api/health/live` |
| Readiness | `http://localhost:3000/api/health/ready` |

## API Reference

### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Login and receive tokens |
| `POST` | `/api/auth/refresh` | Rotate the refresh token |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/auth/me` | Get the authenticated user's profile |

Access tokens are sent as `Bearer` JWT. Refresh tokens are rotated on each use, stored in an `HttpOnly` cookie, and persisted as Argon2id hashes. Multiple concurrent sessions per account are supported; logout only revokes the current session.

### Garage

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/users/me/appearance` | Get the equipped vehicle appearance |
| `PATCH` | `/api/users/me/appearance` | Save a new vehicle appearance |

Appearance covers vehicle model, paint color, finish type, and race number. Saved data is loaded by the frontend on every session restore and applied to the car in races and the training view.

### Training Runs

All endpoints require Bearer JWT and are scoped to the authenticated user.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/training-runs` | Create a new NEAT training run |
| `GET` | `/api/training-runs` | List all training runs |
| `GET` | `/api/training-runs/:id` | Get a training run by ID |
| `PATCH` | `/api/training-runs/:id/status` | Update run status |
| `DELETE` | `/api/training-runs/:id` | Delete a training run |
| `POST` | `/api/training-runs/:id/checkpoints` | Save a generation checkpoint |
| `GET` | `/api/training-runs/:id/checkpoints/latest` | Load the latest checkpoint |
| `GET` | `/api/training-runs/:id/metrics` | Get per-generation metrics history |
| `GET` | `/api/training-runs/:id/best-genome` | Get the best genome ever recorded |

Checkpoint, metric, and run summary are written atomically inside a Prisma transaction. Checkpoints store the full population, PRNG state, and innovation table to allow deterministic resumption.

### Multiplayer

Socket.IO namespace: `/multiplayer`. The access token must be sent in `auth.token` during the handshake.

| Event (emit) | Description |
|---|---|
| `room:create` | Create a new private room |
| `room:join` | Join a room by code |
| `room:leave` | Leave the current room |
| `player:ready` | Signal readiness to start |
| `race:start` | Start the race (host only) |
| `race:input` | Send steering/throttle/brake inputs |

| Event (receive) | Description |
|---|---|
| `race:snapshot` | Authoritative race state broadcast at 10 Hz |

The server runs the physics simulation at 20 Hz. Rooms are ephemeral and live in memory; they are destroyed when all players disconnect.

## Project Structure

pnpm workspace: `apps/` are deployable services, `libs/` is shared NestJS code imported as `@synapse/*`.

```
apps/
├── api/              # Monolithic backend: REST + Socket.IO (this is the default deploy)
├── core-api/         # Stateless REST service: auth, users, garage, training
└── multiplayer/      # Stateful Socket.IO race service
libs/
├── platform/         # Shared bootstrap, health endpoints, env validation, Redis event bus
├── database/         # PrismaService and DatabaseModule
├── domain/           # Race simulation contract shared with the frontend (race parity)
├── auth/             # JWT auth, refresh sessions, guards
├── users/            # User service
├── garage/           # Vehicle appearance persistence
├── training/         # Training run and checkpoint CRUD
└── rooms/            # In-memory rooms and the Socket.IO gateway
```

## Distributed mode

Splitting the backend into `core-api` and `multiplayer` requires a Redis instance for the event bus: set `REDIS_URL` (for example `redis://redis:6379`) in every service. Events currently keep logout in sync: when a session is revoked in `core-api`, the multiplayer service removes that player's cars from any room. Without `REDIS_URL` each isolated instance still works; deploy them as one process (`apps/api`) when you want identical multiplayer behavior to the monolith.

| Service | Port | Talk at | Notes |
|---|---|---|---|
| `core-api` | 3001 | `/api/auth`, `/api/users`, `/api/training-runs` | Needs MongoDB; pushes the schema on boot |
| `multiplayer` | 3002 | `/socket.io` (namespace `/multiplayer`) | Rooms are in memory; no schema push |

## Scripts

| Command | Description |
|---|---|
| `pnpm build` | Build every app and lib (`build:api`, `build:core-api`, `build:multiplayer` for a single app) |
| `pnpm start` | Run the built monolithic API (`start:core-api`, `start:multiplayer` for the split services) |
| `pnpm dev:api` | Monolithic API in watch mode (`dev:core-api`, `dev:multiplayer` for the split services) |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Auto-fix lint errors |
| `pnpm test` | Run Jest unit tests per package |
| `pnpm test:e2e` | Run end-to-end tests (spins up an in-memory MongoDB replica set) |
| `pnpm prisma:generate` | Generate Prisma Client |
| `pnpm db:push` | Push schema to the database and create indexes |
| `pnpm db:studio` | Open Prisma Studio |

> E2E tests use `mongodb-memory-server` and never touch the database configured in `.env`. The first run downloads the official MongoDB binary automatically.

## Docker

A single `Dockerfile` builds all three services; choose with `--build-arg APP`:

| File | Purpose |
|---|---|
| `compose.yaml` | Local development stack (MongoDB replica set + monolith) |
| `compose.prod.yaml` | Production stack (monolith + frontend) |
| `compose.dist.yaml` | Distributed stack (Mongo + Redis + core-api + multiplayer) |

```bash
# Development
docker compose up -d

# Production (monolith and distributed stacks)
docker compose --env-file .env -f compose.prod.yaml up -d --build --wait
docker compose --env-file .env -f compose.dist.yaml up -d --build --wait

# Individual service images
docker build --build-arg APP=core-api --tag synapse-core-api .
docker build --build-arg APP=multiplayer --tag synapse-multiplayer .
```

The Docker entrypoint runs `prisma db push --skip-generate` before starting any REST app; the multiplayer service starts directly since rooms are in memory. If index creation fails, the API will not start.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full instructions on TLS termination, Pterodactyl hosting, backups, and production environment variables.

## Repository guidance

See [AGENTS.md](AGENTS.md) for architecture, data protection, gameplay contracts and contributor rules. Former SQLite migrations are preserved in [docs/archive](docs/archive/README.md) and are not part of the active MongoDB schema.
