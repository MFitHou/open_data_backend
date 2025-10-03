import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Đọc từ ENV (ví dụ: CORS_ORIGINS=http://localhost:4200,http://localhost:5173)
  const origins =
    (process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)) ||
    ['http://localhost:5173'];

  app.enableCors({
    origin: origins,
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
    maxAge: 3600,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
