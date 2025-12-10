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
import { ChatbotService } from './chatbot.service';
import { WikidataService } from '../wikidata/wikidata.service';
import { OverpassService } from '../overpass/overpass.service';

interface SearchContext {
  currentLocation?: { lat: number; lon: number };
  previousQuery?: string;
}

@Injectable()
export class SmartSearchService {
  private readonly logger = new Logger(SmartSearchService.name);

  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly wikidataService: WikidataService,
    private readonly overpassService: OverpassService,
  ) {}

  /**
   * Smart search using AI function calling
   */
  async smartSearch(query: string, context?: SearchContext) {
    try {
      this.logger.log(`Smart search query: "${query}"`);

      const prompt = this.buildSearchPrompt(query, context);
      
      // Truyền context với currentLocation cho ChatFunctionCalling
      const chatContext = context?.currentLocation ? {
        currentLocation: {
          lat: context.currentLocation.lat,
          lon: context.currentLocation.lon
        }
      } : undefined;
      
      const result = await this.chatbotService.ChatFunctionCalling(prompt, chatContext);

      const parsedResult = this.parseSearchResult(result, context);

      return parsedResult;
    } catch (error) {
      this.logger.error('Smart search error:', error);
      throw new BadRequestException('Smart search failed: ' + error.message);
    }
  }

  /**
   * Traditional search (fallback or parallel search)
   */
  async traditionalSearch(query: string, context?: SearchContext) {
    try {
      this.logger.log(`Traditional search: "${query}"`);

      const wikidataResults = await this.wikidataService
        .searchInforByName({ query, limit: 20 })
        .catch(() => []);

      const merged = wikidataResults
        .map((r: any) => ({
          ...r,
          source: 'wikidata',
          score: this.calculateScore(r),
        }))
        .sort((a, b) => b.score - a.score);

      return {
        action: 'search_results',
        suggestions: merged.slice(0, 8),
        totalResults: merged.length,
      };
    } catch (error) {
      this.logger.error('Traditional search error:', error);
      return {
        action: 'search_results',
        suggestions: [],
        totalResults: 0,
      };
    }
  }

  /**
   * Build contextualized search prompt
   */
  private buildSearchPrompt(query: string, context?: SearchContext): string {
    let prompt = query;

    if (context?.currentLocation) {
      prompt += `\n\n[Context] Current location: ${context.currentLocation.lat}, ${context.currentLocation.lon}`;
    }

    if (context?.previousQuery) {
      prompt += `\n[Context] Previous query: ${context.previousQuery}`;
    }

    return prompt;
  }

  /**
   * Parse function calling results into structured response
   */
  private parseSearchResult(result: any, context?: SearchContext) {
    const { finalResponse, functionCalls } = result;

    if (!functionCalls || functionCalls.length === 0) {
      return {
        action: 'text_response',
        message: finalResponse,
        suggestions: [],
      };
    }

    // Analyze function calls to determine action
    const searchResults: any[] = [];
    const nearbyResults: any[] = [];
    let geocodeResult: any = null;
    let radiusKm = 2;
    let searchCenter: { lat: number; lon: number } | null = null;

    for (const call of functionCalls) {
      const { functionName, result: callResult, arguments: args } = call;

      // Handle searchInforByName (Wikidata search)
      if (functionName === 'searchInforByName' && callResult?.search_results) {
        searchResults.push(
          ...callResult.search_results.map((r: any) => ({
            ...r,
            source: 'wikidata',
            score: this.calculateScore(r),
          })),
        );
      }

      // Handle nearby searches (ATMs, hospitals, etc.)
      if (
        functionName.startsWith('search') &&
        functionName.includes('Nearby')
      ) {
        if (callResult?.items) {
          // Add main items
          nearbyResults.push(
            ...callResult.items.map((r: any) => ({
              ...r,
              source: 'overpass',
              score: this.calculateScore(r),
            })),
          );

          const addedPois = new Set(nearbyResults.map((r) => r.poi));
          callResult.items.forEach((item: any) => {
            if (item.relatedEntities && Array.isArray(item.relatedEntities)) {
              item.relatedEntities.forEach((related: any) => {
                // Only add if has coordinates and not duplicate
                if (related.lon && related.lat && !addedPois.has(related.poi)) {
                  addedPois.add(related.poi);
                  nearbyResults.push({
                    ...related,
                    source: 'overpass',
                    score: this.calculateScore(related),
                    relatedEntities: [], // Don't nest relations
                  });
                }
              });
            }
          });
        }

        // Extract radius from arguments
        if (args?.radiusKm) {
          radiusKm = args.radiusKm;
        }

        if (args?.lat && args?.lon) {
          searchCenter = { lat: args.lat, lon: args.lon };
        }
      }

      // Handle geocoding
      if (functionName === 'fetchGeocodeByName' && callResult) {
        geocodeResult = callResult;
      }
    }

    // Determine action based on results
    if (nearbyResults.length > 0) {
      // Determine center point - prioritize searchCenter from function args
      const center =
        searchCenter ||
        (geocodeResult
          ? { lat: geocodeResult.lat, lon: geocodeResult.lng }
          : null) ||
        context?.currentLocation ||
        null;

      return {
        action: 'nearby_search',
        message: finalResponse,
        params: {
          center,
          radiusKm,
        },
        results: nearbyResults,
      };
    }

    if (searchResults.length > 0) {
      return {
        action: 'location_search',
        message: finalResponse,
        suggestions: this.rankSuggestions(searchResults),
      };
    }

    if (geocodeResult) {
      return {
        action: 'show_location',
        message: finalResponse,
        location: geocodeResult,
        suggestions: [
          {
            name: 'Location Found',
            coordinates: [geocodeResult.lng, geocodeResult.lat],
            source: 'geocode',
            score: 100,
          },
        ],
      };
    }

    // Default: just text response
    return {
      action: 'text_response',
      message: finalResponse,
      suggestions: [],
    };
  }

  /**
   * Calculate relevance score for ranking
   */
  private calculateScore(result: any): number {
    let score = 50; // Base score

    // Has coordinates
    if (result.coordinates || (result.lat && result.lon)) {
      score += 20;
    }

    // Has description
    if (result.description) {
      score += 15;
    }

    // Has image
    if (result.image) {
      score += 10;
    }

    // Has type/category
    if (result.type || result.amenity || result.highway) {
      score += 5;
    }

    // Source priority
    const sourceBonus = {
      wikidata: 10,
      overpass: 8,
      fuseki: 6,
      geocode: 5,
    };
    score += sourceBonus[result.source] || 0;

    return score;
  }

  /**
   * Rank and sort suggestions
   */
  private rankSuggestions(results: any[]): any[] {
    return results
      .map((r) => ({
        ...r,
        score: r.score || this.calculateScore(r),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }
}
