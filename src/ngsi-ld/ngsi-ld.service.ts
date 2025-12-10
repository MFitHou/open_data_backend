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
   * Xác định loại entity từ URI (Device hoặc PointOfInterest).
   * @param uri URI của entity
   * @returns Loại entity
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
   * Tạo đối tượng Property theo chuẩn NGSI-LD.
   * @param value Giá trị thuộc tính
   * @param unitCode Mã đơn vị (tùy chọn)
   * @param observedAt Thời gian quan sát (tùy chọn)
   * @returns Đối tượng NgsiLdProperty
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
   * Tạo đối tượng GeoProperty (tọa độ) theo chuẩn NGSI-LD.
   * @param lon Kinh độ
   * @param lat Vĩ độ
   * @returns Đối tượng NgsiLdGeoProperty
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
   * Tạo đối tượng Relationship theo chuẩn NGSI-LD.
   * @param object URI hoặc mảng URI của entity liên quan
   * @returns Đối tượng NgsiLdRelationship
   */
  private createRelationship(object: string | string[]): NgsiLdRelationship {
    return {
      type: 'Relationship',
      object,
    };
  }

  /**
   * Trích xuất loại entity từ danh sách rdf:type URIs.
   * @param rdfTypes Mảng URI rdf:type
   * @returns Tên loại entity (ví dụ: Playground, PointOfInterest)
   */
  private extractTypeFromRdfTypes(rdfTypes: string[]): string {
    if (!rdfTypes || rdfTypes.length === 0) {
      return 'PointOfInterest';
    }

    for (const typeUri of rdfTypes) {
      const schemaMatch = typeUri.match(/schema\.org\/(\w+)$/);
      if (schemaMatch && schemaMatch[1] !== 'Thing') {
        return schemaMatch[1];
      }
    }

    for (const typeUri of rdfTypes) {
      const smartMatch = typeUri.match(/smartdatamodels\.org\/[^\/]+\/(\w+)$/);
      if (smartMatch) {
        return smartMatch[1];
      }
    }

    // Nếu không tìm thấy, lấy phần cuối của URI
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
   * Chuyển đổi dữ liệu POI sang định dạng NGSI-LD entity.
   * @param poi Đối tượng POI từ Fuseki
   * @param includeContext Có thêm @context hay không
   * @returns Đối tượng NgsiLdEntity
   */
  private poiToNgsiLd(poi: any, includeContext: boolean = true): NgsiLdEntity {
    let entityType = 'PointOfInterest';

    if (poi.rdfTypes && poi.rdfTypes.length > 0) {
      entityType = this.extractTypeFromRdfTypes(poi.rdfTypes);
    } else if (poi.device) {
      entityType = 'Device';
    } else if (poi.leisure) {
      entityType = poi.leisure.charAt(0).toUpperCase() + poi.leisure.slice(1);
    } else if (poi.amenity) {
      entityType = poi.amenity.charAt(0).toUpperCase() + poi.amenity.slice(1);
    } else if (poi.highway) {
      entityType = poi.highway
        .split('_')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
    }

    const entity: NgsiLdEntity = {
      '@context': includeContext ? NGSI_LD_CONTEXT : [],
      id: poi.poi,
      type: entityType,
    };

    //Thêm name
    if (poi.name) {
      entity.name = this.createProperty(poi.name);
    }

    // Thêm location
    if (poi.lon !== null && poi.lat !== null) {
      entity.location = this.createGeoProperty(poi.lon, poi.lat);
    }

    // Thêm các thuộc tính chung khác
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

    // Thêm khoảng cách nếu có
    if (poi.distanceKm !== undefined && poi.distanceKm > 0) {
      entity.distance = this.createProperty(poi.distanceKm * 1000, 'MTR');
    }

    // Thêm dữ liệu cảm biến nếu có
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

    // Thêm quan hệ thiết bị nếu có
    if (poi.device) {
      entity.hosts = this.createRelationship(poi.device);
    }

    // Thêm các quan hệ topology (sử dụng URI gốc từ Fuseki)
    if (poi.topology && poi.topology.length > 0) {
      const isNextTo: string[] = [];
      const containedInPlace: string[] = [];

      for (const rel of poi.topology) {
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
   * Chuyển đổi NGSI-LD entity sang định dạng keyValues (giá trị thuần).
   * @param entity Đối tượng NgsiLdEntity
   * @returns Object key-value
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
   * Lọc thuộc tính của entity theo tham số attrs.
   * @param entity Đối tượng NgsiLdEntity
   * @param attrs Chuỗi tên thuộc tính cần giữ lại (phân cách bằng dấu phẩy)
   * @returns Đối tượng NgsiLdEntity đã lọc
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

    // Đảm bảo luôn bao gồm location nếu có
    if (attrList.includes('location') && entity.location) {
      filtered.location = entity.location;
    }

    return filtered;
  }

  /**
   * Lấy thông tin chi tiết của một entity theo ID (URI).
   * @param entityId URI entity
   * @param params Tham số truy vấn (attrs, options)
   * @returns Đối tượng NgsiLdEntity hoặc keyValues
   */
  async getEntity(
    entityId: string,
    params: GetEntityDto,
  ): Promise<NgsiLdEntity | any> {
    this.logger.debug(`[getEntity] Fetching entity: ${entityId}`);

    const result = await this.fusekiService.getPOIByUri({
      uri: entityId,
      language: 'en',
    });

    if (!result.found || !result.poi) {
      throw new NotFoundException(`Entity not found: ${entityId}`);
    }

    // Convert to NGSI-LD format
    let entity = this.poiToNgsiLd(result.poi);
    if (params.attrs) {
      entity = this.filterAttributes(entity, params.attrs);
    }

    if (params.options === NgsiLdOptions.KEY_VALUES) {
      return this.entityToKeyValues(entity);
    }

    return entity;
  }

  /**
   * Truy vấn danh sách entities với các bộ lọc (type, q, georel, ...).
   * @param params Tham số truy vấn
   * @returns Đối tượng NgsiLdEntityCollection
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

    let amenityFilter: string | undefined;
    if (q) {
      const amenityMatch = q.match(/amenity\s*==\s*"?([^"]+)"?/);
      if (amenityMatch) {
        amenityFilter = amenityMatch[1];
      }
    }

    if (georel && coordinates) {
      let coords: number[];
      try {
        coords = JSON.parse(coordinates);
      } catch {
        throw new BadRequestException(
          'Invalid coordinates format. Expected JSON array [lon, lat]',
        );
      }

      let maxDistance = 1000; 
      const distanceMatch = georel.match(/maxDistance\s*==\s*(\d+)/);
      if (distanceMatch) {
        maxDistance = parseInt(distanceMatch[1], 10);
      }

      const radiusKm = maxDistance / 1000;

      const searchResult = await this.fusekiService.searchNearby({
        lat: coords[1],
        lon: coords[0],
        radiusKm,
        types: amenityFilter ? [amenityFilter] : ['atm'], 
        limit: limit || 20,
        language: 'en',
      });

      results = searchResult.items;
      totalCount = searchResult.count;
    } else if (type === 'Device') {
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
   * Lấy dữ liệu lịch sử (temporal) cho một entity (chỉ hỗ trợ Device).
   * @param entityId URI entity
   * @param params Tham số truy vấn temporal
   * @returns Đối tượng NgsiLdEntity chứa dữ liệu lịch sử
   */
  async getTemporalEntity(
    entityId: string,
    params: TemporalQueryDto,
  ): Promise<NgsiLdEntity> {
    this.logger.debug(
      `[getTemporalEntity] Fetching temporal data: ${entityId}`,
    );

    const entityType = this.getEntityTypeFromUri(entityId);
    if (entityType !== 'Device') {
      throw new BadRequestException(
        'Temporal queries are only supported for Device entities',
      );
    }

    const stationId = entityId;

    let measurements: MeasurementType[] = [
      'air_quality',
      'weather',
      'traffic',
      'flood',
    ];
    let fieldsToQuery: string[] | undefined;

    if (params.attrs) {
      fieldsToQuery = params.attrs.split(',').map((a) => a.trim());
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

      measurements = [
        ...new Set(
          fieldsToQuery
            .filter((f) => attrToField[f])
            .map((f) => attrToField[f].measurement),
        ),
      ] as MeasurementType[];
    }

    const startTime = params.timeAt;
    const endTime = params.endTimeAt;

    let aggregateWindow: string | undefined;
    if (params.aggrPeriodDuration) {
      const durationMatch =
        params.aggrPeriodDuration.match(/PT?(\d+)([HDMS])/i);
      if (durationMatch) {
        const value = durationMatch[1];
        const unit = durationMatch[2].toLowerCase();
        aggregateWindow = `${value}${unit}`;
      }
    }

    const temporalEntity: NgsiLdEntity = {
      '@context': NGSI_LD_CONTEXT,
      id: entityId,
      type: 'Device',
    };

    // Truy vấn dữ liệu cho từng measurement
    for (const measurement of measurements) {
      try {
        const measurementFields = MEASUREMENTS[measurement]
          .fields as readonly string[];
        const requestedFields = fieldsToQuery
          ? measurementFields.filter((f) => {
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

        // Thêm dữ liệu vào temporalEntity với tên thuộc tính NGSI-LD
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
   * Lấy danh sách loại entity hỗ trợ (Device, PointOfInterest).
   * @returns Mảng tên loại entity
   */
  getEntityTypes(): string[] {
    return ['Device', 'PointOfInterest'];
  }

  /**
   * Lấy danh sách thuộc tính cho một loại entity.
   * @param entityType Tên loại entity
   * @returns Mảng tên thuộc tính
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
   * Lấy thông tin chi tiết về một loại entity (số lượng, thuộc tính, ...).
   * @param typeName Tên loại entity
   * @returns Object thông tin loại entity
   */
  async getTypeDetails(typeName: string): Promise<any> {
    const validTypes = await this.getEntityTypes();
    if (!validTypes.includes(typeName)) {
      throw new NotFoundException(`Entity type '${typeName}' not found`);
    }

    const attributes = await this.getAttributes(typeName);

    let entityCount = 0;
    try {
      if (typeName === 'Device') {
        const result = await this.fusekiService.getAllIoTStations();
        entityCount = result.stations?.length || 0;
      } else if (typeName === 'PointOfInterest') {
        const result = await this.fusekiService.searchNearby({
          lat: 21.0285,
          lon: 105.8542,
          radiusKm: 50, 
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
   * Xác định kiểu thuộc tính NGSI-LD cho một thuộc tính (Property, GeoProperty, Relationship).
   * @param attrName Tên thuộc tính
   * @returns Mảng kiểu thuộc tính
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
   * Lấy thông tin chi tiết về một thuộc tính (số lượng entity có thuộc tính này, loại entity, ...).
   * @param attrName Tên thuộc tính
   * @returns Object thông tin thuộc tính
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
   * Truy vấn dữ liệu lịch sử cho nhiều entity.
   * @param params Tham số truy vấn temporal (type, ids, attrs, timeAt, ...)
   * @returns Mảng NgsiLdEntity chứa dữ liệu lịch sử
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
    const queryParams: QueryEntitiesDto = {
      type: params.type || 'Device', 
      q: params.q,
      idPattern: params.idPattern,
      attrs: params.attrs?.join(','),
      limit: 100,
    };

    let entities: NgsiLdEntity[] = [];

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
      const collection = await this.queryEntities(queryParams);
      entities = collection.entities || [];
    }

    const deviceEntities = entities.filter((e) => e.type === 'Device');
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
   * Lấy danh sách các JSON-LD context hỗ trợ.
   * @returns Mảng thông tin context
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
   * Lấy thông tin chi tiết về một JSON-LD context theo ID.
   * @param contextId ID context
   * @returns Đối tượng context hoặc thông tin context
   */
  getJsonLdContextById(contextId: string): Record<string, unknown> | JsonLdContextInfo {
    const contexts = this.getJsonLdContexts();

    const context = contexts.find(
      (c) =>
        c.id === contextId ||
        c.id === `urn:ngsi-ld:Context:${contextId}` ||
        c.id.endsWith(`:${contextId}`),
    );

    if (!context) {
      throw new NotFoundException(`JSON-LD Context '${contextId}' not found`);
    }

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
