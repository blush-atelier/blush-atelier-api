import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

export async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT || '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
}
if (require.main === module) {
  void bootstrap().catch(() => {
    console.error(
      'API startup failed; verify configuration and database availability.',
    );
    process.exitCode = 1;
  });
}
