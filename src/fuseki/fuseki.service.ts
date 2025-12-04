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
import { InfluxDBService } from "../influxdb/influxdb.service";

// Sensor data interface for POI
export interface SensorData {
  aqi: number | null;
  temperature: number | null;
  noise_level: number | null;
  timestamp: string | null;
}

@Injectable()
export class FusekiService implements OnModuleInit {
  private readonly logger = new Logger(FusekiService.name);

  private readonly queryEndpoint: string;
  private readonly updateEndpoint: string;
  private readonly graphUri: string;

  constructor(
    private configService: ConfigService,
    private influxDBService: InfluxDBService,
  ) {
    this.queryEndpoint = 
      this.configService.get<string>('FUSEKI_QUERY_ENDPOINT') ||
      `${this.configService.get<string>('FUSEKI_BASE_URL')}/${this.configService.get<string>('FUSEKI_DATASET')}/sparql`;
    
    this.updateEndpoint = 
      this.configService.get<string>('FUSEKI_UPDATE_ENDPOINT') ||
      `${this.configService.get<string>('FUSEKI_BASE_URL')}/${this.configService.get<string>('FUSEKI_DATASET')}/update`;
    
    this.graphUri = this.configService.get<string>('FUSEKI_GRAPH_ATM') || "http://localhost:3030/graph/atm";
  }

  /**
   * Fetch sensor data (AQI, temperature, noise_level) for a device URI
   */
  private async fetchSensorDataForDevice(deviceUri: string): Promise<SensorData> {
    const sensorData: SensorData = {
      aqi: null,
      temperature: null,
      noise_level: null,
      timestamp: null,
    };

    if (!deviceUri) return sensorData;

    try {
      // Use full device URI as station_id (InfluxDB stores full URI)
      const stationId = deviceUri;
      
      this.logger.debug(`[fetchSensorData] Station ID: ${stationId}`);
      
      // Fetch air quality data (AQI)
      try {
        const airQualityData = await this.influxDBService.getLatestByStation({
          stationId,
          measurement: 'air_quality',
          fields: ['aqi'],
        });
        this.logger.debug(`[fetchSensorData] Air quality result for ${stationId}: ${JSON.stringify(airQualityData)}`);
        if (airQualityData?.data?.aqi !== undefined && airQualityData?.data?.aqi !== null) {
          sensorData.aqi = airQualityData.data.aqi;
          if (!sensorData.timestamp || airQualityData.timestamp > sensorData.timestamp) {
            sensorData.timestamp = airQualityData.timestamp;
          }
        }
      } catch (e: any) {
        this.logger.debug(`No air_quality data for station ${stationId}: ${e.message}`);
      }

      // Fetch weather data (temperature)
      try {
        const weatherData = await this.influxDBService.getLatestByStation({
          stationId,
          measurement: 'weather',
          fields: ['temperature'],
        });
        this.logger.debug(`[fetchSensorData] Weather result for ${stationId}: ${JSON.stringify(weatherData)}`);
        if (weatherData?.data?.temperature !== undefined && weatherData?.data?.temperature !== null) {
          sensorData.temperature = weatherData.data.temperature;
          if (!sensorData.timestamp || weatherData.timestamp > sensorData.timestamp) {
            sensorData.timestamp = weatherData.timestamp;
          }
        }
      } catch (e: any) {
        this.logger.debug(`No weather data for station ${stationId}: ${e.message}`);
      }

      // Fetch traffic data (noise_level)
      try {
        const trafficData = await this.influxDBService.getLatestByStation({
          stationId,
          measurement: 'traffic',
          fields: ['noise_level'],
        });
        this.logger.debug(`[fetchSensorData] Traffic result for ${stationId}: ${JSON.stringify(trafficData)}`);
        if (trafficData?.data?.noise_level !== undefined && trafficData?.data?.noise_level !== null) {
          sensorData.noise_level = trafficData.data.noise_level;
          if (!sensorData.timestamp || trafficData.timestamp > sensorData.timestamp) {
            sensorData.timestamp = trafficData.timestamp;
          }
        }
      } catch (e: any) {
        this.logger.debug(`No traffic data for station ${stationId}: ${e.message}`);
      }

    } catch (e: any) {
      this.logger.warn(`Failed to fetch sensor data for device ${deviceUri}: ${e.message}`);
    }

    return sensorData;
  }

  /**
   * Batch fetch sensor data for multiple device URIs
   */
  private async fetchSensorDataForDevices(deviceMap: Map<string, string>): Promise<Map<string, SensorData>> {
    const sensorDataMap = new Map<string, SensorData>();
    
    // Get unique device URIs
    const uniqueDevices = new Set(deviceMap.values());
    const deviceSensorData = new Map<string, SensorData>();
    
    // Fetch sensor data for each unique device
    for (const deviceUri of uniqueDevices) {
      if (deviceUri) {
        const data = await this.fetchSensorDataForDevice(deviceUri);
        deviceSensorData.set(deviceUri, data);
      }
    }
    
    // Map back to POI URIs
    for (const [poiUri, deviceUri] of deviceMap.entries()) {
      if (deviceUri && deviceSensorData.has(deviceUri)) {
        sensorDataMap.set(poiUri, deviceSensorData.get(deviceUri)!);
      }
    }
    
    return sensorDataMap;
  }

