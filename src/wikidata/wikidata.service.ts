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
import { SchemaType } from '@google/generative-ai';
import { ChatTool } from 'src/common/decorators/chat-tools.decorator';

export interface WikidataInfo {
  label?: string;
  description?: string;
  image?: string;
  claims?: Record<string, any>;
  allProperties?: { [key: string]: string };
  propertyUrls?: { [key: string]: string };
  propertyEntityIds?: { [key: string]: string };
}

export interface ReferenceInfo {
  property: string;
  propertyLabel: string;
  references: Array<{ [key: string]: string }>;
}

export interface SearchResult {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  displayName: string;
  source: 'wikidata';
  wikidataId: string;
  description?: string;
  image?: string;
  instanceOf?: string;
  identifiers?: {
    osmRelationId?: string;
    osmNodeId?: string;
    osmWayId?: string;
    viafId?: string;
    gndId?: string;
  };
  statements?: {
    inception?: string;
    population?: string;
    area?: string;
    website?: string;
    phone?: string;
    email?: string;
    address?: string;
    postalCode?: string;
  };
}

@Injectable()
export class WikidataService {
  private readonly logger = new Logger(WikidataService.name);

  async fetchLabels(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    
    const allIds = ids.slice(0, 450);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&ids=${allIds.join('|')}&languages=vi&format=json&origin=*`;
    
    try {
      const res = await fetch(url);
      const json = await res.json();
      const out: Record<string, string> = {};
      
      if (json.entities) {
        Object.entries(json.entities).forEach(([id, entity]: any) => {
          out[id] = entity.labels?.vi?.value || id;
        });
      }
      
      return out;
    } catch (error) {
      this.logger.error(`Error fetching labels: ${error.message}`);
      return {};
    }
  }

  async fetchWikidataInfo(qid: string): Promise<{
    wikidataInfo: WikidataInfo | null;
    references: ReferenceInfo[];
  }> {
    try {
      const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
      const json = await response.json();
      const entity = json.entities[qid];
      
      if (!entity) {
        return { wikidataInfo: null, references: [] };
      }

      const propertyIds = new Set<string>();
      const entityIds = new Set<string>();

      Object.entries(entity.claims || {}).forEach(([propId, claims]: [string, any]) => {
        propertyIds.add(propId);
        claims.forEach((c: any) => {
          const dv = c.mainsnak?.datavalue;
          if (dv?.type === 'wikibase-entityid') entityIds.add(dv.value.id);
          c.references?.forEach((r: any) => {
            Object.entries(r.snaks || {}).forEach(([refPropId, refSnaks]: [string, any]) => {
              propertyIds.add(refPropId);
              const refSnak = refSnaks[0];
              const rdv = refSnak?.datavalue;
              if (rdv?.type === 'wikibase-entityid') entityIds.add(rdv.value.id);
            });
          });
        });
      });

      const labels = await this.fetchLabels([...propertyIds, ...entityIds, qid]);

      const info: WikidataInfo = {
        label: labels[qid] || qid,
        description: entity.descriptions?.vi?.value,
        claims: entity.claims,
        allProperties: {},
        propertyUrls: {},
        propertyEntityIds: {}
      };

      if (entity.claims?.P18) {
        const imageFile = entity.claims.P18[0].mainsnak.datavalue.value;
        info.image = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFile)}?width=300`;
      }

      Object.entries(entity.claims || {}).forEach(([propId, claims]: [string, any]) => {
        const claim = claims[0];
        const dv = claim.mainsnak?.datavalue;
        if (!dv) return;
        
        let value = '';
        let isUrl = false;
        
        switch (dv.type) {
          case 'string':
            if (typeof dv.value === 'string') {
              if (dv.value.startsWith('http')) {
                isUrl = true;
                value = dv.value;
              } else {
                value = dv.value;
              }
            }
            break;
          case 'time':
            value = dv.value.time.substring(1, 11);
            break;
          case 'quantity':
            value = dv.value.amount;
            break;
          case 'wikibase-entityid':
            value = labels[dv.value.id] || dv.value.id;
            info.propertyEntityIds![labels[propId] || propId] = dv.value.id;
            break;
          case 'globecoordinate':
            value = `${dv.value.latitude.toFixed(6)}, ${dv.value.longitude.toFixed(6)}`;
            break;
        }
        
        if (propId !== 'P18' && value) {
          const propLabel = labels[propId] || propId;
          if (!info.allProperties![propLabel]) {
            info.allProperties![propLabel] = value;
            if (isUrl) info.propertyUrls![propLabel] = dv.value;
          }
        }
      });

