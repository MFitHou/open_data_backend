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
  HttpCode,
  HttpStatus,
  Header,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { NgsiLdService } from './ngsi-ld.service';
import {
  GetEntityDto,
  QueryEntitiesDto,
  TemporalQueryDto,
  BatchTemporalQueryDto,
  NgsiLdEntity,
  NgsiLdEntityCollection,
} from './dto';

/**
 * NGSI-LD API Controller
 * Implements ETSI ISG CIM NGSI-LD standard endpoints
 *
 * Available endpoints:
 * - GET /ngsi-ld/v1/entities/{entityId} - Lấy trạng thái hiện tại của một thực thể
 * - GET /ngsi-ld/v1/entities - Truy vấn thực thể với bộ lọc
 * - GET /ngsi-ld/v1/temporal/entities/{entityId} - Lấy dữ liệu lịch sử theo thời gian
 * - GET /ngsi-ld/v1/temporal/entities - Truy vấn thời gian hàng loạt cho nhiều thực thể
 * - GET /ngsi-ld/v1/types - Liệt kê các loại thực thể có sẵn
 * - GET /ngsi-ld/v1/types/{type} - Lấy chi tiết loại thực thể
 * - GET /ngsi-ld/v1/attributes - Liệt kê các thuộc tính có sẵn
 * - GET /ngsi-ld/v1/attributes/{attrName} - Lấy chi tiết thuộc tính
 * - GET /ngsi-ld/v1/jsonldContexts - Liệt kê các ngữ cảnh JSON-LD
 * - GET /ngsi-ld/v1/jsonldContexts/{contextId} - Lấy ngữ cảnh JSON-LD cụ thể
 *
 * @see https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/01.06.01_60/gs_CIM009v010601p.pdf
 */
@Controller('ngsi-ld/v1')
export class NgsiLdController {
  constructor(private readonly ngsiLdService: NgsiLdService) {}

  @Get('entities/:entityId')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getEntity(
    @Param('entityId') entityId: string,
    @Query() params: GetEntityDto,
  ): Promise<NgsiLdEntity | any> {
    return this.ngsiLdService.getEntity(entityId, params);
  }

  @Get('entities')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async queryEntities(
    @Query() params: QueryEntitiesDto,
  ): Promise<NgsiLdEntityCollection> {
    return this.ngsiLdService.queryEntities(params);
  }

  @Get('temporal/entities/:entityId')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getTemporalEntity(
    @Param('entityId') entityId: string,
    @Query() params: TemporalQueryDto,
  ): Promise<NgsiLdEntity> {
    return this.ngsiLdService.getTemporalEntity(entityId, params);
  }

  @Get('types')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getTypes() {
    const types = await this.ngsiLdService.getEntityTypes();
    return {
      '@context': 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld',
      types,
    };
  }

  @Get('attributes')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getAttributes(@Query('type') type?: string) {
    const attributes = type
      ? await this.ngsiLdService.getAttributes(type)
      : ['name', 'location'];

    return {
      '@context': 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld',
      entityType: type || 'all',
      attributes,
    };
  }


  @Get('types/:type')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getTypeDetails(@Param('type') type: string) {
    return this.ngsiLdService.getTypeDetails(type);
  }


  @Get('attributes/:attrName')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getAttributeDetails(@Param('attrName') attrName: string) {
    return this.ngsiLdService.getAttributeDetails(attrName);
  }

  @Get('temporal/entities')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async queryTemporalEntities(
    @Query() params: BatchTemporalQueryDto,
  ): Promise<NgsiLdEntity[]> {
    const ids = params.id
      ? params.id.split(',').map((id) => id.trim())
      : undefined;
    const attrs = params.attrs
      ? params.attrs.split(',').map((a) => a.trim())
      : undefined;

    return this.ngsiLdService.queryTemporalEntities({
      type: params.type,
      ids,
      idPattern: params.idPattern,
      q: params.q,
      attrs,
      timeAt: params.timeAt,
      endTimeAt: params.endTimeAt,
      lastN: params.lastN,
      aggrMethod: params.aggrMethod,
      aggrPeriodDuration: params.aggrPeriodDuration,
    });
  }

  @Get('jsonldContexts')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getJsonLdContexts() {
    return this.ngsiLdService.getJsonLdContexts();
  }

  @Get('jsonldContexts/:contextId')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/ld+json')
  async getJsonLdContextById(@Param('contextId') contextId: string) {
    return this.ngsiLdService.getJsonLdContextById(contextId);
  }
}
