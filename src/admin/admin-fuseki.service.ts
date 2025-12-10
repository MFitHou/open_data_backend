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
 * AdminFusekiService - Service riêng để xử lý SPARQL queries cho Admin module
 * Tách biệt khỏi FusekiService chính để quản lý độc lập
 */
@Injectable()
export class AdminFusekiService implements OnModuleInit {
  private readonly logger = new Logger(AdminFusekiService.name);

  // Đọc từ .env
  private readonly queryEndpoint =
    process.env.FUSEKI_QUERY_ENDPOINT ||
    `${process.env.FUSEKI_BASE_URL}/${process.env.FUSEKI_DATASET}/sparql`;

  private readonly updateEndpoint =
    process.env.FUSEKI_UPDATE_ENDPOINT ||
    `${process.env.FUSEKI_BASE_URL}/${process.env.FUSEKI_DATASET}/update`;

  async onModuleInit() {
    try {
      this.logger.log('Admin Fuseki query endpoint: ' + this.queryEndpoint);
      if (!this.queryEndpoint) {
        this.logger.error('Missing FUSEKI_QUERY_ENDPOINT');
        return;
      }
      // Check graph list (log only, don't block)
      await this.listGraphs();
    } catch (e: any) {
      this.logger.warn('Init admin fuseki skip: ' + e.message);
    }
  }

  /**
   * Liệt kê tất cả các graph trong dataset
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
   * Thực thi SPARQL SELECT query
   * @param query - SPARQL SELECT query string
   * @returns Array of result objects
   */
  async runSelect(query: string): Promise<any[]> {
    if (!this.queryEndpoint) {
      throw new Error('Query endpoint not configured');
    }
    const url = this.queryEndpoint + '?query=' + encodeURIComponent(query);
    this.logger.debug('SPARQL GET: ' + url.substring(0, 200));

    // Fuseki yêu cầu xác thực,
    // nếu không đặt user/pass trên fuseki thì comment phần này
    const headers: Record<string, string> = {
      Accept: 'application/sparql-results+json',
    };
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
   * Alias cho runSelect để tương thích với code sử dụng executeSelect
   * @param query - SPARQL SELECT query string
   * @returns Array of result objects
   */
  async executeSelect(query: string): Promise<any[]> {
    return this.runSelect(query);
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
