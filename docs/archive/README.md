# Archivo histórico

sqlite-migrations/ conserva las migraciones de la antigua versión SQLite. No forman parte del esquema actual ni deben ejecutarse contra MongoDB.

El esquema vigente usa MongoDB y se define en prisma/schema.prisma. Prisma Client se genera con pnpm prisma:generate; db push sincroniza el esquema y los índices con un destino MongoDB conocido. Consulta README.md y DEPLOYMENT.md.

Las bases SQLite locales se conservan como datos del usuario; este archivo no autoriza eliminarlas.
