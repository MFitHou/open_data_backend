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

import { Injectable, Logger, OnModuleInit, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatTool } from "src/common/decorators/chat-tools.decorator";
import { SchemaType } from "@google/generative-ai";
import { classifyPoiType, parseTypeFromUri } from "src/common/poi-types";

@Injectable()
export class FusekiService implements OnModuleInit {
  private readonly logger = new Logger(FusekiService.name);

  private readonly queryEndpoint: string;
  private readonly updateEndpoint: string;
  private readonly graphUri: string;

  constructor(private configService: ConfigService) {
    this.queryEndpoint = 
      this.configService.get<string>('FUSEKI_QUERY_ENDPOINT') ||
      `${this.configService.get<string>('FUSEKI_BASE_URL')}/${this.configService.get<string>('FUSEKI_DATASET')}/sparql`;
    
    this.updateEndpoint = 
      this.configService.get<string>('FUSEKI_UPDATE_ENDPOINT') ||
      `${this.configService.get<string>('FUSEKI_BASE_URL')}/${this.configService.get<string>('FUSEKI_DATASET')}/update`;
    
    this.graphUri = this.configService.get<string>('FUSEKI_GRAPH_ATM') || "http://localhost:3030/graph/atm";
  }

  async onModuleInit() {
    try {
      this.logger.log('Fuseki query endpoint: ' + this.queryEndpoint);
      if (!this.queryEndpoint) {
        this.logger.error('Thiếu FUSEKI_QUERY_ENDPOINT');
        return;
      }
      // Kiểm tra graph list (chỉ log, không chặn)
      await this.listGraphs();
    } catch (e: any) {
      this.logger.warn('Init fuseki skip: ' + e.message);
    }
  }

  async listGraphs() {
    const q = `
      SELECT DISTINCT ?g (COUNT(*) as ?count)
      WHERE {
        GRAPH ?g { ?s ?p ?o }
      } 
      GROUP BY ?g
      LIMIT 50
    `;
    const data = await this.runSelect(q);
    this.logger.log('Graphs detected: ' + data.length);
    data.forEach(r => {
      this.logger.log(`Graph: ${r.g} count=${r.count}`);
    });
    return data;
  }

  async getPOIsByType(params: {
    type: string;
    limit?: number;
    language?: string;
  }) {
    const { language = 'vi' } = params;
    const type = this.convertToSchemaType(params.type);
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 2000);

    // Map type to graph URI
    const typeToGraphMap: Record<string, string> = {
      'atm': this.configService.get<string>('FUSEKI_GRAPH_ATM') || 'http://localhost:3030/graph/atm',
      'bank': this.configService.get<string>('FUSEKI_GRAPH_BANK') || 'http://localhost:3030/graph/bank',
      'restaurant': this.configService.get<string>('FUSEKI_GRAPH_RESTAURANT') || 'http://localhost:3030/graph/restaurant',
      'cafe': this.configService.get<string>('FUSEKI_GRAPH_CAFE') || 'http://localhost:3030/graph/cafe',
      'hospital': this.configService.get<string>('FUSEKI_GRAPH_HOSPITAL') || 'http://localhost:3030/graph/hospital',
      'school': this.configService.get<string>('FUSEKI_GRAPH_SCHOOL') || 'http://localhost:3030/graph/school',
      'bus_stop': this.configService.get<string>('FUSEKI_GRAPH_BUS_STOP') || 'http://localhost:3030/graph/bus-stop',
      'park': this.configService.get<string>('FUSEKI_GRAPH_PARK') || 'http://localhost:3030/graph/park',
      'charging_station': this.configService.get<string>('FUSEKI_GRAPH_CHARGING_STATION') || 'http://localhost:3030/graph/charging-station',
      'pharmacy': this.configService.get<string>('FUSEKI_GRAPH_PHARMACY') || 'http://localhost:3030/graph/pharmacy',
      'police': this.configService.get<string>('FUSEKI_GRAPH_POLICE') || 'http://localhost:3030/graph/police',
      'fire_station': this.configService.get<string>('FUSEKI_GRAPH_FIRE_STATION') || 'http://localhost:3030/graph/fire-station',
      'parking': this.configService.get<string>('FUSEKI_GRAPH_PARKING') || 'http://localhost:3030/graph/parking',
      'fuel_station': this.configService.get<string>('FUSEKI_GRAPH_FUEL_STATION') || 'http://localhost:3030/graph/fuel-station',
      'supermarket': this.configService.get<string>('FUSEKI_GRAPH_SUPERMARKET') || 'http://localhost:3030/graph/supermarket',
      'library': this.configService.get<string>('FUSEKI_GRAPH_LIBRARY') || 'http://localhost:3030/graph/library',
    };

    const graphUri = typeToGraphMap[params.type.toLowerCase()];
    if (!graphUri) {
      throw new BadRequestException(`Unknown POI type: ${type}`);
    }

    this.logger.debug(`Fetching POIs of type: ${type} from graph: ${graphUri}`);

    const query = `
      PREFIX geo: <http://www.opengis.net/ont/geosparql#>
      PREFIX schema: <http://schema.org/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

      SELECT ?s ?finalName ?lat ?lon (GROUP_CONCAT(DISTINCT ?type; separator=",") AS ?types)
      WHERE {
        GRAPH <${graphUri}> {
          ?s a schema:${type} .
          ?s geo:asWKT ?wkt .

          # Thử tìm tên tiếng Anh
          OPTIONAL { 
            ?s schema:name ?name_en . 
            FILTER(lang(?name_en) = "en") 
          }

          # Thử tìm tên tiếng Việt
          OPTIONAL { 
            ?s schema:name ?name_vi . 
            FILTER(lang(?name_vi) = "vi") 
          }

          # Thử tìm tên không có tag ngôn ngữ (dự phòng)
          OPTIONAL { 
            ?s schema:name ?name_raw . 
            FILTER(lang(?name_raw) = "") 
          }

          # Lấy tất cả types
          OPTIONAL { ?s a ?type . }

          # Chọn tên theo thứ tự ưu tiên: Việt -> Anh -> Gốc -> "Không tên"
          BIND(COALESCE(?name_vi, ?name_en, ?name_raw, "Unknown Name") AS ?finalName)
          
          # Parse tọa độ từ WKT POINT(lon lat)
          BIND(REPLACE(STR(?wkt), "^[Pp][Oo][Ii][Nn][Tt]\\\\s*\\\\(([0-9.\\\\-]+)\\\\s+([0-9.\\\\-]+).*\\\\)$", "$1") AS ?lonStr)
          BIND(REPLACE(STR(?wkt), "^[Pp][Oo][Ii][Nn][Tt]\\\\s*\\\\(([0-9.\\\\-]+)\\\\s+([0-9.\\\\-]+).*\\\\)$", "$2") AS ?latStr)
          BIND(xsd:double(?lonStr) AS ?lon)
          BIND(xsd:double(?latStr) AS ?lat)
        }
      }
      GROUP BY ?s ?finalName ?lat ?lon
      LIMIT ${limit}
    `;

