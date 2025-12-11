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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Service xử lý SPARQL queries riêng cho Admin module
 * 
 * Nhiệm vụ:
 * - Thực thi SPARQL SELECT queries để truy vấn dữ liệu từ Apache Jena Fuseki
 * - Thực thi SPARQL UPDATE queries để thêm/sửa/xóa dữ liệu RDF
 * - Quản lý xác thực với Fuseki server (Basic Auth)
 * - Liệt kê và kiểm tra các Named Graph trong dataset
 * 
 * Tách biệt khỏi FusekiService chính để:
 * - Quản lý riêng logic admin (thêm/sửa/xóa POI)
 * - Tránh conflict với queries của user thường
 */
@Injectable()
export class AdminFusekiService implements OnModuleInit {
  private readonly logger = new Logger(AdminFusekiService.name);

  private readonly queryEndpoint =
    process.env.FUSEKI_QUERY_ENDPOINT ||
    `${process.env.FUSEKI_BASE_URL}/${process.env.FUSEKI_DATASET}/sparql`;

  private readonly updateEndpoint =
    process.env.FUSEKI_UPDATE_ENDPOINT ||
    `${process.env.FUSEKI_BASE_URL}/${process.env.FUSEKI_DATASET}/update`;

  /**
   * Khởi tạo service khi NestJS module được load.
   * Kiểm tra kết nối với Fuseki và log danh sách các Named Graph có sẵn.
   */
  async onModuleInit() {
    try {
      this.logger.log('Admin Fuseki query endpoint: ' + this.queryEndpoint);
      if (!this.queryEndpoint) {
        this.logger.error('Missing FUSEKI_QUERY_ENDPOINT');
        return;
      }
      await this.listGraphs();
    } catch (e: any) {
      this.logger.warn('Init admin fuseki skip: ' + e.message);
    }
  }

  /**
   * Liệt kê tất cả các Named Graph trong Fuseki dataset.
   * 
   * Named Graph là nơi lưu trữ dữ liệu RDF theo từng loại POI.
   * Ví dụ: http://localhost:3030/graph/atm, http://localhost:3030/graph/hospital
   * 
   * @returns Mảng các object chứa URI của graph và số lượng triple trong đó
   */
  async listGraphs() {
    const q = `
      SELECT DISTINCT ?g (COUNT(*) as ?count)
      WHERE {
        GRAPH ?g { ?s ?p ?o }
      }
      GROUP BY ?g
      LIMIT 50
    `;
    try {
      const data = await this.runSelect(q);
      this.logger.log('Admin graphs detected: ' + data.length);
      data.forEach((r) => {
        this.logger.log(`Admin Graph: ${r.g} count=${r.count}`);
      });
      return data;
    } catch (error) {
      this.logger.warn(`Could not list graphs: ${error.message}`);
      return [];
    }
  }

  /**
   * Thực thi SPARQL SELECT query để truy vấn dữ liệu
   * 
   * SELECT query dùng để đọc dữ liệu từ RDF triplestore
   * Ví dụ: lấy danh sách POI, tìm kiếm theo tọa độ, lọc theo điều kiện
   * 
   * Tự động xử lý:
   * - Encode query parameters
   * - Thêm Authorization header nếu Fuseki yêu cầu
   * - Parse JSON response thành array of objects đơn giản
   * 
   * @param query SPARQL SELECT query string (bắt đầu bằng PREFIX và SELECT)
   * @returns Mảng các object, mỗi object là 1 kết quả trả về
   * @throws Error nếu query syntax sai hoặc Fuseki server lỗi
   */
  async runSelect(query: string): Promise<any[]> {
    if (!this.queryEndpoint) {
      throw new Error('Query endpoint not configured');
    }
    const url = this.queryEndpoint + '?query=' + encodeURIComponent(query);
    this.logger.debug('SPARQL GET: ' + url.substring(0, 200));

    // Nếu Fuseki không yêu cầu xác thực thì comment phần này.
    const headers: Record<string, string> = { Accept: 'application/sparql-results+json' };
    if (process.env.FUSEKI_USER && process.env.FUSEKI_PASS) {
      const basic = Buffer.from(
        `${process.env.FUSEKI_USER}:${process.env.FUSEKI_PASS}`,
      ).toString('base64');
      headers['Authorization'] = `Basic ${basic}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SPARQL error ${res.status}: ${text}`);
    }

    const json: any = await res.json();
    return json.results.bindings.map((b: any) => {
      const obj: Record<string, any> = {};
      Object.keys(b).forEach((k) => (obj[k] = b[k].value));
      return obj;
    });
  }

  /**
   * Alias method để tương thích với code sử dụng executeSelect
   * Thực chất gọi runSelect() bên trong
   * 
   * @param query SPARQL SELECT query string
   * @returns Mảng các object kết quả
   */
  async executeSelect(query: string): Promise<any[]> {
    return this.runSelect(query);
  }

  /**
   * Thực thi SPARQL UPDATE query để cập nhật dữ liệu.
   * 
   * UPDATE query dùng để:
   * - INSERT DATA: Thêm triple mới vào graph.
   * - DELETE DATA: Xóa triple khỏi graph.
   * - DELETE/INSERT WHERE: Sửa dữ liệu dựa trên điều kiện.
   * 
   * Lưu ý: 
   * - Phải chỉ định Named Graph trong query (GRAPH <uri> { ... }).
   * - Cần quyền ghi trên Fuseki server.
   * - Thay đổi sẽ permanent, không có transaction rollback.
   * 
   * @param updateQuery SPARQL UPDATE query string (INSERT/DELETE/DELETE-INSERT)
   * @throws Error nếu query syntax sai, không có quyền, hoặc server lỗi
   */
  async update(updateQuery: string): Promise<void> {
    if (!this.updateEndpoint) {
      throw new Error('Update endpoint not configured');
    }

    this.logger.debug('SPARQL UPDATE: ' + updateQuery.substring(0, 200));

    const headers: Record<string, string> = {
      'Content-Type': 'application/sparql-update',
    };

    if (process.env.FUSEKI_USER && process.env.FUSEKI_PASS) {
      const basic = Buffer.from(
        `${process.env.FUSEKI_USER}:${process.env.FUSEKI_PASS}`,
      ).toString('base64');
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
}
