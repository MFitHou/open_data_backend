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
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FusekiService } from '../fuseki/fuseki.service';
import {
  InfluxDBService,
  MeasurementType,
  MEASUREMENTS,
} from '../influxdb/influxdb.service';
import {
  NgsiLdEntity,
  NgsiLdEntityCollection,
  NgsiLdOptions,
  NgsiLdProperty,
  NgsiLdGeoProperty,
  NgsiLdRelationship,
  NGSI_LD_CONTEXT,
  UNIT_CODES,
  GetEntityDto,
  QueryEntitiesDto,
  TemporalQueryDto,
  AggregationMethod,
  JsonLdContextInfo,
} from './dto';

/**
 * Service for NGSI-LD API operations
 * Implements ETSI ISG CIM NGSI-LD standard
 */
@Injectable()
export class NgsiLdService {
  private readonly logger = new Logger(NgsiLdService.name);
  private readonly queryEndpoint: string;

  constructor(
    private configService: ConfigService,
    private fusekiService: FusekiService,
    private influxDBService: InfluxDBService,
  ) {
    this.queryEndpoint =
      this.configService.get<string>('FUSEKI_QUERY_ENDPOINT') ||
      `${this.configService.get<string>('FUSEKI_BASE_URL')}/${this.configService.get<string>('FUSEKI_DATASET')}/sparql`;
  }

  /**
   * Determine entity type from URI
   * Device URIs contain 'sensor' or 'device'
   * POI URIs are typically from openstreetmap.org
   */
  private getEntityTypeFromUri(uri: string): string {
    if (
      uri.includes('sensor') ||
      uri.includes('device') ||
      uri.includes('station')
    ) {
      return 'Device';
    }
    return 'PointOfInterest';
  }

  /**
   * Create NGSI-LD Property object
   */
  private createProperty(
    value: any,
    unitCode?: string,
    observedAt?: string,
  ): NgsiLdProperty {
    const prop: NgsiLdProperty = {
      type: 'Property',
      value,
    };
    if (unitCode) prop.unitCode = unitCode;
    if (observedAt) prop.observedAt = observedAt;
    return prop;
  }

  /**
   * Create NGSI-LD GeoProperty object
   */
  private createGeoProperty(lon: number, lat: number): NgsiLdGeoProperty {
    return {
      type: 'GeoProperty',
      value: {
        type: 'Point',
        coordinates: [lon, lat],
      },
    };
  }

  /**
   * Create NGSI-LD Relationship object
   */
  private createRelationship(object: string | string[]): NgsiLdRelationship {
    return {
      type: 'Relationship',
      object,
    };
  }

