# Despliegue con MongoDB

El backend requiere MongoDB con replica set para guardar checkpoint, metrica y resumen en una transaccion y rotar sesiones de forma consistente. La migracion empieza con una base vacia; no importa SQLite.

## Variables

Usa `.env.example` como plantilla única: cópiala a `.env` (Pterodactyl) o pásla a Compose con `--env-file .env`. Define `DATABASE_URL`, secretos JWT distintos, el origen del frontend y, en modo distribuido, `REDIS_URL` en cada servicio. No guardes credenciales en Git.

```text
DATABASE_URL=mongodb://USER:PASSWORD@mongo.example.com:27017/synapse?authSource=admin&replicaSet=rs0&directConnection=true
```

Codifica usuario y clave como componentes URI. Ajusta `authSource` a la base donde se creo el usuario. Para produccion el usuario de la aplicacion necesita acceso a la base de Synapse y permiso para crear sus indices; no necesita administrar el replica set. `directConnection=true` sirve para un unico miembro detras de la asignacion de puertos de Pterodactyl. No ofrece conmutacion automatica entre nodos.

## Docker Compose

`compose.yaml` incluye un replica set de desarrollo sin autenticacion, publicado solo en localhost. No expongas ese servicio de desarrollo a Internet. `compose.prod.yaml` usa tu MongoDB externo y publica solo el frontend. `compose.dist.yaml` despliega el modo distribuido: Mongo local, Redis y los servicios `core-api` (:3001) y `multiplayer` (:3002).

```bash
docker compose --env-file .env -f compose.prod.yaml config
docker compose --env-file .env -f compose.prod.yaml up -d --build --wait
```

El entrypoint ejecuta `prisma db push --skip-generate`, sin `--accept-data-loss` ni reinicios de base. Si falla la preparacion de indices, no inicia la API. El servicio multiplayer no ejecuta migraciones: las salas viven en memoria. Cambios destructivos futuros requieren un procedimiento especifico revisado por separado.

### Modo distribuido

Con `compose.dist.yaml` ambos servicios comparten Mongo, Redis y los secretos JWT. Configura el proxy inverso del host para enrutar `/api/*` hacia `core-api` y `/socket.io/*` hacia `multiplayer`; compose publica ambos puertos solo en 127.0.0.1. `REDIS_URL` ya apunta al Redis del compose; sin el bus, los eventos entre servicios (como expulsar autos al cerrar sesion) no se propagan entre procesos.

## Pterodactyl (una app por servidor)

Importa `deploy/pterodactyl/egg-synapse-mongodb.json`. Copia `start-pterodactyl.sh` a `/home/container/start-pterodactyl.sh`, sube el codigo completo (sin `node_modules` ni `dist`) y configura `.env`. El script instala dependencias, genera Prisma, compila la app y sus libs, prepara los indices y la inicia.

El egg expone la variable de panel `SYNAPSE_APP` para elegir el servicio; no hace falta duplicar repos ni tocar el script:

| Servidor | `SYNAPSE_APP` | Variables imprescindibles | Notas |
|---|---|---|---|
| Backend unico | `api` (por defecto) | `DATABASE_URL`, secretos JWT, `FRONTEND_URL` | Monolito completo. La opcion mas simple. |
| REST | `core-api` | Las mismas + `REDIS_URL` si hay servidor de salas | Aplica el esquema al arrancar. Expone `/api/*`. |
| Salas | `multiplayer` | Las mismas + `REDIS_URL` si hay servidor REST | No aplica esquema. Expone `/socket.io`. |

Reglas del despliegue distribuido:

- Los servidores comparten la misma `DATABASE_URL` y exactamente los mismos secretos JWT. El de `multiplayer` necesita Mongo porque lee genomas de entrenamientos.
- `PORT` lo asigna el panel (`SERVER_PORT`); no lo fijes en `.env`.
- Define el mismo `REDIS_URL` en `core-api` y `multiplayer`. Sin Redis, cerrar sesion no expulsa los autos del jugador de las salas abiertas.
- El servidor del frontend sirve el build con la imagen Nginx del repo `synapse-frontend`. Su plantilla sustituye `CORE_API_UPSTREAM` y `MULTIPLAYER_UPSTREAM` al arrancar el contenedor: define en ese servidor el `IP:PUERTO` del servicio REST y del de salas. No hace falta reconstruir la imagen al cambiar de hosts.
- Si ese servidor no usa la imagen del repo, su proxy debe enrutar `/api/*` al REST y `/socket.io/*` al de salas, con upgrade de WebSocket:

```nginx
location /api/ {
  proxy_pass http://IP_CORE_API:PUERTO_CORE_API;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location /socket.io/ {
  proxy_pass http://IP_MULTIPLAYER:PUERTO_MULTIPLAYER;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Para redesplegar, sube solo el codigo actualizado y reinicia el servidor: el script reinstala, recompila y vuelve a preparar los indices. Conserva siempre tu `.env` privado. Para habilitar el replica set del MongoDB consulta [PTERODACTYL-MONGODB.md](deploy/pterodactyl/PTERODACTYL-MONGODB.md). No ejecutes el backend nuevo contra un MongoDB standalone.

## Documentación Swagger

Swagger está disponible en /api/docs y su esquema JSON en /api/docs-json. Por defecto se deshabilita en producción. Para habilitarlo explícitamente, cambia SWAGGER_ENABLED=true en tu `.env` y reinicia el backend. Para desactivarlo, usa false. Solo se aceptan true y false. La plantilla lo trae desactivado para no exponer la documentación accidentalmente en producción.

El script de Pterodactyl mantiene NODE_ENV=production; no es necesario cambiarlo. La variable de Swagger se carga por separado. Las variables configuradas en el panel tienen prioridad sobre .env: evita definir valores contradictorios en ambos sitios. La documentación no elimina la autenticación de los endpoints; utiliza Authorize con un access token para probar rutas protegidas.

## Verificacion y recuperacion

Comprueba `/api/health/ready`, registro, login, guardado y recuperacion de una generacion. Las pruebas e2e usan una base temporal local y nunca tu servidor externo. Conserva el servidor y los datos SQLite anteriores hasta aprobar el cambio; volver al codigo previo permite seguir usando esa base.

Realiza backups con `mongodump` y comprueba la restauracion con `mongorestore` en una base aparte. Para respaldos consistentes con escrituras concurrentes usa el procedimiento de backup del replica set y su oplog. Un replica set de un nodo permite transacciones, pero no aporta redundancia. Termina TLS en el proxy del frontend y protege la conexion a MongoDB con TLS o una red privada segun tu infraestructura.

## Evitar copias anidadas al subir un ZIP

Descarga la rama `migration/mongodb`, no `main`. Extrae el ZIP y sube el contenido de la carpeta del proyecto directamente a `/home/container`:

```text
/home/container/
  .env
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json
  start-pterodactyl.sh
  apps/
  libs/
  prisma/schema.prisma
```

No mezcles `apps/` o `libs/` de una version con `prisma/` de otra. El schema activo debe indicar `provider = "mongodb"`. No subas `node_modules`, `dist` ni archivos `.tsbuildinfo` del equipo local; se generan en el servidor. Conserva tu `.env` privado.

Un error de compilacion que menciona `synapse-backend-main/src/...`, combinado con `$runCommandRaw` inexistente o `bestGenome: null` incompatible, indica que se estan mezclando fuentes y un cliente Prisma relacional. La compilacion ahora incluye solo el directorio raiz `src/`, y el arranque comprueba el schema antes de instalar o generar Prisma. Esto detecta una subida incompleta; no reemplaza los archivos del despliegue automaticamente.
