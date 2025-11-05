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


import { Controller, Get, HttpException, HttpStatus, Post, Body, BadRequestException, Query } from '@nestjs/common';
import { GeminiService } from './gemini.service';

@Controller('chat')
export class GeminiController {
    constructor(private readonly geminiService: GeminiService) {}

    @Post('main')
    async main(@Body('contents') contents: string) {
        try {
            const result = await this.geminiService.main(contents);
            return result;
        } catch (error) {
            throw new HttpException('Error generating text', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