  async onModuleInit() {
    try {
      this.logger.log('Fuseki query endpoint: ' + this.queryEndpoint);
      if (!this.queryEndpoint) {
        this.logger.error('Missing FUSEKI_QUERY_ENDPOINT');
        return;
      }
      // Check graph list (log only, non-blocking)
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
    const { language = 'en' } = params;
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

    // Fetch topology relationships for all POIs
    if (results.length > 0) {
      const poiUris = results.map(r => `<${r.poi}>`).join(' ');
      const topologyGraphUri = this.configService.get<string>('FUSEKI_GRAPH_TOPOLOGY') || 'http://localhost:3030/graph/topology';
      
      // Determine language tag priority
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
          
          // Parse type from URI if not in data
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
          
          // Create topology object with full information
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
        
        // Assign topology to results
        results.forEach(r => {
          r.topology = topologyMap.get(r.poi) || [];
        });
        
        this.logger.debug(`Found topology relationships for ${topologyMap.size} POIs (after deduplication)`);
      } catch (e: any) {
        this.logger.warn('Failed to fetch topology for getPOIsByType: ' + e.message);
      }
    }

    // Fetch device IDs from iot-coverage graph
    if (results.length > 0) {
      const poiUris = results.map(r => `<${r.poi}>`).join(' ');
      const iotCoverageGraphUri = this.configService.get<string>('FUSEKI_GRAPH_IOT_COVERAGE') || 'http://localhost:3030/graph/iot-coverage';
      
      const deviceQuery = `
        PREFIX sosa: <http://www.w3.org/ns/sosa/>
        
        SELECT ?poi ?device
        WHERE {
          GRAPH <${iotCoverageGraphUri}> {
            VALUES ?poi { ${poiUris} }
            ?poi sosa:isSampledBy ?device .
          }
        }
      `;
      
      try {
        const deviceRows = await this.runSelect(deviceQuery);
        const deviceMap = new Map<string, string>();
        
        deviceRows.forEach(row => {
          deviceMap.set(row.poi, row.device);
        });
        
        // Assign device to results
        results.forEach(r => {
          (r as any).device = deviceMap.get(r.poi) || null;
        });
        
        this.logger.debug(`Found device mappings for ${deviceMap.size} POIs`);
      } catch (e: any) {
        this.logger.warn('Failed to fetch device mappings: ' + e.message);
      }
    }

    // Fetch sensor data (AQI, temperature, noise_level) for POIs with devices
    if (results.length > 0) {
      const deviceMap = new Map<string, string>();
      results.forEach(r => {
        if ((r as any).device) {
          deviceMap.set(r.poi, (r as any).device);
        }
      });
      
      if (deviceMap.size > 0) {
        try {
          const sensorDataMap = await this.fetchSensorDataForDevices(deviceMap);
          
          results.forEach(r => {
            const sensorData = sensorDataMap.get(r.poi);
            (r as any).sensorData = sensorData || null;
          });
          
          this.logger.debug(`Fetched sensor data for ${sensorDataMap.size} POIs`);
        } catch (e: any) {
          this.logger.warn('Failed to fetch sensor data: ' + e.message);
        }
      }
    }

    return {
      count: results.length,
      type,
      results,
    };
  }

  /**
   * Get full POI information by URI
   * Used when clicking on a topology related entity to fetch full details
   */
  async getPOIByUri(params: { uri: string; language?: string }) {
    const { uri } = params;
    const language = params.language || 'en';
    
    if (!uri || !uri.trim()) {
      throw new BadRequestException('uri is required');
    }
    
    this.logger.debug(`[getPOIByUri] Fetching POI: ${uri}`);
    
    // Query to get POI information
    const query = `
      PREFIX ext: <http://opendatafithou.org/def/extension/>
      PREFIX geo: <http://www.opengis.net/ont/geosparql#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX schema: <http://schema.org/>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      
      SELECT ?name ?amenity ?highway ?leisure ?brand ?operator ?wkt ?access ?fee
      WHERE {
        GRAPH ?g {
          <${uri}> geo:asWKT ?wkt .
          OPTIONAL { <${uri}> ext:amenity ?amenity . }
          OPTIONAL { <${uri}> ext:highway ?highway . }
          OPTIONAL { <${uri}> ext:leisure ?leisure . }
          OPTIONAL { <${uri}> schema:brand ?brand . }
          OPTIONAL { <${uri}> schema:operator ?operator . }
          OPTIONAL { <${uri}> ext:access ?access . }
          OPTIONAL { <${uri}> ext:fee ?fee . }
          OPTIONAL { 
            <${uri}> schema:name ?schemaName .
            FILTER(LANG(?schemaName) = "${language}" || LANG(?schemaName) = "")
          }
          OPTIONAL { 
            <${uri}> rdfs:label ?label .
            FILTER(LANG(?label) = "${language}" || LANG(?label) = "")
          }
          BIND(COALESCE(?schemaName, ?label) AS ?name)
        }
      }
      LIMIT 1
    `;
    
    try {
      const rows = await this.runSelect(query);
      
      if (rows.length === 0) {
        this.logger.warn(`[getPOIByUri] POI not found: ${uri}`);
        return { found: false, poi: null };
      }
      
      const row = rows[0];
      
      // Parse WKT to get coordinates
      let lat: number | null = null;
      let lon: number | null = null;
      if (row.wkt) {
        const wktMatch = row.wkt.match(/POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)\s*\)/i);
        if (wktMatch) {
          lon = parseFloat(wktMatch[1]);
          lat = parseFloat(wktMatch[2]);
        }
      }
      