    this.logger.debug(`Executing query for type ${type}:`);

    const rows = await this.runSelect(query);
    this.logger.log(`Found ${rows.length} POIs of type ${type}`);

    // Transform results
    const results = rows.map((row: any) => {
      const finalName = row.finalName || 'Unknown';
      const lat = parseFloat(row.lat || '0');
      const lon = parseFloat(row.lon || '0');

      // Parse types
      const typesString = row.types || '';
      const types = typesString.split(',').filter((t: string) => t.trim());
      
      const typeKey = params.type.toLowerCase();
      const { amenity, highway, leisure } = classifyPoiType(typeKey);

      return {
        poi: row.s || `poi_${Math.random()}`,
        name: finalName,
        lat,
        lon,
        wkt: row.wkt || `POINT(${lon} ${lat})`,
        distanceKm: 0, // No distance calculation for browse mode
        amenity: amenity || undefined,
        highway: highway || undefined,
        leisure: leisure || undefined,
        topology: [] as any[],
      };
    });

    // Fetch topology relationships cho tất cả POIs
    if (results.length > 0) {
      const poiUris = results.map(r => `<${r.poi}>`).join(' ');
      const topologyGraphUri = this.configService.get<string>('FUSEKI_GRAPH_TOPOLOGY') || 'http://localhost:3030/graph/topology';
      
      // Xác định language tag ưu tiên
      const langPriority = language === 'vi' ? ['vi', 'en', ''] : ['en', 'vi', ''];
      
      const topologyQuery = `
        PREFIX schema: <http://schema.org/>
        PREFIX ext: <http://opendatafithou.org/def/extension/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX geo: <http://www.opengis.net/ont/geosparql#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        
        SELECT ?poi ?predicate ?related ?relatedName ?relatedWkt ?relatedAmenity ?relatedHighway ?relatedLeisure ?relatedBrand ?relatedOperator
        WHERE {
          # Tìm mối quan hệ trong graph Topology - CẢ 2 CHIỀU
          GRAPH <${topologyGraphUri}> {
            VALUES ?poi { ${poiUris} }
            {
              # Chiều 1: poi -> related
              ?poi schema:isNextTo ?related .
              BIND("isNextTo" AS ?predicate)
            } UNION {
              # Chiều 2: related -> poi (đảo ngược)
              ?related schema:isNextTo ?poi .
              BIND("isNextTo" AS ?predicate)
            } UNION {
              ?poi schema:containedInPlace ?related .
              BIND("containedInPlace" AS ?predicate)
            } UNION {
              ?related schema:containedInPlace ?poi .
              BIND("containedInPlace" AS ?predicate)
            } UNION {
              ?poi schema:amenityFeature ?related .
              BIND("amenityFeature" AS ?predicate)
            } UNION {
              ?related schema:amenityFeature ?poi .
              BIND("amenityFeature" AS ?predicate)
            } UNION {
              ?poi ext:healthcareNetwork ?related .
              BIND("healthcareNetwork" AS ?predicate)
            } UNION {
              ?related ext:healthcareNetwork ?poi .
              BIND("healthcareNetwork" AS ?predicate)
            } UNION {
              ?poi schema:campusAmenity ?related .
              BIND("campusAmenity" AS ?predicate)
            } UNION {
              ?related schema:campusAmenity ?poi .
              BIND("campusAmenity" AS ?predicate)
            }
          }
          
          # Tìm thông tin tên của địa điểm liên quan với ưu tiên ngôn ngữ
          OPTIONAL {
            GRAPH ?gName1 {
              ?related schema:name ?relatedName_${langPriority[0]} .
              FILTER(LANG(?relatedName_${langPriority[0]}) = "${langPriority[0]}" || LANG(?relatedName_${langPriority[0]}) = "")
            }
          }
          OPTIONAL {
            GRAPH ?gName2 {
              ?related schema:name ?relatedName_${langPriority[1]} .
              FILTER(LANG(?relatedName_${langPriority[1]}) = "${langPriority[1]}")
            }
          }
          OPTIONAL {
            GRAPH ?gLabel {
              ?related rdfs:label ?relatedName_label .
              FILTER(LANG(?relatedName_label) = "${langPriority[0]}" || LANG(?relatedName_label) = "")
            }
          }
          
          # Chọn tên theo thứ tự ưu tiên
          BIND(COALESCE(?relatedName_${langPriority[0]}, ?relatedName_${langPriority[1]}, ?relatedName_label) AS ?relatedName)
          
          # Lấy tọa độ của địa điểm liên quan
          OPTIONAL {
            GRAPH ?g2 {
              ?related geo:asWKT ?relatedWkt .
            }
          }
          
          # Lấy loại địa điểm liên quan
          OPTIONAL {
            GRAPH ?g3 {
              ?related ext:amenity ?relatedAmenity .
            }
          }
          OPTIONAL {
            GRAPH ?g4 {
              ?related ext:highway ?relatedHighway .
            }
          }
          OPTIONAL {
            GRAPH ?g5 {
              ?related ext:leisure ?relatedLeisure .
            }
          }
          OPTIONAL {
            GRAPH ?g6 {
              ?related schema:brand ?relatedBrand .
            }
          }
          OPTIONAL {
            GRAPH ?g7 {
              ?related schema:operator ?relatedOperator .
            }
          }
        }
      `;
      
      try {
        this.logger.debug(`[getPOIsByType] Topology query POI URIs count: ${results.length}`);
        this.logger.debug(`[getPOIsByType] Topology query: ${topologyQuery.substring(0, 500)}...`);
        const topologyRows = await this.runSelect(topologyQuery);
        this.logger.debug(`[getPOIsByType] Topology rows returned: ${topologyRows.length}`);
        if (topologyRows.length > 0) {
          this.logger.debug(`[getPOIsByType] First topology row: ${JSON.stringify(topologyRows[0])}`);
          this.logger.debug(`[getPOIsByType] Sample related URI: ${topologyRows[0].related}`);
        } else {
          this.logger.warn(`[getPOIsByType] No topology rows found! Check if topology graph exists.`);
        }
        const topologyMap = new Map<string, any[]>();
        
        // Track duplicates using a Set with composite key: poi + predicate + related
        const seenTopology = new Set<string>();
        
        topologyRows.forEach(row => {
          // Create unique key to detect duplicates
          const uniqueKey = `${row.poi}|${row.predicate}|${row.related}`;
          
          // Skip if already seen (duplicate)
          if (seenTopology.has(uniqueKey)) {
            return;
          }
          seenTopology.add(uniqueKey);
          
          if (!topologyMap.has(row.poi)) {
            topologyMap.set(row.poi, []);
          }
          
          // Parse WKT để lấy tọa độ
          let relatedLat: number | null = null;
          let relatedLon: number | null = null;
          if (row.relatedWkt) {
            const wktMatch = row.relatedWkt.match(/POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)\s*\)/i);
            if (wktMatch) {
              relatedLon = parseFloat(wktMatch[1]);
              relatedLat = parseFloat(wktMatch[2]);
            }
          }
          
          // Parse type từ URI nếu không có trong data
          // URI format: urn:ngsi-ld:PointOfInterest:Hanoi:<type>:<id>
          let parsedAmenity = row.relatedAmenity || null;
          let parsedHighway = row.relatedHighway || null;
          let parsedLeisure = row.relatedLeisure || null;
          
          if (!parsedAmenity && !parsedHighway && !parsedLeisure && row.related) {
            const parsed = parseTypeFromUri(row.related);
            if (parsed) {
              parsedAmenity = parsed.amenity;
              parsedHighway = parsed.highway;
              parsedLeisure = parsed.leisure;
            }
          }
          
          // Tạo object topology với đầy đủ thông tin
          const topologyItem: any = {
            predicate: row.predicate,
            related: {
              poi: row.related,
              name: row.relatedName || null,
              lat: relatedLat,
              lon: relatedLon,
              wkt: row.relatedWkt || null,
              amenity: parsedAmenity,
              highway: parsedHighway,
              leisure: parsedLeisure,
              brand: row.relatedBrand || null,
              operator: row.relatedOperator || null,
            },
          };
          
          topologyMap.get(row.poi)!.push(topologyItem);
        });
        
