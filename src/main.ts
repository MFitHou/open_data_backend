/**
 * Copyright (C) 2025 MFitHou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import session = require('express-session');
import * as bodyParser from 'body-parser';

/**
 * Bootstrap function - Entry point của NestJS application
 * 
 * Khởi tạo và cấu hình:
 * 1. NestJS application instance
 * 2. Global API prefix (/api)
 * 3. Validation pipe cho data validation tự động
 * 4. Session middleware cho authentication
 * 5. CORS configuration cho cross-origin requests
 * 
 * API Structure:
 * - Base URL: http://localhost:3000/api
 * - All endpoints được prefix với /api
 * - VD: /api/fuseki/atms, /api/admin/stats, /api/auth/login
 * 
 * Environment Variables:
 * - PORT: Port để chạy server (default: 3000)
 * - SESSION_SECRET: Secret key cho session encryption
 * - SESSION_MAX_AGE: Thời gian sống của session (default: 24h)
 * - CORS_ORIGINS: Danh sách origins được phép (default: localhost:5173)
 * - NODE_ENV: production/development
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // Tăng giới hạn body size cho JSON và urlencoded (cho SPARQL queries lớn)
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Cấu hình validation pipe global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(
    session({
      name: 'opendatafithou.sid',
      secret: process.env.SESSION_SECRET || 'opendatafithou-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/',
      },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS || 'http://localhost:5173',
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
    maxAge: 3600,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Backend API running on: http://localhost:${port}/api`);
  console.log(`🌐 CORS: ${process.env.CORS_ORIGINS || 'http://localhost:5173'}`);
  console.log(`🔐 Session-based authentication enabled`);
}
bootstrap();
