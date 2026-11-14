import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { SafeHttpExceptionFilter } from '../shared/infrastructure/checkout-http';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';

export function configureApp(
  app: INestApplication,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const origin = env.FRONTEND_ORIGIN;
  if (!origin || !/^https?:\/\/[^/]+$/.test(origin))
    throw new Error('FRONTEND_ORIGIN must be an explicit HTTP origin');
  if (env.NODE_ENV === 'production' && !origin.startsWith('https://'))
    throw new Error('Production frontend requires HTTPS');
  app.use(helmet());
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path.startsWith('/api/'))
      response.setHeader('Cache-Control', 'no-store');
    // La cabecera obliga al navegador a pasar por CORS/preflight antes de enviar una escritura con cookie.
    if (
      request.method === 'POST' &&
      request.path !== '/api/payments/wompi/events' &&
      request.get('X-Checkout-Request') !== '1'
    )
      return next(new ForbiddenException());
    next();
  });
  app.use(json({ limit: '16kb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
      exceptionFactory: () => new BadRequestException(),
    }),
  );
  app.useGlobalFilters(new SafeHttpExceptionFilter());
  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Checkout-Request', 'Idempotency-Key'],
    credentials: true,
  });
  app.setGlobalPrefix('api');
  const production = env.NODE_ENV === 'production';
  if (production && env.SWAGGER_ENABLED !== 'true') return;

  const config = new DocumentBuilder()
    .setTitle('Blush Atelier API')
    .setVersion('0.2.0')
    .addCookieAuth(
      'checkout_session',
      { type: 'apiKey', in: 'cookie' },
      'checkout',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  for (const [path, operations] of Object.entries(document.paths)) {
    if (!operations.post || path === '/api/payments/wompi/events') continue;
    const parameters = (operations.post.parameters ??= []);
    if (
      !parameters.some(
        (parameter) =>
          'in' in parameter &&
          parameter.in === 'header' &&
          parameter.name.toLowerCase() === 'x-checkout-request',
      )
    )
      parameters.push({
        name: 'X-Checkout-Request',
        in: 'header',
        required: true,
        description: 'Cabecera requerida para las escrituras del checkout.',
        schema: { type: 'string', enum: ['1'], default: '1' },
      });
  }
  const docsPath = production ? 'api/docs' : 'docs';
  SwaggerModule.setup(docsPath, app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: `/${docsPath}-json`,
  });
}
