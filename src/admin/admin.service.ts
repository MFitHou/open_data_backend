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
import { AdminFusekiService } from './admin-fuseki.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly fusekiService: AdminFusekiService) {}

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
        PREFIX ext: <http://opendatafithou.org/def/extension/>
        PREFIX geo: <http://www.opengis.net/ont/geosparql#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX schema: <http://schema.org/>
        PREFIX fiware: <https://smartdatamodels.org/dataModel.PointOfInterest/>
        
        SELECT DISTINCT ?predicate
        WHERE {
          GRAPH <${graphUrl}> {
            ?s ?predicate ?o .
            # Loại bỏ các predicates hệ thống
            FILTER(?predicate != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>)
            FILTER(!STRSTARTS(STR(?predicate), "http://www.w3.org/2000/01/rdf-schema#"))
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
   * Graph mapping - Map từ type tới graph URL
   * Tên type chuẩn hóa theo file TTL (dùng underscore và dấu gạch nối)
   * Hỗ trợ cả underscore và hyphen format để tương thích
   */
  private getGraphMap(): Record<string, string> {
    return {
      // ATM & Banking
      atm: process.env.FUSEKI_GRAPH_ATM || 'http://localhost:3030/graph/atm',
      bank: process.env.FUSEKI_GRAPH_BANK || 'http://localhost:3030/graph/bank',

      // Transport
      bus_stop:
        process.env.FUSEKI_GRAPH_BUS_STOP ||
        'http://localhost:3030/graph/bus_stop',

      // Food & Drink
      cafe: process.env.FUSEKI_GRAPH_CAFE || 'http://localhost:3030/graph/cafe',
      restaurant:
        process.env.FUSEKI_GRAPH_RESTAURANT ||
        'http://localhost:3030/graph/restaurant',

      // Retail
      convenience_store:
        process.env.FUSEKI_GRAPH_CONVENIENCE_STORE ||
        'http://localhost:3030/graph/convenience_store',
      supermarket:
        process.env.FUSEKI_GRAPH_SUPERMARKET ||
        'http://localhost:3030/graph/supermarket',
      marketplace:
        process.env.FUSEKI_GRAPH_MARKETPLACE ||
        'http://localhost:3030/graph/marketplace',
      warehouse:
        process.env.FUSEKI_GRAPH_WAREHOUSE ||
        'http://localhost:3030/graph/warehouse',

      // Healthcare
      hospital:
        process.env.FUSEKI_GRAPH_HOSPITAL ||
        'http://localhost:3030/graph/hospital',
      clinic:
        process.env.FUSEKI_GRAPH_CLINIC || 'http://localhost:3030/graph/clinic',
      pharmacy:
        process.env.FUSEKI_GRAPH_PHARMACY ||
        'http://localhost:3030/graph/pharmacy',

      // Education
      school:
        process.env.FUSEKI_GRAPH_SCHOOL || 'http://localhost:3030/graph/school',
      university:
        process.env.FUSEKI_GRAPH_UNIVERSITY ||
        'http://localhost:3030/graph/university',
      kindergarten:
        process.env.FUSEKI_GRAPH_KINDERGARTEN ||
        'http://localhost:3030/graph/kindergarten',

      // Recreation
      playground:
        process.env.FUSEKI_GRAPH_PLAY_GROUNDS ||
        'http://localhost:3030/graph/playground',
      park: process.env.FUSEKI_GRAPH_PARK || 'http://localhost:3030/graph/park',

      // Infrastructure
      charging_station:
        process.env.FUSEKI_GRAPH_CHARGING_STATION ||
        'http://localhost:3030/graph/charging_station',
      fuel_station:
        process.env.FUSEKI_GRAPH_FUEL_STATION ||
        'http://localhost:3030/graph/fuel_station',
      parking:
        process.env.FUSEKI_GRAPH_PARKING ||
        'http://localhost:3030/graph/parking',

      // Public Services
      post_office:
        process.env.FUSEKI_GRAPH_POST_OFFICE ||
        'http://localhost:3030/graph/post_office',
      library:
        process.env.FUSEKI_GRAPH_LIBRARY ||
        'http://localhost:3030/graph/library',
      community_centre:
        process.env.FUSEKI_GRAPH_COMMUNITY_CENTER ||
        'http://localhost:3030/graph/community_centre',

      // Emergency Services
      police:
        process.env.FUSEKI_GRAPH_POLICE || 'http://localhost:3030/graph/police',
      fire_station:
        process.env.FUSEKI_GRAPH_FIRE_STATION ||
        'http://localhost:3030/graph/fire_station',

      // Utilities
      drinking_water:
        process.env.FUSEKI_GRAPH_DRINKING_WATER ||
        'http://localhost:3030/graph/drinking_water',
      public_toilet:
        process.env.FUSEKI_GRAPH_TOILETS ||
        'http://localhost:3030/graph/public_toilet',
      waste_basket:
        process.env.FUSEKI_GRAPH_WASTE_BASKET ||
        'http://localhost:3030/graph/waste_basket',
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
          `Invalid type. Allowed: ${Object.keys(graphMap).join(', ')}`,
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
          fields.unshift({
            key,
            predicate: '',
            label: this.generateFieldLabel(key),
          });
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
   * Đếm số lượng các loại POI trong database từ tất cả các graph
   */
  async getDashboardStats() {
    try {
      this.logger.log('Fetching dashboard statistics');

      const graphMap = this.getGraphMap();
      const breakdown: Record<string, number> = {};
      let totalPois = 0;

      // Query template để đếm số POI trong một graph
      const createCountQuery = (graphUrl: string) => `
        PREFIX fiware: <https://smartdatamodels.org/dataModel.PointOfInterest/>
        
        SELECT (COUNT(DISTINCT ?poi) AS ?count)
        WHERE {
          GRAPH <${graphUrl}> {
            ?poi a fiware:PointOfInterest .
          }
        }
      `;

      // Tạo promises để đếm từng loại POI
      const countPromises = Object.entries(graphMap).map(
        async ([type, graphUrl]) => {
          try {
            const query = createCountQuery(graphUrl);
            const results = await this.fusekiService.executeSelect(query);
            const count =
              results.length > 0 ? parseInt(results[0].count || '0', 10) : 0;
            return { type, count };
          } catch (error) {
            this.logger.warn(
              `Failed to count ${type} from ${graphUrl}: ${error.message}`,
            );
            return { type, count: 0 };
          }
        },
      );

      // Thực thi tất cả queries song song
      const results = await Promise.all(countPromises);

      // Tổng hợp kết quả
      results.forEach(({ type, count }) => {
        breakdown[type] = count;
        totalPois += count;
      });

      const stats = {
        totalPois,
        graphCount: Object.keys(graphMap).length,
        breakdown,
        // Top 5 categories
        topCategories: Object.entries(breakdown)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([type, count]) => ({ type, count })),
      };

      this.logger.log(
        `Dashboard stats: ${totalPois} total POIs across ${Object.keys(graphMap).length} categories`,
      );
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

      // Generate OSM-like ID (số nguyên lớn)
      const osmId = Math.floor(Math.random() * 9000000000) + 1000000000;

      // Tạo URI theo format: urn:ngsi-ld:PointOfInterest:Hanoi:{type}:{osmId}
      const typeNormalized = data.type
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');
      const poiUri = `urn:ngsi-ld:PointOfInterest:Hanoi:${typeNormalized}:${osmId}`;

      // Lấy graph URI từ graph map
      const graphMap = this.getGraphMap();
      const graphUri = graphMap[data.type.toLowerCase()] || graphMap['atm'];

      // Mapping type sang schema.org class
      const typeSchemaMap: Record<string, string> = {
        atm: 'schema:FinancialService',
        bank: 'schema:BankOrCreditUnion',
        hospital: 'schema:Hospital',
        clinic: 'schema:MedicalClinic',
        public_toilet: 'schema:PublicToilet',
        bus_stop: 'schema:BusStop',
        school: 'schema:School',
        university: 'schema:CollegeOrUniversity',
        library: 'schema:Library',
        post_office: 'schema:PostOffice',
        police: 'schema:PoliceStation',
        fire_station: 'schema:FireStation',
        park: 'schema:Park',
        playground: 'schema:Playground',
        parking: 'schema:ParkingFacility',
        restaurant: 'schema:Restaurant',
        cafe: 'schema:CafeOrCoffeeShop',
        supermarket: 'schema:GroceryStore',
        pharmacy: 'schema:Pharmacy',
        fuel_station: 'schema:GasStation',
        charging_station: 'schema:ChargingStation',
      };

      const schemaType =
        typeSchemaMap[data.type.toLowerCase()] || 'schema:Place';

      // Escape chuỗi để tránh SPARQL injection
      const escapedName = this.escapeSparqlString(data.name);
      const escapedAddress = data.address
        ? this.escapeSparqlString(data.address)
        : null;

      // Tạo WKT string: POINT(lon lat)
      const wktString = `POINT(${data.lon} ${data.lat})`;

      // SPARQL INSERT query với cấu trúc mới
      const insertQuery = `
        PREFIX ext: <http://opendatafithou.org/def/extension/>
        PREFIX fiware: <https://smartdatamodels.org/dataModel.PointOfInterest/>
        PREFIX schema: <http://schema.org/>
        PREFIX geo: <http://www.opengis.net/ont/geosparql#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        
        INSERT DATA {
          GRAPH <${graphUri}> {
            <${poiUri}> a ${schemaType} , fiware:PointOfInterest ;
              ext:osm_id ${osmId} ;
              ext:osm_type "node" ;
              schema:name "${escapedName}"@vi ${escapedAddress ? `;
              schema:address "${escapedAddress}"` : ''} ;
              geo:asWKT "${wktString}"^^geo:wktLiteral .
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
        osmId,
        graphUri,
      };
    } catch (error) {
      this.logger.error('Error creating POI:', error);
      throw error;
    }
  }

  /**
   * Xóa POI khỏi database
   * Sử dụng SPARQL DELETE để xóa tất cả triples liên quan đến POI từ tất cả các graph
   */
  async deletePoi(id: string) {
    try {
      this.logger.log(`Deleting POI: ${id}`);

      // Validate ID
      if (!id || !id.trim()) {
        throw new BadRequestException('Missing required field: id');
      }

      // Lấy danh sách tất cả các graph
      const graphMap = this.getGraphMap();
      const graphUrls = Object.values(graphMap);

      // SPARQL DELETE query để xóa từ tất cả các graph
      const deletePromises = graphUrls.map(async (graphUrl) => {
        const deleteQuery = `
          DELETE WHERE {
            GRAPH <${graphUrl}> {
              <${id}> ?p ?o .
            }
          }
        `;

        try {
          await this.fusekiService.update(deleteQuery);
        } catch (error) {
          this.logger.warn(
            `Failed to delete from ${graphUrl}: ${error.message}`,
          );
        }
      });

      // Thực thi tất cả các DELETE queries
      await Promise.all(deletePromises);

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
   * DEPRECATED - IoT simulation không còn được sử dụng
   */
  async getTrafficData() {
    this.logger.warn(
      'getTrafficData() is deprecated - IoT simulation has been disabled',
    );
    return [];
  }

  /**
   * Lấy dữ liệu flood IoT cho map
   * DEPRECATED - IoT simulation không còn được sử dụng
   */
  async getFloodData() {
    this.logger.warn(
      'getFloodData() is deprecated - IoT simulation has been disabled',
    );
    return [];
  }

  /**
   * Lấy danh sách POIs từ Named Graphs với filter theo type
   * @param type - Loại POI (school, bus-stop, play-ground, drinking-water, toilet, all)
   * @param page - Trang hiện tại (mặc định: 1)
   * @param limit - Số lượng items mỗi trang (mặc định: 10)
   */
  async getPois(type?: string, page: number = 1, limit: number = 10, isLightweight: boolean = false) {
    try {
      this.logger.log(`Fetching POIs: type=${type}, page=${page}, limit=${limit}, lightweight=${isLightweight}`);

      // Lightweight mode: lấy TẤT CẢ POIs không giới hạn (cho map display)
      // Full mode: áp dụng pagination với limit (cho table/list)
      const shouldPaginate = !isLightweight;
      const validPage = Math.max(1, page);
      const validLimit = shouldPaginate ? Math.min(Math.max(1, limit), 100) : 10000; // Max 100 for pagination, 10000 for map

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
            `Invalid type. Allowed: ${Object.keys(graphMap).join(', ')}, all`,
          );
        }
        graphUrls = [graphUrl];
      }

      // Fetch data from all selected graphs
      const allPois: any[] = [];

      for (const graphUrl of graphUrls) {
        try {
          const pois = await this.fetchPoisFromGraph(graphUrl, validLimit * 2, isLightweight);
          allPois.push(...pois);
        } catch (err) {
          this.logger.warn(
            `Failed to fetch from graph ${graphUrl}: ${err.message}`,
          );
          // Continue with other graphs
        }
      }

      // Deduplicate POIs by ID (xử lý trường hợp schema:name có nhiều language tags)
      const uniquePoisMap = new Map<string, any>();
      
      const isVietnamese = (str: string): boolean => {
        if (!str) return false;
        return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(str);
      };
      
      for (const poi of allPois) {
        const existingPoi = uniquePoisMap.get(poi.id);
        
        if (!existingPoi) {
          // First occurrence - add to map
          uniquePoisMap.set(poi.id, poi);
        } else {
          // Duplicate detected - merge data with Vietnamese preference
          
          // Handle name: always prefer Vietnamese
          if (poi.name) {
            const poiIsVi = isVietnamese(poi.name);
            const existingIsVi = isVietnamese(existingPoi.name || '');
            
            // Overwrite if:
            // - Current is Vietnamese and existing is not
            // - OR current has content and existing is placeholder (POI #xxx)
            if ((poiIsVi && !existingIsVi) || 
                (!poi.name.match(/POI #/) && (existingPoi.name || '').match(/POI #/))) {
              existingPoi.name = poi.name;
            }
          }
          
          // Merge other fields if missing in existing POI
          for (const key of Object.keys(poi)) {
            if (key !== 'name' && !existingPoi[key] && poi[key]) {
              existingPoi[key] = poi[key];
            }
          }
        }
      }

      // Convert map back to array
      const uniquePois = Array.from(uniquePoisMap.values());

      // Sort by name
      const sortedPois = uniquePois.sort((a, b) => a.name.localeCompare(b.name));

      // Apply pagination chỉ khi KHÔNG phải lightweight mode
      let finalPois = sortedPois;
      if (shouldPaginate) {
        const startIndex = (validPage - 1) * validLimit;
        const endIndex = startIndex + validLimit;
        finalPois = sortedPois.slice(startIndex, endIndex);
      }

      return {
        success: true,
        data: finalPois,
        pagination: shouldPaginate ? {
          page: validPage,
          limit: validLimit,
          total: sortedPois.length,
          totalPages: Math.ceil(sortedPois.length / validLimit),
        } : {
          page: 1,
          limit: sortedPois.length,
          total: sortedPois.length,
          totalPages: 1,
        },
      };
    } catch (error) {
      this.logger.error('Error fetching POIs:', error);
      throw error;
    }
  }

  /**
   * Lấy chi tiết đầy đủ của một POI theo ID
   * @param id - URI của POI (VD: urn:ngsi-ld:PointOfInterest:Hanoi:school:123)
   * @returns Chi tiết đầy đủ của POI
   */
  async getPoiById(id: string): Promise<any> {
    try {
      this.logger.log(`Fetching POI detail for ID: ${id}`);

      if (!id) {
        throw new BadRequestException('POI ID is required');
      }

      // Query tất cả graphs để tìm POI
      const graphMap = this.getGraphMap();
      const graphUrls = Object.values(graphMap);

      // Query để lấy tất cả properties của POI từ bất kỳ graph nào
      for (const graphUrl of graphUrls) {
        try {
          const query = `
            PREFIX fiware: <https://smartdatamodels.org/dataModel.PointOfInterest/>
            
            SELECT DISTINCT ?p ?o
            WHERE {
              GRAPH <${graphUrl}> {
                <${id}> ?p ?o .
              }
            }
          `.trim();

          const results = await this.fusekiService.executeSelect(query);

          if (results && results.length > 0) {
            // Tìm thấy POI trong graph này
            const typeFromGraph = this.extractTypeFromGraph(graphUrl);
            
            // Build POI object từ predicates
            const poi: any = {
              id,
              type: typeFromGraph,
            };

            results.forEach((row) => {
              const predicate = row.p;
              const value = row.o;

              if (!value) return;

              // Extract field name
              const parts = predicate.split(/[/#]/);
              let fieldName = parts[parts.length - 1];

              // Map các predicates sang fields
              if (fieldName === 'asWKT' || predicate.includes('asWKT')) {
                poi.wkt = value;
                try {
                  const { lat, lon } = this.parseWKT(value);
                  poi.lat = lat;
                  poi.lon = lon;
                } catch (e) {
                  this.logger.warn(`Failed to parse WKT: ${value}`);
                }
              } else if (fieldName === 'name') {
                // Handle name với Vietnamese preference
                const valueStr = String(value).trim();
                const hasVietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(valueStr);
                const hasViTag = valueStr.includes('@vi') || valueStr.endsWith('"@vi');
                
                let cleanValue = valueStr
                  .replace(/^["']|["']$/g, '')
                  .replace(/@(vi|en)$/, '')
                  .trim();
                
                if (hasViTag || hasVietnameseChars) {
                  poi.name = cleanValue;
                } else if (!poi.name) {
                  poi.name = cleanValue;
                }
              } else if (fieldName === 'osm_id' || fieldName === 'osmId') {
                poi.osm_id = value;
              } else if (fieldName === 'osm_type' || fieldName === 'osmType') {
                poi.osm_type = value;
              } else if (fieldName.startsWith('addr_')) {
                poi[fieldName] = value;
              } else if (fieldName === 'operator') {
                poi.operator = value;
              } else if (fieldName === 'brand') {
                poi.brand = value;
              } else if (fieldName === 'telephone') {
                poi.phone = value;
              } else if (fieldName === 'url') {
                poi.website = value;
              } else if (fieldName === 'sameAs') {
                poi.wikidata = value;
              } else if (fieldName !== 'type' && value && String(value).trim()) {
                // Add other fields
                fieldName = fieldName.replace(/:/g, '_');
                poi[fieldName] = value;
              }
            });

            // Fallback name
            if (!poi.name) {
              poi.name = `POI #${id.split(':').pop()}`;
            }

            this.logger.log(`Found POI ${id} in graph ${graphUrl}`);
            return poi;
          }
        } catch (err) {
          this.logger.warn(`Failed to query graph ${graphUrl}: ${err.message}`);
          // Continue with next graph
        }
      }

      // POI not found in any graph
      throw new BadRequestException(`POI with ID ${id} not found`);
    } catch (error) {
      this.logger.error(`Error fetching POI ${id}:`, error);
      throw error;
    }
  }

  /**
   * Lấy tất cả attributes (dynamic properties) của POI
   * Support Dynamic RDF Properties - tự động hiển thị bất kỳ predicate nào có trong RDF
   * @param id - URI của POI
   * @returns Array of { key, value } objects
   */
  async getPoiAttributes(id: string): Promise<{ key: string; value: string }[]> {
    try {
      this.logger.log(`Fetching dynamic attributes for POI: ${id}`);

      if (!id) {
        throw new BadRequestException('POI ID is required');
      }

      // Query tất cả graphs để tìm POI
      const graphMap = this.getGraphMap();
      const graphUrls = Object.values(graphMap);

      // Blacklist - các predicates không nên hiển thị
      const excludedPredicates = [
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        'http://www.opengis.net/ont/geosparql#asWKT', // Đã có lat/lon
        'http://www.w3.org/2000/01/rdf-schema#label',
        'http://www.w3.org/2000/01/rdf-schema#comment',
      ];

      for (const graphUrl of graphUrls) {
        try {
          const query = `
            PREFIX fiware: <https://smartdatamodels.org/dataModel.PointOfInterest/>
            
            SELECT ?p ?o
            WHERE {
              GRAPH <${graphUrl}> {
                <${id}> ?p ?o .
              }
            }
          `.trim();

          const results = await this.fusekiService.executeSelect(query);

          if (results && results.length > 0) {
            this.logger.log(`Found ${results.length} properties for POI ${id}`);

            // Transform results thành array of key-value
            const attributes: { key: string; value: string }[] = [];

            results.forEach((row) => {
              const predicate = row.p;
              const value = row.o;

              // Skip excluded predicates
              if (excludedPredicates.includes(predicate)) {
                return;
              }

              if (!value || String(value).trim() === '') {
                return;
              }

              // Extract readable key from predicate URI
              const parts = predicate.split(/[/#]/);
              let key = parts[parts.length - 1];

              // Cleanup key - convert to Title Case
              key = key.replace(/:/g, '_').replace(/([A-Z])/g, ' $1').trim();
              key = key.charAt(0).toUpperCase() + key.slice(1);

              // Cleanup value
              let cleanValue = String(value).trim();
              
              // Remove language tags
              cleanValue = cleanValue.replace(/@(vi|en)$/i, '');
              
              // Remove quotes if wrapped
              cleanValue = cleanValue.replace(/^["']|["']$/g, '');

              // Handle WKT coordinates specially - extract lat/lon
              if (key.toLowerCase().includes('wkt') || predicate.includes('asWKT')) {
                try {
                  const { lat, lon } = this.parseWKT(cleanValue);
                  attributes.push({ key: 'Latitude', value: lat.toFixed(6) });
                  attributes.push({ key: 'Longitude', value: lon.toFixed(6) });
                  return; // Skip original WKT value
                } catch (e) {
                  // If parse fails, skip WKT
                  return;
                }
              }

              // Add to attributes
              attributes.push({ key, value: cleanValue });
            });

            return attributes;
          }
        } catch (err) {
          this.logger.warn(`Failed to query graph ${graphUrl}: ${err.message}`);
          continue;
        }
      }

      // POI not found
      throw new BadRequestException(`POI with ID ${id} not found`);
    } catch (error) {
      this.logger.error(`Error fetching attributes for POI ${id}:`, error);
      throw error;
    }
  }

  /**
   * Fetch lightweight POIs - chỉ lấy trường cần thiết cho hiển thị map
   * @param graphUrl - URL của Named Graph  
   * @param limit - Số lượng tối đa (dùng limit lớn để lấy tất cả)
   */
  private async fetchLightweightPoisFromGraph(graphUrl: string, limit: number = 10000): Promise<any[]> {
    try {
      const typeFromGraph = this.extractTypeFromGraph(graphUrl);

      // Query chỉ lấy các trường thiết yếu: id, name, type, coordinates
      // Lightweight mode thường dùng limit cao để lấy TẤT CẢ POIs cho map
      const query = `
        PREFIX fiware: <https://smartdatamodels.org/dataModel.PointOfInterest/>
        PREFIX schema: <http://schema.org/>
        PREFIX geo: <http://www.opengis.net/ont/geosparql#>
        
        SELECT DISTINCT ?s ?name ?wkt
        WHERE {
          GRAPH <${graphUrl}> {
            ?s a fiware:PointOfInterest .
            OPTIONAL { ?s schema:name ?name }
            OPTIONAL { ?s geo:asWKT ?wkt }
          }
        }
        LIMIT ${limit}
      `.trim();

      this.logger.debug(`Lightweight query for ${graphUrl}`);

      const results = await this.fusekiService.executeSelect(query);

      // Transform results - chỉ giữ lại các trường cần thiết
      return results
        .map((row) => {
          try {
            const poi: any = {
              id: row.s,
              type: typeFromGraph,
            };

            // Handle name với Vietnamese preference
            if (row.name) {
              const valueStr = String(row.name).trim();
              const hasVietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(valueStr);
              const hasViTag = valueStr.includes('@vi') || valueStr.endsWith('"@vi');
              
              let cleanValue = valueStr
                .replace(/^["']|["']$/g, '')
                .replace(/@(vi|en)$/, '')
                .trim();
              
              if (hasViTag || hasVietnameseChars) {
                poi.name = cleanValue;
              } else if (!poi.name) {
                poi.name = cleanValue;
              }
            }

            // Parse WKT for coordinates
            if (row.wkt) {
              poi.wkt = row.wkt;
              try {
                const { lat, lon } = this.parseWKT(row.wkt);
                poi.lat = lat;
                poi.lon = lon;
              } catch (e) {
                this.logger.warn(`Failed to parse WKT: ${row.wkt}`);
              }
            }

            // Fallback name
            if (!poi.name) {
              poi.name = `POI_${typeFromGraph}_${Math.random().toString(36).substr(2, 6)}`;
            }

            // Bỏ qua POI không có tọa độ
            if (!poi.lat || !poi.lon) {
              return null;
            }

            return poi;
          } catch (parseError) {
            this.logger.warn(`Failed to parse lightweight POI: ${parseError.message}`);
            return null;
          }
        })
        .filter((poi) => poi !== null);
    } catch (error) {
      this.logger.error(`Error fetching lightweight POIs from ${graphUrl}:`, error);
      return [];
    }
  }

  /**
   * Fetch POIs từ một Named Graph cụ thể
   * Sử dụng introspection để query động chỉ những thuộc tính có trong data
   * @param graphUrl - URL của Named Graph
   * @param limit - Số lượng tối đa (default 100 cho full mode, 10000 cho lightweight)
   * @param isLightweight - Nếu true, chỉ query các trường cần thiết cho map
   */
  private async fetchPoisFromGraph(graphUrl: string, limit: number = 100, isLightweight: boolean = false): Promise<any[]> {
    try {
      // Nếu lightweight mode, chỉ query các trường cần thiết
      if (isLightweight) {
        return await this.fetchLightweightPoisFromGraph(graphUrl, limit);
      }

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

      // Build query động - sử dụng fiware:PointOfInterest thay vì geo:Point
      // CHÚ Ý: Không thể dùng FILTER(lang(?px) = "vi") ở đây vì ?px là động
      // Language preference sẽ được xử lý trong transformGraphResults()
      const query = `
        PREFIX fiware: <https://smartdatamodels.org/dataModel.PointOfInterest/>
        
        SELECT DISTINCT ?s ${selectVars.slice(1).join(' ')}
        WHERE {
          GRAPH <${graphUrl}> {
            ?s a fiware:PointOfInterest .
            ${optionalPatterns.join('\n            ')}
          }
        }
        LIMIT ${limit}
      `.trim();

      this.logger.debug(`Dynamic query for ${graphUrl}:\n${query}`);

      const results = await this.fusekiService.executeSelect(query);

      // Transform results thành POI objects
      return this.transformGraphResults(
        results,
        predicates,
        predicateMap,
        graphUrl,
      );
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
            } else if (fieldName === 'name') {
              // Xử lý name với language tags: ưu tiên @vi > @en > no-tag
              const valueStr = String(value).trim();
              
              // Detect Vietnamese by checking for Vietnamese characters
              const hasVietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(valueStr);
              
              // Check for explicit language tags in string
              const hasViTag = valueStr.includes('@vi') || valueStr.endsWith('"@vi');
              const hasEnTag = valueStr.includes('@en') || valueStr.endsWith('"@en');
              
              // Clean the value (remove quotes and language tags)
              let cleanValue = valueStr
                .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
                .replace(/@(vi|en)$/, '')       // Remove @vi or @en suffix
                .trim();
              
              // Priority logic:
              // 1. If has @vi tag OR contains Vietnamese characters → use it
              // 2. If has @en tag and no existing Vietnamese name → use it
              // 3. No tag and no existing name → use as fallback
              
              if (hasViTag || hasVietnameseChars) {
                // Vietnamese name - highest priority, always overwrite
                poi.name = cleanValue;
              } else if (hasEnTag) {
                // English name - only use if no Vietnamese name exists
                if (!poi.name) {
                  poi.name = cleanValue;
                }
              } else {
                // No language tag - fallback if no name exists
                if (!poi.name) {
                  poi.name = cleanValue;
                }
              }
            } else if (fieldName === 'osm_id') {
              poi.osm_id = value;
            } else if (fieldName === 'osm_type') {
              poi.osm_type = value;
            } else if (fieldName.startsWith('addr_')) {
              // Map address fields: addr_city, addr_district, addr_street, addr_housenumber
              poi[fieldName] = value;
            } else if (fieldName === 'operator') {
              poi.operator = value;
            } else if (fieldName === 'brand') {
              poi.brand = value;
            } else if (fieldName === 'legalName') {
              poi.legal_name = value;
            } else if (fieldName === 'telephone') {
              poi.phone = value;
            } else if (fieldName === 'url') {
              poi.website = value;
            } else if (fieldName === 'sameAs') {
              poi.wikidata = value;
            } else {
              // Normalize field name và chỉ thêm nếu có giá trị
              fieldName = fieldName.replace(/:/g, '_');
              if (value && value.trim()) {
                poi[fieldName] = value;
              }
            }
          });

          // Fallback cho name
          if (!poi.name) {
            poi.name = poi.osm_id
              ? `POI #${poi.osm_id}`
              : `${typeFromGraph}_${Math.random().toString(36).substr(2, 9)}`;
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
