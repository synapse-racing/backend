import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';

export function configureApp(app: NestExpressApplication): void {
  const configService = app.get(ConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };

  expressApp.set('trust proxy', 1);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '100kb' });
  const swaggerEnabled = configService.getOrThrow<boolean>('SWAGGER_ENABLED');
  const securityHeaders = helmet();
  const httpDocsHeaders = helmet({
    contentSecurityPolicy: {
      directives: { 'upgrade-insecure-requests': null },
    },
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const isDocs = /^\/api\/docs(?:\/|$|-json$)/.test(request.path);
    // The direct HTTP deployment has no TLS listener for Swagger's relative assets.
    const headers =
      swaggerEnabled && isDocs && !request.secure
        ? httpDocsHeaders
        : securityHeaders;
    headers(request, response, next);
  });
  app.use(cookieParser());
  const frontendUrl = configService.getOrThrow<string>('FRONTEND_URL');
  const nodeEnv = configService.getOrThrow<string>('NODE_ENV');

  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || origin === frontendUrl) {
        return callback(null, true);
      }
      if (nodeEnv !== 'production') {
        try {
          const { hostname } = new URL(origin);
          const isLocalOrLan =
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

          if (isLocalOrLan) {
            return callback(null, true);
          }
        } catch {
          // ignore malformed URLs
        }
      }
      return callback(null, false);
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Synapse Racing API')
      .setDescription('API for NEAT training and multiplayer racing')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
