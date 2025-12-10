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
   * Thực hiện tìm kiếm thông minh sử dụng AI function calling.
   * Gửi prompt đã được xây dựng (có thể kèm vị trí hiện tại) tới ChatbotService,
   * sau đó phân tích kết quả trả về từ AI để xác định loại kết quả (gợi ý địa điểm, kết quả gần đây, v.v.).
   * @param query Câu truy vấn tìm kiếm của người dùng
   * @param context Ngữ cảnh tìm kiếm (vị trí hiện tại, truy vấn trước đó)
   * @returns Kết quả tìm kiếm đã được phân tích và chuẩn hóa
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
      
      const result = await this.chatbotService.ChatFunctionCalling(prompt);

      const parsedResult = this.parseSearchResult(result, context);

      return parsedResult;
    } catch (error) {
      this.logger.error('Smart search error:', error);
      throw new BadRequestException('Smart search failed: ' + error.message);
    }
  }

  /**
   * Thực hiện tìm kiếm truyền thống (không dùng AI), chủ yếu dựa vào Wikidata.
   * Dùng khi AI không trả về kết quả hoặc để so sánh song song.
   * @param query Câu truy vấn tìm kiếm của người dùng
   * @param context Ngữ cảnh tìm kiếm (vị trí hiện tại, truy vấn trước đó)
   * @returns Danh sách gợi ý địa điểm từ Wikidata
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
   * Xây dựng prompt tìm kiếm có ngữ cảnh (vị trí hiện tại, truy vấn trước đó) để gửi cho AI.
   * @param query Câu truy vấn tìm kiếm của người dùng
   * @param context Ngữ cảnh tìm kiếm (vị trí hiện tại, truy vấn trước đó)
   * @returns Chuỗi prompt hoàn chỉnh
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
   * Phân tích kết quả trả về từ AI function calling thành cấu trúc dữ liệu chuẩn hóa.
   * Xác định loại kết quả (gần đây, gợi ý, vị trí, chỉ trả lời text, v.v.).
   * @param result Kết quả trả về từ ChatbotService.ChatFunctionCalling
   * @param context Ngữ cảnh tìm kiếm (vị trí hiện tại, truy vấn trước đó)
   * @returns Object kết quả đã chuẩn hóa để frontend dễ xử lý
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

    // Tập hợp kết quả từ các function calls
    const searchResults: any[] = [];
    const nearbyResults: any[] = [];
    let geocodeResult: any = null;
    let radiusKm = 2;
    let searchCenter: { lat: number; lon: number } | null = null;

    for (const call of functionCalls) {
      const { functionName, result: callResult, arguments: args } = call;

      // Thực hiện xử lý kết quả dựa trên tên hàm được gọi
      if (functionName === 'searchInforByName' && callResult?.search_results) {
        searchResults.push(
          ...callResult.search_results.map((r: any) => ({
            ...r,
            source: 'wikidata',
            score: this.calculateScore(r),
          })),
        );
      }

      // Xử lý tìm kiếm gần đây (ATM, bệnh viện, v.v.)
      if (
        functionName.startsWith('search') &&
        functionName.includes('Nearby')
      ) {
        if (callResult?.items) {
          // Thêm các mục chính
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
                if (related.lon && related.lat && !addedPois.has(related.poi)) {
                  addedPois.add(related.poi);
                  nearbyResults.push({
                    ...related,
                    source: 'overpass',
                    score: this.calculateScore(related),
                    relatedEntities: [], 
                  });
                }
              });
            }
          });
        }

        // Cập nhật radius và center nếu có trong args
        if (args?.radiusKm) {
          radiusKm = args.radiusKm;
        }

        if (args?.lat && args?.lon) {
          searchCenter = { lat: args.lat, lon: args.lon };
        }
      }

      // Xử lý geocode
      if (functionName === 'fetchGeocodeByName' && callResult) {
        geocodeResult = callResult;
      }
    }

    // Xác định loại kết quả để trả về
    if (nearbyResults.length > 0) {
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

    return {
      action: 'text_response',
      message: finalResponse,
      suggestions: [],
    };
  }

  /**
   * Tính điểm relevance cho một kết quả tìm kiếm để phục vụ việc xếp hạng.
   * Ưu tiên các kết quả có tọa độ, mô tả, hình ảnh, loại, và nguồn dữ liệu uy tín.
   * @param result Đối tượng kết quả tìm kiếm
   * @returns Số điểm relevance
   */
  private calculateScore(result: any): number {
    let score = 50; // Base score

    // Có tọa độ
    if (result.coordinates || (result.lat && result.lon)) {
      score += 20;
    }

    // Có mô tả
    if (result.description) {
      score += 15;
    }

    // Có hình ảnh
    if (result.image) {
      score += 10;
    }

    // Có loại/nhóm
    if (result.type || result.amenity || result.highway) {
      score += 5;
    }

    // Ưu tiên nguồn dữ liệu
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
   * Xếp hạng và sắp xếp các gợi ý tìm kiếm theo điểm relevance.
   * @param results Danh sách kết quả tìm kiếm
   * @returns Danh sách gợi ý đã được xếp hạng (tối đa 10)
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
