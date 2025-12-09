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

import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InfluxDB, QueryApi } from '@influxdata/influxdb-client';
import { firstValueFrom } from 'rxjs/internal/firstValueFrom';

// Define measurement configurations
export const MEASUREMENTS = {
  air_quality: {
    fields: ['aqi', 'pm25', 'pm10'],
    description: 'Air quality data including AQI and particulate matter',
  },
  flood: {
    fields: ['rain_1h', 'water_level'],
    description: 'Flood monitoring data',
  },
  traffic: {
    fields: ['avg_speed', 'intensity', 'noise_level'],
    description: 'Traffic monitoring data',
  },
  weather: {
    fields: ['noise_level', 'humidity', 'rain_1h', 'temperature', 'wind_speed'],
    description: 'Weather monitoring data',
  },
} as const;

export type MeasurementType = keyof typeof MEASUREMENTS;

export interface SensorDataPoint {
  time: string;
  stationId: string;
  measurement: string;
  field: string;
  value: number;
}

export interface StationData {
  stationId: string;
  measurement: string;
  data: Record<string, number | null>;
  timestamp: string;
}

@Injectable()
export class InfluxDBService implements OnModuleInit {
  private readonly logger = new Logger(InfluxDBService.name);
  private influxDB: InfluxDB;
  private queryApi: QueryApi;
  private readonly bucket: string;
  private readonly org: string;

  constructor(private configService: ConfigService) {
    const url =
      this.configService.get<string>('INFLUXDB_URL') || 'http://localhost:8086';
    const token = this.configService.get<string>('INFLUXDB_TOKEN') || '';
    this.bucket =
      this.configService.get<string>('INFLUXDB_BUCKET') || 'iot_data';
    this.org = this.configService.get<string>('INFLUXDB_ORG') || 'fithou';

    this.influxDB = new InfluxDB({ url, token });
    this.queryApi = this.influxDB.getQueryApi(this.org);
  }

  async onModuleInit() {
    this.logger.log('InfluxDB Service initialized');
    this.logger.log(
      `InfluxDB URL: ${this.configService.get<string>('INFLUXDB_URL') || 'http://localhost:8086'}`,
    );
    this.logger.log(`InfluxDB Bucket: ${this.bucket}`);
    this.logger.log(`InfluxDB Org: ${this.org}`);
  }

  /**
   * Get available measurements and their fields
   */
  getMeasurements() {
    return MEASUREMENTS;
  }

  /**
   * Validate measurement and fields
   */
  private validateMeasurement(measurement: string, fields?: string[]): void {
    if (!MEASUREMENTS[measurement as MeasurementType]) {
      throw new BadRequestException(
        `Invalid measurement: ${measurement}. Available: ${Object.keys(MEASUREMENTS).join(', ')}`,
      );
    }

    if (fields && fields.length > 0) {
      const validFields = MEASUREMENTS[measurement as MeasurementType]
        .fields as readonly string[];
      const invalidFields = fields.filter((f) => !validFields.includes(f));
      if (invalidFields.length > 0) {
        throw new BadRequestException(
          `Invalid fields for ${measurement}: ${invalidFields.join(', ')}. Available: ${validFields.join(', ')}`,
        );
      }
    }
  }