        // Gán topology vào results
        results.forEach(r => {
          r.topology = topologyMap.get(r.poi) || [];
        });
        
        this.logger.debug(`Found topology relationships for ${topologyMap.size} POIs (after deduplication)`);
      } catch (e: any) {
        this.logger.warn('Failed to fetch topology for getPOIsByType: ' + e.message);
      }
    }

    return {
      count: results.length,
      type,
      results,
    };
  }

  // PUBLIC: thực thi SELECT do client cung cấp
  async executeSelect(query: string) {
    if (!query || !query.trim()) {
      throw new BadRequestException('Query rỗng');
    }

    console.log('Original query:', query);
    const cleaned = query.trim();

    // Tìm từ khóa SELECT (không phân biệt hoa thường) sau các dòng PREFIX
    const hasSelect = /\bSELECT\b/i.test(cleaned);
    if (!hasSelect) {
      throw new BadRequestException('Chỉ hỗ trợ SELECT SPARQL');
    }

    console.log('Cleaned query:', cleaned);

    return this.runSelect(cleaned);
 }

  @ChatTool({
    name: 'searchNearby',
    description: 'Tìm các POI (điểm quan tâm) gần vị trí kinh độ/vĩ độ cho trước. Hỗ trợ 27+ loại dịch vụ: atm, bank, school, drinking_water, bus_stop, playground, toilets, hospital, post_office, park, parking, library, charging_station, waste_basket, fuel_station, community_centre, supermarket, police, pharmacy, fire_station, restaurant, university, convenience_store, marketplace, cafe, warehouse, clinic, kindergarten. Có thể tìm nhiều loại cùng lúc. Tự động bao gồm thông tin topology relationships (địa điểm liên quan).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        lon: { type: SchemaType.NUMBER, description: 'Kinh độ của vị trí trung tâm' },
        lat: { type: SchemaType.NUMBER, description: 'Vĩ độ của vị trí trung tâm' },
        radiusKm: { type: SchemaType.NUMBER, description: 'Bán kính tìm kiếm (km)' },
        types: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'Danh sách loại dịch vụ cần tìm (atm, hospital, school, cafe, bus_stop, playground, restaurant, charging_station, etc.). Để trống để tìm tất cả.' },
        includeIoT: { type: SchemaType.BOOLEAN, description: 'Bao gồm thông tin trạm cảm biến IoT phủ sóng. Mặc định: false.' },
        limit: { type: SchemaType.NUMBER, description: 'Số POI tối đa trả về (mặc định 150)' },
      },
      required: ['lon', 'lat', 'radiusKm'],
    },
  })
  async searchNearby(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    types?: string[];          // Danh sách loại dịch vụ (atm, hospital, school, cafe, bus_stop, playground, etc.)
    includeTopology?: boolean; // thêm thông tin topology relationships
    includeIoT?: boolean;      // thêm thông tin IoT coverage
    limit?: number;
    language?: string;         // Ngôn ngữ: 'vi', 'en', 'all' (mặc định: 'vi')
  }) {
    const { lon, lat, radiusKm } = params;
    if (
      lon === undefined || lat === undefined ||
      Number.isNaN(lon) || Number.isNaN(lat)
    ) throw new BadRequestException('Thiếu hoặc sai lon/lat');
    if (!radiusKm || radiusKm <= 0) throw new BadRequestException('radiusKm phải > 0');

    const limit = Math.min(Math.max(params.limit ?? 100, 1), 100);
    
    // Luôn bật topology cho tất cả queries, IoT tùy chọn
    const includeTopology = true; // Always true
    const includeIoT = params.includeIoT === true; // Default: false

    // Bounding box
    const deltaLat = radiusKm / 111;
    const radLat = lat * Math.PI / 180;
    const deltaLon = radiusKm / (111 * Math.cos(radLat) || 0.00001);
    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    const types = (params.types || []).map(t => t.trim().toLowerCase()).filter(Boolean);
    
    // Map types to graph URIs (hỗ trợ cả số ít và số nhiều)
    const typeToGraphMap: Record<string, string> = {
      'atm': this.configService.get<string>('FUSEKI_GRAPH_ATM') || 'http://localhost:3030/graph/atm',
      'atms': this.configService.get<string>('FUSEKI_GRAPH_ATM') || 'http://localhost:3030/graph/atm',
      'hospital': this.configService.get<string>('FUSEKI_GRAPH_HOSPITAL') || 'http://localhost:3030/graph/hospital',
      'hospitals': this.configService.get<string>('FUSEKI_GRAPH_HOSPITAL') || 'http://localhost:3030/graph/hospital',
      'school': this.configService.get<string>('FUSEKI_GRAPH_SCHOOL') || 'http://localhost:3030/graph/school',
      'schools': this.configService.get<string>('FUSEKI_GRAPH_SCHOOL') || 'http://localhost:3030/graph/school',
      'playground': this.configService.get<string>('FUSEKI_GRAPH_PLAYGROUND') || 'http://localhost:3030/graph/playground',
      'playgrounds': this.configService.get<string>('FUSEKI_GRAPH_PLAYGROUND') || 'http://localhost:3030/graph/playground',
      'toilet': this.configService.get<string>('FUSEKI_GRAPH_TOILET') || 'http://localhost:3030/graph/toilet',
      'toilets': this.configService.get<string>('FUSEKI_GRAPH_TOILET') || 'http://localhost:3030/graph/toilet',
      'bus_stop': this.configService.get<string>('FUSEKI_GRAPH_BUS_STOP') || 'http://localhost:3030/graph/bus-stop',
      'bus-stop': this.configService.get<string>('FUSEKI_GRAPH_BUS_STOP') || 'http://localhost:3030/graph/bus-stop',
      'bus_stops': this.configService.get<string>('FUSEKI_GRAPH_BUS_STOP') || 'http://localhost:3030/graph/bus-stop',
      'bus-stops': this.configService.get<string>('FUSEKI_GRAPH_BUS_STOP') || 'http://localhost:3030/graph/bus-stop',
      'drinking_water': this.configService.get<string>('FUSEKI_GRAPH_DRINKING_WATER') || 'http://localhost:3030/graph/drinking-water',
      'drinking-water': this.configService.get<string>('FUSEKI_GRAPH_DRINKING_WATER') || 'http://localhost:3030/graph/drinking-water',
      'bank': this.configService.get<string>('FUSEKI_GRAPH_BANK') || 'http://localhost:3030/graph/bank',
      'banks': this.configService.get<string>('FUSEKI_GRAPH_BANK') || 'http://localhost:3030/graph/bank',
      'cafe': this.configService.get<string>('FUSEKI_GRAPH_CAFE') || 'http://localhost:3030/graph/cafe',
      'cafes': this.configService.get<string>('FUSEKI_GRAPH_CAFE') || 'http://localhost:3030/graph/cafe',
      'restaurant': this.configService.get<string>('FUSEKI_GRAPH_RESTAURANT') || 'http://localhost:3030/graph/restaurant',
      'restaurants': this.configService.get<string>('FUSEKI_GRAPH_RESTAURANT') || 'http://localhost:3030/graph/restaurant',
      'police': this.configService.get<string>('FUSEKI_GRAPH_POLICE') || 'http://localhost:3030/graph/police',
      'fire_station': this.configService.get<string>('FUSEKI_GRAPH_FIRE_STATION') || 'http://localhost:3030/graph/fire-station',
      'fire-station': this.configService.get<string>('FUSEKI_GRAPH_FIRE_STATION') || 'http://localhost:3030/graph/fire-station',
      'fire_stations': this.configService.get<string>('FUSEKI_GRAPH_FIRE_STATION') || 'http://localhost:3030/graph/fire-station',
      'post_office': this.configService.get<string>('FUSEKI_GRAPH_POST_OFFICE') || 'http://localhost:3030/graph/post-office',
      'post-office': this.configService.get<string>('FUSEKI_GRAPH_POST_OFFICE') || 'http://localhost:3030/graph/post-office',
      'post_offices': this.configService.get<string>('FUSEKI_GRAPH_POST_OFFICE') || 'http://localhost:3030/graph/post-office',
      'library': this.configService.get<string>('FUSEKI_GRAPH_LIBRARY') || 'http://localhost:3030/graph/library',
      'libraries': this.configService.get<string>('FUSEKI_GRAPH_LIBRARY') || 'http://localhost:3030/graph/library',
      'community_center': this.configService.get<string>('FUSEKI_GRAPH_COMMUNITY_CENTER') || 'http://localhost:3030/graph/community-center',
      'community-center': this.configService.get<string>('FUSEKI_GRAPH_COMMUNITY_CENTER') || 'http://localhost:3030/graph/community-center',
      'community_centers': this.configService.get<string>('FUSEKI_GRAPH_COMMUNITY_CENTER') || 'http://localhost:3030/graph/community-center',
      'marketplace': this.configService.get<string>('FUSEKI_GRAPH_MARKETPLACE') || 'http://localhost:3030/graph/marketplace',
      'marketplaces': this.configService.get<string>('FUSEKI_GRAPH_MARKETPLACE') || 'http://localhost:3030/graph/marketplace',
      'parking': this.configService.get<string>('FUSEKI_GRAPH_PARKING') || 'http://localhost:3030/graph/parking',
      'parkings': this.configService.get<string>('FUSEKI_GRAPH_PARKING') || 'http://localhost:3030/graph/parking',
      'fuel_station': this.configService.get<string>('FUSEKI_GRAPH_FUEL_STATION') || 'http://localhost:3030/graph/fuel-station',
      'fuel-station': this.configService.get<string>('FUSEKI_GRAPH_FUEL_STATION') || 'http://localhost:3030/graph/fuel-station',
      'fuel_stations': this.configService.get<string>('FUSEKI_GRAPH_FUEL_STATION') || 'http://localhost:3030/graph/fuel-station',
      'charging_station': this.configService.get<string>('FUSEKI_GRAPH_CHARGING_STATION') || 'http://localhost:3030/graph/charging-station',
      'charging-station': this.configService.get<string>('FUSEKI_GRAPH_CHARGING_STATION') || 'http://localhost:3030/graph/charging-station',
      'charging_stations': this.configService.get<string>('FUSEKI_GRAPH_CHARGING_STATION') || 'http://localhost:3030/graph/charging-station',
      'pharmacy': this.configService.get<string>('FUSEKI_GRAPH_PHARMACY') || 'http://localhost:3030/graph/pharmacy',
      'pharmacies': this.configService.get<string>('FUSEKI_GRAPH_PHARMACY') || 'http://localhost:3030/graph/pharmacy',
      'supermarket': this.configService.get<string>('FUSEKI_GRAPH_SUPERMARKET') || 'http://localhost:3030/graph/supermarket',
      'supermarkets': this.configService.get<string>('FUSEKI_GRAPH_SUPERMARKET') || 'http://localhost:3030/graph/supermarket',
      'convenience_store': this.configService.get<string>('FUSEKI_GRAPH_CONVENIENCE_STORE') || 'http://localhost:3030/graph/convenience-store',
      'convenience-store': this.configService.get<string>('FUSEKI_GRAPH_CONVENIENCE_STORE') || 'http://localhost:3030/graph/convenience-store',
      'convenience_stores': this.configService.get<string>('FUSEKI_GRAPH_CONVENIENCE_STORE') || 'http://localhost:3030/graph/convenience-store',
      'kindergarten': this.configService.get<string>('FUSEKI_GRAPH_KINDERGARTEN') || 'http://localhost:3030/graph/kindergarten',
      'kindergartens': this.configService.get<string>('FUSEKI_GRAPH_KINDERGARTEN') || 'http://localhost:3030/graph/kindergarten',
      'university': this.configService.get<string>('FUSEKI_GRAPH_UNIVERSITY') || 'http://localhost:3030/graph/university',
      'universities': this.configService.get<string>('FUSEKI_GRAPH_UNIVERSITY') || 'http://localhost:3030/graph/university',
      'warehouse': this.configService.get<string>('FUSEKI_GRAPH_WAREHOUSE') || 'http://localhost:3030/graph/warehouse',
      'warehouses': this.configService.get<string>('FUSEKI_GRAPH_WAREHOUSE') || 'http://localhost:3030/graph/warehouse',
      'park': this.configService.get<string>('FUSEKI_GRAPH_PARK') || 'http://localhost:3030/graph/park',
      'parks': this.configService.get<string>('FUSEKI_GRAPH_PARK') || 'http://localhost:3030/graph/park',
      'waste_basket': this.configService.get<string>('FUSEKI_GRAPH_WASTE_BASKET') || 'http://localhost:3030/graph/waste-basket',
      'waste-basket': this.configService.get<string>('FUSEKI_GRAPH_WASTE_BASKET') || 'http://localhost:3030/graph/waste-basket',
      'waste_baskets': this.configService.get<string>('FUSEKI_GRAPH_WASTE_BASKET') || 'http://localhost:3030/graph/waste-basket',
    };
    
    // Determine which graphs to query
    let graphUris: string[] = [];
    if (types.length > 0) {
      graphUris = types.map(t => typeToGraphMap[t]).filter(g => g);
      if (graphUris.length === 0) {
        this.logger.warn(`No graphs found for types: ${types.join(', ')}`);
        return { center: { lon, lat }, radiusKm, count: 0, items: [] };
      }
    } else {
      graphUris = Object.values(typeToGraphMap);
    }
    
    this.logger.debug(`Querying ${graphUris.length} graphs for types: ${types.join(', ') || 'all'}`);
    
    // Build UNION of GRAPH clauses - mỗi graph query riêng biệt hoàn toàn
    const graphClauses = graphUris.map(uri => `{
        GRAPH <${uri}> {
          ?poi geo:asWKT ?wkt .
          OPTIONAL { ?poi ext:amenity ?amenity . }
          OPTIONAL { ?poi ext:highway ?highway . }
          OPTIONAL { ?poi ext:leisure ?leisure . }
          OPTIONAL { ?poi a ?type . }
          OPTIONAL { ?poi rdfs:label ?labelRaw . }
          OPTIONAL { ?poi schema:name ?schemaNameRaw . }
          OPTIONAL { ?poi schema:brand ?brand . }
          OPTIONAL { ?poi schema:operator ?operator . }
        }
      }`).join(' UNION ');
    
    // IoT coverage
    const iotJoin = params.includeIoT ? `
      OPTIONAL { 
        GRAPH <${this.configService.get<string>('FUSEKI_GRAPH_IOT_COVERAGE') || 'http://localhost:3030/graph/iot-coverage'}> {
          ?poi sosa:isSampledBy ?iotStation .
        }
      }` : '';

    const query = `
      PREFIX ext: <http://opendatafithou.org/def/extension/>
      PREFIX geo: <http://www.opengis.net/ont/geosparql#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX schema: <http://schema.org/>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX sosa: <http://www.w3.org/ns/sosa/>
      
      SELECT ?poi ?name ?amenity ?highway ?leisure ?brand ?operator ?wkt ?lon ?lat
             (GROUP_CONCAT(DISTINCT ?type; separator=",") AS ?types)
             (GROUP_CONCAT(DISTINCT ?iotStation; separator=",") AS ?iotStations)
      WHERE {
        {
          SELECT DISTINCT ?poi ?name ?amenity ?highway ?leisure ?brand ?operator ?wkt ?lon ?lat ?type
          WHERE {
            ${graphClauses}
            
            BIND(REPLACE(STR(?wkt), "^[Pp][Oo][Ii][Nn][Tt]\\\\s*\\\\(([0-9.\\\\-]+)\\\\s+([0-9.\\\\-]+).*\\\\)$", "$1") AS ?lonStr)
            BIND(REPLACE(STR(?wkt), "^[Pp][Oo][Ii][Nn][Tt]\\\\s*\\\\(([0-9.\\\\-]+)\\\\s+([0-9.\\\\-]+).*\\\\)$", "$2") AS ?latStr)
            BIND(xsd:double(?lonStr) AS ?lon)
            BIND(xsd:double(?latStr) AS ?lat)
            
            # Ưu tiên lấy giá trị tiếng Việt, nếu không có thì lấy giá trị không có language tag, cuối cùng là bất kỳ giá trị nào
            BIND(IF(BOUND(?schemaNameRaw) && LANG(?schemaNameRaw) = "vi", ?schemaNameRaw,
                    IF(BOUND(?schemaNameRaw) && LANG(?schemaNameRaw) = "", ?schemaNameRaw, ?schemaNameRaw)) AS ?schemaName)
            BIND(IF(BOUND(?labelRaw) && LANG(?labelRaw) = "vi", ?labelRaw,
                    IF(BOUND(?labelRaw) && LANG(?labelRaw) = "", ?labelRaw, ?labelRaw)) AS ?label)
            BIND(COALESCE(?schemaName, ?label) AS ?name)
            
            FILTER(?lon >= ${minLon} && ?lon <= ${maxLon} && ?lat >= ${minLat} && ?lat <= ${maxLat})
            FILTER(BOUND(?wkt))
          }
        }
        
        ${iotJoin}
      }
      GROUP BY ?poi ?name ?amenity ?highway ?leisure ?brand ?operator ?wkt ?lon ?lat
      LIMIT ${limit * 3}
    `;

    const rows = await this.runSelect(query);
    
    this.logger.debug(`Found ${rows.length} raw results from SPARQL query`);

    // Xác định ngôn ngữ mong muốn (mặc định: 'vi')
    const language = (params.language || 'vi').toLowerCase();
    this.logger.debug(`Language preference: ${language}`);

    // Deduplicate POIs - ưu tiên ngôn ngữ được chỉ định
    const poiMap = new Map<string, any>();
    for (const r of rows) {
      if (!r.lon || !r.lat) continue;
      
      // Parse types from GROUP_CONCAT result and map schema.org types to amenity/highway/leisure
      if (r.types) {
        const typeArray = r.types.split(',');
        
        for (const t of typeArray) {
          // Map schema.org types to amenity/highway/leisure
          if (t.includes('schema.org/')) {
            const schemaType = t.split('/').pop();
            r.amenity = this.convertFromSchemaType(schemaType);
          }
        }
      }
      
      const poiUri = r.poi;
      
      // Nếu language='all', không deduplicate, giữ tất cả variants
      if (language === 'all') {
        const key = `${poiUri}_${r.name || ''}`;
        poiMap.set(key, r);
        continue;
      }
      
      // Kiểm tra ngôn ngữ của tên
      const hasVietnamese = r.name && (r.name.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i));
      const hasEnglish = r.name && !hasVietnamese && (r.name.match(/[a-zA-Z]/));
      
      const matchesPreference = 
        (language === 'vi' && hasVietnamese) ||
        (language === 'en' && hasEnglish) ||
        (!hasVietnamese && !hasEnglish); // Không xác định được ngôn ngữ
      
      if (!poiMap.has(poiUri)) {
        poiMap.set(poiUri, r);
      } else {
        // Nếu POI đã tồn tại, chỉ thay thế nếu bản mới khớp với ngôn ngữ mong muốn hơn
        const existing = poiMap.get(poiUri);
        const existingHasVietnamese = existing.name && (existing.name.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i));
        const existingHasEnglish = existing.name && !existingHasVietnamese && (existing.name.match(/[a-zA-Z]/));
        
        const existingMatchesPreference = 
          (language === 'vi' && existingHasVietnamese) ||
          (language === 'en' && existingHasEnglish);
        
        // Thay thế nếu bản mới khớp với preference mà bản cũ không khớp
        if (matchesPreference && !existingMatchesPreference) {
          poiMap.set(poiUri, r);
        }
      }
    }
    
    this.logger.debug(`After deduplication: ${poiMap.size} unique POIs`);

    // Process results với Haversine
    let results = Array.from(poiMap.values())
      .map(r => {
        const dKm = this.haversineKm(lat, lon, parseFloat(r.lat), parseFloat(r.lon));
        
        // Parse iotStations từ GROUP_CONCAT (CSV)
        const iotStations = r.iotStations 
          ? r.iotStations.split(',').filter((s: string) => s.trim())
          : [];
        
        return {
          poi: r.poi,
          name: r.name || null,
          amenity: r.amenity || null,
          highway: r.highway || null,
          leisure: r.leisure || null,
          brand: r.brand || null,
          operator: r.operator || null,
          wkt: r.wkt || null,
          lon: parseFloat(r.lon),
          lat: parseFloat(r.lat),
          distanceKm: dKm,
          iotStations: iotStations.length > 0 ? iotStations : null,
          topology: null as any, // sẽ populate nếu includeTopology=true
        };
      })
      .filter(r => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    // Fetch topology relationships nếu được yêu cầu
    if (includeTopology && results.length > 0) {
      const poiUris = results.map(r => `<${r.poi}>`).join(' ');
      const topologyGraphUri = this.configService.get<string>('FUSEKI_GRAPH_TOPOLOGY') || 'http://localhost:3030/graph/topology';
      
      const topologyQuery = `
        PREFIX schema: <http://schema.org/>
        PREFIX ext: <http://opendatafithou.org/def/extension/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX geo: <http://www.opengis.net/ont/geosparql#>
        
        SELECT ?poi ?predicate ?related ?relatedName ?relatedWkt
        WHERE {
          # Tìm mối quan hệ trong graph Topology
          GRAPH <${topologyGraphUri}> {
            VALUES ?poi { ${poiUris} }
            {
              ?poi schema:isNextTo ?related .
              BIND("isNextTo" AS ?predicate)
            } UNION {
              ?poi schema:containedInPlace ?related .
              BIND("containedInPlace" AS ?predicate)
            } UNION {
              ?poi schema:amenityFeature ?related .
              BIND("amenityFeature" AS ?predicate)
            } UNION {
              ?poi ext:healthcareNetwork ?related .
              BIND("healthcareNetwork" AS ?predicate)
            } UNION {
              ?poi schema:campusAmenity ?related .
              BIND("campusAmenity" AS ?predicate)
            }
          }
          
          # Tìm tên của địa điểm liên quan (ở bất kỳ graph nào)
          OPTIONAL {
            GRAPH ?g {
              {
                ?related schema:name ?relatedName .
              } UNION {
                ?related rdfs:label ?relatedName .
              }
            }
          }
          
          # Lấy tọa độ của địa điểm liên quan
          OPTIONAL {
            GRAPH ?g2 {
              ?related geo:asWKT ?relatedWkt .
            }
          }
        }
      `;
      
      try {
        const topologyRows = await this.runSelect(topologyQuery);
        const topologyMap = new Map<string, any[]>();
        
        topologyRows.forEach(row => {
          if (!topologyMap.has(row.poi)) {
            topologyMap.set(row.poi, []);
          }
          
          // Parse WKT để lấy tọa độ
          let relatedLat: number | null = null;
          let relatedLon: number | null = null;
          if (row.relatedWkt) {
            const wktMatch = row.relatedWkt.match(/POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)\s*\)/i);
            if (wktMatch) {
              relatedLon = parseFloat(wktMatch[1]);
              relatedLat = parseFloat(wktMatch[2]);
            }
          }
          
          // Parse type từ URI
          const parsed = row.related ? parseTypeFromUri(row.related) : null;
          
          topologyMap.get(row.poi)!.push({
            predicate: row.predicate,
            related: {
              poi: row.related,
              name: row.relatedName || null,
              lat: relatedLat,
              lon: relatedLon,
              wkt: row.relatedWkt || null,
              amenity: parsed?.amenity || null,
              highway: parsed?.highway || null,
              leisure: parsed?.leisure || null,
            },
          });
        });
        
        results = results.map(r => ({
          ...r,
          topology: topologyMap.get(r.poi) || [],
        }));
      } catch (e: any) {
        this.logger.warn('Failed to fetch topology: ' + e.message);
      }
    }

    return {
      center: { lon, lat },
      radiusKm,
      count: results.length,
      items: results,
    };
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // km
    const toRad = (deg: number) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Thực thi SPARQL UPDATE query (INSERT, DELETE, etc.)
   * @param updateQuery - SPARQL UPDATE query string
   */
  async update(updateQuery: string): Promise<void> {
    if (!this.updateEndpoint) {
      throw new Error('Update endpoint not configured');
    }

    this.logger.debug('SPARQL UPDATE: ' + updateQuery.substring(0, 200));

    const headers: Record<string, string> = {
      'Content-Type': 'application/sparql-update',
    };

    const fusekiUser = this.configService.get<string>('FUSEKI_USER');
    const fusekiPass = this.configService.get<string>('FUSEKI_PASS');
    if (fusekiUser && fusekiPass) {
      const basic = Buffer.from(`${fusekiUser}:${fusekiPass}`).toString('base64');
      headers['Authorization'] = `Basic ${basic}`;
    }

    const res = await fetch(this.updateEndpoint, {
      method: 'POST',
      headers,
      body: updateQuery,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SPARQL UPDATE error ${res.status}: ${text}`);
    }

    this.logger.debug('SPARQL UPDATE success');
  }

  private async runSelect(query: string) {
    if (!this.queryEndpoint) {
      throw new Error('Query endpoint not configured');
    }
    const url = this.queryEndpoint + '?query=' + encodeURIComponent(query);
    this.logger.debug('SPARQL GET: ' + url);

    //Fuseki yêu cầu xác thực, 
    //nếu không đặt user/pass trên fuseki thì comment phần này
    const headers: Record<string, string> = { Accept: 'application/sparql-results+json' };
    const fusekiUser = this.configService.get<string>('FUSEKI_USER');
    const fusekiPass = this.configService.get<string>('FUSEKI_PASS');
    if (fusekiUser && fusekiPass) {
      const basic = Buffer.from(`${fusekiUser}:${fusekiPass}`).toString('base64');
      headers['Authorization'] = `Basic ${basic}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SPARQL error ${res.status}: ${text}`);
    }

    const json: any = await res.json();
    return json.results.bindings.map((b: any) => {
      const obj: Record<string, any> = {};
      Object.keys(b).forEach(k => (obj[k] = b[k].value));
      return obj;
    });
  }

  @ChatTool({
    name: 'searchNearbyWithTopology',
    description: 'Tìm địa điểm có quan hệ topology với địa điểm khác. Ví dụ: tìm quán ăn gần trạm sạc, cafe trong công viên, bệnh viện có bãi đỗ xe. Hỗ trợ nhiều loại địa điểm liên quan (relatedTypes có thể là array). Tool này tối ưu cho query kiểu "tìm A gần/trong/có B (và C, D...)". Lưu ý: relationship="isNextTo" (mặc định) bao gồm cả isNextTo và containedInPlace để cover khái niệm "gần".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        lon: { type: SchemaType.NUMBER, description: 'Kinh độ trung tâm' },
        lat: { type: SchemaType.NUMBER, description: 'Vĩ độ trung tâm' },
        radiusKm: { type: SchemaType.NUMBER, description: 'Bán kính tìm kiếm (km)' },
        targetType: { type: SchemaType.STRING, description: 'Loại địa điểm cần tìm (restaurant, cafe, hospital, school, etc.)' },
        relatedTypes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'Danh sách loại địa điểm liên quan (charging_station, parking, bus_stop, atm, etc.). Có thể là 1 hoặc nhiều types.' },
        relationship: { 
          type: SchemaType.STRING, 
          description: 'Loại quan hệ: "isNextTo" (bên cạnh), "containedInPlace" (trong khu vực), "amenityFeature" (có tiện ích). Mặc định: "isNextTo"'
        },
        limit: { type: SchemaType.NUMBER, description: 'Số kết quả tối đa (mặc định 50)' },
      },
      required: ['lon', 'lat', 'radiusKm', 'targetType', 'relatedTypes'],
    },
  })
  async searchNearbyWithTopology(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    targetType: string;
    relatedTypes: string[];
    relationship?: string;
    limit?: number;
  }) {
    const { lon, lat, radiusKm, targetType, relatedTypes } = params;
    const relationship = params.relationship || 'isNextTo';
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

    const relationshipTypes = relationship === 'isNextTo' 
      ? ['isNextTo', 'containedInPlace']
      : [relationship];
    
    this.logger.debug(`searchNearbyWithTopology: ${targetType} with relationships [${relationshipTypes.join('+')}] to [${relatedTypes.join(', ')}] within ${radiusKm}km`);

    const targetResults = await this.searchNearby({
      lon, lat, radiusKm,
      types: [targetType],
      includeTopology: false,
      limit: limit * 2, // Query nhiều hơn để sau khi filter còn đủ
    });

    if (targetResults.count === 0) {
      this.logger.warn(`No ${targetType} found in radius`);
      return { 
        center: { lon, lat }, 
        radiusKm, 
        targetType,
        relatedTypes,
        relationship,
        count: 0, 
        items: [] 
      };
    }

    const relatedResults = await this.searchNearby({
      lon, lat, radiusKm,
      types: relatedTypes,
      includeTopology: false,
      limit: 100,
    });

    if (relatedResults.count === 0) {
      this.logger.warn(`No [${relatedTypes.join(', ')}] found in radius`);
      return { 
        center: { lon, lat }, 
        radiusKm, 
        targetType,
        relatedTypes,
        relationship,
        count: 0, 
        items: [] 
      };
    }

    const targetUris = targetResults.items.map(r => `<${r.poi}>`).join(' ');
    const relatedUris = relatedResults.items.map(r => `<${r.poi}>`).join(' ');
    const topologyGraphUri = this.configService.get<string>('FUSEKI_GRAPH_TOPOLOGY') || 'http://localhost:3030/graph/topology';
    
    // Build query dựa trên relationship
    let whereClause = '';
    if (relationship === 'isNextTo') {
      // "gần" = isNextTo OR containedInPlace
      whereClause = `
        {
          ?targetPoi schema:isNextTo ?relatedPoi .
        } UNION {
          ?relatedPoi schema:isNextTo ?targetPoi .
        } UNION {
          ?targetPoi schema:containedInPlace ?relatedPoi .
        } UNION {
          ?relatedPoi schema:containedInPlace ?targetPoi .
        }
      `;
    } else if (relationship === 'containedInPlace') {
      whereClause = `
        {
          ?targetPoi schema:containedInPlace ?relatedPoi .
        } UNION {
          ?relatedPoi schema:containedInPlace ?targetPoi .
        }
      `;
    } else if (relationship === 'amenityFeature') {
      whereClause = `
        {
          ?targetPoi schema:amenityFeature ?relatedPoi .
        } UNION {
          ?relatedPoi schema:amenityFeature ?targetPoi .
        }
      `;
    } else {
      // Default: all relationships
      whereClause = `
        {
          ?targetPoi schema:isNextTo ?relatedPoi .
        } UNION {
          ?relatedPoi schema:isNextTo ?targetPoi .
        } UNION {
          ?targetPoi schema:containedInPlace ?relatedPoi .
        } UNION {
          ?relatedPoi schema:containedInPlace ?targetPoi .
        } UNION {
          ?targetPoi schema:amenityFeature ?relatedPoi .
        } UNION {
          ?relatedPoi schema:amenityFeature ?targetPoi .
        }
      `;
    }

    const topologyQuery = `
      PREFIX schema: <http://schema.org/>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT DISTINCT ?targetPoi ?relatedPoi
      WHERE {
        GRAPH <${topologyGraphUri}> {
          VALUES ?targetPoi { ${targetUris} }
          VALUES ?relatedPoi { ${relatedUris} }
          ${whereClause}
        }
      }
    `;

    const topologyRows = await this.runSelect(topologyQuery);
    
    this.logger.debug(`Topology query found ${topologyRows.length} relationships between ${targetResults.count} ${targetType} and ${relatedResults.count} [${relatedTypes.join(', ')}]`);
    
    if (topologyRows.length === 0) {
      this.logger.warn(`No topology relationships found between ${targetType} and [${relatedTypes.join(', ')}] in this area. Returning ${targetType} without topology filter.`);
      
      // Trả về kết quả target type kèm thông báo không tìm thấy mối quan hệ topology
      return {
        center: { lon, lat },
        radiusKm,
        targetType,
        relatedTypes,
        relationship,
        noTopologyFound: true,
        message: `Không tìm thấy mối quan hệ "${relationship}" giữa ${targetType} và ${relatedTypes.join(', ')} trong khu vực này. Dưới đây là danh sách ${targetType} tìm được trong bán kính ${radiusKm}km.`,
        count: targetResults.count,
        items: targetResults.items.slice(0, limit).map(item => ({
          ...item,
          relatedEntities: [], // Không có related entities vì không có topology
        })),
      };
    }

    const targetUrisWithTopology = new Set(topologyRows.map(r => r.targetPoi));
    const filteredItems = targetResults.items.filter(item => targetUrisWithTopology.has(item.poi)).slice(0, limit);

    this.logger.debug(`Filtered down to ${filteredItems.length} ${targetType} with topology relationships`);

    // Enrich với thông tin related entity (đầy đủ thông tin POI)
    const relatedMap = new Map(relatedResults.items.map(r => [r.poi, r]));
    const enrichedItems = filteredItems.map(item => {
      const relatedEntities = topologyRows
        .filter(r => r.targetPoi === item.poi)
        .map(r => {
          const related = relatedMap.get(r.relatedPoi);
          return related ? {
            poi: related.poi,
            name: related.name,
            amenity: related.amenity || null,
            highway: related.highway || null,
            leisure: related.leisure || null,
            brand: related.brand || null,
            operator: related.operator || null,
            wkt: related.wkt,
            lon: related.lon,
            lat: related.lat,
            distanceKm: related.distanceKm,
          } : {
            poi: r.relatedPoi,
            name: null,
            lon: null,
            lat: null,
            distanceKm: null,
          };
        });

      return {
        ...item,
        relatedEntities,
      };
    });

    this.logger.debug(`Found ${enrichedItems.length} ${targetType} with [${relationshipTypes.join('+')}] relationships to [${relatedTypes.join(', ')}]`);

    return {
      center: { lon, lat },
      radiusKm,
      targetType,
      relatedTypes,
      relationship,
      count: enrichedItems.length,
      items: enrichedItems,
    };
  }


  private convertToSchemaType(type: string){
    switch(type){
      case 'atm':
        return 'FinancialService';
      case 'bank':
        return 'BankOrCreditUnion';
      case 'bus_stop':
      case 'bus-stop':
        return 'BusStop';
      case 'cafe':
        return 'CafeOrCoffeeShop';
      case 'charging_station':
      case 'charging-station':
        return 'AutomotiveBusiness';
      case 'community_center':
      case 'community-center':
      case 'community_centre':
        return 'CommunityCenter';
      case 'convenience_store':
      case 'convenience-store':
        return 'ConvenienceStore';
      case 'drinking_water':
      case 'drinking-water':
        return 'DrinkingWaterDispenser';
      case 'fire_station':
      case 'fire-station':
        return 'FireStation';
      case 'fuel_station':
      case 'fuel-station':
        return 'GasStation';
      case 'hospital':
        return 'Hospital';
      case 'kindergarten':
        return 'Preschool';
      case 'library':
        return 'Library';
      case 'marketplace':
        return 'Market';
      case 'park':
        return 'Park';
      case 'parking':
        return 'ParkingFacility';
      case 'pharmacy':
        return 'Pharmacy';
      case 'playground':
        return 'Playground';
      case 'police':
        return 'PoliceStation';
      case 'post_office':
      case 'post-office':
        return 'PostOffice';
      case 'restaurant':
        return 'Restaurant';
      case 'school':
        return 'School';
      case 'supermarket':
        return 'GroceryStore';
      case 'toilet':
      case 'toilets':
      case 'public_toilet':
        return 'PublicToilet';
      case 'university':
        return 'CollegeOrUniversity';
      case 'warehouse':
        return 'Warehouse';
      case 'waste_basket':
      case 'waste-basket':
        return 'WasteContainer';
      default:
        return type;
    }
  }

  private convertFromSchemaType(type: string){
    switch(type){
      case 'FinancialService':
        return 'atm';
      case 'BankOrCreditUnion':
        return 'bank';
      case 'BusStop':
        return 'bus_stop';
      case 'CafeOrCoffeeShop':
        return 'cafe';
      case 'AutomotiveBusiness':
      case 'ChargingStation':
        return 'charging_station';
      case 'CommunityCenter':
        return 'community_center';
      case 'ConvenienceStore':
        return 'convenience_store';
      case 'DrinkingWaterDispenser':
        return 'drinking_water';
      case 'FireStation':
        return 'fire_station';
      case 'GasStation':
        return 'fuel';
      case 'Hospital':
        return 'hospital';
      case 'Preschool':
        return 'kindergarten';
      case 'Library':
        return 'library';
      case 'Market':
        return 'marketplace';
      case 'Park':
        return 'park';
      case 'ParkingFacility':
        return 'parking';
      case 'Pharmacy':
        return 'pharmacy';
      case 'Playground':
        return 'playground';
      case 'PoliceStation':
        return 'police';
      case 'PostOffice':
        return 'post_office';
      case 'Restaurant':
        return 'restaurant';
      case 'School':
        return 'school';
      case 'GroceryStore':
        return 'supermarket';
      case 'PublicToilet':
        return 'toilets';
      case 'CollegeOrUniversity':
        return 'university';
      case 'Warehouse':
        return 'warehouse';
      case 'WasteContainer':
        return 'waste_basket';
      default:
        return type;
    }
  }
}