  /**
   * Extract entity type from rdf:type URIs
   * Example: "http://schema.org/Playground" -> "Playground"
   * Example: "https://smartdatamodels.org/dataModel.PointOfInterest/PointOfInterest" -> "PointOfInterest"
   */
  private extractTypeFromRdfTypes(rdfTypes: string[]): string {
    if (!rdfTypes || rdfTypes.length === 0) {
      return 'PointOfInterest';
    }

    // Look for schema.org types first (e.g., schema:Playground)
    for (const typeUri of rdfTypes) {
      // Match schema.org types: http://schema.org/Playground
      const schemaMatch = typeUri.match(/schema\.org\/(\w+)$/);
      if (schemaMatch && schemaMatch[1] !== 'Thing') {
        return schemaMatch[1];
      }
    }

    // Look for smartdatamodels types
    for (const typeUri of rdfTypes) {
      // Match smartdatamodels: https://smartdatamodels.org/dataModel.PointOfInterest/PointOfInterest
      const smartMatch = typeUri.match(/smartdatamodels\.org\/[^\/]+\/(\w+)$/);
      if (smartMatch) {
        return smartMatch[1];
      }
    }

    // Fallback: extract last segment from any URI
    for (const typeUri of rdfTypes) {
      const lastSegment = typeUri.split(/[#\/]/).pop();
      if (
        lastSegment &&
        lastSegment !== 'Thing' &&
        lastSegment !== 'Resource'
      ) {
        return lastSegment;
      }
    }

    return 'PointOfInterest';
  }

  /**
   * Convert POI data to NGSI-LD format (normalized)
   * Uses original Fuseki URI as entity ID (unique identifier in Apache Fuseki)
   */
  private poiToNgsiLd(poi: any, includeContext: boolean = true): NgsiLdEntity {
    // Determine entity type from rdf:types (from Fuseki)
    let entityType = 'PointOfInterest';

    if (poi.rdfTypes && poi.rdfTypes.length > 0) {
      // Use rdf:type from Fuseki data
      entityType = this.extractTypeFromRdfTypes(poi.rdfTypes);
    } else if (poi.device) {
      entityType = 'Device';
    } else if (poi.leisure) {
      // Fallback: leisure types (playground, park, etc.)
      entityType = poi.leisure.charAt(0).toUpperCase() + poi.leisure.slice(1);
    } else if (poi.amenity) {
      // Fallback: amenity types (atm, hospital, etc.)
      entityType = poi.amenity.charAt(0).toUpperCase() + poi.amenity.slice(1);
    } else if (poi.highway) {
      // Fallback: highway types (bus_stop, etc.)
      entityType = poi.highway
        .split('_')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
    }

    const entity: NgsiLdEntity = {
      '@context': includeContext ? NGSI_LD_CONTEXT : [],
      id: poi.poi, // Use original Fuseki URI as entity ID
      type: entityType,
    };

    // Add name
    if (poi.name) {
      entity.name = this.createProperty(poi.name);
    }

    // Add location
    if (poi.lon !== null && poi.lat !== null) {
      entity.location = this.createGeoProperty(poi.lon, poi.lat);
    }

    // Add POI-specific properties
    if (poi.amenity) {
      entity.amenity = this.createProperty(poi.amenity);
    }
    if (poi.highway) {
      entity.highway = this.createProperty(poi.highway);
    }
    if (poi.leisure) {
      entity.leisure = this.createProperty(poi.leisure);
    }
    if (poi.brand) {
      entity.brand = this.createProperty(poi.brand);
    }
    if (poi.operator) {
      entity.operator = this.createProperty(poi.operator);
    }
    if (poi.access) {
      entity.access = this.createProperty(poi.access);
    }
    if (poi.fee) {
      entity.fee = this.createProperty(poi.fee);
    }

    // Add distance if available
    if (poi.distanceKm !== undefined && poi.distanceKm > 0) {
      entity.distance = this.createProperty(poi.distanceKm * 1000, 'MTR');
    }

    // Add sensor data if available
    if (poi.sensorData) {
      const { aqi, temperature, noise_level, timestamp } = poi.sensorData;
      if (aqi !== null) {
        entity.aqi = this.createProperty(aqi, UNIT_CODES.aqi, timestamp);
      }
      if (temperature !== null) {
        entity.temperature = this.createProperty(
          temperature,
          UNIT_CODES.temperature,
          timestamp,
        );
      }
      if (noise_level !== null) {
        entity.noiseLevel = this.createProperty(
          noise_level,
          UNIT_CODES.noise_level,
          timestamp,
        );
      }
    }

    // Add device relationship if available
    if (poi.device) {
      entity.hosts = this.createRelationship(poi.device);
    }

    // Add topology relationships (use original URIs)
    if (poi.topology && poi.topology.length > 0) {
      const isNextTo: string[] = [];
      const containedInPlace: string[] = [];

      for (const rel of poi.topology) {
        // Use original Fuseki URI for related entities
        if (rel.predicate === 'isNextTo') {
          isNextTo.push(rel.related);
        } else if (rel.predicate === 'containedInPlace') {
          containedInPlace.push(rel.related);
        }
      }

      if (isNextTo.length > 0) {
        entity.isNextTo = this.createRelationship(
          isNextTo.length === 1 ? isNextTo[0] : isNextTo,
        );
      }
      if (containedInPlace.length > 0) {
        entity.containedInPlace = this.createRelationship(
          containedInPlace.length === 1
            ? containedInPlace[0]
            : containedInPlace,
        );
      }
    }

    return entity;
  }

  /**
   * Convert NGSI-LD entity to keyValues format
   */
  private entityToKeyValues(entity: NgsiLdEntity): any {
    const keyValues: any = {
      '@context': entity['@context'],
      id: entity.id,
      type: entity.type,
    };

    for (const [key, value] of Object.entries(entity)) {
      if (['@context', 'id', 'type'].includes(key)) continue;

      if (value && typeof value === 'object') {
        if (value.type === 'Property') {
          keyValues[key] = value.value;
        } else if (value.type === 'GeoProperty') {
          keyValues[key] = value.value;
        } else if (value.type === 'Relationship') {
          keyValues[key] = value.object;
        }
      }
    }

    return keyValues;
  }

  /**
   * Filter entity attributes based on attrs parameter
   */
  private filterAttributes(entity: NgsiLdEntity, attrs?: string): NgsiLdEntity {
    if (!attrs) return entity;

    const attrList = attrs.split(',').map((a) => a.trim());
    const filtered: NgsiLdEntity = {
      '@context': entity['@context'],
      id: entity.id,
      type: entity.type,
    };

    for (const attr of attrList) {
      if (entity[attr] !== undefined) {
        filtered[attr] = entity[attr];
      }
    }

    // Always include location if requested
    if (attrList.includes('location') && entity.location) {
      filtered.location = entity.location;
    }

    return filtered;
  }

  /**
   * GET /ngsi-ld/v1/entities/{entityId}
   * Retrieve the current state of a single entity
   * entityId is the original Fuseki URI (unique identifier)
   */
  async getEntity(
    entityId: string,
    params: GetEntityDto,
  ): Promise<NgsiLdEntity | any> {
    this.logger.debug(`[getEntity] Fetching entity: ${entityId}`);

    // entityId is the original Fuseki URI - no conversion needed
    // Fetch POI data from Fuseki using the URI directly
    const result = await this.fusekiService.getPOIByUri({
      uri: entityId,
      language: 'en',
    });

    if (!result.found || !result.poi) {
      throw new NotFoundException(`Entity not found: ${entityId}`);
    }

    // Convert to NGSI-LD format (URI is preserved as entity ID)
    let entity = this.poiToNgsiLd(result.poi);

    // Filter attributes if specified
    if (params.attrs) {
      entity = this.filterAttributes(entity, params.attrs);
    }

    // Convert to keyValues format if requested
    if (params.options === NgsiLdOptions.KEY_VALUES) {
      return this.entityToKeyValues(entity);
    }

    return entity;
  }

  /**
   * GET /ngsi-ld/v1/entities
   * Query entities with filters
   */
  async queryEntities(
    params: QueryEntitiesDto,
  ): Promise<NgsiLdEntityCollection> {
    this.logger.debug(
      `[queryEntities] Query params: ${JSON.stringify(params)}`,
    );

    const {
      type,
      q,
      georel,
      geometry,
      coordinates,
      limit,
      offset,
      attrs,
      options,
    } = params;

    let results: any[] = [];
    let totalCount = 0;

    // Parse q parameter for amenity filter
    let amenityFilter: string | undefined;
    if (q) {
      const amenityMatch = q.match(/amenity\s*==\s*"?([^"]+)"?/);
      if (amenityMatch) {
        amenityFilter = amenityMatch[1];
      }
    }

    // Handle geo-spatial query
    if (georel && coordinates) {
      // Parse coordinates
      let coords: number[];
      try {
        coords = JSON.parse(coordinates);
      } catch {
        throw new BadRequestException(
          'Invalid coordinates format. Expected JSON array [lon, lat]',
        );
      }

      // Parse georel to extract maxDistance
      let maxDistance = 1000; // default 1km
      const distanceMatch = georel.match(/maxDistance\s*==\s*(\d+)/);
      if (distanceMatch) {
        maxDistance = parseInt(distanceMatch[1], 10);
      }

      // Convert meters to kilometers
      const radiusKm = maxDistance / 1000;

      // Use Fuseki nearby search
      const searchResult = await this.fusekiService.searchNearby({
        lat: coords[1],
        lon: coords[0],
        radiusKm,
        types: amenityFilter ? [amenityFilter] : ['atm'], // default type
        limit: limit || 20,
        language: 'en',
      });

      results = searchResult.items;
      totalCount = searchResult.count;
    } else if (type === 'Device') {
      // Query IoT devices
      const stations = await this.influxDBService.getLatestAllStations({
        measurement: 'air_quality',
      });

      results = stations.map((station) => ({
        poi: `http://opendatafithou.org/sensor/station:${station.stationId}`,
        name: `IoT Station ${station.stationId}`,
        device: station.stationId,
        sensorData: {
          aqi: station.data.aqi,
          timestamp: station.timestamp,
        },
      }));
      totalCount = results.length;
    } else if (amenityFilter) {
      // Query by POI type
      const typeResult = await this.fusekiService.getPOIsByType({
        type: amenityFilter,
        limit: limit || 20,
        language: 'en',
      });

      results = typeResult.results;
      totalCount = typeResult.count;
    } else {
      throw new BadRequestException(
        'Query must include type with q filter or geo-spatial parameters',
      );
    }

    // Apply pagination
    const paginatedResults = results.slice(
      offset || 0,
      (offset || 0) + (limit || 20),
    );

    // Convert to NGSI-LD entities
    const entities = paginatedResults.map((poi) => {
      let entity = this.poiToNgsiLd(poi, false);
      if (attrs) {
        entity = this.filterAttributes(entity, attrs);
      }
      if (options === NgsiLdOptions.KEY_VALUES) {
        return this.entityToKeyValues(entity);
      }
      return entity;
    });

    return {
      '@context': NGSI_LD_CONTEXT,
      type: 'EntityCollection',
      totalCount,
      entities,
    };
  }

  /**
   * GET /ngsi-ld/v1/temporal/entities/{entityId}
   * Retrieve historical time-series data
   * entityId is the original Fuseki URI for the device
   */
  async getTemporalEntity(
    entityId: string,
    params: TemporalQueryDto,
  ): Promise<NgsiLdEntity> {
    this.logger.debug(
      `[getTemporalEntity] Fetching temporal data: ${entityId}`,
    );

    // Check if this is a Device entity (for temporal queries)
    const entityType = this.getEntityTypeFromUri(entityId);
    if (entityType !== 'Device') {
      throw new BadRequestException(
        'Temporal queries are only supported for Device entities',
      );
    }

    // Use the entityId (Fuseki URI) directly as station ID for InfluxDB
    const stationId = entityId;

    // Determine which measurements to query
    let measurements: MeasurementType[] = [
      'air_quality',
      'weather',
      'traffic',
      'flood',
    ];
    let fieldsToQuery: string[] | undefined;

    if (params.attrs) {
      fieldsToQuery = params.attrs.split(',').map((a) => a.trim());
      // Map NGSI-LD attribute names to InfluxDB fields
      const attrToField: Record<
        string,
        { measurement: MeasurementType; field: string }
      > = {
        temperature: { measurement: 'weather', field: 'temperature' },
        humidity: { measurement: 'weather', field: 'humidity' },
        windSpeed: { measurement: 'weather', field: 'wind_speed' },
        rainfall: { measurement: 'weather', field: 'rain_1h' },
        aqi: { measurement: 'air_quality', field: 'aqi' },
        pm25: { measurement: 'air_quality', field: 'pm25' },
        pm10: { measurement: 'air_quality', field: 'pm10' },
        noiseLevel: { measurement: 'traffic', field: 'noise_level' },
        trafficIntensity: { measurement: 'traffic', field: 'intensity' },
        avgSpeed: { measurement: 'traffic', field: 'avg_speed' },
        waterLevel: { measurement: 'flood', field: 'water_level' },
      };

      // Filter measurements based on requested attributes
      measurements = [
        ...new Set(
          fieldsToQuery
            .filter((f) => attrToField[f])
            .map((f) => attrToField[f].measurement),
        ),
      ] as MeasurementType[];
    }

    // Convert ISO timestamps to InfluxDB format
    const startTime = params.timeAt;
    const endTime = params.endTimeAt;

    // Calculate aggregation window if specified
    let aggregateWindow: string | undefined;
    if (params.aggrPeriodDuration) {
      // Convert ISO 8601 duration to InfluxDB format
      // PT1H -> 1h, PT30M -> 30m, P1D -> 1d
      const durationMatch =
        params.aggrPeriodDuration.match(/PT?(\d+)([HDMS])/i);
      if (durationMatch) {
        const value = durationMatch[1];
        const unit = durationMatch[2].toLowerCase();
        aggregateWindow = `${value}${unit}`;
      }
    }

    // Build temporal entity response
    const temporalEntity: NgsiLdEntity = {
      '@context': NGSI_LD_CONTEXT,
      id: entityId,
      type: 'Device',
    };

    // Query each measurement type
    for (const measurement of measurements) {
      try {
        const measurementFields = MEASUREMENTS[measurement]
          .fields as readonly string[];
        const requestedFields = fieldsToQuery
          ? measurementFields.filter((f) => {
              // Check if any requested attr maps to this field
              const attrToField: Record<string, string> = {
                temperature: 'temperature',
                humidity: 'humidity',
                windSpeed: 'wind_speed',
                rainfall: 'rain_1h',
                aqi: 'aqi',
                pm25: 'pm25',
                pm10: 'pm10',
                noiseLevel: 'noise_level',
                trafficIntensity: 'intensity',
                avgSpeed: 'avg_speed',
                waterLevel: 'water_level',
              };
              return fieldsToQuery?.some((attr) => attrToField[attr] === f);
            })
          : [...measurementFields];

        if (requestedFields.length === 0) continue;

        const history = await this.influxDBService.getHistoryByStation({
          stationId,
          measurement,
          fields: requestedFields,
          start: startTime,
          stop: endTime,
          aggregateWindow,
        });

        // Group by field
        const fieldData: Record<string, any[]> = {};
        for (const point of history) {
          if (!fieldData[point.field]) {
            fieldData[point.field] = [];
          }
          fieldData[point.field].push({
            type: 'Property',
            value: point.value,
            unitCode: UNIT_CODES[point.field as keyof typeof UNIT_CODES],
            observedAt: point.time,
          });
        }

        // Add to entity with NGSI-LD attribute names
        const fieldToAttr: Record<string, string> = {
          temperature: 'temperature',
          humidity: 'humidity',
          wind_speed: 'windSpeed',
          rain_1h: 'rainfall',
          aqi: 'aqi',
          pm25: 'pm25',
          pm10: 'pm10',
          noise_level: 'noiseLevel',
          intensity: 'trafficIntensity',
          avg_speed: 'avgSpeed',
          water_level: 'waterLevel',
        };

        for (const [field, values] of Object.entries(fieldData)) {
          const attrName = fieldToAttr[field] || field;
          // Apply lastN limit if specified
          if (params.lastN && values.length > params.lastN) {
            temporalEntity[attrName] = values.slice(-params.lastN);
          } else {
            temporalEntity[attrName] = values;
          }
        }
      } catch (e: any) {
        this.logger.debug(`No ${measurement} data for station: ${e.message}`);
      }
    }

    return temporalEntity;
  }

  /**
   * Get available entity types
   */
  getEntityTypes(): string[] {
    return ['Device', 'PointOfInterest'];
  }

  /**
   * Get available attributes for an entity type
   */
  getAttributes(entityType: string): string[] {
    if (entityType === 'Device') {
      return [
        'name',
        'location',
        'temperature',
        'humidity',
        'windSpeed',
        'rainfall',
        'aqi',
        'pm25',
        'pm10',
        'noiseLevel',
        'trafficIntensity',
        'avgSpeed',
        'waterLevel',
      ];
    }

    if (entityType === 'PointOfInterest') {
      return [
        'name',
        'location',
        'amenity',
        'highway',
        'leisure',
        'brand',
        'operator',
        'access',
        'fee',
        'distance',
        'isNextTo',
        'containedInPlace',
      ];
    }

    return [];
  }

  /**
   * Get detailed information about a specific entity type
   * NGSI-LD Specification: GET /types/{type}
   */
  async getTypeDetails(typeName: string): Promise<any> {
    const validTypes = await this.getEntityTypes();
    if (!validTypes.includes(typeName)) {
      throw new NotFoundException(`Entity type '${typeName}' not found`);
    }

    const attributes = await this.getAttributes(typeName);

    // Count entities of this type
    let entityCount = 0;
    try {
      if (typeName === 'Device') {
        const result = await this.fusekiService.getAllIoTStations();
        entityCount = result.stations?.length || 0;
      } else if (typeName === 'PointOfInterest') {
        // Get approximate count from POIs using searchNearby with large radius
        const result = await this.fusekiService.searchNearby({
          lat: 21.0285,
          lon: 105.8542,
          radiusKm: 50, // 50km radius to cover most data
          limit: 10000,
        });
        entityCount = result.items?.length || 0;
      }
    } catch (e) {
      this.logger.warn(`Could not count entities for type ${typeName}: ${e}`);
    }

    const attributeDetails = attributes.map((attr) => ({
      id: `urn:ngsi-ld:Attribute:${attr}`,
      type: 'Attribute',
      attributeName: attr,
      attributeTypes: this.getAttributeType(attr),
    }));

    return {
      '@context': NGSI_LD_CONTEXT,
      id: `urn:ngsi-ld:EntityTypeInfo:${typeName}`,
      type: 'EntityTypeInformation',
      typeName: typeName,
      entityCount: entityCount,
      attributeDetails: attributeDetails,
    };
  }

  /**
   * Get the NGSI-LD attribute type for a given attribute name
   */
  private getAttributeType(attrName: string): string[] {
    const propertyAttrs = [
      'name',
      'temperature',
      'humidity',
      'windSpeed',
      'rainfall',
      'aqi',
      'pm25',
      'pm10',
      'noiseLevel',
      'trafficIntensity',
      'avgSpeed',
      'waterLevel',
      'amenity',
      'highway',
      'leisure',
      'brand',
      'operator',
      'access',
      'fee',
      'distance',
    ];
    const geoPropertyAttrs = ['location'];
    const relationshipAttrs = ['isNextTo', 'containedInPlace'];

    if (geoPropertyAttrs.includes(attrName)) {
      return ['GeoProperty'];
    }
    if (relationshipAttrs.includes(attrName)) {
      return ['Relationship'];
    }
    if (propertyAttrs.includes(attrName)) {
      return ['Property'];
    }
    return ['Property'];
  }

  /**
   * Get detailed information about a specific attribute
   * NGSI-LD Specification: GET /attributes/{attrName}
   */
  async getAttributeDetails(attrName: string): Promise<any> {
    const allTypes = await this.getEntityTypes();
    const typeNames: string[] = [];

    for (const type of allTypes) {
      const attrs = await this.getAttributes(type);
      if (attrs.includes(attrName)) {
        typeNames.push(type);
      }
    }

    if (typeNames.length === 0) {
      throw new NotFoundException(`Attribute '${attrName}' not found`);
    }

    // Count entities with this attribute
    let attributeCount = 0;
    for (const type of typeNames) {
      try {
        if (type === 'Device') {
          const result = await this.fusekiService.getAllIoTStations();
          attributeCount += result.stations?.length || 0;
        } else if (type === 'PointOfInterest') {
          const result = await this.fusekiService.searchNearby({
            lat: 21.0285,
            lon: 105.8542,
            radiusKm: 50,
            limit: 10000,
          });
          attributeCount += result.items?.length || 0;
        }
      } catch (e) {
        this.logger.warn(
          `Could not count entities for attribute ${attrName}: ${e}`,
        );
      }
    }

    return {
      '@context': NGSI_LD_CONTEXT,
      id: `urn:ngsi-ld:Attribute:${attrName}`,
      type: 'Attribute',
      attributeName: attrName,
      attributeCount: attributeCount,
      typeNames: typeNames,
      attributeTypes: this.getAttributeType(attrName),
    };
  }

  /**
   * Query temporal data for multiple entities (batch temporal query)
   * NGSI-LD Specification: GET /temporal/entities
   */
  async queryTemporalEntities(params: {
    type?: string;
    ids?: string[];
    idPattern?: string;
    q?: string;
    attrs?: string[];
    timeAt: string;
    endTimeAt: string;
    lastN?: number;
    aggrMethod?: AggregationMethod;
    aggrPeriodDuration?: string;
  }): Promise<NgsiLdEntity[]> {
    // First, get matching entities
    const queryParams: QueryEntitiesDto = {
      type: params.type || 'Device', // Default to Device for temporal queries
      q: params.q,
      idPattern: params.idPattern,
      attrs: params.attrs?.join(','),
      limit: 100,
    };

    let entities: NgsiLdEntity[] = [];

    // If specific IDs provided, query each
    if (params.ids && params.ids.length > 0) {
      for (const id of params.ids) {
        try {
          const entity = await this.getEntity(id, {});
          entities.push(entity);
        } catch (e) {
          this.logger.debug(`Entity ${id} not found for temporal query`);
        }
      }
    } else {
      // Query by type/pattern
      const collection = await this.queryEntities(queryParams);
      entities = collection.entities || [];
    }

    // Filter to only devices (only devices have temporal data)
    const deviceEntities = entities.filter((e) => e.type === 'Device');

    // Get temporal data for each device
    const temporalEntities: NgsiLdEntity[] = [];

    for (const entity of deviceEntities) {
      try {
        const temporalParams: TemporalQueryDto = {
          timeAt: params.timeAt,
          endTimeAt: params.endTimeAt,
          attrs: params.attrs?.join(','),
          lastN: params.lastN,
          aggrMethod: params.aggrMethod,
          aggrPeriodDuration: params.aggrPeriodDuration,
        };

        const temporalEntity = await this.getTemporalEntity(
          entity.id,
          temporalParams,
        );
        temporalEntities.push(temporalEntity);
      } catch (e: any) {
        this.logger.debug(
          `No temporal data for entity ${entity.id}: ${e.message}`,
        );
      }
    }

    return temporalEntities;
  }

  /**
   * Get available JSON-LD contexts
   * NGSI-LD Specification: GET /jsonldContexts
   */
  getJsonLdContexts(): JsonLdContextInfo[] {
    return [
      {
        '@context': NGSI_LD_CONTEXT,
        id: 'urn:ngsi-ld:Context:core',
        type: 'ContextSourceRegistration',
        url: 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld',
        kind: 'Implicit',
      },
      {
        '@context': NGSI_LD_CONTEXT,
        id: 'urn:ngsi-ld:Context:smartcity',
        type: 'ContextSourceRegistration',
        url: 'http://opendatafithou.org/contexts/smartcity.jsonld',
        kind: 'Hosted',
      },
    ];
  }

  /**
   * Get a specific JSON-LD context by ID
   * NGSI-LD Specification: GET /jsonldContexts/{contextId}
   */
  getJsonLdContextById(contextId: string): Record<string, unknown> | JsonLdContextInfo {
    const contexts = this.getJsonLdContexts();

    // Try to find by full ID or partial match
    const context = contexts.find(
      (c) =>
        c.id === contextId ||
        c.id === `urn:ngsi-ld:Context:${contextId}` ||
        c.id.endsWith(`:${contextId}`),
    );

    if (!context) {
      throw new NotFoundException(`JSON-LD Context '${contextId}' not found`);
    }

    // Return the actual context content based on the context type
    if (context.id === 'urn:ngsi-ld:Context:core') {
      return {
        '@context': {
          'ngsi-ld': 'https://uri.etsi.org/ngsi-ld/',
          id: '@id',
          type: '@type',
          Property: 'ngsi-ld:Property',
          Relationship: 'ngsi-ld:Relationship',
          GeoProperty: 'ngsi-ld:GeoProperty',
          TemporalProperty: 'ngsi-ld:TemporalProperty',
          value: 'ngsi-ld:hasValue',
          object: 'ngsi-ld:hasObject',
          observedAt: {
            '@id': 'ngsi-ld:observedAt',
            '@type': 'DateTime',
          },
          unitCode: 'ngsi-ld:unitCode',
        },
      };
    }

    if (context.id === 'urn:ngsi-ld:Context:smartcity') {
      return {
        '@context': {
          '@vocab': 'http://opendatafithou.org/ontology/',
          schema: 'http://schema.org/',
          sosa: 'http://www.w3.org/ns/sosa/',
          geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
          Device: 'sosa:Sensor',
          PointOfInterest: 'schema:Place',
          name: 'schema:name',
          location: 'geo:location',
          temperature: 'sosa:observes',
          humidity: 'sosa:observes',
          aqi: 'property:airQualityIndex',
          pm25: 'property:pm25Concentration',
          pm10: 'property:pm10Concentration',
          noiseLevel: 'property:noiseLevel',
          trafficIntensity: 'property:trafficIntensity',
          waterLevel: 'property:waterLevel',
        },
      };
    }

    return context;
  }
}
