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
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Header,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { NgsiLdService } from './ngsi-ld.service';
import {
  GetEntityDto,
  QueryEntitiesDto,
  TemporalQueryDto,
  BatchTemporalQueryDto,
  NgsiLdEntity,
  NgsiLdEntityCollection,
} from './dto';

/**
 * NGSI-LD API Controller
 * Implements ETSI ISG CIM NGSI-LD standard endpoints
 *
 * Available endpoints:
 * - GET /ngsi-ld/v1/entities/{entityId} - Retrieve single entity
 * - GET /ngsi-ld/v1/entities - Query multiple entities with filters
 * - GET /ngsi-ld/v1/temporal/entities/{entityId} - Historical time-series data
 * - GET /ngsi-ld/v1/temporal/entities - Batch temporal query
 * - GET /ngsi-ld/v1/types - List available entity types
 * - GET /ngsi-ld/v1/types/{type} - Get type details
 * - GET /ngsi-ld/v1/attributes - List available attributes
 * - GET /ngsi-ld/v1/attributes/{attrName} - Get attribute details
 * - GET /ngsi-ld/v1/jsonldContexts - List JSON-LD contexts
 * - GET /ngsi-ld/v1/jsonldContexts/{contextId} - Get specific context
 *
 * @see https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf
 */
@Controller('ngsi-ld/v1')
export class NgsiLdController {
  constructor(private readonly ngsiLdService: NgsiLdService) {}

  /**
   * GET /ngsi-ld/v1/entities/{entityId}
   * Retrieve the current state of a single entity (Context Snapshot)
   *
   * Combines static metadata from Jena Fuseki with latest IoT values from InfluxDB
   *
   * @param entityId - Original Fuseki URI (e.g., https://www.openstreetmap.org/node/1000087341)
   * @param params.options - Response format: 'normalized' (default) or 'keyValues'
   * @param params.attrs - Comma-separated list of attributes to include
   *
   * @example
   * GET /ngsi-ld/v1/entities/https://www.openstreetmap.org/node/1000087341
   * GET /ngsi-ld/v1/entities/http://opendatafithou.org/sensor/station:Lang?options=keyValues
   */
  @Get('entities/:entityId')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getEntity(
    @Param('entityId') entityId: string,
    @Query() params: GetEntityDto,
  ): Promise<NgsiLdEntity | any> {
    return this.ngsiLdService.getEntity(entityId, params);
  }

  /**
   * GET /ngsi-ld/v1/entities
   * Query entities with filters (Discovery & Geo-fencing)
   *
   * @param params.type - Entity type to filter (required)
   * @param params.q - Query filter (e.g., amenity=="atm")
   * @param params.georel - Spatial relationship (e.g., near;maxDistance==1000)
   * @param params.geometry - GeoJSON geometry type (e.g., Point)
   * @param params.coordinates - Coordinates for spatial query (JSON format)
   * @param params.limit - Max number of results (default: 20, max: 1000)
   * @param params.offset - Pagination offset
   * @param params.attrs - Comma-separated attributes to include
   * @param params.options - Response format
   *
   * @example
   * GET /ngsi-ld/v1/entities?type=PointOfInterest&q=amenity=="atm"
   * GET /ngsi-ld/v1/entities?type=PointOfInterest&georel=near;maxDistance==1000&geometry=Point&coordinates=[105.8542,21.0285]
   */
  @Get('entities')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async queryEntities(
    @Query() params: QueryEntitiesDto,
  ): Promise<NgsiLdEntityCollection> {
    return this.ngsiLdService.queryEntities(params);
  }

  /**
   * GET /ngsi-ld/v1/temporal/entities/{entityId}
   * Retrieve historical time-series data (Temporal Evolution)
   *
   * Currently only supports Device entities (IoT stations).
   *
   * @param entityId - Original Fuseki URI for the device
   * @param params.timeAt - Start time (ISO 8601)
   * @param params.endTimeAt - End time (ISO 8601)
   * @param params.attrs - Comma-separated attributes to include
   * @param params.lastN - Return only last N values
   * @param params.aggrMethod - Aggregation method (avg, min, max, sum)
   * @param params.aggrPeriodDuration - Aggregation period (ISO 8601 duration)
   *
   * @example
   * GET /ngsi-ld/v1/temporal/entities/http://opendatafithou.org/sensor/station:Lang?timeAt=2025-11-01T00:00:00Z&endTimeAt=2025-12-01T00:00:00Z&attrs=temperature,aqi
   */
  @Get('temporal/entities/:entityId')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getTemporalEntity(
    @Param('entityId') entityId: string,
    @Query() params: TemporalQueryDto,
  ): Promise<NgsiLdEntity> {
    return this.ngsiLdService.getTemporalEntity(entityId, params);
  }

