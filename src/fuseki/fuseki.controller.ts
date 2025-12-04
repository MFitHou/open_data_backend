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

  @Get('nearby')
  async searchNearby(
    @Query('lon') lon?: string,
    @Query('lat') lat?: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('types') types?: string,
    @Query('includeTopology') includeTopology?: string,
    @Query('includeIoT') includeIoT?: string,
    @Query('limit') limit?: string,
    @Query('language') language?: string,
  ) {
    try {
      if (!lon || !lat || !radiusKm) {
        throw new BadRequestException('lon, lat, radiusKm bắt buộc');
      }
      
      const typesArray = types ? types.split(',').map(t => t.trim()).filter(Boolean) : undefined;
      
      const data = await this.fusekiService.searchNearby({
        lon: parseFloat(lon),
        lat: parseFloat(lat),
        radiusKm: parseFloat(radiusKm),
        types: typesArray,
        includeTopology: includeTopology === 'true',
        includeIoT: includeIoT === 'true',
        limit: limit ? parseInt(limit, 10) : 50,
        language: language || 'vi',
      });
      return data;
    } catch (e: any) {
      throw new HttpException(
        { message: 'Search nearby query failed', error: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('pois-by-type')
  async getPOIsByType(
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('language') language?: string,
  ) {
    try {
      if (!type) {
        throw new BadRequestException('type parameter is required');
      }
      
      const data = await this.fusekiService.getPOIsByType({
        type: type.trim(),
        limit: limit ? parseInt(limit, 10) : 100,
        language: language || 'vi',
      });
      return data;
    } catch (e: any) {
      throw new HttpException(
        { message: 'Get POIs by type failed', error: e.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}