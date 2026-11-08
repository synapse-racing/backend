# Synapse Racing — backend

## Contexto y arquitectura

API NestJS para autenticación, apariencia de vehículos, persistencia NEAT y carreras multijugador autoritativas. El entrenamiento NEAT ocurre en el frontend; el servidor valida y guarda checkpoints, genomas y métricas, y ejecuta las carreras multijugador.

- Este archivo rige el repositorio. Las instrucciones del usuario tienen prioridad.
- Referencias actuales: código, prisma/schema.prisma, package.json, README.md y DEPLOYMENT.md. docs/archive/ solo conserva decisiones históricas.
- Repositorio complementario habitual: ../synapse-frontend. Comprueba su disponibilidad.
- Node.js 24, pnpm según packageManager y pnpm-lock.yaml. No añadas lockfiles de otros gestores.
- Base de datos actual: MongoDB con replica set, Prisma 6. No SQLite ni PostgreSQL. Las migraciones SQLite archivadas no se ejecutan.

## Mapa del código

Monorepo pnpm: `apps/` (servicios desplegables) y `libs/` (código compartido por todos). El paquete raíz solo orquesta scripts.

- apps/api: monolito completo (REST + Socket.IO) en el puerto 3000. Conserva el determinismo del comportamiento.
- apps/core-api: servicio REST sin estado (auth, usuarios, garaje, entrenamiento) en 3001.
- apps/multiplayer: servicio con estado Socket.IO (salas, carreras) en 3002.
- libs/platform: arranque común (app.setup, health, validación de entorno) y el bus de eventos Redis en libs/platform/src/bus.ts.
- libs/database: PrismaService (reintentos transaccionales) y DatabaseModule.
- libs/domain: dominio compartido de simulación: física, sensores, circuitos, checkpoints, apariencia y evaluación de genomas. Contrato de paridad con el frontend.
- libs/auth, libs/users, libs/training, libs/garage: módulos REST (controladores, DTO, servicios).
- libs/rooms: salas en memoria, gateway Socket.IO y autorización de acciones.
- prisma/schema.prisma: esquema vigente; docs/mongodb-examples.json: ejemplos de datos.
- test: E2E aislados con MongoDB temporal. Pruebas unitarias junto al código como *.spec.ts.
- deploy/pterodactyl, Dockerfile con ARG APP, docker-entrypoint.sh, docker/healthcheck.js y compose*.yaml: despliegue por app. compose.prod.yaml para el monolito y compose.dist.yaml para el modo distribuido.

## Reglas de implementación

- Mantén el monolito modular y sus capas. Controladores/gateway validan y delegan; servicios de aplicación coordinan; el dominio evita dependencias de transporte y persistencia.
- Los apps importan libs por `@synapse/*`. Un cambio de dominio o DTO se hace en la lib compartida, no copiado por app. Duplicar lógica rompe la paridad.
- Los eventos entre servicios se declaran con tipos en el bus (libs/platform/src/bus.ts) y se publican solo a través de él. Sin REDIS_URL el bus es no-op: siempre mantén comportamientos válidos en mono-instancia.
- El estado del juego vive en las salas del servicio multiplayer; el REST no escribe salas. El bus solo lleva eventos de sincronización como auth.session.logout.
- TypeScript estricto, DTO con class-validator y validación de límites en el servidor. No confíes en datos ni permisos enviados por el cliente.
- Protege acceso por usuario a entrenamientos y apariencia. Los permisos del anfitrión se comprueban en el servidor.
- Cambios en REST o Socket.IO deben revisar DTO, serialización, Swagger cuando aplique y tipos del frontend.
- Conserva códigos de error estables y no envíes trazas, secretos ni detalles internos. El frontend traduce los errores conocidos y muestra referencias en español; coordina cambios de códigos con su catálogo.
- No agregues dependencias ni refactorizaciones ajenas a la tarea. No sustituyas persistencia o versiones de simulación como parte de una limpieza.
- Nuevos eventos, variables de la ejecución o apps deben quedar en .env.example y .env.production.example cuando aplique.

