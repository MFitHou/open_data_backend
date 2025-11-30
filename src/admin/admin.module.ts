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
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { FusekiModule } from '../fuseki/fuseki.module';
import { IotSimulatorService } from './iot-simulator.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), FusekiModule],
  providers: [AdminService, IotSimulatorService],
  controllers: [AdminController],
  exports: [AdminService, IotSimulatorService],
})
export class AdminModule {}
