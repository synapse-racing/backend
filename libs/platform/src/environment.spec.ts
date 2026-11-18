import { validateEnvironment } from './environment';

const settings = {
  FRONTEND_URL: 'https://game.example.com',
  DATABASE_URL: 'mongodb://127.0.0.1:27017/synapse_test',
  JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-32-characters',
  JWT_REFRESH_SECRET: 'test-refresh-secret-different-at-least-32-characters',
};

describe('Swagger configuration', () => {
  it.each([
    ['production', undefined, false],
    ['production', 'true', true],
    ['production', 'false', false],
    ['development', undefined, true],
    ['development', 'false', false],
    ['test', true, true],
    ['test', false, false],
  ])(
    'resolves %s with override %s to %s',
    (NODE_ENV, SWAGGER_ENABLED, expected) => {
      expect(
        validateEnvironment({ ...settings, NODE_ENV, SWAGGER_ENABLED })
          .SWAGGER_ENABLED,
      ).toBe(expected);
    },
  );

  it.each(['falsee', '1', 1, ''])(
    'rejects ambiguous values such as %s',
    (SWAGGER_ENABLED) => {
      expect(() =>
        validateEnvironment({ ...settings, SWAGGER_ENABLED }),
      ).toThrow('SWAGGER_ENABLED must be true or false');
    },
  );
});

describe('production environment security', () => {
  it('rejects a plaintext public origin and example deployment secrets', () => {
    expect(() =>
      validateEnvironment({
        ...settings,
        NODE_ENV: 'production',
        FRONTEND_URL: 'http://game.example.com',
      }),
    ).toThrow('HTTPS');
    expect(() =>
      validateEnvironment({
        ...settings,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET:
          'replace-with-an-access-secret-of-at-least-32-characters',
      }),
    ).toThrow('example JWT secrets');
  });

  it('trusts no proxies by default and rejects a broad or ambiguous trust setting', () => {
    expect(validateEnvironment(settings).TRUST_PROXY).toEqual([]);
    expect(
      validateEnvironment({
        ...settings,
        TRUST_PROXY: '127.0.0.1, 172.20.10.0/28',
      }).TRUST_PROXY,
    ).toEqual(['127.0.0.1', '172.20.10.0/28']);
    for (const value of ['1', '0.0.0.0/0', '::/0', 'loopback']) {
      expect(() =>
        validateEnvironment({ ...settings, TRUST_PROXY: value }),
      ).toThrow('TRUST_PROXY');
    }
  });
});
