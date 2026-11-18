import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { isAllowedBrowserOrigin } from './http-security';

export function configureApp(app: NestExpressApplication): void {
  const configService = app.get(ConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };

  expressApp.set(
    'trust proxy',
    configService.get<string[]>('TRUST_PROXY') ?? [],
  );
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
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
      callback(null, isAllowedBrowserOrigin(origin, frontendUrl, nodeEnv));
    },
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const isAuth = /^\/api\/auth(?:\/|$)/i.test(request.path);
    if (isAuth || request.headers.authorization) {
      response.setHeader('Cache-Control', 'no-store');
      const forwardedProto = request.headers['x-forwarded-proto'];
      if (
        nodeEnv === 'production' &&
        (!request.secure ||
          (forwardedProto !== undefined && forwardedProto !== 'https'))
      ) {
        response
          .status(403)
          .json({ statusCode: 403, message: 'Secure connection required' });
        return;
      }
    }
    if (
      isAuth &&
      request.method === 'POST' &&
      !isAllowedBrowserOrigin(request.headers.origin, frontendUrl, nodeEnv)
    ) {
      response
        .status(403)
        .json({ statusCode: 403, message: 'Forbidden origin' });
      return;
    }
    next();
  });
  app.useBodyParser('json', { limit: '2mb' });
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