      // References
      const refs: ReferenceInfo[] = [];
      Object.entries(entity.claims || {}).forEach(([propId, claims]: [string, any]) => {
        const claim = claims[0];
        if (claim.references && claim.references.length > 0) {
          const refData: Array<{ [key: string]: string }> = [];
          claim.references.forEach((ref: any) => {
            const refObj: { [key: string]: string } = {};
            Object.entries(ref.snaks || {}).forEach(([refPropId, refSnaks]: [string, any]) => {
              const refSnak = refSnaks[0];
              const rdv = refSnak?.datavalue;
              if (!rdv) return;
              
              let refValue = '';
              if (rdv.type === 'string') refValue = rdv.value;
              else if (rdv.type === 'time') refValue = rdv.value.time.substring(1, 11);
              else if (rdv.type === 'wikibase-entityid') refValue = labels[rdv.value.id] || rdv.value.id;
              
              if (refValue) {
                const refLabel = labels[refPropId] || refPropId;
                refObj[refLabel] = refValue;
              }
            });
            if (Object.keys(refObj).length > 0) refData.push(refObj);
          });
          
          if (refData.length > 0) {
            refs.push({
              property: propId,
              propertyLabel: labels[propId] || propId,
              references: refData
            });
          }
        }
      });

      return { wikidataInfo: info, references: refs };
    } catch (error) {
      this.logger.error(`Error fetching Wikidata info: ${error.message}`);
      return { wikidataInfo: null, references: [] };
    }
  }

  @ChatTool({
    name: 'searchInforByName',
    description: 'Search for places on Wikidata based on keywords and return a list of results with detailed information.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Keyword to search for places on Wikidata' },
        limit: { type: SchemaType.NUMBER, description: 'Maximum number of results to return' },
      },
      required: ['query'],
    },
  })

  async searchInforByName(params: { query: string; limit?: number }): Promise<SearchResult[]> {
    const { query, limit = 15 } = params;
    console.log(`Searching Wikidata for: ${query} (limit: ${limit})`);
    try {
      const sparqlQuery = `
        SELECT DISTINCT ?place ?placeLabel ?placeDescription ?coord ?image ?instanceOfLabel
          ?inception ?population ?area ?website ?phone ?email ?address ?postalCode
          ?osmRelation ?osmNode ?osmWay ?viaf ?gnd
        WHERE {
          ?place wdt:P17 wd:Q881 .
          
          SERVICE wikibase:label { bd:serviceParam wikibase:language "vi". }
          
          ?place rdfs:label ?placeLabel .
          FILTER(CONTAINS(LCASE(?placeLabel), LCASE("${query}")))
          
          ?place wdt:P625 ?coord .
          
          OPTIONAL { ?place wdt:P31 ?instanceOf . ?instanceOf rdfs:label ?instanceOfLabel . FILTER(LANG(?instanceOfLabel) = "vi") }
          OPTIONAL { ?place wdt:P18 ?image }
          OPTIONAL { ?place wdt:P571 ?inception }
          OPTIONAL { ?place wdt:P1082 ?population }
          OPTIONAL { ?place wdt:P2046 ?area }
          OPTIONAL { ?place wdt:P856 ?website }
          OPTIONAL { ?place wdt:P1329 ?phone }
          OPTIONAL { ?place wdt:P968 ?email }
          OPTIONAL { ?place wdt:P6375 ?address }
          OPTIONAL { ?place wdt:P281 ?postalCode }
          OPTIONAL { ?place wdt:P402 ?osmRelation }
          OPTIONAL { ?place wdt:P11693 ?osmNode }
          OPTIONAL { ?place wdt:P10689 ?osmWay }
          OPTIONAL { ?place wdt:P214 ?viaf }
          OPTIONAL { ?place wdt:P227 ?gnd }
          OPTIONAL { ?place schema:description ?placeDescription . FILTER(LANG(?placeDescription) = "vi") }
        }
        LIMIT ${limit}
      `;

      const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}`;
      const response = await fetch(url, {
        headers: { 
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'OpenDataMap/1.0 (https://opendatamap.hou.edu.vn)',
        },
      });

      if (!response.ok) {
        throw new Error(`Wikidata search failed: ${response.status}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      for (const item of data.results.bindings) {
        if (!item.coord?.value) continue;

        const coordMatch = item.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
        if (!coordMatch) continue;

        const lon = parseFloat(coordMatch[1]);
        const lat = parseFloat(coordMatch[2]);
        const wikidataId = item.place.value.split('/').pop();

        const result: SearchResult = {
          id: wikidataId,
          name: item.placeLabel?.value || wikidataId,
          type: item.instanceOfLabel?.value || 'place',
          lat,
          lon,
          displayName: item.placeLabel?.value || wikidataId,
          source: 'wikidata',
          wikidataId,
          description: item.placeDescription?.value,
          image: item.image?.value,
          instanceOf: item.instanceOfLabel?.value,
          identifiers: {
            osmRelationId: item.osmRelation?.value,
            osmNodeId: item.osmNode?.value,
            osmWayId: item.osmWay?.value,
            viafId: item.viaf?.value,
            gndId: item.gnd?.value,
          },
          statements: {
            inception: item.inception?.value,
            population: item.population?.value,
            area: item.area?.value,
            website: item.website?.value,
            phone: item.phone?.value,
            email: item.email?.value,
            address: item.address?.value,
            postalCode: item.postalCode?.value,
          },
        };

        results.push(result);
      }

      this.logger.log(`Search for "${query}" returned ${results.length} results`);
      return results;
    } catch (error) {
      this.logger.error(`Error searching Wikidata: ${error.message}`);
      return [];
    }
  }
}
