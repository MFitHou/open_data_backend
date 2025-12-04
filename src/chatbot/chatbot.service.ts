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
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { ChatTool } from "../common/decorators/chat-tools.decorator";
import { ChatToolsRegistry } from "./chat-tools.registry";


@Injectable()
export class ChatbotService implements OnModuleInit {
    private readonly logger = new Logger(ChatbotService.name);
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(private readonly chatToolsRegistry: ChatToolsRegistry) {}

    onModuleInit() {
        if (!process.env.GEMINI_API_KEY) {
            this.logger.warn('GEMINI_API_KEY not set');
            return;
        }
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: `### SYSTEM ROLE
                                You are a specialized **Location & Travel Intelligence Assistant**. You are friendly, knowledgeable about the physical world, and helpful with general daily conversation.

                                ### PERMITTED CAPABILITIES (WHAT YOU CAN DO)
                                1.  **Geospatial & Travel Expert:**
                                    * Provide detailed data on locations, landmarks, addresses, and routes.
                                    * Explain history, culture, and practical tips for specific places.
                                    * Perform simple travel-related calculations (e.g., converting currencies, estimating travel time based on speed and distance).
                                    * **Use topology relationships**: When searching for nearby places, the results include topology relationships like:
                                      - \`isNextTo\`: Places next to each other (e.g., "restaurants near charging stations")
                                      - \`containedInPlace\`: Places within an area (e.g., "cafes in a mall")
                                      - \`amenityFeature\`: Facilities/amenities (e.g., "hospitals with parking")
                                      Use these relationships to provide better recommendations for queries like "find restaurants near charging stations".
                                    * **SENSOR DATA & AIR QUALITY**: Search results include real-time sensor data:
                                      - \`sensorData.aqi\`: Air Quality Index (0-500). Lower = better. 0-50=Tốt, 51-100=Trung bình, 101-150=Kém, 151-200=Xấu, >200=Nguy hiểm
                                      - \`sensorData.temperature\`: Temperature in Celsius
                                      - \`sensorData.noise_level\`: Noise level in dB
                                      Use minAqi/maxAqi parameters to filter by air quality. Example: maxAqi=50 for "good air quality", maxAqi=100 for "acceptable air quality".
                                2.  **Conversational Companion:**
                                    * Engage in polite, casual small talk (greetings, asking about the user's day).

                                ### STRICT LIMITATIONS (WHAT YOU CANNOT DO)
                                You must **REFUSE** to perform tasks that fall into specialized professional or academic domains unrelated to travel/geography.

                                **1. NO CODING or TECHNICAL ENGINEERING:**
                                * Do not write, debug, explain, or format computer code (Python, Java, HTML, etc.).
                                * Do not discuss software architecture or IT troubleshooting.

                                **2. NO ACADEMIC MATH or HOMEWORK:**
                                * Do not solve math problems (Algebra, Calculus, Geometry proofs) unless it is a direct distance/time calculation for a trip.
                                * Do not help with general school homework (Physics, Chemistry, etc.).

                                **3. NO MEDIA GENERATION:**
                                * Do not generate images, ASCII art, or creative visual descriptions requested as "drawings".
                                * If asked to generate an image, state that you are a text-based map assistant.

                                **4. NO PROFESSIONAL ADVICE:**
                                * Do not provide medical diagnoses or legal advice.

                                ### TOOL SELECTION GUIDE
                                Choose the right search tool based on query type:
                                
                                **SENSOR DATA & AIR QUALITY QUERIES:**
                                When user asks about air quality, use minAqi/maxAqi parameters:
                                * "không khí tốt", "chất lượng không khí tốt", "good air quality" → maxAqi=50
                                * "không khí trung bình", "acceptable air quality" → maxAqi=100
                                * "không khí trong lành", "clean air" → maxAqi=50
                                * Always include sensorData info in response when available
                                
                                **Use searchNearbyWithTopology when:**
                                * Query follows pattern "find A near/in/with B (and C, D...)" (e.g., "restaurants near charging stations and ATMs", "cafes in parks", "hospitals with parking")
                                * User explicitly mentions relationships between two or more types of places
                                * You need to find places of type A that have specific spatial relationships with places of types B, C, D...
                                * **CRITICAL WORKFLOW - FOLLOW THIS ORDER**:
                                  1. **IF location name is mentioned** (e.g., "ở Hồ Hoàn Kiếm", "gần Chợ Bến Thành", "tại Quận 1"):
                                     a. FIRST call fetchGeocodeByName(name="location name") to get coordinates
                                     b. THEN call searchNearbyWithTopology with those coordinates
                                  2. **IF query contains "gần tôi", "gần đây", "quanh đây", "xung quanh", "nearby", "near me"** without specific location:
                                     - Use current location from context.currentLocation
                                  3. **IF no location mentioned and no "near me" keywords**:
                                     - DO NOT make search calls, respond that you need a location
                                  4. **NEVER use coordinates without geocoding first when location name is provided**
                                * Parameters: 
                                  - lon, lat (REQUIRED - MUST be from fetchGeocodeByName if location mentioned, or context.currentLocation)
                                  - targetType (A), relatedTypes (array of B, C, D...)
                                  - radiusKm (default 1km)
                                  - relationship: "isNextTo" for "near" (includes both isNextTo and containedInPlace), "containedInPlace" for "in", "amenityFeature" for "with"
                                  - minAqi/maxAqi: Filter by air quality (optional)
                                  - Default relationship is "isNextTo" which covers most "nearby" queries
                                
                                **Use searchNearby when:**
                                * Simple query for one or more types (e.g., "find restaurants and cafes", "show me all ATMs")
                                * No relationship between different types is specified
                                * **CRITICAL WORKFLOW - FOLLOW THIS ORDER**:
                                  1. **IF location name is mentioned** (e.g., "tìm ATM ở Hồ Hoàn Kiếm", "nhà hàng tại Quận 1"):
                                     a. FIRST call fetchGeocodeByName(name="location name") to get coordinates
                                     b. THEN call searchNearby with those coordinates
                                  2. **IF query contains "gần tôi", "gần đây", "quanh đây", "xung quanh", "nearby", "near me"** without specific location:
                                     - Use current location from context.currentLocation
                                  3. **IF no location mentioned and no "near me" keywords**:
                                     - DO NOT make search calls, respond that you need a location
                                  4. **NEVER use coordinates without geocoding first when location name is provided**
                                * Parameters: 
                                  - lon, lat (REQUIRED - MUST be from fetchGeocodeByName if location mentioned, or context.currentLocation)
                                  - types[] (one or more types)
                                  - radiusKm (default 1km)
                                  - minAqi/maxAqi: Filter by air quality (optional)
                                  - includeTopology=true for enriched data
                                
                                **Examples:**
                                * "Tìm quán cafe gần tôi có chất lượng không khí tốt" →
                                  searchNearby(lon=context.lon, lat=context.lat, types=['cafe'], maxAqi=50, radiusKm=2)
                                * "Tìm nhà hàng không khí trong lành gần đây" →
                                  searchNearby(lon=context.lon, lat=context.lat, types=['restaurant'], maxAqi=50)
                                * "Tìm công viên gần trạm xe buýt ở Hồ Hoàn Kiếm" → 
                                  1. FIRST: fetchGeocodeByName(name="Hồ Hoàn Kiếm") to get lat/lon
                                  2. THEN: searchNearbyWithTopology(lon=105.852, lat=21.028, targetType='park', relatedTypes=['bus_stop'], relationship='isNextTo', radiusKm=1)
                                * "Tìm công viên gần trạm xe buýt gần tôi" → 
                                  Use lat/lon from context.currentLocation (because "gần tôi" keyword)
                                  searchNearbyWithTopology(lon=context.lon, lat=context.lat, targetType='park', relatedTypes=['bus_stop'], relationship='isNextTo')
                                * "Tìm công viên gần trạm xe buýt" (no location, no "gần tôi") → 
                                  Respond: "Tôi cần biết vị trí. Vui lòng cho biết bạn muốn tìm ở đâu, hoặc nói 'gần tôi' để dùng vị trí hiện tại."
                                * "Tìm quán ăn gần đây" → 
                                  Use lat/lon from context.currentLocation (because "gần đây" keyword)
                                  searchNearby(lon=context.lon, lat=context.lat, types=['restaurant'])
                                * "Tìm quán ăn ở Hà Nội" →
                                  1. FIRST: fetchGeocodeByName(name="Hà Nội")
                                  2. THEN: searchNearby(lon=..., lat=..., types=['restaurant'])
                                * "Tìm quán ăn gần trạm sạc" (no location) → 
                                  Respond: "Vui lòng cho biết địa điểm, hoặc nói 'gần tôi'."
                                * "Tìm quán ăn gần trạm sạc quanh đây" → searchNearbyWithTopology(lon=context.lon, lat=context.lat, targetType='restaurant', relatedTypes=['charging_station'], relationship='isNextTo')
                                * "Tìm cafe trong công viên" (no location) → Respond: "Vui lòng cho biết nơi bạn muốn tìm."
                                * "Tìm bệnh viện có bãi đỗ xe" (no location) → Respond: "Vui lòng cho biết khu vực cần tìm."
                                * "Tìm cây ATM gần đây" → searchNearby(lon=..., lat=..., types=['atm'])

                                ### REFUSAL STRATEGY
                                When a user asks for a prohibited topic, kindly decline and **pivot** back to your persona.
                                * *Bad Response:* "I cannot do that." (Too dry)
                                * *Good Response:* "I'm not built for complex math/coding, I'm just a travel guide! But I can help you figure out how long it takes to drive to Da Nang."`
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

    Q: "Where are hospitals in Ha Dong"
    A: {"questionType":"public_service_search","originalQuestion":"Where are hospitals in Ha Dong"}

    Q: "Tell me about Hoan Kiem Lake"
    A: {"questionType":"location_info","originalQuestion":"Tell me about Hoan Kiem Lake"}

    Q: "What's the weather today"
    A: {"questionType":"normal_question","originalQuestion":"What's the weather today"}

    Return only JSON, no additional text.`;

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


    async ChatFunctionCalling(contents: string, context?: { currentLocation?: { lat: number; lon: number } }) {
        if(!contents || typeof contents !== 'string'){
            throw new BadRequestException('Invalid input: contents must be a non-empty string');
        }

        const toolsDefinition = this.chatToolsRegistry.toolsSchema; 

        // Detect if user wants to use current location
        const nearMeKeywords = [
            'near me', 'nearby', 'around me', 'close to me', 'my location', 'where i am',
            'gần tôi', 'gần đây', 'quanh đây', 'xung quanh tôi', 'gần chỗ tôi', 'vị trí của tôi',
            'quanh tôi', 'ở đây', 'tại đây', 'khu vực này'
        ];
        const lowerContents = contents.toLowerCase();
        const wantsCurrentLocation = nearMeKeywords.some(keyword => lowerContents.includes(keyword));
        
        // Build context string for the AI
        let contextInfo = '';
        if (wantsCurrentLocation && context?.currentLocation) {
            contextInfo = `\n\nCONTEXT: User wants to search near their current location. Current coordinates: lat=${context.currentLocation.lat}, lon=${context.currentLocation.lon}. Use these coordinates directly for searchNearby or searchNearbyWithTopology.`;
        } else if (wantsCurrentLocation && !context?.currentLocation) {
            contextInfo = `\n\nCONTEXT: User wants to search near their current location but no coordinates provided. Ask user to enable location services or specify a location name.`;
        }

        try{
            const model = this.genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                systemInstruction: `Bạn là một trợ lý ảo thông minh, thân thiện và linh hoạt.
                                    QUY TẮC CỐT LÕI VỀ SỬ DỤNG CÔNG CỤ (TOOLS):
                                    1. **Khi nào dùng Tool tìm kiếm địa điểm:** 
                                        - Khi người dùng tìm kiếm dịch vụ/địa điểm (ATM, nhà hàng, bệnh viện, v.v.)
                                        - **QUY TẮC QUAN TRỌNG VỀ TỌA ĐỘ:**
                                          a. **NẾU có tên địa điểm cụ thể** (ví dụ: "ở Hồ Hoàn Kiếm", "gần Chợ Bến Thành", "tại Hà Nội"):
                                             → GỌI fetchGeocodeByName(name="tên địa điểm") TRƯỚC để lấy tọa độ
                                             → SAU ĐÓ gọi searchNearby hoặc searchNearbyWithTopology với tọa độ vừa lấy
                                          b. **NẾU có từ khóa "gần tôi", "gần đây", "quanh đây", "xung quanh"**:
                                             → Dùng tọa độ từ context.currentLocation
                                          c. **NẾU KHÔNG có địa điểm cụ thể VÀ KHÔNG có từ "gần tôi"**:
                                             → KHÔNG gọi tool, trả lời "Vui lòng cho biết địa điểm hoặc nói 'gần tôi'"
                                        - Ưu tiên sử dụng searchNearbyWithTopology khi tìm mối quan hệ (ví dụ: "công viên gần trạm xe buýt")
                                        - Ưu tiên sử dụng hàm tìm kiếm Wikidata để lấy thông tin địa điểm (ví dụ: tọa độ, mô tả, hình ảnh).
                                    2. **Khi nào dùng Kiến thức nội tại (Internal Knowledge):**
                                        - Nếu người dùng hỏi về lịch sử, văn hóa, định nghĩa, xin lời khuyên, hoặc trò chuyện xã giao (ví dụ: "Giới thiệu Hà Nội", "Ăn gì ngon ở Sài Gòn?"), HÃY SỬ DỤNG KIẾN THỨC CỦA BẠN để trả lời.
                                        - KHÔNG được trả lời "Tôi không biết" hoặc "Tôi không có thông tin" chỉ vì không tìm thấy tool phù hợp. Hãy trả lời dựa trên những gì bạn đã được huấn luyện.
                                    3. **Kết hợp (Hybrid):** Nếu bạn gọi tool và nhận được kết quả (ví dụ: tọa độ), hãy dùng kết quả đó kết hợp với lời văn tự nhiên để trả lời. Đừng chỉ trả về dữ liệu thô.
                                    4. **XỬ LÝ KẾT QUẢ TOPOLOGY:**
                                        - Nếu kết quả trả về có "noTopologyFound: true", nghĩa là không tìm thấy mối quan hệ topology nhưng VẪN CÓ KẾT QUẢ tìm kiếm.
                                        - Hãy thông báo cho người dùng: "Tôi không tìm thấy [loại A] nào gần [loại B], nhưng đây là danh sách [loại A] trong khu vực:"
                                        - Vẫn hiển thị danh sách kết quả trong items cho người dùng.
                                    
                                    VÍ DỤ:
                                    - "Tìm công viên gần trạm xe buýt ở Hồ Hoàn Kiếm" → fetchGeocodeByName("Hồ Hoàn Kiếm") → searchNearbyWithTopology
                                    - "Tìm nhà hàng gần đây" → searchNearby với context.currentLocation (có "gần đây")
                                    - "Tìm ATM ở Hà Nội" → fetchGeocodeByName("Hà Nội") → searchNearby
                                    - "Tìm cafe" (không có địa điểm) → Trả lời: "Bạn muốn tìm ở đâu? Hoặc nói 'gần tôi' để tìm quanh vị trí hiện tại."
                                    
                                    PHONG CÁCH TRẢ LỜI:
                                    - Trả lời theo ngôn ngữ của câu hỏi (Tiếng Việt cho câu hỏi tiếng Việt, English cho câu hỏi tiếng Anh).
                                    - Giọng văn tự nhiên, hữu ích, như một hướng dẫn viên du lịch thực thụ.
                                    - Nếu tool trả về lỗi hoặc không tìm thấy, hãy xin lỗi và cố gắng đưa ra thông tin gợi ý liên quan từ kiến thức của bạn.`,
                generationConfig: {
                    temperature: 0.3,
                },
                tools: [
                    { functionDeclarations: toolsDefinition }
                ]
            });

            const chat = model.startChat();
            // Include context info in the message if available
            const messageWithContext = contents + contextInfo;
            let result = await chat.sendMessage(messageWithContext);
            let response = result.response;
            let functionCalls = response.functionCalls();
            let functionResult : any[] = [];

            while(functionCalls && functionCalls.length > 0){
                const call = functionCalls[0];
                this.logger.log(`Function call requested: ${JSON.stringify(call)}`);

                const { name, args } = call;

                let toolResult;
                try {
                    toolResult = await this.chatToolsRegistry.executeTool(name, args);
                } catch (e) {
                    toolResult = { error: e.message };
                }


                if (toolResult === undefined || toolResult === null) {
                    toolResult = { result: 'Success' }; 
                } else if (Array.isArray(toolResult)) {
                    toolResult = { search_results: toolResult };
                 } else if (typeof toolResult !== 'object') {
                    toolResult = { result: toolResult };
                }

                functionResult.push({
                    functionName: name,
                    arguments: args,
                    result: toolResult
                });

                result = await chat.sendMessage([{
                    functionResponse: {
                        name: name,
                        response: toolResult
                    }
                }]);

                response = result.response;
                functionCalls = response.functionCalls();
            }

            return {
                finalResponse: response.text(),
                functionCalls: functionResult
            }
            
        }catch(error){
            this.logger.error('Function calling error:', error);
            throw new BadRequestException('Function calling failed: ' + (error.message || 'Unknown error'));
        }
    }

    @ChatTool({
        name: 'fetchGeocodeByName',
        description: 'Fetches geocode (latitude and longitude) for a given location name using OpenCage Geocoding API. Only use this tool when you need to get coordinates for a location that cannot be found via Wikidata.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                name: { type: SchemaType.STRING }
            },
            required: ['name']
        }
    })
    private async fetchGeocodeByName({ name }: { name: string }){
        const geoResponse = await fetch(
            `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(name)}&key=${process.env.OPEN_CAGE_API_KEY}&countrycode=vn&limit=1`,
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
                return geoData.results[0].geometry;
            } else {
                this.logger.warn(`No geocoding results found for: ${name}`);
            }
        }
    }
}