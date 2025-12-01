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

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { SmartSearchService } from './smart-search.service';
import { DiscoveryModule } from '@nestjs/core';
import { ChatToolsRegistry } from './chat-tools.registry';
import { WikidataModule } from '../wikidata/wikidata.module';
import { OverpassModule } from '../overpass/overpass.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), 
    DiscoveryModule,
    WikidataModule,
    OverpassModule
  ],
  providers: [ChatbotService, SmartSearchService, ChatToolsRegistry],
  controllers: [ChatbotController],
  exports: [ChatbotService, SmartSearchService],
})
export class ChatbotModule {}