      // Parse type from URI if not in data
      let amenity = row.amenity || null;
      let highway = row.highway || null;
      let leisure = row.leisure || null;
      
      if (!amenity && !highway && !leisure) {
        const parsed = parseTypeFromUri(uri);
        if (parsed) {
          amenity = parsed.amenity;
          highway = parsed.highway;
          leisure = parsed.leisure;
        }
      }
      
      const poiData = {
        poi: uri,
        name: row.name || null,
        amenity,
        highway,
        leisure,
        brand: row.brand || null,
        operator: row.operator || null,
        access: row.access || null,
        fee: row.fee || null,
        wkt: row.wkt || null,
        lat,
        lon,
        distanceKm: 0,
        topology: [] as any[],
      };
      
      // Fetch topology for this POI
      const topologyGraphUri = this.configService.get<string>('FUSEKI_GRAPH_TOPOLOGY') || 'http://localhost:3030/graph/topology';
      const langPriority = language === 'vi' ? ['vi', 'en', ''] : ['en', 'vi', ''];
      
      const topologyQuery = `
        PREFIX schema: <http://schema.org/>
        PREFIX ext: <http://opendatafithou.org/def/extension/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX geo: <http://www.opengis.net/ont/geosparql#>
        
        SELECT ?predicate ?related ?relatedName ?relatedWkt ?relatedAmenity ?relatedHighway ?relatedLeisure ?relatedBrand ?relatedOperator
        WHERE {
          GRAPH <${topologyGraphUri}> {
            {
              <${uri}> schema:isNextTo ?related .
              BIND("isNextTo" AS ?predicate)
            } UNION {
              ?related schema:isNextTo <${uri}> .
              BIND("isNextTo" AS ?predicate)
            } UNION {
              <${uri}> schema:containedInPlace ?related .
              BIND("containedInPlace" AS ?predicate)
            } UNION {
              ?related schema:containedInPlace <${uri}> .
              BIND("containedInPlace" AS ?predicate)
            } UNION {
              <${uri}> schema:amenityFeature ?related .
              BIND("amenityFeature" AS ?predicate)
            } UNION {
              ?related schema:amenityFeature <${uri}> .
              BIND("amenityFeature" AS ?predicate)
            } UNION {
              <${uri}> ext:healthcareNetwork ?related .
              BIND("healthcareNetwork" AS ?predicate)
            } UNION {
              ?related ext:healthcareNetwork <${uri}> .
              BIND("healthcareNetwork" AS ?predicate)
            } UNION {
              <${uri}> schema:campusAmenity ?related .
              BIND("campusAmenity" AS ?predicate)
            } UNION {
              ?related schema:campusAmenity <${uri}> .
              BIND("campusAmenity" AS ?predicate)
            }
          }
          
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
          BIND(COALESCE(?relatedName_${langPriority[0]}, ?relatedName_${langPriority[1]}, ?relatedName_label) AS ?relatedName)
          
          OPTIONAL {
            GRAPH ?g2 {
              ?related geo:asWKT ?relatedWkt .
            }
          }
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
        const topologyRows = await this.runSelect(topologyQuery);
        const seenTopology = new Set<string>();
        
        topologyRows.forEach(tRow => {
          const uniqueKey = `${tRow.predicate}|${tRow.related}`;
          if (seenTopology.has(uniqueKey)) return;
          seenTopology.add(uniqueKey);
          
          // Parse WKT
          let relatedLat: number | null = null;
          let relatedLon: number | null = null;
          if (tRow.relatedWkt) {
            const wktMatch = tRow.relatedWkt.match(/POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)\s*\)/i);
            if (wktMatch) {
              relatedLon = parseFloat(wktMatch[1]);
              relatedLat = parseFloat(wktMatch[2]);
            }
          }
          
          // Parse type from URI
          let parsedAmenity = tRow.relatedAmenity || null;
          let parsedHighway = tRow.relatedHighway || null;
          let parsedLeisure = tRow.relatedLeisure || null;
          
          if (!parsedAmenity && !parsedHighway && !parsedLeisure && tRow.related) {
            const parsed = parseTypeFromUri(tRow.related);
            if (parsed) {
              parsedAmenity = parsed.amenity;
              parsedHighway = parsed.highway;
              parsedLeisure = parsed.leisure;
            }
          }
          
          poiData.topology.push({
            predicate: tRow.predicate,
            related: {
              poi: tRow.related,
              name: tRow.relatedName || null,
              lat: relatedLat,
              lon: relatedLon,
              wkt: tRow.relatedWkt || null,
              amenity: parsedAmenity,
              highway: parsedHighway,
              leisure: parsedLeisure,
              brand: tRow.relatedBrand || null,
              operator: tRow.relatedOperator || null,
            },
          });
        });
        
        this.logger.debug(`[getPOIByUri] Found ${poiData.topology.length} topology relations`);
      } catch (e: any) {
        this.logger.warn(`[getPOIByUri] Failed to fetch topology: ${e.message}`);
      }
      
      // Fetch device ID from iot-coverage graph
      const iotCoverageGraphUri = this.configService.get<string>('FUSEKI_GRAPH_IOT_COVERAGE') || 'http://localhost:3030/graph/iot-coverage';
      
      const deviceQuery = `
        PREFIX sosa: <http://www.w3.org/ns/sosa/>
        
