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
 * DEPRECATED: Service giả lập dữ liệu cảm biến IoT cho Smart City
 * 
 * Trạng thái: ĐÃ VÔ HIỆU HÓA (các @Cron decorators đã bị comment)
 * 
 * Mục đích ban đầu:
 * - Tạo dữ liệu cảm biến giả lập realtime cho demo Smart City Dashboard
 * - Sử dụng SOSA/SSN Ontology (Semantic Sensor Network) chuẩn W3C
 * - Lưu trữ vào Apache Jena Fuseki dưới dạng RDF triples
 * 
 * Các loại cảm biến được giả lập:
 * 1. Traffic Cameras: Đo mật độ giao thông (vehicles/minute)
 * 2. Flood Sensors: Đo mức nước tại các điểm ngập úng (cm)
 * 
 * Lý do ngừng sử dụng:
 * - IoT simulation không phù hợp với kiến trúc Linked Open Data hiện tại
 * - Dữ liệu giả lập không có giá trị thực tế cho production
 * - Tăng độ phức tạp không cần thiết cho hệ thống POI management
 * 
 * Named Graphs được sử dụng:
 * - http://opendatafithou.org/graph/iot-traffic: Dữ liệu giao thông
 * - http://opendatafithou.org/graph/iot-flood: Dữ liệu ngập lụt
 * 
 * @deprecated Sẽ bị xóa hoàn toàn trong phiên bản tương lai
 */
@Injectable()
export class IotSimulatorService {
  private readonly logger = new Logger(IotSimulatorService.name);

}