  /**
   * Get latest data for a specific station
   */
  async getLatestByStation(params: {
    stationId: string;
    measurement: MeasurementType;
    fields?: string[];
  }): Promise<StationData | null> {
    const { stationId, measurement, fields } = params;
    this.validateMeasurement(measurement, fields);

    const selectedFields =
      fields && fields.length > 0 ? fields : MEASUREMENTS[measurement].fields;

    const fieldFilter = selectedFields
      .map((f) => `r["_field"] == "${f}"`)
      .join(' or ');

    const query = `
      from(bucket: "${this.bucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r["_measurement"] == "${measurement}")
        |> filter(fn: (r) => r["station_id"] == "${stationId}")
        |> filter(fn: (r) => ${fieldFilter})
        |> last()
    `;

    try {
      const results: any[] = [];

      await new Promise<void>((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            results.push(tableMeta.toObject(row));
          },
          error: (error) => {
            this.logger.error(`InfluxDB query error: ${error.message}`);
            reject(error);
          },
          complete: () => resolve(),
        });
      });

      if (results.length === 0) {
        return null;
      }

      // Aggregate results by field
      const data: Record<string, number | null> = {};
      let latestTime = '';

      for (const field of selectedFields) {
        data[field] = null;
      }

      for (const row of results) {
        data[row._field] = row._value;
        if (!latestTime || row._time > latestTime) {
          latestTime = row._time;
        }
      }

      return {
        stationId,
        measurement,
        data,
        timestamp: latestTime,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get latest data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get historical data for a specific station
   */
  async getHistoryByStation(params: {
    stationId: string;
    measurement: MeasurementType;
    fields?: string[];
    start: string; // e.g., "-1h", "-24h", "-7d", or ISO timestamp
    stop?: string; // e.g., "now()", or ISO timestamp
    aggregateWindow?: string; // e.g., "1m", "5m", "1h"
  }): Promise<SensorDataPoint[]> {
    const {
      stationId,
      measurement,
      fields,
      start,
      stop = 'now()',
      aggregateWindow,
    } = params;
    this.validateMeasurement(measurement, fields);

    const selectedFields =
      fields && fields.length > 0 ? fields : MEASUREMENTS[measurement].fields;

    const fieldFilter = selectedFields
      .map((f) => `r["_field"] == "${f}"`)
      .join(' or ');

    let query = `
      from(bucket: "${this.bucket}")
        |> range(start: ${start}, stop: ${stop})
        |> filter(fn: (r) => r["_measurement"] == "${measurement}")
        |> filter(fn: (r) => r["station_id"] == "${stationId}")
        |> filter(fn: (r) => ${fieldFilter})
    `;

    if (aggregateWindow) {
      query += `
        |> aggregateWindow(every: ${aggregateWindow}, fn: mean, createEmpty: false)
      `;
    }

    query += `
        |> sort(columns: ["_time"])
    `;

    try {
      const results: SensorDataPoint[] = [];

      await new Promise<void>((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            const obj = tableMeta.toObject(row);
            results.push({
              time: obj._time,
              stationId: obj.station_id,
              measurement: obj._measurement,
              field: obj._field,
              value: obj._value,
            });
          },
          error: (error) => {
            this.logger.error(`InfluxDB query error: ${error.message}`);
            reject(error);
          },
          complete: () => resolve(),
        });
      });

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to get history data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get latest data for all stations of a measurement type
   */
  async getLatestAllStations(params: {
    measurement: MeasurementType;
    fields?: string[];
  }): Promise<StationData[]> {
    const { measurement, fields } = params;
    this.validateMeasurement(measurement, fields);

    const selectedFields =
      fields && fields.length > 0 ? fields : MEASUREMENTS[measurement].fields;

    const fieldFilter = selectedFields
      .map((f) => `r["_field"] == "${f}"`)
      .join(' or ');

    const query = `
      from(bucket: "${this.bucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r["_measurement"] == "${measurement}")
        |> filter(fn: (r) => ${fieldFilter})
        |> last()
        |> group(columns: ["station_id", "_field"])
    `;

    try {
      const results: any[] = [];

      await new Promise<void>((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            results.push(tableMeta.toObject(row));
          },
          error: (error) => {
            this.logger.error(`InfluxDB query error: ${error.message}`);
            reject(error);
          },
          complete: () => resolve(),
        });
      });

      // Group by station_id
      const stationMap = new Map<
        string,
        { data: Record<string, number | null>; timestamp: string }
      >();

      for (const row of results) {
        const stationId = row.station_id;
        if (!stationMap.has(stationId)) {
          const initialData: Record<string, number | null> = {};
          for (const field of selectedFields) {
            initialData[field] = null;
          }
          stationMap.set(stationId, { data: initialData, timestamp: '' });
        }

        const station = stationMap.get(stationId)!;
        station.data[row._field] = row._value;
        if (!station.timestamp || row._time > station.timestamp) {
          station.timestamp = row._time;
        }
      }

      return Array.from(stationMap.entries()).map(
        ([stationId, { data, timestamp }]) => ({
          stationId,
          measurement,
          data,
          timestamp,
        }),
      );
    } catch (error: any) {
      this.logger.error(`Failed to get all stations data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get data by device URI (for integration with Fuseki POI)
   */
  async getDataByDeviceUri(params: {
    deviceUri: string;
    measurement?: MeasurementType;
    fields?: string[];
  }): Promise<StationData[]> {
    const { deviceUri, measurement, fields } = params;

    // Extract station ID from device URI
    // Format: urn:ngsi-ld:Device:Hanoi:station:HoGuom -> HoGuom
    const stationId = deviceUri.split(':').pop() || deviceUri;

    this.logger.debug(
      `Extracting station ID from URI: ${deviceUri} -> ${stationId}`,
    );

    if (measurement) {
      const result = await this.getLatestByStation({
        stationId,
        measurement,
        fields,
      });
      return result ? [result] : [];
    }

    // If no measurement specified, get data from all measurements
    const allResults: StationData[] = [];

    for (const m of Object.keys(MEASUREMENTS) as MeasurementType[]) {
      try {
        const result = await this.getLatestByStation({
          stationId,
          measurement: m,
          fields: undefined, // Get all fields
        });
        if (result && Object.values(result.data).some((v) => v !== null)) {
          allResults.push(result);
        }
      } catch (e) {
        // Skip measurements that don't have data for this station
        this.logger.debug(`No ${m} data for station ${stationId}`);
      }
    }

    return allResults;
  }

  /**
   * Execute custom Flux query
   */
  async executeQuery(query: string): Promise<any[]> {
    this.logger.debug(`Executing custom query: ${query}`);

    try {
      const results: any[] = [];

      await new Promise<void>((resolve, reject) => {
        this.queryApi.queryRows(query, {
          next: (row, tableMeta) => {
            results.push(tableMeta.toObject(row));
          },
          error: (error) => {
            this.logger.error(`InfluxDB query error: ${error.message}`);
            reject(error);
          },
          complete: () => resolve(),
        });
      });

      return results;
    } catch (error: any) {
      this.logger.error(`Failed to execute query: ${error.message}`);
      throw error;
    }
  }

  async get5DayForecast(lat: number, lon: number, units: string = 'metric') {
    try {
      const baseUrl = this.configService.get<string>(
        'OPENWEATHERMAP_API_BASE_URL',
      );
      const apiKey =
        this.configService.get<string>('OPENWEATHERMAP_API_KEY') || '';

      const params = new URLSearchParams({
        lat: (21.0245).toString(),
        lon: (105.84117).toString(),
        units,
        appid: apiKey,
      });

      const url = `${baseUrl}/forecast?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new HttpException(
          `OpenWeatherMap API error: ${response.statusText}`,
          response.status,
        );
      }

      const data = await response.json();
      return this.formatForecastData(data);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Error fetching weather data',
        500,
      );
    }
  }

  private formatForecastData(data: any) {
    return {
      city: {
        name: data.city.name,
        country: data.city.country,
        coordinates: {
          lat: data.city.coord.lat,
          lon: data.city.coord.lon,
        },
        timezone: data.city.timezone,
        sunrise: new Date(data.city.sunrise * 1000),
        sunset: new Date(data.city.sunset * 1000),
      },
      forecast: data.list.map((item: any) => ({
        datetime: new Date(item.dt * 1000),
        timestamp: item.dt,
        temperature: {
          current: item.main.temp,
          feels_like: item.main.feels_like,
          min: item.main.temp_min,
          max: item.main.temp_max,
        },
        weather: {
          main: item.weather[0].main,
          description: item.weather[0].description,
          icon: item.weather[0].icon,
          icon_url: `https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`,
        },
        wind: {
          speed: item.wind.speed,
          deg: item.wind.deg,
          gust: item.wind.gust,
        },
        clouds: item.clouds.all,
        humidity: item.main.humidity,
        pressure: item.main.pressure,
        visibility: item.visibility,
        rain: item.rain?.['3h'] || 0,
        snow: item.snow?.['3h'] || 0,
        pop: item.pop,
      })),
      total_forecasts: data.cnt,
    };
  }
}
