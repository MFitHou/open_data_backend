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

import {
  Controller,
  Get,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { WikidataService } from './wikidata.service';
import { SearchQueryDto } from './dto/SearchQueryDto';

@Controller('wikidata')
export class WikidataController {
  constructor(private readonly wikidataService: WikidataService) {}

  @Get('info/:qid')
  async getWikidataInfo(@Param('qid') qid: string) {
    if (!/^Q\d+$/.test(qid)) {
      throw new HttpException('Invalid QID format', HttpStatus.BAD_REQUEST);
    }

    const result = await this.wikidataService.fetchWikidataInfo(qid);

    if (!result.wikidataInfo) {
      throw new HttpException(
        'Wikidata entity not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }

  @Get('labels')
  async getLabels(@Query('ids') ids: string) {
    if (!ids) {
      throw new HttpException('Missing ids parameter', HttpStatus.BAD_REQUEST);
    }

    const idArray = ids
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id);

    if (idArray.length === 0) {
      return {};
    }

    return await this.wikidataService.fetchLabels(idArray);
  }

  @Get('search')
  async search(@Query() searchQuery: SearchQueryDto) {
    const { query, limit = 15 } = searchQuery;

    if (!query || query.trim().length === 0) {
      throw new HttpException(
        'Search query is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.wikidataService.searchInforByName({
      query: query.trim(),
      limit,
    });
  }
}
