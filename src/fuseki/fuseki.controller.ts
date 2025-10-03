

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
}