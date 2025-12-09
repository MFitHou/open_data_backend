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

import { Controller, Get, Post, Query, Body, BadRequestException } from '@nestjs/common';
import { InfluxDBService, MeasurementType, MEASUREMENTS } from './influxdb.service';

@Controller('influxdb')
export class InfluxDBController {
  constructor(private readonly influxDBService: InfluxDBService) {}

  /**
   * Get available measurements and their fields
   * GET /influxdb/measurements
   */
  @Get('measurements')
  getMeasurements() {
    return {
      measurements: this.influxDBService.getMeasurements(),
    };
  }

  /**
   * Get latest data for a specific station
   * GET /influxdb/latest?stationId=HoGuom&measurement=air_quality&fields=pm25,pm10
   */
  @Get('latest')
  async getLatest(
    @Query('stationId') stationId: string,
    @Query('measurement') measurement: string,
    @Query('fields') fieldsStr?: string,
  ) {
    if (!stationId) {
      throw new BadRequestException('stationId is required');
    }
    if (!measurement) {
      throw new BadRequestException('measurement is required');
    }

    const fields = fieldsStr ? fieldsStr.split(',').map(f => f.trim()) : undefined;

    const result = await this.influxDBService.getLatestByStation({
      stationId,
      measurement: measurement as MeasurementType,
      fields,
    });

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Get historical data for a specific station
   * GET /influxdb/history?stationId=HoGuom&measurement=air_quality&start=-1h&aggregateWindow=5m
   */
  @Get('history')
  async getHistory(
    @Query('stationId') stationId: string,
    @Query('measurement') measurement: string,
    @Query('fields') fieldsStr?: string,
    @Query('start') start: string = '-1h',
    @Query('stop') stop: string = 'now()',
    @Query('aggregateWindow') aggregateWindow?: string,
  ) {
    if (!stationId) {
      throw new BadRequestException('stationId is required');
    }
    if (!measurement) {
      throw new BadRequestException('measurement is required');
    }

    const fields = fieldsStr ? fieldsStr.split(',').map(f => f.trim()) : undefined;

    const results = await this.influxDBService.getHistoryByStation({
      stationId,
      measurement: measurement as MeasurementType,
      fields,
      start,
      stop,
      aggregateWindow,
    });

    return {
      success: true,
      count: results.length,
      data: results,
    };
  }

  /**
   * Get latest data for all stations of a measurement type
   * GET /influxdb/stations?measurement=air_quality&fields=pm25,pm10
   */
  @Get('stations')
  async getAllStations(
    @Query('measurement') measurement: string,
    @Query('fields') fieldsStr?: string,
  ) {
    if (!measurement) {
      throw new BadRequestException('measurement is required');
    }

    const fields = fieldsStr ? fieldsStr.split(',').map(f => f.trim()) : undefined;

    const results = await this.influxDBService.getLatestAllStations({
      measurement: measurement as MeasurementType,
      fields,
    });

    return {
      success: true,
      count: results.length,
      data: results,
    };
  }

  /**
   * Get data by device URI (integration with Fuseki POI)
   * GET /influxdb/device?uri=urn:ngsi-ld:Device:Hanoi:station:HoGuom&measurement=weather
   */
  @Get('device')
  async getByDeviceUri(
    @Query('uri') deviceUri: string,
    @Query('measurement') measurement?: string,
    @Query('fields') fieldsStr?: string,
  ) {
    if (!deviceUri) {
      throw new BadRequestException('uri is required');
    }

    const fields = fieldsStr ? fieldsStr.split(',').map(f => f.trim()) : undefined;

    const results = await this.influxDBService.getDataByDeviceUri({
      deviceUri,
      measurement: measurement as MeasurementType | undefined,
      fields,
    });

    return {
      success: true,
      deviceUri,
      count: results.length,
      data: results,
    };
  }

  /**
   * Execute custom Flux query (admin only)
   * POST /influxdb/query
   * Body: { "query": "from(bucket: \"iot_data\") |> range(start: -1h) |> limit(n: 10)" }
   */
  @Post('query')
  async executeQuery(@Body('query') query: string) {
    if (!query) {
      throw new BadRequestException('query is required');
    }

    const results = await this.influxDBService.executeQuery(query);

    return {
      success: true,
      count: results.length,
      data: results,
    };
  }

  @Get('weather/forecast')
  async getWeatherForecast(
    @Query('lat') lat: number,
    @Query('lon') lon: number,
    @Query('units') units: string = 'metric',
  ) {
    const forecast = await this.influxDBService.get5DayForecast(lat, lon, units);

    return {
      success: true,
      data: forecast,
    };
  }
}