        SELECT ?device
        WHERE {
          GRAPH <${iotCoverageGraphUri}> {
            <${uri}> sosa:isSampledBy ?device .
          }
        }
        LIMIT 1
      `;
      
      try {
        const deviceRows = await this.runSelect(deviceQuery);
        if (deviceRows.length > 0) {
          (poiData as any).device = deviceRows[0].device;
          this.logger.debug(`[getPOIByUri] Found device: ${(poiData as any).device}`);
        } else {
          (poiData as any).device = null;
        }
      } catch (e: any) {
        this.logger.warn(`[getPOIByUri] Failed to fetch device: ${e.message}`);
        (poiData as any).device = null;
      }
      
      // Also fetch device for topology related entities
      if (poiData.topology.length > 0) {
        const relatedUris = poiData.topology.map(t => `<${t.related.poi}>`).join(' ');
        
        const relatedDeviceQuery = `
          PREFIX sosa: <http://www.w3.org/ns/sosa/>
          
          SELECT ?poi ?device
          WHERE {
            GRAPH <${iotCoverageGraphUri}> {
              VALUES ?poi { ${relatedUris} }
              ?poi sosa:isSampledBy ?device .
            }
          }
        `;
        
        try {
          const relatedDeviceRows = await this.runSelect(relatedDeviceQuery);
          const relatedDeviceMap = new Map<string, string>();
          
          relatedDeviceRows.forEach(row => {
            relatedDeviceMap.set(row.poi, row.device);
          });
          
          // Assign device to topology related entities
          poiData.topology.forEach(t => {
            (t.related as any).device = relatedDeviceMap.get(t.related.poi) || null;
          });
          
          this.logger.debug(`[getPOIByUri] Found device mappings for ${relatedDeviceMap.size} topology entities`);
        } catch (e: any) {
          this.logger.warn(`[getPOIByUri] Failed to fetch device for topology: ${e.message}`);
        }
      }
      
      // Fetch sensor data for main POI
      if ((poiData as any).device) {
        try {
          const sensorData = await this.fetchSensorDataForDevice((poiData as any).device);
          (poiData as any).sensorData = sensorData;
          this.logger.debug(`[getPOIByUri] Fetched sensor data for POI`);
        } catch (e: any) {
          this.logger.warn(`[getPOIByUri] Failed to fetch sensor data: ${e.message}`);
          (poiData as any).sensorData = null;
        }
      } else {
        (poiData as any).sensorData = null;
      }
      
      return { found: true, poi: poiData };
    } catch (e: any) {
      this.logger.error(`[getPOIByUri] Error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Get all IoT stations with their coordinates from iot_infrastructure graph
   * URI Pattern: urn:ngsi-ld:Device:Hanoi:station:{TênTrạm}
   */
  async getAllIoTStations() {
    const iotInfraGraphUri = this.configService.get<string>('FUSEKI_GRAPH_IOT_INFRASTRUCTURE') || 'http://localhost:3030/graph/iot-infrastructure';
    
    this.logger.debug(`[getAllIoTStations] Fetching all IoT stations from ${iotInfraGraphUri}`);
    
    // Query to get all stations with their geometry
    const query = `
      PREFIX sosa: <http://www.w3.org/ns/sosa/>
      PREFIX ssn: <http://www.w3.org/ns/ssn/>
      PREFIX geo: <http://www.opengis.net/ont/geosparql#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX sf: <http://www.opengis.net/ont/sf#>
      
      SELECT DISTINCT ?station ?label ?wkt
      WHERE {
        GRAPH <${iotInfraGraphUri}> {
          ?station a sosa:Platform .
          OPTIONAL { ?station rdfs:label ?label . }
          
          ?station geo:hasGeometry ?geometry .
          ?geometry a sf:Point .
          ?geometry geo:asWKT ?wkt .
        }
      }
    `;
    
    try {
      const rows = await this.runSelect(query);
      this.logger.debug(`[getAllIoTStations] Found ${rows.length} stations`);
      
      const stations: Array<{ stationId: string; label: string; lat: number; lon: number }> = [];
      
      rows.forEach(row => {
        if (row.wkt && row.station) {
          // Parse WKT to get coordinates
          const wktMatch = row.wkt.match(/POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)\s*\)/i);
          if (wktMatch) {
            const lon = parseFloat(wktMatch[1]);
            const lat = parseFloat(wktMatch[2]);
            
            // Only add if coordinates are valid
            if (!isNaN(lat) && !isNaN(lon)) {
              // Extract station name from URI (last part after last :)
              const stationName = row.station.split(':').pop() || row.station;
              stations.push({
                stationId: row.station,
                label: row.label || stationName,
                lat,
                lon,
              });
            }
          }
        }
      });
      
      this.logger.debug(`[getAllIoTStations] Parsed ${stations.length} valid stations`);
      
