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

      if (!data.latitude || !data.longitude) {
        throw new BadRequestException('Missing required fields: latitude, longitude');
      }

      // Tạo URI cho POI mới
      const poiId = `poi_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const poiUri = `http://opendatafithou.org/poi/${poiId}`;

      // Xác định graph dựa trên type
      let graphUri = 'http://localhost:3030/graph/atm'; // Default
      let poiClass = 'ex:ATM';

      switch (data.type.toLowerCase()) {
        case 'hospital':
          graphUri = 'http://localhost:3030/graph/hospital';
          poiClass = 'ex:Hospital';
          break;
        case 'toilet':
          graphUri = 'http://localhost:3030/graph/toilet';
          poiClass = 'ex:Toilet';
          break;
        case 'bus-stop':
        case 'bus_stop':
          graphUri = 'http://localhost:3030/graph/bus_stop';
          poiClass = 'ex:BusStop';
          break;
        case 'atm':
        default:
          graphUri = 'http://localhost:3030/graph/atm';
          poiClass = 'ex:ATM';
      }

      // SPARQL INSERT query
      const insertQuery = `
        PREFIX ex: <http://opendatafithou.org/poi/>
        PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
        
        INSERT DATA {
          GRAPH <${graphUri}> {
            <${poiUri}> a ${poiClass} ;
              rdfs:label "${data.name}"@vi ;
              geo:lat "${data.latitude}"^^xsd:decimal ;
              geo:long "${data.longitude}"^^xsd:decimal ;
              ${data.address ? `ex:address "${data.address}"@vi ;` : ''}
              ${data.description ? `rdfs:comment "${data.description}"@vi ;` : ''}
              ex:createdAt "${new Date().toISOString()}"^^xsd:dateTime .
          }
        }
      `;

      // Thực thi INSERT query
      // Note: FusekiService cần có method executeUpdate cho INSERT/DELETE
      // Tạm thời sử dụng executeSelect và log warning
      this.logger.warn('INSERT query prepared but not executed (need executeUpdate method):');
      this.logger.debug(insertQuery);

      // TODO: Implement executeUpdate trong FusekiService
      // await this.fusekiService.executeUpdate(insertQuery);

      return {
        success: true,
        message: 'POI creation prepared (pending executeUpdate implementation)',
        poiId,
        poiUri,
        query: insertQuery,
      };
    } catch (error) {
      this.logger.error('Error creating POI:', error);
      throw error;
    }
  }
}
