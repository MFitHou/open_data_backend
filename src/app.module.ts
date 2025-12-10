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

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FusekiModule } from './fuseki/fuseki.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { WikidataModule } from './wikidata/wikidata.module';
import { OverpassModule } from './overpass/overpass.module';
import { AdminModule } from './admin/admin.module';
import { InfluxDBModule } from './influxdb/influxdb.module';
import { UsersModule } from './users/users.module';
import { NgsiLdModule } from './ngsi-ld/ngsi-ld.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.development', '.env'],
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 3306),
        username: configService.get('DB_USERNAME', 'root'),
        password: configService.get('DB_PASSWORD', ''),
        database: configService.get('DB_DATABASE', 'opendatafithou'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') !== 'production', // Auto-sync trong dev
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),
    ScheduleModule.forRoot(), // Enable cron jobs
    UsersModule,
    FusekiModule,
    ChatbotModule,
    WikidataModule,
    OverpassModule,
    AdminModule,
    InfluxDBModule,
    NgsiLdModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
