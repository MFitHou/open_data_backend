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
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Options format for NGSI-LD responses
 */
export enum NgsiLdOptions {
  NORMALIZED = 'normalized',
  KEY_VALUES = 'keyValues',
}

/**
 * Aggregation methods for temporal queries
 */
export enum AggregationMethod {
  AVG = 'avg',
  MIN = 'min',
  MAX = 'max',
  SUM = 'sum',
}

/**
 * Query parameters for GET /ngsi-ld/v1/entities/{entityId}
 * @property options - Response format: normalized (default) or keyValues for simplified
 * @property attrs - Comma-separated list of attributes to include
 */
export class GetEntityDto {
  @IsOptional()
  @IsEnum(NgsiLdOptions)
  options?: NgsiLdOptions = NgsiLdOptions.NORMALIZED;

  @IsOptional()
  @IsString()
  attrs?: string;
}

/**
 * Query parameters for GET /ngsi-ld/v1/entities
 * @property type - Entity type to filter (e.g., 'PointOfInterest', 'Device')
 * @property idPattern - Pattern to match entity IDs (regex)
 * @property q - Query language filter (e.g., amenity=="atm")
 * @property georel - Spatial relationship (e.g., near;maxDistance==1000)
 * @property geometry - GeoJSON geometry type (e.g., Point)
 * @property coordinates - Coordinates for spatial query (JSON format)
 * @property limit - Maximum number of results (default: 20, max: 1000)
 * @property offset - Pagination offset
 * @property attrs - Comma-separated attributes to include
 * @property options - Response format
 */
export class QueryEntitiesDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  idPattern?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  georel?: string;

  @IsOptional()
  @IsString()
  geometry?: string;

  @IsOptional()
  @IsString()
  coordinates?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  attrs?: string;

  @IsOptional()
  @IsEnum(NgsiLdOptions)
  options?: NgsiLdOptions = NgsiLdOptions.NORMALIZED;
}

/**
 * Query parameters for GET /ngsi-ld/v1/temporal/entities/{entityId}
 * @property timeAt - Start time (ISO 8601 format)
 * @property endTimeAt - End time (ISO 8601 format)
 * @property attrs - Comma-separated attributes to include
 * @property lastN - Return only last N values
 * @property timeproperty - Temporal property to query (default: observedAt)
 * @property aggrMethod - Aggregation method (avg, min, max, sum)
 * @property aggrPeriodDuration - Aggregation period (ISO 8601 duration, e.g., PT1H)
 */
export class TemporalQueryDto {
  @IsString()
  timeAt: string;

  @IsString()
  endTimeAt: string;

  @IsOptional()
  @IsString()
  attrs?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  lastN?: number;

  @IsOptional()
  @IsString()
  timeproperty?: string = 'observedAt';

  @IsOptional()
  @IsEnum(AggregationMethod)
  aggrMethod?: AggregationMethod;

  @IsOptional()
  @IsString()
  aggrPeriodDuration?: string;
}

/**
 * NGSI-LD Property type
 */
export interface NgsiLdProperty {
  type: 'Property';
  value: any;
  unitCode?: string;
  observedAt?: string;
}

/**
 * NGSI-LD GeoProperty type
 */
export interface NgsiLdGeoProperty {
  type: 'GeoProperty';
  value: {
    type: 'Point' | 'Polygon' | 'LineString';
    coordinates: number[] | number[][] | number[][][];
  };
}

/**
 * NGSI-LD Relationship type
 */
export interface NgsiLdRelationship {
  type: 'Relationship';
  object: string | string[];
}

/**
 * NGSI-LD Entity base structure
 */
export interface NgsiLdEntity {
  '@context': string | (string | Record<string, string>)[];
  id: string;
  type: string;
  [key: string]: any;
}

/**
 * NGSI-LD Entity Collection response
 */
export interface NgsiLdEntityCollection {
  '@context': string | (string | Record<string, string>)[];
  type: 'EntityCollection';
  totalCount: number;
  entities: NgsiLdEntity[];
}

/**
 * NGSI-LD Error response
 */
export interface NgsiLdError {
  type: string;
  title: string;
  detail: string;
  status: number;
}

/**
 * Unit codes for NGSI-LD properties
 */
export const UNIT_CODES = {
  temperature: 'CEL', // Celsius
  humidity: 'P1', // Percentage
  pm25: 'GQ', // Micrograms per cubic meter
  pm10: 'GQ',
  aqi: undefined, // Index (no unit)
  wind_speed: 'MTS', // Meters per second
  rain_1h: 'MMT', // Millimeters
  water_level: 'MTR', // Meters
  noise_level: 'DB', // Decibels
  avg_speed: 'KMH', // Kilometers per hour
  intensity: undefined, // Index (no unit)
  distance: 'MTR', // Meters
};

/**
 * Default NGSI-LD context
 */
export const NGSI_LD_CONTEXT = [
  'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld',
  {
    sosa: 'http://www.w3.org/ns/sosa/',
    schema: 'http://schema.org/',
    property: 'http://opendatafithou.org/property/',
  },
];

/**
 * Query parameters for GET /ngsi-ld/v1/temporal/entities (batch temporal query)
 */
export class BatchTemporalQueryDto extends TemporalQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  id?: string; // Comma-separated entity IDs

  @IsOptional()
  @IsString()
  idPattern?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  georel?: string;

  @IsOptional()
  @IsString()
  geometry?: string;

  @IsOptional()
  @IsString()
  coordinates?: string;
}

/**
 * NGSI-LD Type information response
 */
export interface NgsiLdTypeInfo {
  '@context': string | (string | Record<string, string>)[];
  id: string;
  type: 'EntityTypeInformation';
  typeName: string;
  entityCount: number;
  attributeDetails: NgsiLdAttributeInfo[];
}

/**
 * NGSI-LD Attribute information
 */
export interface NgsiLdAttributeInfo {
  id: string;
  type: 'Attribute';
  attributeName: string;
  attributeTypes?: string[];
}

/**
 * NGSI-LD Attribute details response
 */
export interface NgsiLdAttributeDetails {
  '@context': string | (string | Record<string, string>)[];
  id: string;
  type: 'Attribute';
  attributeName: string;
  attributeCount: number;
  typeNames: string[];
  attributeTypes?: string[];
}

/**
 * JSON-LD Context information
 */
export interface JsonLdContextInfo {
  '@context': string | (string | Record<string, string>)[];
  id: string;
  type: 'ContextSourceRegistration';
  url: string;
  kind: 'Hosted' | 'Cached' | 'Implicit';
}
