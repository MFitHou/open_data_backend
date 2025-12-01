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
import { ChatbotService } from './chatbot.service';
import { SmartSearchService } from './smart-search.service';

@Controller('chat')
export class ChatbotController {
    constructor(
        private readonly chatbotService: ChatbotService,
        private readonly smartSearchService: SmartSearchService,
    ) {}

    @Post('main')
    async main(@Body('contents') contents: string) {
        try {
            const result = await this.chatbotService.main(contents);
            return result;
        } catch (error) {
            throw new HttpException('Error generating text', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('test')
    async test(@Body('contents') contents: string) {
         try {
            const result = await this.chatbotService.test(contents);
            return result;
        } catch (error) {
            throw new HttpException('Error generating text', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('testFC')
    async testFC(@Body('contents') contents: string) {
         try {
            const result = await this.chatbotService.testFunctionCalling(contents);
            return result;
        } catch (error) {
            console.error(error);
            throw new HttpException('Error generating text', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('smart-search')
    async smartSearch(@Body() body: { query: string; context?: any; mode?: 'ai' | 'traditional' }) {
        try {
            const { query, context, mode = 'ai' } = body;

            if (!query || typeof query !== 'string') {
                throw new BadRequestException('Query is required');
            }

            if (mode === 'traditional') {
                return await this.smartSearchService.traditionalSearch(query, context);
            }

            return await this.smartSearchService.smartSearch(query, context);
        } catch (error) {
            console.error('Smart search error:', error);
            throw new HttpException(
                error.message || 'Smart search failed',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }
}