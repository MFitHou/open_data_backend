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

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FusekiService } from '../fuseki/fuseki.service';
import { randomUUID } from 'crypto';

/**
 * IoT Simulator Service
 * Tạo dữ liệu cảm biến giả lập cho Smart City Dashboard
 * Sử dụng SOSA/SSN Ontology theo quy định cuộc thi
 */
@Injectable()
export class IotSimulatorService {
  private readonly logger = new Logger(IotSimulatorService.name);

  // Named Graph URIs cho tổ chức dữ liệu tốt hơn
  private readonly TRAFFIC_GRAPH = 'http://opendatafithou.org/graph/iot-traffic';
  private readonly FLOOD_GRAPH = 'http://opendatafithou.org/graph/iot-flood';

  // Mock data sources - Traffic Cameras tại Hà Nội
  private readonly trafficCameras = [
    {
      id: 'Cam_CauGiay',
      lat: 21.033,
      lon: 105.799,
      name: 'Cầu Giấy Intersection',
    },
    {
      id: 'Cam_KimMa',
      lat: 21.028,
      lon: 105.819,
      name: 'Kim Mã - Núi Trúc Junction',
    },
    {
      id: 'Cam_GiangVo',
      lat: 21.025,
      lon: 105.827,
      name: 'Giảng Võ Boulevard',
    },
    {
      id: 'Cam_HoanKiem',
      lat: 21.029,
      lon: 105.852,
      name: 'Hoàn Kiếm Lake Area',
    },
    {
      id: 'Cam_MyDinh',
      lat: 21.028,
      lon: 105.776,
      name: 'Mỹ Đình Stadium Area',
    },
  ];

  // Mock data sources - Flood Sensors tại Hà Nội
  private readonly floodSensors = [
    {
      id: 'Flood_ThaiHa',
      lat: 21.012,
      lon: 105.82,
      name: 'Thái Hà Street',
    },
    {
      id: 'Flood_NguyenTrai',
      lat: 21.005,
      lon: 105.835,
      name: 'Nguyễn Trãi - Khuất Duy Tiến',
    },
    {
      id: 'Flood_ToLich',
      lat: 21.015,
      lon: 105.794,
      name: 'Tô Lịch River - Láng Hạ',
    },
  ];

  constructor(private readonly fusekiService: FusekiService) {}

  /**
   * Mô phỏng dữ liệu giao thông - chạy mỗi 10 giây
   */
  @Cron('*/10 * * * * *')
  async handleTrafficSimulation() {
    this.logger.debug('Running traffic simulation...');

    try {
      // Xóa dữ liệu cũ để tránh bloat database (SILENT = không lỗi nếu graph chưa tồn tại)
      const clearGraph = `DROP SILENT GRAPH <${this.TRAFFIC_GRAPH}>`;
      await this.fusekiService.update(clearGraph);

      // Tạo batch insert cho tất cả cameras
      const observations: string[] = [];

      for (const camera of this.trafficCameras) {
        // Sinh dữ liệu ngẫu nhiên
        const intensity = Math.floor(Math.random() * 81) + 20; // 20-100 vehicles/min
        const congested = intensity > 80;
        const observationId = `Obs_Traffic_${randomUUID()}`;
        const timestamp = new Date().toISOString();

        observations.push(`
  ex:${observationId} a sosa:Observation ;
    rdfs:label "Traffic Observation at ${camera.name}" ;
    sosa:madeBySensor ex:${camera.id} ;
    sosa:hasSimpleResult "${intensity}"^^xsd:integer ;
    sosa:resultTime "${timestamp}"^^xsd:dateTime ;
    ex:congested "${congested}"^^xsd:boolean ;
    ex:sensorType "traffic_camera" .
    
  ex:${camera.id} a sosa:Sensor ;
    rdfs:label "${camera.name}" ;
    geo:lat "${camera.lat}"^^xsd:double ;
    geo:long "${camera.lon}"^^xsd:double .
        `);

        this.logger.debug(
          `Traffic data generated: ${camera.id} - ${intensity} vehicles/min (congested: ${congested})`,
        );
      }

      // Tạo SPARQL INSERT DATA query với Named Graph
      const sparql = `
PREFIX sosa: <http://www.w3.org/ns/sosa/>
PREFIX ex: <http://opendatafithou.org/sensor/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

INSERT DATA {
  GRAPH <${this.TRAFFIC_GRAPH}> {
${observations.join('\n')}
  }
}
      `.trim();

      // Gửi vào Fuseki
      await this.fusekiService.update(sparql);
      this.logger.log(`Traffic simulation completed: ${this.trafficCameras.length} cameras updated`);
    } catch (error) {
      this.logger.error('Error in traffic simulation:', error.message);
    }
  }

