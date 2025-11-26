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
export class ChatbotService implements OnModuleInit {
    private readonly logger = new Logger(ChatbotService.name);
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

        const ananlysisPrompt = await this.test(contents);
        if(ananlysisPrompt.questionType === 'normal_question' || ananlysisPrompt.questionType === 'location_info') {
            try {
                await new Promise(resolve => setTimeout(resolve, 900));
                const result = await this.model.generateContent(contents);
                const response = result.response;
                return response.candidates;
            } catch (error) {
                this.logger.error('Gemini API error:', error);
                throw new BadRequestException('Generation failed');
            }
        } else if(ananlysisPrompt.questionType === 'location_search') {
            try{
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const model = this.genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: "application/json",
                    }
                });
                
                const prompt = `Read and answer location-related questions: "${contents}"
                
                    Return JSON in the format:
                    {
                        "locations": ["location 1", "location 2", ...]
                    }

                    Only return pure JSON, no markdown, no additional text.`;

                const result = await model.generateContent(prompt);
                const text = result.response.text().trim();
                
                this.logger.log(`Location search response: ${text}`);
                
                // Parse JSON với error handling
                let locationData;
                try {
                    locationData = JSON.parse(text);
                } catch (parseError) {
                    this.logger.warn('Direct JSON parse failed, trying to clean...');
                    

                    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                    

                    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        this.logger.error('No JSON found in location response');
                        throw new BadRequestException('Invalid location response format');
                    }
                    
                    locationData = JSON.parse(jsonMatch[0]);
                }
                
                // Validate response structure
                if (!locationData.locations || !Array.isArray(locationData.locations)) {
                    this.logger.error('Invalid locations array in response');
                    throw new BadRequestException('Invalid locations format');
                }
                
                this.logger.log(`Found ${locationData.locations.length} locations`);
                
                return {
                    questionType: 'location_search',
                    originalQuestion: contents,
                    ...locationData
                };
                
            } catch(error){
                this.logger.error('Location search error:', error);
                throw new BadRequestException('Location search failed: ' + (error.message || 'Unknown error'));
            }
        } else if(ananlysisPrompt.questionType === 'public_service_search') {
            try {
                // Parse service types từ analysis
                const serviceTypes = ananlysisPrompt.service 
                    ? ananlysisPrompt.service.split(',').map((s: string) => s.trim().toLowerCase())
                    : [];
                
                const location = ananlysisPrompt.location || '';
                const scope = ananlysisPrompt.scope || '';
                
                // Tính toán radius từ scope
                let radiusKm = 5;
                if (scope) {
                    const scopeLower = scope.toLowerCase();
                    
                    const meterMatch = scopeLower.match(/(\d+)\s*m(?!k)/);
                    if (meterMatch) {
                        radiusKm = Math.min(Math.max(parseInt(meterMatch[1]) / 1000, 0.5), 50);
                    } else {
                        const kmMatch = scopeLower.match(/(\d+(?:\.\d+)?)\s*km/);
                        if (kmMatch) {
                            radiusKm = Math.min(Math.max(parseFloat(kmMatch[1]), 0.5), 50);
                        } else if (scopeLower.includes('gần nhất') || scopeLower.includes('gần đây')) {
                            radiusKm = 2;
                        } else if (scopeLower.includes('xa')) {
                            radiusKm = 10;
                        }
                    }
                }
                
                this.logger.log(`Searching public services: ${serviceTypes.join(', ')} with radius ${radiusKm}km`);
                
                const serviceMapping: { [key: string]: string } = {
                    'atm': 'atms',
                    'bệnh viện': 'hospitals',
                    'hospital': 'hospitals',
                    'trường học': 'schools',
                    'school': 'schools',
                    'nhà vệ sinh': 'toilets',
                    'toilet': 'toilets',
                    'toilets': 'toilets',
                    'sân chơi': 'playgrounds',
                    'playground': 'playgrounds',
                    'trạm xe buýt': 'bus-stops',
                    'bus_stop': 'bus-stops',
                    'nước uống': 'drinking_water',
                    'drinking_water': 'drinking_water'
                };
                
                const amenities: string[] = [];
                for (const serviceType of serviceTypes) {
                    const amenity = serviceMapping[serviceType];
                    if (amenity && !amenities.includes(amenity)) {
                        amenities.push(amenity);
                    }
                }
                
                if (amenities.length === 0) {
                    const originalLower = contents.toLowerCase();
                    for (const [key, value] of Object.entries(serviceMapping)) {
                        if (originalLower.includes(key) && !amenities.includes(value)) {
                            amenities.push(value);
                        }
                    }
                }
                
                this.logger.log(`Mapped amenities: ${amenities.join(', ')}, radius: ${radiusKm}km`);
                
                let defaultLon = 0; 
                let defaultLat = 0;

                if (location && location.trim() !== '') {
                    try {
                        
                        const geoResponse = await fetch(
                            `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${process.env.OPEN_CAGE_API_KEY}&countrycode=vn&limit=1`,
                            {
                                method: 'GET',
                                headers: { "Content-Type": 'application/json' },
                            }
                        );

                        if (!geoResponse.ok) {
                            this.logger.warn(`Geocoding API failed with status: ${geoResponse.status}`);
                        } else {
                            const geoData = await geoResponse.json();
                            
                            if (geoData.results && geoData.results.length > 0) {
                                defaultLon = geoData.results[0].geometry.lng;
                                defaultLat = geoData.results[0].geometry.lat;
                                this.logger.log(`Found coordinates: ${defaultLat}, ${defaultLon}`);
                            } else {
                                this.logger.warn(`No geocoding results found for: ${location}`);
                            }
                        }
                    } catch (geoError) {
                        this.logger.error(`Geocoding error: ${geoError.message}`);
                        this.logger.warn(`Using default coordinates for Hanoi`);
                    }
                }

                return {
                    questionType: 'public_service_search',
                    originalQuestion: contents,
                    location: location,
                    service: serviceTypes.join(', '),
                    amenities: amenities,
                    scope: scope,
                    radiusKm: radiusKm,
                    searchParams: {
                        lon: defaultLon,
                        lat: defaultLat,
                        radiusKm: radiusKm,
                        amenities: amenities,
                        limit: 50
                    },
                    message: `Tìm kiếm ${amenities.join(', ')} ${location ? `tại ${location}` : 'gần bạn'} trong bán kính ${radiusKm}km`
                };
                
            } catch (error) {
                this.logger.error('Public service search error:', error);
                throw new BadRequestException('Public service search failed: ' + (error.message || 'Unknown error'));
            }
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

    async test(contents: string) {
        if (!this.genAI) {
            throw new BadRequestException('Gemini not configured');
        }

        // Validate input
        if (!contents || typeof contents !== 'string' || contents.trim() === '') {
            throw new BadRequestException('Invalid input: contents must be a non-empty string');
        }

        try {
            const model = this.genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json",
                }
            });

            const prompt = `Analysis question and return the question type.

    Question: "${contents}"

    Return JSON in the format:
    {
    "location": "name of the location if any, or empty if not related",
    "service": "name of the public service to search for, or empty if not related",
    "scope": "search radius if any, or empty if not related",
    "questionType": "location_search" or "public_service_search" or "location_info" or "normal_question" or "unknown",
    "originalQuestion": "original user question"
    }

    Rules for classifying questionType:
    - "location_search": Search for specific locations (find stores, find restaurants..., District, Ward, Commune, County, Place names)
    - "public_service_search": Search for public services (ATM, hospital, school, toilet, playground, bus stop...)
    - "location_info": Ask for information about locations (introduce Hoan Kiem Lake, history of Van Mieu...)
    - "normal_question": Regular questions (weather, news, greetings...)
    - "unknown": Unknown

    Rules for classifying service:
    - atm, hospital, school, toilet, playground, bus_stop, drinking_water
    - Multiple services can be present in one question, separated by commas
    Examples:

    Q: "Bệnh viện nào ở Hà Đông"
    A: {"questionType":"public_service_search","originalQuestion":"Bệnh viện nào ở Hà Đông"}

    Q: "Giới thiệu về Hồ Hoàn Kiếm"
    A: {"questionType":"location_info","originalQuestion":"Giới thiệu về Hồ Hoàn Kiếm"}

    Q: "Hôm nay thời tiết thế nào"
    A: {"questionType":"normal_question","originalQuestion":"Hôm nay thời tiết thế nào"}

    Chỉ trả về JSON, không thêm text khác.`;

            this.logger.log(`Analyzing question type...`);
            
            const result = await model.generateContent(prompt);
            
            if (!result || !result.response) {
                this.logger.error('Empty response from Gemini');
                throw new BadRequestException('Empty response from API');
            }

            const text = result.response.text().trim();
            
            this.logger.log(`Raw response: ${text}`);

            if (!text || text.length === 0) {
                this.logger.error('Empty text response');
                throw new BadRequestException('Empty response text');
            }

            // Parse JSON
            let analysis;
            try {
                analysis = JSON.parse(text);
            } catch (parseError) {
                this.logger.warn('Direct JSON parse failed, trying to extract...');
                
                let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                
                const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    this.logger.error('No JSON found in response');
                    throw new BadRequestException('Invalid response format: no JSON found');
                }
                
                analysis = JSON.parse(jsonMatch[0]);
            }
            
            // Validate and set defaults
            if (!analysis.questionType) {
                analysis.questionType = 'unknown';
            }

            if (!analysis.originalQuestion) {
                analysis.originalQuestion = contents;
            }

            this.logger.log(`Analysis result: ${JSON.stringify(analysis)}`);
            
            return analysis;

        } catch (error) {
            this.logger.error('Gemini API error:', error);
            
            if (error instanceof BadRequestException) {
                throw error;
            }
            
            // Fallback response
            const lowerContent = contents.toLowerCase();
            const publicServiceKeywords = ['bệnh viện', 'trường học', 'nhà vệ sinh', 'sân chơi', 'trạm xe buýt', 'nước uống'];
            const locationInfoKeywords = ['giới thiệu', 'lịch sử', 'thông tin', 'có gì', 'đặc biệt', 'nổi tiếng'];
            
            let questionType = 'unknown';
            
            if (locationInfoKeywords.some(keyword => lowerContent.includes(keyword))) {
                questionType = 'location_info';
            } else if (publicServiceKeywords.some(keyword => lowerContent.includes(keyword))) {
                questionType = 'public_service_search';
            } else if (lowerContent.includes('tìm') || lowerContent.includes('ở đâu') || lowerContent.includes('gần')) {
                questionType = 'location_search';
            } else {
                questionType = 'normal_question';
            }
            
            return {
                questionType,
                originalQuestion: contents
            };
        }
    }
}