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
import { ConfigModule } from '@nestjs/config';
import { FusekiService } from './fuseki.service';
import { FusekiController } from './fuseki.controller';
import { InfluxDBModule } from '../influxdb/influxdb.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), InfluxDBModule],
  providers: [FusekiService],
  controllers: [FusekiController],
  exports: [FusekiService],
})
export class FusekiModule {}