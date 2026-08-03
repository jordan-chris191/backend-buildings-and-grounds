import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // <-- add this
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // CORS + ValidationPipes (keep these)
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ✅ Swagger setup
  const config = new DocumentBuilder()
    .setTitle('B&G Management System')
    .setDescription('API for Buildings & Grounds operations')
    .setVersion('1.0')
    .addBearerAuth()   // since you use JWT
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.useStaticAssets(join(process.cwd(), 'public'));
  console.log('Static files served from:', join(process.cwd(), 'public'));
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap();