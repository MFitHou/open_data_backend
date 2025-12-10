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

/**
 * Service helper để xây dựng SPARQL queries cho Crowdsource feature
 */
@Injectable()
export class CrowdsourceSparqlHelper {
  private readonly logger = new Logger(CrowdsourceSparqlHelper.name);

  // Graph URIs
  private readonly PENDING_GRAPH = 'http://opendatafithou.org/graph/school-pending';
  private readonly MAIN_GRAPH = 'http://opendatafithou.org/graph/school';

  // Prefixes
  private readonly PREFIXES = `
    PREFIX ex: <http://opendatafithou.org/poi/>
    PREFIX ext: <http://opendatafithou.org/ext/>
    PREFIX schema: <http://schema.org/>
    PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  `;

  /**
   * Tạo SPARQL INSERT query để thêm báo cáo vào Pending Graph
   */
  buildInsertReportQuery(
    reportUri: string,
    targetPoiId: string,
    userId: string,
    data: Record<string, any>,
  ): string {
    const timestamp = new Date().toISOString();
    
    // Build data triples
    const dataTriples = this.buildDataTriples(reportUri, data);

    const query = `
      ${this.PREFIXES}
      
      INSERT DATA {
        GRAPH <${this.PENDING_GRAPH}> {
          ext:${reportUri} a ext:UpdateReport ;
            ext:refTarget ex:${targetPoiId} ;
            ext:reportedByUserID "${userId}" ;
            ext:reportedAt "${timestamp}"^^xsd:dateTime ;
            ext:status "pending" .
          
          ${dataTriples}
        }
      }
    `;

    this.logger.debug(`Built INSERT query: ${query}`);
    return query;
  }

  /**
   * Build data triples từ proposed data
   */
  private buildDataTriples(reportUri: string, data: Record<string, any>): string {
    const triples: string[] = [];

    // Mapping từ DTO fields sang RDF predicates
    const fieldMapping = {
      telephone: 'schema:telephone',
      email: 'schema:email',
      website: 'schema:url',
      openingHours: 'schema:openingHours',
      hasWifi: 'ext:hasWifi',
      wheelchairAccessible: 'schema:wheelchairAccessible',
      parking: 'ext:hasParking',
      airConditioning: 'ext:hasAirConditioning',
      petsAllowed: 'ext:petsAllowed',
      reservationRequired: 'ext:reservationRequired',
      priceLevel: 'schema:priceRange',
      paymentMethods: 'schema:paymentAccepted',
      description: 'schema:description',
      notes: 'rdfs:comment',
    };

    for (const [field, predicate] of Object.entries(fieldMapping)) {
      if (data[field] !== undefined && data[field] !== null) {
        const value = data[field];
        let tripleValue: string;

        if (typeof value === 'boolean') {
          tripleValue = `"${value}"^^xsd:boolean`;
        } else if (typeof value === 'number') {
          tripleValue = `"${value}"^^xsd:integer`;
        } else {
          // String - escape quotes
          const escapedValue = String(value).replace(/"/g, '\\"');
          tripleValue = `"${escapedValue}"`;
        }

        triples.push(`ext:${reportUri} ${predicate} ${tripleValue} .`);
      }
    }

    return triples.join('\n          ');
  }

  /**
   * Tạo SPARQL query để merge data từ Pending Graph sang Main Graph
   */
  buildMergeToMainGraphQuery(
    reportUri: string,
    targetPoiId: string,
    data: Record<string, any>,
  ): string {
    const dataTriples = this.buildDataTriplesForMerge(targetPoiId, data);

    // DELETE old data predicates, INSERT new ones
    const deletePatterns = this.buildDeletePatterns(targetPoiId, data);

    const query = `
      ${this.PREFIXES}
      
      DELETE {
        GRAPH <${this.MAIN_GRAPH}> {
          ${deletePatterns}
        }
      }
      INSERT {
        GRAPH <${this.MAIN_GRAPH}> {
          ${dataTriples}
        }
      }
      WHERE {
        GRAPH <${this.MAIN_GRAPH}> {
          ex:${targetPoiId} a ?type .
        }
      }
    `;

    this.logger.debug(`Built MERGE query: ${query}`);
    return query;
  }

  /**
   * Build data triples cho việc merge vào Main Graph
   */
  private buildDataTriplesForMerge(
    targetPoiId: string,
    data: Record<string, any>,
  ): string {
    const triples: string[] = [];

    const fieldMapping = {
      telephone: 'schema:telephone',
      email: 'schema:email',
      website: 'schema:url',
      openingHours: 'schema:openingHours',
      hasWifi: 'ext:hasWifi',
      wheelchairAccessible: 'schema:wheelchairAccessible',
      parking: 'ext:hasParking',
      airConditioning: 'ext:hasAirConditioning',
      petsAllowed: 'ext:petsAllowed',
      reservationRequired: 'ext:reservationRequired',
      priceLevel: 'schema:priceRange',
      paymentMethods: 'schema:paymentAccepted',
      description: 'schema:description',
      notes: 'rdfs:comment',
    };

    for (const [field, predicate] of Object.entries(fieldMapping)) {
      if (data[field] !== undefined && data[field] !== null) {
        const value = data[field];
        let tripleValue: string;

        if (typeof value === 'boolean') {
          tripleValue = `"${value}"^^xsd:boolean`;
        } else if (typeof value === 'number') {
          tripleValue = `"${value}"^^xsd:integer`;
        } else {
          const escapedValue = String(value).replace(/"/g, '\\"');
          tripleValue = `"${escapedValue}"`;
        }

        triples.push(`ex:${targetPoiId} ${predicate} ${tripleValue} .`);
      }
    }

    return triples.join('\n          ');
  }

  /**
   * Build DELETE patterns để xóa dữ liệu cũ
   */
  private buildDeletePatterns(
    targetPoiId: string,
    data: Record<string, any>,
  ): string {
    const patterns: string[] = [];

    const fieldMapping = {
      telephone: 'schema:telephone',
      email: 'schema:email',
      website: 'schema:url',
      openingHours: 'schema:openingHours',
      hasWifi: 'ext:hasWifi',
      wheelchairAccessible: 'schema:wheelchairAccessible',
      parking: 'ext:hasParking',
      airConditioning: 'ext:hasAirConditioning',
      petsAllowed: 'ext:petsAllowed',
      reservationRequired: 'ext:reservationRequired',
      priceLevel: 'schema:priceRange',
      paymentMethods: 'schema:paymentAccepted',
      description: 'schema:description',
      notes: 'rdfs:comment',
    };

    for (const [field, predicate] of Object.entries(fieldMapping)) {
      if (data[field] !== undefined && data[field] !== null) {
        patterns.push(`ex:${targetPoiId} ${predicate} ?old_${field} .`);
      }
    }

    return patterns.join('\n          ');
  }

  /**
   * Update status của report trong Pending Graph
   */
  buildUpdateReportStatusQuery(
    reportUri: string,
    newStatus: string,
  ): string {
    const query = `
      ${this.PREFIXES}
      
      DELETE {
        GRAPH <${this.PENDING_GRAPH}> {
          ext:${reportUri} ext:status ?oldStatus .
        }
      }
      INSERT {
        GRAPH <${this.PENDING_GRAPH}> {
          ext:${reportUri} ext:status "${newStatus}" .
        }
      }
      WHERE {
        GRAPH <${this.PENDING_GRAPH}> {
          ext:${reportUri} ext:status ?oldStatus .
        }
      }
    `;

    return query;
  }

  /**
   * Query để lấy danh sách pending reports
   */
  buildGetPendingReportsQuery(poiId?: string): string {
    const poiFilter = poiId ? `FILTER(?target = ex:${poiId})` : '';

    const query = `
      ${this.PREFIXES}
      
      SELECT ?report ?target ?userId ?timestamp ?status
      WHERE {
        GRAPH <${this.PENDING_GRAPH}> {
          ?report a ext:UpdateReport ;
            ext:refTarget ?target ;
            ext:reportedByUserID ?userId ;
            ext:reportedAt ?timestamp ;
            ext:status ?status .
          
          ${poiFilter}
        }
      }
      ORDER BY DESC(?timestamp)
      LIMIT 100
    `;

    return query;
  }
}