  /**
   * GET /ngsi-ld/v1/types
   * Get available entity types (Discovery)
   *
   * @returns List of entity types in the system
   */
  @Get('types')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getTypes() {
    const types = await this.ngsiLdService.getEntityTypes();
    return {
      '@context': 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld',
      types,
    };
  }

  /**
   * GET /ngsi-ld/v1/attributes
   * Get available attributes for an entity type (Discovery)
   *
   * @param type - Entity type to get attributes for (optional)
   * @returns List of attributes for the specified type
   */
  @Get('attributes')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getAttributes(@Query('type') type?: string) {
    const attributes = type
      ? await this.ngsiLdService.getAttributes(type)
      : ['name', 'location'];

    return {
      '@context': 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld',
      entityType: type || 'all',
      attributes,
    };
  }

  /**
   * GET /ngsi-ld/v1/types/{type}
   * Get detailed information about a specific entity type
   *
   * @param type - Entity type name (e.g., 'Device', 'PointOfInterest')
   * @returns Type information including attribute details and entity count
   *
   * @example
   * GET /ngsi-ld/v1/types/Device
   * GET /ngsi-ld/v1/types/PointOfInterest
   */
  @Get('types/:type')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getTypeDetails(@Param('type') type: string) {
    return this.ngsiLdService.getTypeDetails(type);
  }

  /**
   * GET /ngsi-ld/v1/attributes/{attrName}
   * Get detailed information about a specific attribute
   *
   * @param attrName - Attribute name (e.g., 'temperature', 'location')
   * @returns Attribute information including type names and count
   *
   * @example
   * GET /ngsi-ld/v1/attributes/temperature
   * GET /ngsi-ld/v1/attributes/location
   */
  @Get('attributes/:attrName')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getAttributeDetails(@Param('attrName') attrName: string) {
    return this.ngsiLdService.getAttributeDetails(attrName);
  }

  /**
   * GET /ngsi-ld/v1/temporal/entities
   * Batch temporal query for multiple entities
   *
   * @param params.type - Entity type to filter
   * @param params.id - Comma-separated entity IDs
   * @param params.idPattern - Pattern to match entity IDs
   * @param params.q - Query filter
   * @param params.timeAt - Start time (ISO 8601)
   * @param params.endTimeAt - End time (ISO 8601)
   * @param params.attrs - Comma-separated attributes to include
   * @param params.lastN - Return only last N values
   * @param params.aggrMethod - Aggregation method
   * @param params.aggrPeriodDuration - Aggregation period
   *
   * @example
   * GET /ngsi-ld/v1/temporal/entities?type=Device&timeAt=2025-01-01T00:00:00Z&endTimeAt=2025-01-02T00:00:00Z
   * GET /ngsi-ld/v1/temporal/entities?id=urn:ngsi-ld:Device:station1,urn:ngsi-ld:Device:station2&timeAt=...
   */
  @Get('temporal/entities')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async queryTemporalEntities(
    @Query() params: BatchTemporalQueryDto,
  ): Promise<NgsiLdEntity[]> {
    const ids = params.id
      ? params.id.split(',').map((id) => id.trim())
      : undefined;
    const attrs = params.attrs
      ? params.attrs.split(',').map((a) => a.trim())
      : undefined;

    return this.ngsiLdService.queryTemporalEntities({
      type: params.type,
      ids,
      idPattern: params.idPattern,
      q: params.q,
      attrs,
      timeAt: params.timeAt,
      endTimeAt: params.endTimeAt,
      lastN: params.lastN,
      aggrMethod: params.aggrMethod,
      aggrPeriodDuration: params.aggrPeriodDuration,
    });
  }

  /**
   * GET /ngsi-ld/v1/jsonldContexts
   * List available JSON-LD contexts
   *
   * @returns List of available JSON-LD context registrations
   *
   * @example
   * GET /ngsi-ld/v1/jsonldContexts
   */
  @Get('jsonldContexts')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getJsonLdContexts() {
    return this.ngsiLdService.getJsonLdContexts();
  }

  /**
   * GET /ngsi-ld/v1/jsonldContexts/{contextId}
   * Get a specific JSON-LD context by ID
   *
   * @param contextId - Context ID (e.g., 'core', 'smartcity', or full URN)
   * @returns The JSON-LD context definition
   *
   * @example
   * GET /ngsi-ld/v1/jsonldContexts/core
   * GET /ngsi-ld/v1/jsonldContexts/smartcity
   * GET /ngsi-ld/v1/jsonldContexts/urn:ngsi-ld:Context:core
   */
  @Get('jsonldContexts/:contextId')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getJsonLdContextById(@Param('contextId') contextId: string) {
    return this.ngsiLdService.getJsonLdContextById(contextId);
  }
}
