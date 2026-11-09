import { validateEnvironment } from './environment';

const settings = {
  FRONTEND_URL: 'http://localhost:5173',
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
