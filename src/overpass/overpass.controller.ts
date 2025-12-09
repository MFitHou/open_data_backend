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

import { Controller, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { OverpassService } from './overpass.service';

@Controller('overpass')
export class OverpassController {
  constructor(private readonly overpassService: OverpassService) {}

  @Get('raw/:qid')
  async getOverpassRaw(@Param('qid') qid: string) {
    if (!/^Q\d+$/.test(qid)) {
      throw new HttpException('Invalid QID format', HttpStatus.BAD_REQUEST);
    }
    
    const result = await this.overpassService.fetchOverpassRaw(qid);
    
    if (!result) {
      throw new HttpException('No Overpass data found', HttpStatus.NOT_FOUND);
    }
    
    return result;
  }

  @Get('outline/:qid')
  async getOverpassOutline(@Param('qid') qid: string) {
    if (!/^Q\d+$/.test(qid)) {
      throw new HttpException('Invalid QID format', HttpStatus.BAD_REQUEST);
    }
    
    const result = await this.overpassService.fetchOverpassOutline(qid);
    
    if (!result) {
      throw new HttpException('No outline data found', HttpStatus.NOT_FOUND);
    }
    
    return result;
  }

  @Get('relation/:relationId')
  async getOutlineByRelationId(@Param('relationId') relationId: string) {
    const osmRelationId = parseInt(relationId, 10);
    
    if (isNaN(osmRelationId) || osmRelationId <= 0) {
      throw new HttpException('Invalid OSM relation ID', HttpStatus.BAD_REQUEST);
    }
    
    const result = await this.overpassService.fetchOutlineByOSMRelationId(osmRelationId);
    
    if (!result.geojson) {
      throw new HttpException(`No outline found: ${result.source}`, HttpStatus.NOT_FOUND);
    }
    
    return result;
  }
}
