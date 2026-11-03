# Synapse Racing — backend

## Contexto y arquitectura

API NestJS para autenticación, apariencia de vehículos, persistencia NEAT y carreras multijugador autoritativas. El entrenamiento NEAT ocurre en el frontend; el servidor valida y guarda checkpoints, genomas y métricas, y ejecuta las carreras multijugador.

- Este archivo rige el repositorio. Las instrucciones del usuario tienen prioridad.
- Referencias actuales: código, prisma/schema.prisma, package.json, README.md y DEPLOYMENT.md. docs/archive/ solo conserva decisiones históricas.
- Repositorio complementario habitual: ../synapse-frontend. Comprueba su disponibilidad.
- Node.js 24, pnpm según packageManager y pnpm-lock.yaml. No añadas lockfiles de otros gestores.
- Base de datos actual: MongoDB con replica set, Prisma 6. No SQLite ni PostgreSQL. Las migraciones SQLite archivadas no se ejecutan.

## Mapa del código

- src/main.ts y src/app.setup.ts: arranque, prefijo /api, CORS, cookies, seguridad, validación y Swagger.
- src/config: validación de variables de entorno.
- src/infrastructure/database: Prisma y conexión.
- src/modules/auth: JWT, sesiones de renovación, guards, DTO y controladores.
- src/modules/users: usuarios y apariencia de vehículos.
- src/modules/training: entrenamientos, checkpoints, genomas, métricas e importación del invitado.
- src/modules/multiplayer/application: salas y autorización de acciones.
- src/modules/multiplayer/domain: simulación, sensores, circuitos y evaluación de genomas.
- src/modules/multiplayer/presentation: gateway Socket.IO /multiplayer y DTO.
- prisma/schema.prisma: esquema vigente; docs/mongodb-examples.json: ejemplos de datos.
- test: E2E aislados con MongoDB temporal. Pruebas unitarias junto al código como *.spec.ts.
- deploy/pterodactyl, Dockerfile, docker-entrypoint.sh y compose*.yaml: despliegue.

## Reglas de implementación

- Mantén el monolito modular y sus capas. Controladores/gateway validan y delegan; servicios de aplicación coordinan; el dominio evita dependencias de transporte y persistencia.
- TypeScript estricto, DTO con class-validator y validación de límites en el servidor. No confíes en datos ni permisos enviados por el cliente.
- Protege acceso por usuario a entrenamientos y apariencia. Los permisos del anfitrión se comprueban en el servidor.
- Cambios en REST o Socket.IO deben revisar DTO, serialización, Swagger cuando aplique y tipos del frontend.
- Conserva códigos de error estables y no envíes trazas, secretos ni detalles internos. El frontend traduce los errores conocidos y muestra referencias en español; coordina cambios de códigos con su catálogo.
- No agregues dependencias ni refactorizaciones ajenas a la tarea. No sustituyas persistencia o versiones de simulación como parte de una limpieza.

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
- No leas ni publiques .env para documentar configuración. Usa .env.example y .env.production.example; FRONTEND_URL requiere origen completo, con protocolo y puerto cuando aplique.
- Conserva bases locales, copias de seguridad y volúmenes. No ejecutes reset, --accept-data-loss, limpieza de colecciones o cambios contra producción como comprobación rutinaria.
- MongoDB requiere replica set para transacciones. El esquema se sincroniza con Prisma db push; Prisma Migrate no se utiliza con este proveedor.
- No ejecutes db:push/db:deploy sin conocer el destino. Nunca uses la base del usuario para E2E.
- Mantén arranque no interactivo para Docker/Pterodactyl, PORT configurable y escucha en 0.0.0.0. No hardcodees hosts ni credenciales del hosting.

## Comprobación y entrega

- pnpm prisma:generate: genera Prisma Client; pnpm build: compila; pnpm lint: ESLint sin modificar archivos.
- pnpm test -- --runInBand: unitarias. pnpm test:e2e --runInBand: E2E con replica set temporal privado mediante test/run-e2e.cjs; puede descargar el binario MongoDB.
- Ejecuta comprobaciones proporcionales al cambio. E2E solo mediante su runner aislado, no directamente contra DATABASE_URL del entorno.
- Para cambios de simulación, ejecuta pnpm test:race-parity desde el frontend (acepta ruta al backend).
- Comunica resultados y bloqueos con precisión; no desactives validaciones para ocultar fallos.
- Antes de borrar, comprueba referencias en código, tests, scripts, CI, Docker y despliegues. No uses git clean ni reset --hard; preserva cambios del usuario, .env y datos.
- No versionar dist, node_modules, coverage, temporales, ZIP, logs o bases de datos. Usa tmp/ y exports/ para salidas locales.
- Crea ramas cuando se solicite; usa feat/, fix/ o chore/, sin prefijo codex. Commits breves en inglés con feat:, fix:, refactor:, chore: o docs:.
- Commit, push, despliegue y pruebas en hosting únicamente dentro del alcance autorizado. Revisa el diff antes de preparar commits.
- Mantén documentación breve y vigente; evita informes adicionales salvo solicitud.
