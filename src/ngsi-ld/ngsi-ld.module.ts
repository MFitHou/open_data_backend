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
import { NgsiLdController } from './ngsi-ld.controller';
import { NgsiLdService } from './ngsi-ld.service';
import { FusekiModule } from '../fuseki/fuseki.module';
import { InfluxDBModule } from '../influxdb/influxdb.module';

/**
 * NGSI-LD Module
 *
 * Implements ETSI ISG CIM NGSI-LD standard API for Smart City data access.
 * Provides standardized endpoints for:
 * - Entity retrieval (combining static Fuseki data with IoT InfluxDB data)
 * - Entity discovery with geo-spatial filtering
 * - Temporal (historical) data queries
 *
 * @see https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf
 */
@Module({
  imports: [FusekiModule, InfluxDBModule],
  controllers: [NgsiLdController],
  providers: [NgsiLdService],
  exports: [NgsiLdService],
})
export class NgsiLdModule {}
