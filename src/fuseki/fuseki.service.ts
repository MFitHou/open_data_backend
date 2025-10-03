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

@Injectable()
export class FusekiService implements OnModuleInit {
  private readonly logger = new Logger(FusekiService.name);

  // Đọc từ .env
  private readonly queryEndpoint =
    process.env.FUSEKI_QUERY_ENDPOINT ||
    `${process.env.FUSEKI_BASE_URL}/${process.env.FUSEKI_DATASET}/sparql`;

  private readonly graphUri = "http://localhost:3030/graph/atm";

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
      SELECT * FROM ${this.graphUri}
      WHERE {
        
      } 
      LIMIT 50
    `;
    const data = await this.runSelect(q);
    this.logger.log('Graphs detected: ' + data.length);
    data.forEach(r => {
      this.logger.log(`Graph: ${r.g} count=${r.count}`);
    });
    return data;
  }

  async queryAllATMs() {
    // Nếu chưa xác định graphUri: đọc toàn bộ triple (cẩn trọng nếu dataset lớn)
    const query = this.graphUri
      ? `
        SELECT ?s ?p ?o
        WHERE {
          GRAPH <${this.graphUri}> { ?s ?p ?o }
        } LIMIT 1000
      `
      : `
        SELECT ?s ?p ?o
        WHERE { ?s ?p ?o }
        LIMIT 500
      `;

    const rows = await this.runSelect(query);
    this.logger.log(`Triples fetched: ${rows.length}`);
    return rows;
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

  // Tìm POI gần (default graph)
  async searchNearby(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    amenities?: string[];   // vd ['atm','school']
    limit?: number;         // số POI tối đa trả về (sau lọc khoảng cách)
  }) {
    const { lon, lat, radiusKm } = params;
    if (
      lon === undefined || lat === undefined ||
      Number.isNaN(lon) || Number.isNaN(lat)
    ) throw new BadRequestException('Thiếu hoặc sai lon/lat');
    if (!radiusKm || radiusKm <= 0) throw new BadRequestException('radiusKm phải > 0');

    const limit = Math.min(Math.max(params.limit ?? 200, 1), 2000);

    // Độ lệch (degree) cho bounding box sơ bộ
    const deltaLat = radiusKm / 111; // ~111km mỗi 1 độ vĩ
    const radLat = lat * Math.PI / 180;
    const deltaLon = radiusKm / (111 * Math.cos(radLat) || 0.00001);

    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    let amenityFilter = '';
    const amenities = (params.amenities || []).map(a => a.trim().toLowerCase()).filter(Boolean);
    if (amenities.length > 0) {
      // tạo list "atm","school",...
      const amenityIn = amenities.map(a => `"${a}"`).join(',');
      amenityFilter = `FILTER(LCASE(STR(?amenity)) IN (${amenityIn}))`;
    }

    const query = `
      PREFIX ex: <http://opendatafithou.org/poi/>
      PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      SELECT ?poi ?amenity ?brand ?operator ?wkt ?lon ?lat
      WHERE {
        ?poi ex:amenity ?amenity .
        OPTIONAL { ?poi ex:brand ?brand . }
        OPTIONAL { ?poi ex:operator ?operator . }
        OPTIONAL {
          ?poi geo:hasGeometry ?g .
          ?g geo:asWKT ?wkt .
          # Tách lon / lat từ WKT POINT(lon lat)
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$1") AS ?lonStr)
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$2") AS ?latStr)
          BIND(xsd:double(?lonStr) AS ?lon)
          BIND(xsd:double(?latStr) AS ?lat)
        }
        FILTER(BOUND(?wkt))
        ${amenityFilter}
        FILTER(?lon >= ${minLon} && ?lon <= ${maxLon} && ?lat >= ${minLat} && ?lat <= ${maxLat})
      }
      LIMIT ${limit * 3}  # lấy rộng hơn, lọc khoảng cách thật ở backend
    `;

    const rows = await this.runSelect(query);

    // Tính khoảng cách Haversine
    const results = rows
      .filter(r => r.lon && r.lat)
      .map(r => {
        const dKm = this.haversineKm(lat, lon, parseFloat(r.lat), parseFloat(r.lon));
        return {
          poi: r.poi,
          amenity: r.amenity || null,
          brand: r.brand || null,
          operator: r.operator || null,
          wkt: r.wkt || null,
          lon: parseFloat(r.lon),
          lat: parseFloat(r.lat),
          distanceKm: dKm,
        };
      })
      .filter(r => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return {
      center: { lon, lat },
      radiusKm,
      count: results.length,
      items: results
    };
  }

  // Tìm playground gần
  async searchPlaygroundsNearby(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    limit?: number;
  }) {
    const { lon, lat, radiusKm } = params;
    if (
      lon === undefined || lat === undefined ||
      Number.isNaN(lon) || Number.isNaN(lat)
    ) throw new BadRequestException('Thiếu hoặc sai lon/lat');
    if (!radiusKm || radiusKm <= 0) throw new BadRequestException('radiusKm phải > 0');

    const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);

    // Bounding box
    const deltaLat = radiusKm / 111;
    const radLat = lat * Math.PI / 180;
    const deltaLon = radiusKm / (111 * Math.cos(radLat) || 0.00001);
    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    const query = `
      PREFIX ex: <http://opendatafithou.org/poi/>
      PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?poi ?leisure ?name ?wkt ?lon ?lat
      WHERE {
        ?poi ex:leisure "playground" .
        OPTIONAL { ?poi rdfs:label ?name . }
        OPTIONAL {
          ?poi geo:hasGeometry ?g .
          ?g geo:asWKT ?wkt .
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$1") AS ?lonStr)
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$2") AS ?latStr)
          BIND(xsd:double(?lonStr) AS ?lon)
          BIND(xsd:double(?latStr) AS ?lat)
        }
        FILTER(BOUND(?wkt))
        FILTER(?lon >= ${minLon} && ?lon <= ${maxLon} && ?lat >= ${minLat} && ?lat <= ${maxLat})
      }
      LIMIT ${limit * 3}
    `;

    const rows = await this.runSelect(query);

    const results = rows
      .filter(r => r.lon && r.lat)
      .map(r => {
        const dKm = this.haversineKm(lat, lon, parseFloat(r.lat), parseFloat(r.lon));
        return {
          poi: r.poi,
          leisure: 'playground',
          name: r.name || null,
          wkt: r.wkt || null,
          lon: parseFloat(r.lon),
          lat: parseFloat(r.lat),
          distanceKm: dKm,
        };
      })
      .filter(r => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return {
      center: { lon, lat },
      radiusKm,
      count: results.length,
      items: results
    };
  }

  // Tìm bệnh viện gần
  async searchHospitalsNearby(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    limit?: number;
  }) {
    const { lon, lat, radiusKm } = params;
    if (
      lon === undefined || lat === undefined ||
      Number.isNaN(lon) || Number.isNaN(lat)
    ) throw new BadRequestException('Thiếu hoặc sai lon/lat');
    if (!radiusKm || radiusKm <= 0) throw new BadRequestException('radiusKm phải > 0');

    const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);

    // Bounding box
    const deltaLat = radiusKm / 111;
    const radLat = lat * Math.PI / 180;
    const deltaLon = radiusKm / (111 * Math.cos(radLat) || 0.00001);
    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    const query = `
      PREFIX ex: <http://opendatafithou.org/poi/>
      PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?poi ?amenity ?name ?operator ?wkt ?lon ?lat
      WHERE {
        ?poi ex:amenity ?amenity .
        FILTER(LCASE(STR(?amenity)) = "hospital")
        OPTIONAL { ?poi rdfs:label ?name . }
        OPTIONAL { ?poi ex:operator ?operator . }
        OPTIONAL {
          ?poi geo:hasGeometry ?g .
          ?g geo:asWKT ?wkt .
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$1") AS ?lonStr)
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$2") AS ?latStr)
          BIND(xsd:double(?lonStr) AS ?lon)
          BIND(xsd:double(?latStr) AS ?lat)
        }
        FILTER(BOUND(?wkt))
        FILTER(?lon >= ${minLon} && ?lon <= ${maxLon} && ?lat >= ${minLat} && ?lat <= ${maxLat})
      }
      LIMIT ${limit * 3}
    `;

    const rows = await this.runSelect(query);

    const results = rows
      .filter(r => r.lon && r.lat)
      .map(r => {
        const dKm = this.haversineKm(lat, lon, parseFloat(r.lat), parseFloat(r.lon));
        return {
          poi: r.poi,
          amenity: r.amenity || 'hospital',
          name: r.name || null,
          operator: r.operator || null,
          wkt: r.wkt || null,
          lon: parseFloat(r.lon),
          lat: parseFloat(r.lat),
          distanceKm: dKm,
        };
      })
      .filter(r => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return {
      center: { lon, lat },
      radiusKm,
      count: results.length,
      items: results
    };
  }

  // Tìm nhà vệ sinh gần
  async searchToiletsNearby(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    limit?: number;
  }) {
    const { lon, lat, radiusKm } = params;
    if (
      lon === undefined || lat === undefined ||
      Number.isNaN(lon) || Number.isNaN(lat)
    ) throw new BadRequestException('Thiếu hoặc sai lon/lat');
    if (!radiusKm || radiusKm <= 0) throw new BadRequestException('radiusKm phải > 0');

    const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);

    // Bounding box
    const deltaLat = radiusKm / 111;
    const radLat = lat * Math.PI / 180;
    const deltaLon = radiusKm / (111 * Math.cos(radLat) || 0.00001);
    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    const query = `
      PREFIX ex: <http://opendatafithou.org/poi/>
      PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?poi ?amenity ?name ?access ?fee ?wkt ?lon ?lat
      WHERE {
        ?poi ex:amenity ?amenity .
        FILTER(LCASE(STR(?amenity)) = "toilets")
        OPTIONAL { ?poi rdfs:label ?name . }
        OPTIONAL { ?poi ex:access ?access . }
        OPTIONAL { ?poi ex:fee ?fee . }
        OPTIONAL {
          ?poi geo:hasGeometry ?g .
          ?g geo:asWKT ?wkt .
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$1") AS ?lonStr)
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$2") AS ?latStr)
          BIND(xsd:double(?lonStr) AS ?lon)
          BIND(xsd:double(?latStr) AS ?lat)
        }
        FILTER(BOUND(?wkt))
        FILTER(?lon >= ${minLon} && ?lon <= ${maxLon} && ?lat >= ${minLat} && ?lat <= ${maxLat})
      }
      LIMIT ${limit * 3}
    `;

    const rows = await this.runSelect(query);

    const results = rows
      .filter(r => r.lon && r.lat)
      .map(r => {
        const dKm = this.haversineKm(lat, lon, parseFloat(r.lat), parseFloat(r.lon));
        return {
          poi: r.poi,
          amenity: r.amenity || 'toilets',
          name: r.name || null,
          access: r.access || null,
          fee: r.fee || null,
          wkt: r.wkt || null,
          lon: parseFloat(r.lon),
          lat: parseFloat(r.lat),
          distanceKm: dKm,
        };
      })
      .filter(r => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return {
      center: { lon, lat },
      radiusKm,
      count: results.length,
      items: results
    };
  }

  // Tìm trạm xe buýt gần
  async searchBusStopsNearby(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    limit?: number;
  }) {
    const { lon, lat, radiusKm } = params;
    if (
      lon === undefined || lat === undefined ||
      Number.isNaN(lon) || Number.isNaN(lat)
    ) throw new BadRequestException('Thiếu hoặc sai lon/lat');
    if (!radiusKm || radiusKm <= 0) throw new BadRequestException('radiusKm phải > 0');

    const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);

    // Bounding box
    const deltaLat = radiusKm / 111;
    const radLat = lat * Math.PI / 180;
    const deltaLon = radiusKm / (111 * Math.cos(radLat) || 0.00001);
    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    const query = `
      PREFIX ex: <http://opendatafithou.org/poi/>
      PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?poi ?highway ?name ?wkt ?lon ?lat
      WHERE {
        ?poi ex:highway ?highway .
        FILTER(LCASE(STR(?highway)) = "bus_stop")
        OPTIONAL { ?poi rdfs:label ?name . }
        OPTIONAL {
          ?poi geo:hasGeometry ?g .
          ?g geo:asWKT ?wkt .
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$1") AS ?lonStr)
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$2") AS ?latStr)
          BIND(xsd:double(?lonStr) AS ?lon)
          BIND(xsd:double(?latStr) AS ?lat)
        }
        FILTER(BOUND(?wkt))
        FILTER(?lon >= ${minLon} && ?lon <= ${maxLon} && ?lat >= ${minLat} && ?lat <= ${maxLat})
      }
      LIMIT ${limit * 3}
    `;

    const rows = await this.runSelect(query);

    const results = rows
      .filter(r => r.lon && r.lat)
      .map(r => {
        const dKm = this.haversineKm(lat, lon, parseFloat(r.lat), parseFloat(r.lon));
        return {
          poi: r.poi,
          highway: r.highway || 'bus_stop',
          name: r.name || null,
          wkt: r.wkt || null,
          lon: parseFloat(r.lon),
          lat: parseFloat(r.lat),
          distanceKm: dKm,
        };
      })
      .filter(r => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return {
      center: { lon, lat },
      radiusKm,
      count: results.length,
      items: results
    };
  }

  // Tìm ATM gần
  async searchATMsNearby(params: {
    lon: number;
    lat: number;
    radiusKm: number;
    limit?: number;
  }) {
    const { lon, lat, radiusKm } = params;
    if (
      lon === undefined || lat === undefined ||
      Number.isNaN(lon) || Number.isNaN(lat)
    ) throw new BadRequestException('Thiếu hoặc sai lon/lat');
    if (!radiusKm || radiusKm <= 0) throw new BadRequestException('radiusKm phải > 0');

    const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);

    const deltaLat = radiusKm / 111;
    const radLat = lat * Math.PI / 180;
    const deltaLon = radiusKm / (111 * Math.cos(radLat) || 0.00001);
    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    const query = `
      PREFIX ex: <http://opendatafithou.org/poi/>
      PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?poi ?amenity ?brand ?operator ?wkt ?lon ?lat
      WHERE {
        ?poi ex:amenity ?amenity .
        FILTER(LCASE(STR(?amenity)) = "atm")
        OPTIONAL { ?poi ex:brand ?brand . }
        OPTIONAL { ?poi ex:operator ?operator . }
        OPTIONAL {
          ?poi geo:hasGeometry ?g .
          ?g geo:asWKT ?wkt .
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$1") AS ?lonStr)
          BIND(REPLACE(STR(?wkt), "^POINT\\\\(([^ ]+) ([^)]+)\\\\)$", "$2") AS ?latStr)
          BIND(xsd:double(?lonStr) AS ?lon)
          BIND(xsd:double(?latStr) AS ?lat)
        }
        FILTER(BOUND(?wkt))
        FILTER(?lon >= ${minLon} && ?lon <= ${maxLon} && ?lat >= ${minLat} && ?lat <= ${maxLat})
      }
      LIMIT ${limit * 3}
    `;

    const rows = await this.runSelect(query);

    const results = rows
      .filter(r => r.lon && r.lat)
      .map(r => {
        const dKm = this.haversineKm(lat, lon, parseFloat(r.lat), parseFloat(r.lon));
        return {
          poi: r.poi,
          amenity: r.amenity || 'atm',
          brand: r.brand || null,
          operator: r.operator || null,
          wkt: r.wkt || null,
          lon: parseFloat(r.lon),
          lat: parseFloat(r.lat),
          distanceKm: dKm,
        };
      })
      .filter(r => r.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    return {
      center: { lon, lat },
      radiusKm,
      count: results.length,
      items: results
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

  private async runSelect(query: string) {
    if (!this.queryEndpoint) {
      throw new Error('Query endpoint not configured');
    }
    const url = this.queryEndpoint + '?query=' + encodeURIComponent(query);
    this.logger.debug('SPARQL GET: ' + url);

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/sparql-results+json' }
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
}