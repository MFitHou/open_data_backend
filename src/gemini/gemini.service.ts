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

import { Injectable, Logger, OnModuleInit, BadRequestException } from "@nestjs/common";
import { GoogleGenerativeAI } from "@google/generative-ai";

@Injectable()
export class GeminiService implements OnModuleInit {
    private readonly logger = new Logger(GeminiService.name);
    private genAI: GoogleGenerativeAI;
    private model: any;

    onModuleInit() {
        if (!process.env.GEMINI_API_KEY) {
            this.logger.warn('GEMINI_API_KEY not set');
            return;
        }
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: `You are a location classification assistant. 
                Only respond to questions about locations in Vietnam, including tourist destinations and public facilities.
                If the question is not appropriate, reply: "Inappropriate question."`
        });
        
        this.logger.log("GeminiService initialized");
    }

    async main(contents: string) {
        if (!this.model) {
            throw new BadRequestException('Gemini not configured');
        }

        try {
            const result = await this.model.generateContent(contents);
            const response = result.response;
            return response.candidates;
        } catch (error) {
            this.logger.error('Gemini API error:', error);
            throw new BadRequestException('Generation failed');
        }
    }

    async classifyLocation(query: string): Promise<string> {
        if (!this.genAI) {
            throw new BadRequestException('Gemini not configured');
        }

        try {
            const model = this.genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                systemInstruction: `You are a location classification assistant. 
                Only respond to questions about locations in Vietnam, including tourist destinations and public facilities.
                If the question is not appropriate, reply: "Inappropriate question."`,
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 20,
                }
            });

            const result = await model.generateContent(`Phân loại: "${query}"`);
            const text = result.response.text().trim().toLowerCase();

            const validTypes = ['atm', 'hospital', 'school', 'toilet', 'playground', 'bus_stop', 'drinking_water'];
            if (validTypes.includes(text)) {
                return text;
            }

            this.logger.warn(`Invalid classification: ${text}`);
            return 'unknown';

        } catch (error) {
            this.logger.error('Classification error:', error);
            throw new BadRequestException('Classification failed');
        }
    }
}