  /**
   * Mô phỏng dữ liệu ngập lụt - chạy mỗi 20 giây
   */
  @Cron('*/20 * * * * *')
  async handleFloodSimulation() {
    this.logger.debug('Running flood simulation...');

    try {
      // Xóa dữ liệu cũ để tránh bloat database (SILENT = không lỗi nếu graph chưa tồn tại)
      const clearGraph = `DROP SILENT GRAPH <${this.FLOOD_GRAPH}>`;
      await this.fusekiService.update(clearGraph);

      // Tạo batch insert cho tất cả sensors
      const observations: string[] = [];

      for (const sensor of this.floodSensors) {
        // Sinh dữ liệu ngẫu nhiên
        const waterLevel = Math.floor(Math.random() * 51); // 0-50 cm
        const observationId = `Obs_Flood_${randomUUID()}`;
        const timestamp = new Date().toISOString();
        const alertLevel =
          waterLevel > 40 ? 'critical' : waterLevel > 25 ? 'warning' : 'normal';

        observations.push(`
  ex:${observationId} a sosa:Observation ;
    rdfs:label "Flood Observation at ${sensor.name}" ;
    sosa:madeBySensor ex:${sensor.id} ;
    sosa:hasSimpleResult "${waterLevel}"^^xsd:integer ;
    sosa:resultTime "${timestamp}"^^xsd:dateTime ;
    ex:alertLevel "${alertLevel}" ;
    ex:sensorType "flood_sensor" .
    
  ex:${sensor.id} a sosa:Sensor ;
    rdfs:label "${sensor.name}" ;
    geo:lat "${sensor.lat}"^^xsd:double ;
    geo:long "${sensor.lon}"^^xsd:double .
        `);

        this.logger.debug(
          `Flood data generated: ${sensor.id} - ${waterLevel}cm (alert: ${alertLevel})`,
        );
      }

      // Tạo SPARQL INSERT DATA query với Named Graph
      const sparql = `
PREFIX sosa: <http://www.w3.org/ns/sosa/>
PREFIX ex: <http://opendatafithou.org/sensor/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

INSERT DATA {
  GRAPH <${this.FLOOD_GRAPH}> {
${observations.join('\n')}
  }
}
      `.trim();

      // Gửi vào Fuseki
      await this.fusekiService.update(sparql);
      this.logger.log(`Flood simulation completed: ${this.floodSensors.length} sensors updated`);
    } catch (error) {
      this.logger.error('Error in flood simulation:', error.message);
    }
  }

  /**
   * Lấy dữ liệu traffic gần nhất (cho dashboard)
   */
  async getLatestTrafficData() {
    const query = `
PREFIX sosa: <http://www.w3.org/ns/sosa/>
PREFIX ex: <http://opendatafithou.org/sensor/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?obs ?sensor ?sensorLabel ?lat ?lon ?intensity ?congested ?timestamp
WHERE {
  GRAPH <${this.TRAFFIC_GRAPH}> {
    ?obs a sosa:Observation ;
      sosa:madeBySensor ?sensor ;
      sosa:hasSimpleResult ?intensity ;
      sosa:resultTime ?timestamp ;
      ex:congested ?congested ;
      ex:sensorType "traffic_camera" .
      
    ?sensor rdfs:label ?sensorLabel ;
      geo:lat ?lat ;
      geo:long ?lon .
  }
}
ORDER BY DESC(?timestamp)
LIMIT 50
    `.trim();

    return this.fusekiService.executeSelect(query);
  }

  /**
   * Lấy dữ liệu flood gần nhất (cho dashboard)
   */
  async getLatestFloodData() {
    const query = `
PREFIX sosa: <http://www.w3.org/ns/sosa/>
PREFIX ex: <http://opendatafithou.org/sensor/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?obs ?sensor ?sensorLabel ?lat ?lon ?waterLevel ?alertLevel ?timestamp
WHERE {
  GRAPH <${this.FLOOD_GRAPH}> {
    ?obs a sosa:Observation ;
      sosa:madeBySensor ?sensor ;
      sosa:hasSimpleResult ?waterLevel ;
      sosa:resultTime ?timestamp ;
      ex:alertLevel ?alertLevel ;
      ex:sensorType "flood_sensor" .
      
    ?sensor rdfs:label ?sensorLabel ;
      geo:lat ?lat ;
      geo:long ?lon .
  }
}
ORDER BY DESC(?timestamp)
LIMIT 30
    `.trim();

    return this.fusekiService.executeSelect(query);
  }
}
