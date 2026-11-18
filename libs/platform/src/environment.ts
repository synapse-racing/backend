import { isIP } from 'node:net';

const environments = ['development', 'test', 'production'] as const;
const exampleSecrets = new Set([
  'replace-with-an-access-secret-of-at-least-32-characters',
  'replace-with-a-different-refresh-secret-of-at-least-32-characters',
  'synapse-local-access-secret-change-me-2026',
  'synapse-local-refresh-secret-change-me-2026',
]);

export function parseTrustedProxies(value: unknown): string[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string')
    throw new Error('TRUST_PROXY must be a list of IP addresses or CIDRs');
  const proxies = value.split(',').map((entry) => entry.trim());
  for (const entry of proxies) {
    const [address, prefix, ...extra] = entry.split('/');
    const family = isIP(address);
    if (
      !family ||
      extra.length ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (family === 4 ? 32 : 128)))
    ) {
      throw new Error(
        'TRUST_PROXY must list only trusted proxy IP addresses or CIDRs',
      );
    }
  }
  return proxies;
}

function requireUrl(config: Record<string, unknown>, key: string): string {
  const value = config[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} is required`);
  }

  try {
    new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }

  return value;
}

function requireSecret(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.length < 32) {
    throw new Error(`${key} must contain at least 32 characters`);
  }

  return value;
}

function parsePositiveInteger(
  config: Record<string, unknown>,
  key: string,
  defaultValue: number,
): number {
  const value = Number(config[key] ?? defaultValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }

  return value;
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error('SWAGGER_ENABLED must be true or false');
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnvironment = config.NODE_ENV ?? 'development';
  if (
    typeof nodeEnvironment !== 'string' ||
    !environments.includes(nodeEnvironment as (typeof environments)[number])
  ) {
    throw new Error(`NODE_ENV must be one of: ${environments.join(', ')}`);
  }

  const port = Number(config.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const frontendUrl = requireUrl(config, 'FRONTEND_URL');
  const frontend = new URL(frontendUrl);
  if (
    frontendUrl !== frontend.origin ||
    !['http:', 'https:'].includes(frontend.protocol)
  ) {
    throw new Error('FRONTEND_URL must be an HTTP(S) origin without a path');
  }
  if (nodeEnvironment === 'production' && frontend.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use HTTPS in production');
  }
  const databaseUrl = requireUrl(config, 'DATABASE_URL');
  if (
    !/^mongodb(?:\+srv)?:\/\//.test(databaseUrl) ||
    new URL(databaseUrl).pathname.replace(/^\//, '').length === 0
  ) {
    throw new Error(
      'DATABASE_URL must be a MongoDB URL with an explicit database name',
    );
  }

  const accessSecret = requireSecret(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = requireSecret(config, 'JWT_REFRESH_SECRET');
  if (accessSecret === refreshSecret) {
    throw new Error('JWT access and refresh secrets must be different');
  }
  if (
    nodeEnvironment === 'production' &&
    [accessSecret, refreshSecret].some((secret) => exampleSecrets.has(secret))
  ) {
    throw new Error(
      'Replace the example JWT secrets before running in production',
    );
  }

  return {
    ...config,
    NODE_ENV: nodeEnvironment,
    TRUST_PROXY: parseTrustedProxies(config.TRUST_PROXY),
    SWAGGER_ENABLED: parseBoolean(
      config.SWAGGER_ENABLED,
      nodeEnvironment !== 'production',
    ),
    PORT: port,
    FRONTEND_URL: frontendUrl,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_TTL_SECONDS: parsePositiveInteger(
      config,
      'JWT_ACCESS_TTL_SECONDS',
      900,
    ),
    JWT_REFRESH_TTL_DAYS: parsePositiveInteger(
      config,
      'JWT_REFRESH_TTL_DAYS',
      30,
    ),
  };
}