## Invariantes del juego

- El servidor decide resultados. Las salas son efímeras en memoria; no prometas recuperación o persistencia que no existe.
- Salas de 2 a 64 jugadores, con capacidad entera validada. Solo el anfitrión modifica pista, velocidad o elimina autos.
- Entrenamiento y multijugador deben coincidir en física, sensores, checkpoints, progreso y terminación. Un cambio requiere revisar el contrato del frontend y ejecutar su script de paridad.
- Circuitos cerrados y deterministas por semilla, salida y meta compartidas; conserva versiones y compatibilidad de checkpoints.
- No introduzcas pilotos privilegiados, conducción asistida oculta ni resultados garantizados para genomas iniciales.
- Respeta el paso fijo de simulación, snapshots e interpolación cliente. La aceleración usa tiempo simulado, no cambia los resultados por FPS.
- Guarda checkpoint, métricas y resumen de generación de forma coherente y transaccional. Mantén validación de snapshots y aislamiento por usuario.

## Sesión, datos y despliegue

- JWT de acceso y cookie HttpOnly para renovación; contraseñas y tokens de renovación con hash. No registres tokens, cookies ni contraseñas.
- Sesiones simultáneas permitidas. Cerrar sesión revoca la sesión correspondiente; no reintroduzcas bloqueos globales ni por cuenta o IP sin solicitud explícita.
- No leas ni publiques .env para documentar configuración. Usa .env.example y .env.production.example; FRONTEND_URL requiere origen completo, con protocolo y puerto cuando aplique. REDIS_URL es opcional y activa el bus Redis entre servicios.
- Sin REDIS_URL cada servicio vive aislado y comparte estado solo si es el mismo proceso (monolito). No prometas sincronización entre procesos sin Redis.
- Conserva bases locales, copias de seguridad y volúmenes. No ejecutes reset, --accept-data-loss, limpieza de colecciones o cambios contra producción como comprobación rutinaria.
- MongoDB requiere replica set para transacciones. El esquema se sincroniza con Prisma db push; Prisma Migrate no se utiliza con este proveedor.
- No ejecutes db:push/db:deploy sin conocer el destino. Nunca uses la base del usuario para E2E.
- Mantén arranque no interactivo para Docker/Pterodactyl, PORT configurable y escucha en 0.0.0.0. No hardcodees hosts ni credenciales del hosting.

## Comprobación y entrega

- pnpm prisma:generate: genera Prisma Client; pnpm build: compila todo el workspace en orden de dependencias (build:api, build:core-api y build:multiplayer por app).
- pnpm lint: ESLint sin modificar archivos. pnpm test: unitarias por paquete tras compilar libs. pnpm test:e2e: E2E del monolito con replica set temporal privado mediante test/run-e2e.cjs; puede descargar el binario MongoDB.
- Ejecuta las apps en desarrollo con dev:api, dev:core-api o dev:multiplayer; arranca compilado con start:{app}.
- Ejecuta comprobaciones proporcionales al cambio. E2E solo mediante su runner aislado, no directamente contra DATABASE_URL del entorno.
- Para cambios de simulación, ejecuta pnpm test:race-parity desde el frontend (usa libs/domain del backend).
- Comunica resultados y bloqueos con precisión; no desactives validaciones para ocultar fallos.
- Antes de borrar, comprueba referencias en código, tests, scripts, CI, Docker y despliegues. No uses git clean ni reset --hard; preserva cambios del usuario, .env y datos.
- No versionar dist, node_modules, coverage, temporales, ZIP, logs o bases de datos. Usa tmp/ y exports/ para salidas locales.
- Crea ramas cuando se solicite; usa feat/, fix/ o chore/, sin prefijo codex. Commits breves en inglés con feat:, fix:, refactor:, chore: o docs:.
- Commit, push, despliegue y pruebas en hosting únicamente dentro del alcance autorizado. Revisa el diff antes de preparar commits.
- Mantén documentación breve y vigente; evita informes adicionales salvo solicitud.
