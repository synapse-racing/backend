import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureApp } from './app.setup';

@Controller('probe')
class ProbeController {
  @Get()
  get() {
    return { ok: true };
  }
}

describe('Swagger routes', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app?.close();
  });

  it.each([true, false])(
    'uses the explicit flag in production: %s',
    async (enabled) => {
      const module = await Test.createTestingModule({
        controllers: [ProbeController],
        providers: [
          {
            provide: ConfigService,
            useValue: new ConfigService({
              NODE_ENV: 'production',
              SWAGGER_ENABLED: enabled,
              FRONTEND_URL: 'http://localhost:5173',
            }),
          },
        ],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>({
        bodyParser: false,
      });
      configureApp(app);
      await app.init();
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