      return { stations };
    } catch (e: any) {
      this.logger.error(`[getAllIoTStations] Error: ${e.message}`);
      return { stations: [] };
    }
  }

  /**
   * Get locations of multiple devices (for AQI layer)
   * Fetches lat/lon directly from iot_infrastructure graph
   */
  async getDeviceLocations(deviceUris: string[]) {
    if (!deviceUris || deviceUris.length === 0) {
      return { locations: {} };
    }
    
    this.logger.debug(`[getDeviceLocations] Fetching locations for ${deviceUris.length} devices`);
    
    const iotInfraGraphUri = this.configService.get<string>('FUSEKI_GRAPH_IOT_INFRASTRUCTURE') || 'http://localhost:3030/graph/iot-infrastructure';
    
    // Build VALUES clause for device URIs
    const deviceValues = deviceUris.map(uri => `<${uri}>`).join(' ');
    
    // Query to get device locations directly from iot_infrastructure
    const query = `
      PREFIX geo: <http://www.opengis.net/ont/geosparql#>
      PREFIX sf: <http://www.opengis.net/ont/sf#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT DISTINCT ?device ?label ?wkt
      WHERE {
        GRAPH <${iotInfraGraphUri}> {
          VALUES ?device { ${deviceValues} }
          ?device geo:hasGeometry ?geometry .
          ?geometry a sf:Point .
          ?geometry geo:asWKT ?wkt .
          OPTIONAL { ?device rdfs:label ?label . }
        }
      }
    `;
    
    try {
      const rows = await this.runSelect(query);
      this.logger.debug(`[getDeviceLocations] Found ${rows.length} device locations`);
      
      const locations: Record<string, { lat: number; lon: number; label: string }> = {};
      
      rows.forEach(row => {
        if (row.wkt && row.device) {
          // Parse WKT to get coordinates
          const wktMatch = row.wkt.match(/POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)\s*\)/i);
          if (wktMatch) {
            const lon = parseFloat(wktMatch[1]);
            const lat = parseFloat(wktMatch[2]);
            
            // Only add if coordinates are valid
            if (!isNaN(lat) && !isNaN(lon)) {
              const stationName = row.device.split(':').pop() || row.device;
              locations[row.device] = { lat, lon, label: row.label || stationName };
            }
          }
        }
      });
      
      this.logger.debug(`[getDeviceLocations] Parsed ${Object.keys(locations).length} valid locations`);
      
      return { locations };
    } catch (e: any) {
      this.logger.error(`[getDeviceLocations] Error: ${e.message}`);
      return { locations: {} };
    }
  }

  // PUBLIC: Execute SELECT query provided by client
  async executeSelect(query: string) {
    if (!query || !query.trim()) {
      throw new BadRequestException('Query is empty');
    }

    console.log('Original query:', query);
    const cleaned = query.trim();

    // Find SELECT keyword (case insensitive) after PREFIX lines
    const hasSelect = /\bSELECT\b/i.test(cleaned);
    if (!hasSelect) {
      throw new BadRequestException('Only SELECT SPARQL queries are supported');
    }

    console.log('Cleaned query:', cleaned);

    return this.runSelect(cleaned);
 }

  @ChatTool({
    name: 'searchNearby',
    description: 'Search for POIs (points of interest) near a given longitude/latitude location. Supports 27+ service types: atm, bank, school, drinking_water, bus_stop, playground, toilets, hospital, post_office, park, parking, library, charging_station, waste_basket, fuel_station, community_centre, supermarket, police, pharmacy, fire_station, restaurant, university, convenience_store, marketplace, cafe, warehouse, clinic, kindergarten. Can search multiple types at once. Automatically includes topology relationships information (related places). **RESULTS INCLUDE SENSOR DATA**: sensorData with aqi (air quality index 0-500, lower=better), temperature (°C), noise_level (dB). Use minAqi/maxAqi to filter by air quality (e.g., maxAqi=50 = good air, maxAqi=100 = moderate).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        lon: { type: SchemaType.NUMBER, description: 'Longitude of center location' },
        lat: { type: SchemaType.NUMBER, description: 'Latitude of center location' },
        radiusKm: { type: SchemaType.NUMBER, description: 'Search radius (km)' },
        types: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'List of service types to search (atm, hospital, school, cafe, bus_stop, playground, restaurant, charging_station, etc.). Leave empty to search all.' },
        includeIoT: { type: SchemaType.BOOLEAN, description: 'Include IoT sensor coverage information. Default: false.' },
        minAqi: { type: SchemaType.NUMBER, description: 'Minimum AQI filter (0-500). Only returns places with aqi >= minAqi.' },
        maxAqi: { type: SchemaType.NUMBER, description: 'Maximum AQI filter (0-500). Use maxAqi=50 for good air, maxAqi=100 for moderate air.' },
        limit: { type: SchemaType.NUMBER, description: 'Maximum POIs to return (default 150)' },
      },
      required: ['lon', 'lat', 'radiusKm'],
    },
  })
  async searchNearby(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    types?: string[];          // List of service types (atm, hospital, school, cafe, bus_stop, playground, etc.)
    includeTopology?: boolean; // Include topology relationships info
    includeIoT?: boolean;      // Include IoT coverage info
    minAqi?: number;           // Minimum AQI filter
    maxAqi?: number;           // Maximum AQI filter (e.g., 50 = good air)
    limit?: number;
    language?: string;         // Language: 'vi', 'en', 'all' (default: 'en')
  }) {
    const { lon, lat, radiusKm } = params;
    if (
      lon === undefined || lat === undefined ||
      Number.isNaN(lon) || Number.isNaN(lat)
    ) throw new BadRequestException('Missing or invalid lon/lat');
    if (!radiusKm || radiusKm <= 0) throw new BadRequestException('radiusKm must be > 0');

    // Increase internal limit if AQI filter is applied to have enough results after filtering
    const hasAqiFilter = params.minAqi !== undefined || params.maxAqi !== undefined;
    const internalLimit = hasAqiFilter ? 300 : Math.min(Math.max(params.limit ?? 100, 1), 100);
    const outputLimit = Math.min(Math.max(params.limit ?? 100, 1), 100);
    
    // Always enable topology for all queries, IoT is optional
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
    
    // Map types to graph URIs (supports both singular and plural)
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
            BIND(IF(BOUND(?schemaNameRaw) && LANG(?schemaNameRaw) = "en", ?schemaNameRaw,
                    IF(BOUND(?schemaNameRaw) && LANG(?schemaNameRaw) = "", ?schemaNameRaw, ?schemaNameRaw)) AS ?schemaName)
            BIND(IF(BOUND(?labelRaw) && LANG(?labelRaw) = "en", ?labelRaw,
                    IF(BOUND(?labelRaw) && LANG(?labelRaw) = "", ?labelRaw, ?labelRaw)) AS ?label)
            BIND(COALESCE(?schemaName, ?label) AS ?name)
            
            FILTER(?lon >= ${minLon} && ?lon <= ${maxLon} && ?lat >= ${minLat} && ?lat <= ${maxLat})
            FILTER(BOUND(?wkt))
          }
        }
        
        ${iotJoin}
      }
      GROUP BY ?poi ?name ?amenity ?highway ?leisure ?brand ?operator ?wkt ?lon ?lat
      LIMIT ${internalLimit * 3}
    `;

    const rows = await this.runSelect(query);
    
    this.logger.debug(`Found ${rows.length} raw results from SPARQL query`);

    // Determine desired language (default: 'en')
    const language = (params.language || 'en').toLowerCase();
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

    // Process results với Haversine - chưa slice để có thể filter theo AQI sau
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
      .slice(0, hasAqiFilter ? internalLimit : outputLimit);

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
          
          # Tìm tên của địa điểm liên quan - ưu tiên tiếng Việt
          OPTIONAL {
            GRAPH ?g {
              {
                ?related schema:name ?relatedNameVi .
                FILTER(LANG(?relatedNameVi) = "en")
              }
            }
          }
          OPTIONAL {
            GRAPH ?g2 {
              {
                ?related schema:name ?relatedNameNoLang .
                FILTER(LANG(?relatedNameNoLang) = "")
              }
            }
          }
          OPTIONAL {
            GRAPH ?g3 {
              {
                ?related schema:name ?relatedNameAny .
              }
            }
          }
          OPTIONAL {
            GRAPH ?g4 {
              {
                ?related rdfs:label ?relatedLabelVi .
                FILTER(LANG(?relatedLabelVi) = "en")
              }
            }
          }
          OPTIONAL {
            GRAPH ?g5 {
              {
                ?related rdfs:label ?relatedLabelNoLang .
                FILTER(LANG(?relatedLabelNoLang) = "")
              }
            }
          }
          OPTIONAL {
            GRAPH ?g6 {
              {
                ?related rdfs:label ?relatedLabelAny .
              }
            }
          }
          
          BIND(COALESCE(?relatedNameVi, ?relatedNameNoLang, ?relatedNameAny, ?relatedLabelVi, ?relatedLabelNoLang, ?relatedLabelAny) AS ?relatedName)
          
          # Lấy tọa độ của địa điểm liên quan
          OPTIONAL {
            GRAPH ?g7 {
              ?related geo:asWKT ?relatedWkt .
            }
          }
        }
      `;
      
      try {
        const topologyRows = await this.runSelect(topologyQuery);
        const topologyMap = new Map<string, Map<string, any>>();
        
        topologyRows.forEach(row => {
          if (!topologyMap.has(row.poi)) {
            topologyMap.set(row.poi, new Map());
          }
          
          // Deduplicate key: predicate + related URI
          const dedupeKey = `${row.predicate}|${row.related}`;
          
          // Chỉ thêm nếu chưa tồn tại (ưu tiên kết quả đầu tiên - đã có tên tiếng Việt từ COALESCE)
          if (topologyMap.get(row.poi)!.has(dedupeKey)) {
            return; // Skip duplicate
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
          
          topologyMap.get(row.poi)!.set(dedupeKey, {
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
          topology: topologyMap.has(r.poi) ? Array.from(topologyMap.get(r.poi)!.values()) : [],
        }));
        
        // Fetch device for topology related entities
        const allRelatedUris = new Set<string>();
        topologyRows.forEach(row => allRelatedUris.add(row.related));
        
        if (allRelatedUris.size > 0) {
          const relatedUrisStr = Array.from(allRelatedUris).map(u => `<${u}>`).join(' ');
          const iotCoverageGraphUri = this.configService.get<string>('FUSEKI_GRAPH_IOT_COVERAGE') || 'http://localhost:3030/graph/iot-coverage';
          
          const relatedDeviceQuery = `
            PREFIX sosa: <http://www.w3.org/ns/sosa/>
            
            SELECT ?poi ?device
            WHERE {
              GRAPH <${iotCoverageGraphUri}> {
                VALUES ?poi { ${relatedUrisStr} }
                ?poi sosa:isSampledBy ?device .
              }
            }
          `;
          
          try {
            const relatedDeviceRows = await this.runSelect(relatedDeviceQuery);
            const relatedDeviceMap = new Map<string, string>();
            
            relatedDeviceRows.forEach(row => {
              relatedDeviceMap.set(row.poi, row.device);
            });
            
            // Update topology related entities with device
            results.forEach(r => {
              if (r.topology) {
                r.topology.forEach((t: any) => {
                  t.related.device = relatedDeviceMap.get(t.related.poi) || null;
                });
              }
            });
            
            this.logger.debug(`Found device mappings for ${relatedDeviceMap.size} topology entities`);
          } catch (e: any) {
            this.logger.warn('Failed to fetch device for topology: ' + e.message);
          }
        }
      } catch (e: any) {
        this.logger.warn('Failed to fetch topology: ' + e.message);
      }
    }
    
    // Fetch device IDs from iot-coverage graph for main POIs
    if (results.length > 0) {
      const poiUris = results.map(r => `<${r.poi}>`).join(' ');
      const iotCoverageGraphUri = this.configService.get<string>('FUSEKI_GRAPH_IOT_COVERAGE') || 'http://localhost:3030/graph/iot-coverage';
      
      const deviceQuery = `
        PREFIX sosa: <http://www.w3.org/ns/sosa/>
        
        SELECT ?poi ?device
        WHERE {
          GRAPH <${iotCoverageGraphUri}> {
            VALUES ?poi { ${poiUris} }
            ?poi sosa:isSampledBy ?device .
          }
        }
      `;
      
      try {
        const deviceRows = await this.runSelect(deviceQuery);
        const deviceMap = new Map<string, string>();
        
        deviceRows.forEach(row => {
          deviceMap.set(row.poi, row.device);
        });
        
        // Assign device to results
        results = results.map(r => ({
          ...r,
          device: deviceMap.get(r.poi) || null,
        }));
        
        this.logger.debug(`Found device mappings for ${deviceMap.size} POIs`);
      } catch (e: any) {
        this.logger.warn('Failed to fetch device mappings: ' + e.message);
      }
    }

    // Fetch sensor data (AQI, temperature, noise_level) for POIs with devices
    if (results.length > 0) {
      const deviceMap = new Map<string, string>();
      results.forEach(r => {
        if ((r as any).device) {
          deviceMap.set(r.poi, (r as any).device);
        }
      });
      
      if (deviceMap.size > 0) {
        try {
          const sensorDataMap = await this.fetchSensorDataForDevices(deviceMap);
          
          results = results.map(r => ({
            ...r,
            sensorData: sensorDataMap.get(r.poi) || null,
          }));
          
          this.logger.debug(`Fetched sensor data for ${sensorDataMap.size} POIs`);
        } catch (e: any) {
          this.logger.warn('Failed to fetch sensor data: ' + e.message);
        }
      }
    }

    // Filter by AQI if requested
    if (hasAqiFilter) {
      const beforeFilter = results.length;
      results = results.filter(r => {
        const sensorData = (r as any).sensorData;
        // Chỉ lọc những POI có sensor data và AQI
        if (!sensorData || sensorData.aqi === null || sensorData.aqi === undefined) {
          return false; // Bỏ qua POI không có dữ liệu AQI khi filter
        }
        const aqi = sensorData.aqi;
        if (params.minAqi !== undefined && aqi < params.minAqi) return false;
        if (params.maxAqi !== undefined && aqi > params.maxAqi) return false;
        return true;
      }).slice(0, outputLimit);
      
      this.logger.debug(`AQI filter: ${beforeFilter} -> ${results.length} (minAqi=${params.minAqi}, maxAqi=${params.maxAqi})`);
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
    description: 'Search for places with topology relationships to other places. Examples: find restaurants near charging stations, cafes in parks, hospitals with parking. Supports multiple related place types (relatedTypes can be an array). This tool is optimized for queries like "find A near/in/with B (and C, D...)". Note: relationship="isNextTo" (default) includes both isNextTo and containedInPlace to cover the concept of "near". **RESULTS INCLUDE SENSOR DATA**: sensorData with aqi (air quality index 0-500, lower=better), temperature (°C), noise_level (dB). Use minAqi/maxAqi to filter by air quality.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        lon: { type: SchemaType.NUMBER, description: 'Center longitude' },
        lat: { type: SchemaType.NUMBER, description: 'Center latitude' },
        radiusKm: { type: SchemaType.NUMBER, description: 'Search radius (km)' },
        targetType: { type: SchemaType.STRING, description: 'Type of place to search for (restaurant, cafe, hospital, school, etc.)' },
        relatedTypes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'List of related place types (charging_station, parking, bus_stop, atm, etc.). Can be 1 or more types.' },
        relationship: { 
          type: SchemaType.STRING, 
          description: 'Relationship type: "isNextTo" (adjacent), "containedInPlace" (within area), "amenityFeature" (has amenity). Default: "isNextTo"'
        },
        minAqi: { type: SchemaType.NUMBER, description: 'Minimum AQI filter (0-500)' },
        maxAqi: { type: SchemaType.NUMBER, description: 'Maximum AQI filter. Use maxAqi=50 for good air, maxAqi=100 for moderate.' },
        limit: { type: SchemaType.NUMBER, description: 'Maximum results (default 50)' },
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
    minAqi?: number;           // Lọc AQI tối thiểu
    maxAqi?: number;           // Lọc AQI tối đa
    limit?: number;
  }) {
    const { lon, lat, radiusKm, targetType, relatedTypes } = params;
    const relationship = params.relationship || 'isNextTo';
    const hasAqiFilter = params.minAqi !== undefined || params.maxAqi !== undefined;
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

    const relationshipTypes = relationship === 'isNextTo' 
      ? ['isNextTo', 'containedInPlace']
      : [relationship];
    
    this.logger.debug(`searchNearbyWithTopology: ${targetType} with relationships [${relationshipTypes.join('+')}] to [${relatedTypes.join(', ')}] within ${radiusKm}km`);

    const targetResults = await this.searchNearby({
      lon, lat, radiusKm,
      types: [targetType],
      includeTopology: false,
      limit: hasAqiFilter ? limit * 4 : limit * 2, // Query nhiều hơn nếu có AQI filter
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

    // Enrich với thông tin related entity (đầy đủ thông tin POI) - deduplicate
    const relatedMap = new Map(relatedResults.items.map(r => [r.poi, r]));
    const enrichedItems = filteredItems.map(item => {
      // Deduplicate related entities theo URI
      const seenRelated = new Set<string>();
      const relatedEntities = topologyRows
        .filter(r => r.targetPoi === item.poi)
        .filter(r => {
          // Chỉ giữ lại related POI đầu tiên, bỏ qua duplicates
          if (seenRelated.has(r.relatedPoi)) return false;
          seenRelated.add(r.relatedPoi);
          return true;
        })
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
            device: (related as any).device || null,
          } : {
            poi: r.relatedPoi,
            name: null,
            lon: null,
            lat: null,
            distanceKm: null,
            device: null,
          };
        });

      return {
        ...item,
        relatedEntities,
      };
    });

    // Fetch device IDs for enriched items from iot-coverage graph
    const allPoiUris = enrichedItems.map(item => `<${item.poi}>`);
    const allRelatedUris = enrichedItems.flatMap(item => 
      item.relatedEntities.map(re => `<${re.poi}>`)
    );
    const allUris = [...new Set([...allPoiUris, ...allRelatedUris])].join(' ');
    
    if (allUris.length > 0) {
      const iotCoverageGraphUri = this.configService.get<string>('FUSEKI_GRAPH_IOT_COVERAGE') || 'http://localhost:3030/graph/iot-coverage';
      
      const deviceQuery = `
        PREFIX sosa: <http://www.w3.org/ns/sosa/>
        
        SELECT ?poi ?device
        WHERE {
          GRAPH <${iotCoverageGraphUri}> {
            VALUES ?poi { ${allUris} }
            ?poi sosa:isSampledBy ?device .
          }
        }
      `;
      
      try {
        const deviceRows = await this.runSelect(deviceQuery);
        const deviceMap = new Map<string, string>();
        
        deviceRows.forEach(row => {
          deviceMap.set(row.poi, row.device);
        });
        
        // Update enriched items with device URIs
        enrichedItems.forEach(item => {
          (item as any).device = deviceMap.get(item.poi) || null;
          item.relatedEntities.forEach((re: any) => {
            re.device = deviceMap.get(re.poi) || null;
          });
        });
        
        this.logger.debug(`Found device mappings for ${deviceMap.size} POIs in searchNearbyWithTopology`);
      } catch (e: any) {
        this.logger.warn('Failed to fetch device mappings in searchNearbyWithTopology: ' + e.message);
      }
    }

    // Fetch sensor data for enriched items
    const poiDeviceMap = new Map<string, string>();
    enrichedItems.forEach(item => {
      if ((item as any).device) {
        poiDeviceMap.set(item.poi, (item as any).device);
      }
    });
    
    if (poiDeviceMap.size > 0) {
      try {
        const sensorDataMap = await this.fetchSensorDataForDevices(poiDeviceMap);
        
        enrichedItems.forEach(item => {
          (item as any).sensorData = sensorDataMap.get(item.poi) || null;
        });
        
        this.logger.debug(`Fetched sensor data for ${sensorDataMap.size} POIs in searchNearbyWithTopology`);
      } catch (e: any) {
        this.logger.warn('Failed to fetch sensor data in searchNearbyWithTopology: ' + e.message);
      }
    }

    // Filter by AQI if requested
    let finalItems = enrichedItems;
    if (hasAqiFilter) {
      const beforeFilter = finalItems.length;
      finalItems = finalItems.filter(item => {
        const sensorData = (item as any).sensorData;
        if (!sensorData || sensorData.aqi === null || sensorData.aqi === undefined) {
          return false;
        }
        const aqi = sensorData.aqi;
        if (params.minAqi !== undefined && aqi < params.minAqi) return false;
        if (params.maxAqi !== undefined && aqi > params.maxAqi) return false;
        return true;
      }).slice(0, limit);
      
      this.logger.debug(`AQI filter in searchNearbyWithTopology: ${beforeFilter} -> ${finalItems.length}`);
    }

    this.logger.debug(`Found ${finalItems.length} ${targetType} with [${relationshipTypes.join('+')}] relationships to [${relatedTypes.join(', ')}]`);

    return {
      center: { lon, lat },
      radiusKm,
      targetType,
      relatedTypes,
      relationship,
      count: finalItems.length,
      items: finalItems,
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