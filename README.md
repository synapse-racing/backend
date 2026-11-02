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
| `PORT` | HTTP port (default `3000`) |
| `FRONTEND_URL` | Allowed CORS origin |
| `DATABASE_URL` | MongoDB connection string (must include replica set) |
| `JWT_ACCESS_SECRET` | At least 32 characters |
| `JWT_REFRESH_SECRET` | At least 32 characters, different from the access secret |
| `JWT_ACCESS_TTL_SECONDS` | Access token lifetime in seconds (default `900`) |
| `JWT_REFRESH_TTL_DAYS` | Refresh token lifetime in days (default `30`) |

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
pnpm start:dev   # Development (watch mode)
pnpm start:prod  # Production (compiled dist)
```

| Endpoint | URL |
|---|---|
| REST API | `http://localhost:3000/api` |
| Swagger UI | `http://localhost:3000/api/docs` _(disabled in production)_ |
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

```
src/
├── config/               # Environment variable validation (Zod)
├── infrastructure/
│   └── database/         # Prisma service and connection management
└── modules/
    ├── auth/             # JWT auth, refresh session management
    │   ├── application/  # Use cases (register, login, refresh, logout)
    │   ├── domain/       # Auth entities and port interfaces
    │   ├── infrastructure/  # Guards, token strategies
    │   └── presentation/ # Auth controller, DTOs
    ├── garage/           # Vehicle appearance endpoint
    ├── multiplayer/      # Socket.IO gateway, rooms, authoritative simulation
    ├── training/         # Training run and checkpoint CRUD
    └── users/            # User service and appearance persistence
```

## Scripts

| Command | Description |
|---|---|
| `pnpm start:dev` | Start in watch mode |
| `pnpm start:prod` | Start compiled production build |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Auto-fix lint errors |
| `pnpm test` | Run Jest unit tests |
| `pnpm test:e2e` | Run end-to-end tests (spins up an in-memory MongoDB replica set) |
| `pnpm test:cov` | Run unit tests with coverage |
| `pnpm prisma:generate` | Generate Prisma Client |
| `pnpm db:push` | Push schema to the database and create indexes |
| `pnpm db:studio` | Open Prisma Studio |

> E2E tests use `mongodb-memory-server` and never touch the database configured in `.env`. The first run downloads the official MongoDB binary automatically.

## Docker

A `Dockerfile` and two Compose files are included:

| File | Purpose |
|---|---|
| `compose.yaml` | Local development stack (MongoDB replica set + backend) |
| `compose.prod.yaml` | Production stack (external MongoDB + frontend) |

```bash
# Development
docker compose up -d

# Production
docker compose --env-file .env.production -f compose.prod.yaml up -d --build --wait
```

The Docker entrypoint runs `prisma db push --skip-generate` before starting the API. If index creation fails, the API will not start.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full instructions on TLS termination, Pterodactyl hosting, backups, and production environment variables.
