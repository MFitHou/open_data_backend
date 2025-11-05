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

import { Controller, Get, HttpException, HttpStatus, Post, Body, BadRequestException, Query } from '@nestjs/common';
import { FusekiService } from './fuseki.service';
import { SparqlQueryDto } from './dto/SparqlQueryDto';

@Controller('fuseki')
export class FusekiController {
  constructor(private readonly fusekiService: FusekiService) {}

  @Get('atms')
  async getAllATMs() {
    try {
      const rows = await this.fusekiService.queryAllATMs();
      return { count: rows.length, data: rows };
    } catch (e: any) {
      throw new HttpException(
        { message: 'Query Fuseki failed', error: e.message },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('query')
  async runQuery(@Body('query') query?: SparqlQueryDto['query']) {
    try {
      if (!query || !query.trim()) {
        throw new BadRequestException('Missing field "query" in body');
      }
      const data = await this.fusekiService.executeSelect(query);
      return { count: data.length, data };
    } catch (e: any) {
      throw new HttpException(
        { message: 'Query Fuseki failed', error: e.message },
        e.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('atms/nearby')
  async atmsNearby(
    @Query('lon') lon?: string,
    @Query('lat') lat?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!lon || !lat || !radiusKm) {
        throw new BadRequestException('lon, lat, radiusKm bắt buộc');
      }
      const data = await this.fusekiService.searchATMsNearby({
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        radiusKm: parseFloat(radiusKm),
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return data;
    } catch (e: any) {
      throw new HttpException(
        { message: 'ATMs nearby query failed', error: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('playgrounds/nearby')
  async playgroundsNearby(
    @Query('lon') lon?: string,
    @Query('lat') lat?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!lon || !lat || !radiusKm) {
        throw new BadRequestException('lon, lat, radiusKm bắt buộc');
      }
      const data = await this.fusekiService.searchPlaygroundsNearby({
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        radiusKm: parseFloat(radiusKm),
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return data;
    } catch (e: any) {
      throw new HttpException(
        { message: 'Playgrounds nearby query failed', error: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('hospitals/nearby')
  async hospitalsNearby(
    @Query('lon') lon?: string,
    @Query('lat') lat?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!lon || !lat || !radiusKm) {
        throw new BadRequestException('lon, lat, radiusKm bắt buộc');
      }
      const data = await this.fusekiService.searchHospitalsNearby({
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        radiusKm: parseFloat(radiusKm),
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return data;
    } catch (e: any) {
      throw new HttpException(
        { message: 'Hospitals nearby query failed', error: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('toilets/nearby')
  async toiletsNearby(
    @Query('lon') lon?: string,
    @Query('lat') lat?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!lon || !lat || !radiusKm) {
        throw new BadRequestException('lon, lat, radiusKm bắt buộc');
      }
      const data = await this.fusekiService.searchToiletsNearby({
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        radiusKm: parseFloat(radiusKm),
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return data;
    } catch (e: any) {
      throw new HttpException(
        { message: 'Toilets nearby query failed', error: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('bus-stops/nearby')
  async busStopsNearby(
    @Query('lon') lon?: string,
    @Query('lat') lat?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!lon || !lat || !radiusKm) {
        throw new BadRequestException('lon, lat, radiusKm bắt buộc');
      }
      const data = await this.fusekiService.searchBusStopsNearby({
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        radiusKm: parseFloat(radiusKm),
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return data;
    } catch (e: any) {
      throw new HttpException(
        { message: 'Bus stops nearby query failed', error: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('drinking-water/nearby')
  async drinkingWaterNearby(
    @Query('lon') lon?: string,
    @Query('lat') lat?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!lon || !lat || !radiusKm) {
        throw new BadRequestException('lon, lat, radiusKm bắt buộc');
      }
      const data = await this.fusekiService.searchDrinkingWaterNearby({
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        radiusKm: parseFloat(radiusKm),
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return data;
    } catch (e: any) {
      throw new HttpException(
        { message: 'Drinking water nearby query failed', error: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}