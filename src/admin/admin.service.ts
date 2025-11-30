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

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FusekiService } from '../fuseki/fuseki.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly fusekiService: FusekiService) {}

  /**
   * Cache schema của mỗi graph để tránh query lại nhiều lần
   */
  private schemaCache: Map<string, string[]> = new Map();

  /**
   * Introspection: Tự động phát hiện các thuộc tính có trong graph
   * @param graphUrl - URL của Named Graph
   * @returns Danh sách các predicates (thuộc tính) có thực tế trong data
   */
  private async introspectGraphSchema(graphUrl: string): Promise<string[]> {
    // Kiểm tra cache
    if (this.schemaCache.has(graphUrl)) {
      return this.schemaCache.get(graphUrl)!;
    }

    try {
      // Query để lấy tất cả predicates có trong graph
      const query = `
        PREFIX ex: <http://opendatafithou.org/poi/>
        PREFIX geo1: <http://www.opendatafithou.net/ont/geosparql#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX schema: <http://schema.org/>
        
        SELECT DISTINCT ?predicate
        WHERE {
          GRAPH <${graphUrl}> {
            ?s ?predicate ?o .
            # Loại bỏ các predicates hệ thống
            FILTER(?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
            FILTER(!STRSTARTS(STR(?predicate), "http://www.w3.org/2000/01/rdf-schema#"))
            FILTER(?predicate != geo1:hasGeometry)
          }
        }
        LIMIT 100
      `.trim();

      const results = await this.fusekiService.executeSelect(query);
      const predicates = results.map((row) => row.predicate).filter(Boolean);

      // Lưu vào cache
      this.schemaCache.set(graphUrl, predicates);
      this.logger.log(`Graph ${graphUrl} has ${predicates.length} properties`);

      return predicates;
    } catch (error) {
      this.logger.error(`Failed to introspect schema for ${graphUrl}:`, error);
      return [];
    }
  }

  /**
   * Graph mapping
   */
  private getGraphMap(): Record<string, string> {
    return {
      school: 'http://160.250.5.179:3030/graph/school',
      'bus-stop': 'http://160.250.5.179:3030/graph/bus-stop',
      'play-ground': 'http://160.250.5.179:3030/graph/play-ground',
      'drinking-water': 'http://160.250.5.179:3030/graph/drinking-water',
      toilet: 'http://160.250.5.179:3030/graph/toilet',
    };
  }

  /**
   * Lấy schema (cấu trúc thuộc tính) của một loại POI
   * Trả về danh sách các thuộc tính có thực tế trong data
   */
  async getPoiSchema(type: string) {
    try {
      const graphMap = this.getGraphMap();
      const graphUrl = graphMap[type.toLowerCase()];

      if (!graphUrl) {
        throw new BadRequestException(
          `Invalid type. Allowed: ${Object.keys(graphMap).join(', ')}`
        );
      }

      // Lấy schema từ introspection
      const predicates = await this.introspectGraphSchema(graphUrl);

      // Map predicates thành field names thân thiện
      const fields = predicates.map((predicate) => {
        const parts = predicate.split(/[/#]/);
        const fieldName = parts[parts.length - 1];
        return {
          key: fieldName,
          predicate,
          label: this.generateFieldLabel(fieldName),
        };
      });

      // Thêm các field bắt buộc nếu chưa có
      const essentialFields = ['name', 'coordinates', 'address'];
      essentialFields.forEach((key) => {
        if (!fields.find((f) => f.key === key || f.key.includes(key))) {
          fields.unshift({ key, predicate: '', label: this.generateFieldLabel(key) });
        }
      });

      return {
        success: true,
        type,
        graphUrl,
        fields,
        count: fields.length,
      };
    } catch (error) {
      this.logger.error('Error fetching POI schema:', error);
      throw error;
    }
  }

  /**
   * Generate field label từ field name
   */
  private generateFieldLabel(fieldName: string): string {
    // Convert camelCase/snake_case to Title Case
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  /**
   * Lấy thống kê tổng quan cho dashboard
   * Đếm số lượng các loại POI trong database
   */
  async getDashboardStats() {
    try {
      this.logger.log('Fetching dashboard statistics');

      // Query đếm tổng số ATMs (sử dụng property ex:amenity thay vì type)
      const atmsQuery = `
        PREFIX ex: <http://opendatafithou.org/poi/>
        
        SELECT (COUNT(?poi) AS ?count)
        WHERE {
          ?poi ex:amenity ?amenity .
          FILTER(LCASE(STR(?amenity)) = "atm")
        }
      `;

      // Query đếm tổng số hospitals
      const hospitalsQuery = `
        PREFIX ex: <http://opendatafithou.org/poi/>
        
        SELECT (COUNT(?poi) AS ?count)
        WHERE {
          ?poi ex:amenity ?amenity .
          FILTER(LCASE(STR(?amenity)) = "hospital")
        }
      `;

      // Query đếm tổng số toilets
      const toiletsQuery = `
        PREFIX ex: <http://opendatafithou.org/poi/>
        
        SELECT (COUNT(?poi) AS ?count)
        WHERE {
          ?poi ex:amenity ?amenity .
          FILTER(LCASE(STR(?amenity)) = "toilets")
        }
      `;

      // Query đếm tổng số bus stops
      const busStopsQuery = `
        PREFIX ex: <http://opendatafithou.org/poi/>
        
        SELECT (COUNT(?poi) AS ?count)
        WHERE {
          ?poi ex:highway ?highway .
          FILTER(LCASE(STR(?highway)) = "bus_stop")
        }
      `;

      // Thực thi các queries
      const [atmsResult, hospitalsResult, toiletsResult, busStopsResult] = await Promise.allSettled([
        this.fusekiService.executeSelect(atmsQuery),
        this.fusekiService.executeSelect(hospitalsQuery),
        this.fusekiService.executeSelect(toiletsQuery),
        this.fusekiService.executeSelect(busStopsQuery),
      ]);

      // Xử lý kết quả
      const atmsCount =
        atmsResult.status === 'fulfilled' && atmsResult.value.length > 0
          ? parseInt(atmsResult.value[0].count || '0', 10)
          : 0;

      const hospitalsCount =
        hospitalsResult.status === 'fulfilled' && hospitalsResult.value.length > 0
          ? parseInt(hospitalsResult.value[0].count || '0', 10)
          : 0;

      const toiletsCount =
        toiletsResult.status === 'fulfilled' && toiletsResult.value.length > 0
          ? parseInt(toiletsResult.value[0].count || '0', 10)
          : 0;

      const busStopsCount =
        busStopsResult.status === 'fulfilled' && busStopsResult.value.length > 0
          ? parseInt(busStopsResult.value[0].count || '0', 10)
          : 0;

      const totalPois = atmsCount + hospitalsCount + toiletsCount + busStopsCount;

      const stats = {
        totalPois,
        monitoringPoints: 0, // Placeholder - sẽ implement sau
        totalReports: 0, // Placeholder - sẽ implement sau
        breakdown: {
          atms: atmsCount,
          hospitals: hospitalsCount,
          toilets: toiletsCount,
          busStops: busStopsCount,
        },
      };

      this.logger.log(`Dashboard stats: ${JSON.stringify(stats)}`);
      return stats;
    } catch (error) {
      this.logger.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Tạo POI mới trong database
   * Sử dụng SPARQL INSERT để thêm dữ liệu mới
   */
  async createPoi(data: any) {
    try {
      this.logger.log('Creating new POI');

      // Validate dữ liệu đầu vào
      if (!data || !data.type) {
        throw new BadRequestException('Missing required field: type');
      }

      if (!data.name) {
        throw new BadRequestException('Missing required field: name');
      }

      if (data.lat === undefined || data.lon === undefined) {
        throw new BadRequestException('Missing required fields: lat, lon');
      }

      // Generate UUID v4
      const uuid = this.generateUUID();
      
      // Tạo URI theo format yêu cầu: urn:ngsi-ld:PointOfInterest:Hanoi:{type}:{uuid}
      const typeNormalized = data.type.toLowerCase().replace(/[^a-z0-9]/g, '');
      const poiUri = `urn:ngsi-ld:PointOfInterest:Hanoi:${typeNormalized}:${uuid}`;

      // Xác định graph và ontology mapping dựa trên type
      let graphUri = 'http://localhost:3030/graph/atm'; // Default
      let schemaType = 'schema:FinancialService';

      switch (data.type.toLowerCase()) {
        case 'hospital':
          graphUri = 'http://localhost:3030/graph/hospital';
          schemaType = 'schema:MedicalClinic';
          break;
        case 'toilet':
        case 'toilets':
          graphUri = 'http://localhost:3030/graph/toilet';
          schemaType = 'schema:PublicToilet';
          break;
        case 'bus-stop':
        case 'bus_stop':
        case 'busstop':
          graphUri = 'http://localhost:3030/graph/bus_stop';
          schemaType = 'schema:BusStation';
          break;
        case 'atm':
        default:
          graphUri = 'http://localhost:3030/graph/atm';
          schemaType = 'schema:FinancialService';
      }

      // Escape chuỗi để tránh SPARQL injection
      const escapedName = this.escapeSparqlString(data.name);
      const escapedAddress = data.address ? this.escapeSparqlString(data.address) : null;

      // SPARQL INSERT query với ontology mapping đầy đủ
      const insertQuery = `
        PREFIX fiware: <https://uri.fiware.org/ns/data-models#>
        PREFIX schema: <http://schema.org/>
        PREFIX geo: <http://www.opengis.net/ont/geosparql#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        
        INSERT DATA {
          GRAPH <${graphUri}> {
            <${poiUri}> a fiware:PointOfInterest , ${schemaType} ;
              schema:name "${escapedName}" ;
              geo:lat "${data.lat}"^^xsd:decimal ;
              geo:long "${data.lon}"^^xsd:decimal ${escapedAddress ? `;
              schema:address "${escapedAddress}"` : ''} .
          }
        }
      `;

      // Thực thi INSERT query
      await this.fusekiService.update(insertQuery);

      this.logger.log(`POI created successfully: ${poiUri}`);

      return {
        success: true,
        message: 'POI created successfully',
        id: poiUri,
        uuid,
        graphUri,
      };
    } catch (error) {
      this.logger.error('Error creating POI:', error);
      throw error;
    }
  }

  /**
   * Xóa POI khỏi database
   * Sử dụng SPARQL DELETE để xóa tất cả triples liên quan đến POI
   */
  async deletePoi(id: string) {
    try {
      this.logger.log(`Deleting POI: ${id}`);

      // Validate ID
      if (!id || !id.trim()) {
        throw new BadRequestException('Missing required field: id');
      }

      // SPARQL DELETE query để xóa tất cả triples có subject là POI này
      const deleteQuery = `
        DELETE WHERE {
          <${id}> ?p ?o .
        }
      `;

      // Thực thi DELETE query
      await this.fusekiService.update(deleteQuery);

      this.logger.log(`POI deleted successfully: ${id}`);

      return {
        success: true,
        message: 'POI deleted successfully',
        id,
      };
    } catch (error) {
      this.logger.error('Error deleting POI:', error);
      throw error;
    }
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Escape chuỗi cho SPARQL để tránh injection
   */
  private escapeSparqlString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Lấy dữ liệu traffic IoT cho map
   * Return empty array nếu graph chưa tồn tại hoặc rỗng
   */
  async getTrafficData() {
    try {
      this.logger.log('Fetching traffic IoT data');

      const query = `
PREFIX sosa: <http://www.w3.org/ns/sosa/>
PREFIX ex: <http://opendatafithou.org/sensor/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?sensor ?sensorLabel ?lat ?lon ?intensity ?congested
WHERE {
  GRAPH <http://opendatafithou.org/graph/iot-traffic> {
    ?obs a sosa:Observation ;
      sosa:madeBySensor ?sensor ;
      sosa:hasSimpleResult ?intensity ;
      ex:congested ?congested ;
      ex:sensorType "traffic_camera" .
      
    ?sensor rdfs:label ?sensorLabel ;
      geo:lat ?lat ;
      geo:long ?lon .
  }
}
      `.trim();

      const results = await this.fusekiService.executeSelect(query);

      // Transform kết quả thành format sạch cho frontend
      const trafficData = results.map((row) => ({
        id: row.sensor?.split('/').pop() || 'unknown',
        name: row.sensorLabel || 'Unknown Sensor',
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        intensity: parseInt(row.intensity, 10),
        congested: row.congested === 'true',
      }));

      this.logger.log(`Traffic data fetched: ${trafficData.length} sensors`);
      return trafficData;
    } catch (error) {
      // Return empty array thay vì throw error (graph có thể chưa tồn tại)
      this.logger.warn('Traffic data fetch returned empty (graph may not exist yet)');
      return [];
    }
  }

  /**
   * Lấy dữ liệu flood IoT cho map
   * Return empty array nếu graph chưa tồn tại hoặc rỗng
   */
  async getFloodData() {
    try {
      this.logger.log('Fetching flood IoT data');

      const query = `
PREFIX sosa: <http://www.w3.org/ns/sosa/>
PREFIX ex: <http://opendatafithou.org/sensor/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?sensor ?sensorLabel ?lat ?lon ?waterLevel ?alertLevel
WHERE {
  GRAPH <http://opendatafithou.org/graph/iot-flood> {
    ?obs a sosa:Observation ;
      sosa:madeBySensor ?sensor ;
      sosa:hasSimpleResult ?waterLevel ;
      ex:alertLevel ?alertLevel ;
      ex:sensorType "flood_sensor" .
      
    ?sensor rdfs:label ?sensorLabel ;
      geo:lat ?lat ;
      geo:long ?lon .
  }
}
      `.trim();

      const results = await this.fusekiService.executeSelect(query);

      // Transform kết quả thành format sạch cho frontend
      const floodData = results.map((row) => ({
        id: row.sensor?.split('/').pop() || 'unknown',
        name: row.sensorLabel || 'Unknown Sensor',
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        waterLevel: parseInt(row.waterLevel, 10),
        alertLevel: row.alertLevel || 'normal',
      }));

      this.logger.log(`Flood data fetched: ${floodData.length} sensors`);
      return floodData;
    } catch (error) {
      // Return empty array thay vì throw error (graph có thể chưa tồn tại)
      this.logger.warn('Flood data fetch returned empty (graph may not exist yet)');
      return [];
    }
  }

  /**
   * Lấy danh sách POIs từ Named Graphs với filter theo type
   * @param type - Loại POI (school, bus-stop, play-ground, drinking-water, toilet, all)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param limit - Số lượng items mỗi trang (mặc định: 10)
   */
  async getPois(type?: string, page: number = 1, limit: number = 10) {
    try {
      this.logger.log(`Fetching POIs: type=${type}, page=${page}, limit=${limit}`);

      // Validate pagination params
      const validPage = Math.max(1, page);
      const validLimit = Math.min(Math.max(1, limit), 100); // Max 100 items per page

      // Map type to graph URL
      const graphMap = this.getGraphMap();

      // Determine which graphs to query
      let graphUrls: string[] = [];
      
      if (!type || type === 'all') {
        // Query all graphs
        graphUrls = Object.values(graphMap);
      } else {
        // Query specific graph
        const graphUrl = graphMap[type.toLowerCase()];
        if (!graphUrl) {
          throw new BadRequestException(
            `Invalid type. Allowed: ${Object.keys(graphMap).join(', ')}, all`
          );
        }
        graphUrls = [graphUrl];
      }

      // Fetch data from all selected graphs
      const allPois: any[] = [];

      for (const graphUrl of graphUrls) {
        try {
          const pois = await this.fetchPoisFromGraph(graphUrl, validLimit * 2);
          allPois.push(...pois);
        } catch (err) {
          this.logger.warn(`Failed to fetch from graph ${graphUrl}: ${err.message}`);
          // Continue with other graphs
        }
      }

      // Sort by name and apply pagination
      const sortedPois = allPois.sort((a, b) => a.name.localeCompare(b.name));
      const startIndex = (validPage - 1) * validLimit;
      const endIndex = startIndex + validLimit;
      const paginatedPois = sortedPois.slice(startIndex, endIndex);

      return {
        success: true,
        data: paginatedPois,
        pagination: {
          page: validPage,
          limit: validLimit,
          total: sortedPois.length,
          totalPages: Math.ceil(sortedPois.length / validLimit),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching POIs:', error);
      throw error;
    }
  }

  /**
   * Fetch POIs từ một Named Graph cụ thể
   * Sử dụng introspection để query động chỉ những thuộc tính có trong data
   * @param graphUrl - URL của Named Graph
   * @param limit - Số lượng tối đa
   */
  private async fetchPoisFromGraph(graphUrl: string, limit: number = 20): Promise<any[]> {
    try {
      // Lấy schema (danh sách predicates) có trong graph
      const predicates = await this.introspectGraphSchema(graphUrl);
      
      if (predicates.length === 0) {
        this.logger.warn(`No predicates found in graph ${graphUrl}`);
        return [];
      }

      // Build SPARQL SELECT variables động
      const selectVars = ['?s'];
      const optionalPatterns: string[] = [];

      // Map predicates thành variables
      const predicateMap: Record<string, string> = {};
      predicates.forEach((predicate, index) => {
        const varName = `?p${index}`;
        selectVars.push(varName);
        optionalPatterns.push(`OPTIONAL { ?s <${predicate}> ${varName} }`);
        predicateMap[predicate] = varName.substring(1); // Remove '?'
      });

      // Build query động
      const query = `
        PREFIX geo1: <http://www.opendatafithou.net/ont/geosparql#>
        
        SELECT ${selectVars.join(' ')}
        WHERE {
          GRAPH <${graphUrl}> {
            ?s a geo1:Point .
            ${optionalPatterns.join('\n            ')}
          }
        }
        LIMIT ${limit}
      `.trim();

      this.logger.debug(`Dynamic query for ${graphUrl}:\n${query}`);

      const results = await this.fusekiService.executeSelect(query);

      // Transform results thành POI objects
      return this.transformGraphResults(results, predicates, predicateMap, graphUrl);
    } catch (error) {
      this.logger.error(`Error fetching from graph ${graphUrl}:`, error);
      return [];
    }
  }

  /**
   * Transform SPARQL results thành POI objects
   */
  private transformGraphResults(
    results: any[],
    predicates: string[],
    predicateMap: Record<string, string>,
    graphUrl: string,
  ): any[] {

    return results
      .map((row) => {
        try {
          const typeFromGraph = this.extractTypeFromGraph(graphUrl);
          
          // Build POI object động từ predicates
          const poi: any = {
            id: row.s,
            type: typeFromGraph,
          };

          // Map từng predicate sang field
          predicates.forEach((predicate) => {
            const varName = predicateMap[predicate];
            const value = row[varName];
            
            if (!value) return; // Skip null values

            // Extract field name từ predicate URI
            const parts = predicate.split(/[/#]/);
            let fieldName = parts[parts.length - 1];
            
            // Special handling cho các field quan trọng
            if (fieldName === 'asWKT' || predicate.includes('asWKT')) {
              poi.wkt = value;
              try {
                const { lat, lon } = this.parseWKT(value);
                poi.lat = lat;
                poi.lon = lon;
              } catch (e) {
                this.logger.warn(`Failed to parse WKT: ${value}`);
              }
            } else if (fieldName === 'label' || fieldName.includes('name')) {
              if (!poi.name) poi.name = value;
            } else if (fieldName.includes('addr') || fieldName === 'address') {
              poi.address = value;
            } else {
              // Normalize field name
              fieldName = fieldName.replace(/:/g, '_');
              poi[fieldName] = value;
            }
          });

          // Fallback cho name
          if (!poi.name) {
            const id = poi.id?.split('/').pop() || 'unknown';
            poi.name = `POI #${id.substring(0, 10)}`;
          }

          // Ensure coordinates exist
          if (!poi.lat || !poi.lon) {
            throw new Error('Missing coordinates');
          }

          return poi;
        } catch (parseError) {
          this.logger.warn(`Failed to parse POI: ${parseError.message}`, row);
          return null;
        }
      })
      .filter((poi) => poi !== null);
  }

  /**
   * Parse WKT string để lấy lat/lon
   * Format: "POINT(lon lat)" hoặc "POINT (lon lat)"
   * VD: "POINT(105.835 21.029)"
   */
  private parseWKT(wkt: string): { lat: number; lon: number } {
    if (!wkt || typeof wkt !== 'string') {
      throw new Error('Invalid or missing WKT');
    }

    // Regex để extract coordinates từ POINT(lon lat)
    const match = wkt.match(/POINT\s*\(\s*([\d.-]+)\s+([\d.-]+)\s*\)/i);
    
    if (!match) {
      throw new Error(`Invalid WKT format: ${wkt}`);
    }

    const lon = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    // Validate coordinates
    if (isNaN(lat) || isNaN(lon)) {
      throw new Error(`Invalid coordinates in WKT: ${wkt}`);
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(`Coordinates out of range: lat=${lat}, lon=${lon}`);
    }

    return { lat, lon };
  }

  /**
   * Extract type từ Graph URL
   * VD: "http://160.250.5.179:3030/graph/school" -> "school"
   */
  private extractTypeFromGraph(graphUrl: string): string {
    const match = graphUrl.match(/\/graph\/([^/]+)$/);
    return match ? match[1] : 'unknown';
  }
}
