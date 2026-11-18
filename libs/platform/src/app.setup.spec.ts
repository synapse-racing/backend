import { Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureApp } from './app.setup';
import { httpLoggerOptions } from './http-security';

@Controller('probe')
class ProbeController {
  @Get()
  get() {
    return { ok: true };
  }
}

@Controller('auth')
class AuthProbeController {
  @Post('probe')
  post() {
    return { ok: true };
  }
}

describe('HTTP security', () => {
  let app: NestExpressApplication;

  async function boot(enabled: boolean, trustedProxies: string[] = []) {
    const module = await Test.createTestingModule({
      controllers: [ProbeController, AuthProbeController],
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'production',
            SWAGGER_ENABLED: enabled,
            FRONTEND_URL: 'https://game.example.com',
            TRUST_PROXY: trustedProxies,
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    return app.init();
  }

  afterEach(async () => {
    await app?.close();
  });

  it('ignores forwarded HTTPS from untrusted peers', async () => {
    await boot(false);
    await request(app.getHttpServer())
      .post('/api/auth/probe')
      .set('X-Forwarded-Proto', 'https')
      .expect(403, { statusCode: 403, message: 'Secure connection required' });
  });

  it('accepts HTTPS from a trusted proxy but rejects an unapproved browser origin', async () => {
    await boot(false, ['127.0.0.1']);
    await request(app.getHttpServer())
      .post('/api/auth/probe')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://untrusted.example.com')
      .expect(403, { statusCode: 403, message: 'Forbidden origin' });
    await request(app.getHttpServer())
      .post('/api/auth/probe')
      .set('X-Forwarded-Proto', 'https')
      .set('Origin', 'https://game.example.com')
      .expect('Cache-Control', 'no-store')
      .expect(201);
  });

  it('keeps only basic request metadata and status in HTTP logs', () => {
    const { serializers } = httpLoggerOptions('production');
    const requestLog = {
      id: 1,
      method: 'POST',
      url: '/api/auth/login?private=value',
      headers: { authorization: 'secret', cookie: 'secret' },
      body: { password: 'secret' },
    };
    const responseLog = {
      statusCode: 200,
      headers: { 'set-cookie': 'secret' },
    };
    expect(serializers.req(requestLog)).toEqual({
      id: 1,
      method: 'POST',
      url: '/api/auth/login',
    });
    expect(serializers.res(responseLog)).toEqual({ statusCode: 200 });
  });

  it.each([true, false])(
    'uses the explicit flag in production: %s',
    async (enabled) => {
      await boot(enabled, ['127.0.0.1']);
      const apiResponse = await request(app.getHttpServer())
        .get('/api/probe')
        .expect(200);
      expect(apiResponse.headers['content-security-policy']).toContain(
        'upgrade-insecure-requests',
      );
      await request(app.getHttpServer())
        .get('/api/docs/')
        .expect(enabled ? 200 : 404);
      const response = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(enabled ? 200 : 404);
      if (enabled) {
        const html = await request(app.getHttpServer())
          .get('/api/docs/')
          .expect(200);
        expect(html.headers['content-security-policy']).not.toContain(
          'upgrade-insecure-requests',
        );
        expect(html.headers['content-security-policy']).toContain(
          "script-src 'self'",
        );
        for (const asset of [
          'swagger-ui.css',
          'swagger-ui-bundle.js',
          'swagger-ui-init.js',
        ]) {
          await request(app.getHttpServer())
            .get('/api/docs/' + asset)
            .expect(200);
        }
        const https = await request(app.getHttpServer())
          .get('/api/docs/')
          .set('X-Forwarded-Proto', 'https')
          .expect(200);
        expect(https.headers['content-security-policy']).toContain(
          'upgrade-insecure-requests',
        );
        expect((response.body as { paths: unknown }).paths).toHaveProperty(
          '/api/probe',
        );
      }
    },
  );
});
