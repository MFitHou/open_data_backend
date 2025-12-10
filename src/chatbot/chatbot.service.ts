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
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { ChatTool } from '../common/decorators/chat-tools.decorator';
import { ChatToolsRegistry } from './chat-tools.registry';

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
      model: 'gemini-2.5-flash',
      systemInstruction: `### SYSTEM ROLE
                                You are a specialized **Location & Travel Intelligence Assistant**. You are friendly, knowledgeable about the physical world, and helpful with general daily conversation.
                                **ALWAY RESPONSE ENGLISH**
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
                                      - \`sensorData.aqi\`: Air Quality Index (0-500). Lower = better. 0-50=Good, 51-100=Moderate, 101-150=Unhealthy for Sensitive, 151-200=Unhealthy, >200=Hazardous
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
                                * "good air quality", "clean air" → maxAqi=50
                                * "acceptable air quality", "moderate air quality" → maxAqi=100
                                * "fresh air", "healthy air" → maxAqi=50
                                * Always include sensorData info in response when available
                                
                                **Use searchNearbyWithTopology when:**
                                * Query follows pattern "find A near/in/with B (and C, D...)" (e.g., "restaurants near charging stations and ATMs", "cafes in parks", "hospitals with parking")
                                * User explicitly mentions relationships between two or more types of places
                                * You need to find places of type A that have specific spatial relationships with places of types B, C, D...
                                * **CRITICAL WORKFLOW - FOLLOW THIS ORDER**:
                                  1. **IF location name is mentioned** (e.g., "at Hoan Kiem Lake", "near Ben Thanh Market", "in District 1"):
                                     a. FIRST call fetchGeocodeByName(name="location name") to get coordinates
                                     b. THEN call searchNearbyWithTopology with those coordinates
                                  2. **IF query contains "nearby", "near me", "around here", "in this area"** without specific location:
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
                                  1. **IF location name is mentioned** (e.g., "find ATM at Hoan Kiem Lake", "restaurants in District 1"):
                                     a. FIRST call fetchGeocodeByName(name="location name") to get coordinates
                                     b. THEN call searchNearby with those coordinates
                                  2. **IF query contains "nearby", "near me", "around here", "in this area"** without specific location:
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
                                * "Find cafes near me with good air quality" →
                                  searchNearby(lon=context.lon, lat=context.lat, types=['cafe'], maxAqi=50, radiusKm=2)
                                * "Find restaurants with clean air nearby" →
                                  searchNearby(lon=context.lon, lat=context.lat, types=['restaurant'], maxAqi=50)
                                * "Find parks near bus stops at Hoan Kiem Lake" → 
                                  1. FIRST: fetchGeocodeByName(name="Hoan Kiem Lake") to get lat/lon
                                  2. THEN: searchNearbyWithTopology(lon=105.852, lat=21.028, targetType='park', relatedTypes=['bus_stop'], relationship='isNextTo', radiusKm=1)
                                * "Find parks near bus stops near me" → 
                                  Use lat/lon from context.currentLocation (because "near me" keyword)
                                  searchNearbyWithTopology(lon=context.lon, lat=context.lat, targetType='park', relatedTypes=['bus_stop'], relationship='isNextTo')
                                * "Find parks near bus stops" (no location, no "near me") → 
                                  Respond: "I need a location. Please specify where you want to search, or say 'near me' to use your current location."
                                * "Find restaurants nearby" → 
                                  Use lat/lon from context.currentLocation (because "nearby" keyword)
                                  searchNearby(lon=context.lon, lat=context.lat, types=['restaurant'])
                                * "Find restaurants in Hanoi" →
                                  1. FIRST: fetchGeocodeByName(name="Hanoi")
                                  2. THEN: searchNearby(lon=..., lat=..., types=['restaurant'])
                                * "Find restaurants near charging stations" (no location) → 
                                  Respond: "Please specify the location, or say 'near me'."
                                * "Find restaurants near charging stations around here" → searchNearbyWithTopology(lon=context.lon, lat=context.lat, targetType='restaurant', relatedTypes=['charging_station'], relationship='isNextTo')
                                * "Find cafes in parks" (no location) → Respond: "Please specify where you want to search."
                                * "Find hospitals with parking" (no location) → Respond: "Please specify the area to search."
                                * "Find ATMs nearby" → searchNearby(lon=..., lat=..., types=['atm'])

                                ### REFUSAL STRATEGY
                                When a user asks for a prohibited topic, kindly decline and **pivot** back to your persona.
                                * *Bad Response:* "I cannot do that." (Too dry)
                                * *Good Response:* "I'm not built for complex math/coding, I'm just a travel guide! But I can help you figure out how long it takes to drive to Da Nang."`,
    });

    this.logger.log('GeminiService initialized');
  }

  async main(contents: string) {
    if (!this.model) {
      throw new BadRequestException('Gemini not configured');
    }

    const ananlysisPrompt = await this.test(contents);
    if (
      ananlysisPrompt.questionType === 'normal_question' ||
      ananlysisPrompt.questionType === 'location_info'
    ) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const result = await this.model.generateContent(contents);
        const response = result.response;
        return response.candidates;
      } catch (error) {
        this.logger.error('Gemini API error:', error);
        throw new BadRequestException('Generation failed');
      }
    } else if (ananlysisPrompt.questionType === 'location_search') {
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const model = this.genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
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

          let cleaned = text
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();

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
          ...locationData,
        };
      } catch (error) {
        this.logger.error('Location search error:', error);
        throw new BadRequestException(
          'Location search failed: ' + (error.message || 'Unknown error'),
        );
      }
    } else if (ananlysisPrompt.questionType === 'public_service_search') {
      try {
        // Parse service types từ analysis
        const serviceTypes = ananlysisPrompt.service
          ? ananlysisPrompt.service
              .split(',')
              .map((s: string) => s.trim().toLowerCase())
          : [];

        const location = ananlysisPrompt.location || '';
        const scope = ananlysisPrompt.scope || '';

        // Tính toán radius từ scope
        let radiusKm = 5;
        if (scope) {
          const scopeLower = scope.toLowerCase();

          const meterMatch = scopeLower.match(/(\d+)\s*m(?!k)/);
          if (meterMatch) {
            radiusKm = Math.min(
              Math.max(parseInt(meterMatch[1]) / 1000, 0.5),
              50,
            );
          } else {
            const kmMatch = scopeLower.match(/(\d+(?:\.\d+)?)\s*km/);
            if (kmMatch) {
              radiusKm = Math.min(Math.max(parseFloat(kmMatch[1]), 0.5), 50);
            } else if (
              scopeLower.includes('gần nhất') ||
              scopeLower.includes('gần đây')
            ) {
              radiusKm = 2;
            } else if (scopeLower.includes('xa')) {
              radiusKm = 10;
            }
          }
        }

        this.logger.log(
          `Searching public services: ${serviceTypes.join(', ')} with radius ${radiusKm}km`,
        );

        const serviceMapping: { [key: string]: string } = {
          atm: 'atms',
          'bệnh viện': 'hospitals',
          hospital: 'hospitals',
          'trường học': 'schools',
          school: 'schools',
          'nhà vệ sinh': 'toilets',
          toilet: 'toilets',
          toilets: 'toilets',
          'sân chơi': 'playgrounds',
          playground: 'playgrounds',
          'trạm xe buýt': 'bus-stops',
          bus_stop: 'bus-stops',
          'nước uống': 'drinking_water',
          drinking_water: 'drinking_water',
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

        this.logger.log(
          `Mapped amenities: ${amenities.join(', ')}, radius: ${radiusKm}km`,
        );

        let defaultLon = 0;
        let defaultLat = 0;

        if (location && location.trim() !== '') {
          try {
            const geoResponse = await fetch(
              `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${process.env.OPEN_CAGE_API_KEY}&countrycode=vn&limit=1`,
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
              },
            );

            if (!geoResponse.ok) {
              this.logger.warn(
                `Geocoding API failed with status: ${geoResponse.status}`,
              );
            } else {
              const geoData = await geoResponse.json();

              if (geoData.results && geoData.results.length > 0) {
                defaultLon = geoData.results[0].geometry.lng;
                defaultLat = geoData.results[0].geometry.lat;
                this.logger.log(
                  `Found coordinates: ${defaultLat}, ${defaultLon}`,
                );
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
            limit: 50,
          },
          message: `Tìm kiếm ${amenities.join(', ')} ${location ? `tại ${location}` : 'gần bạn'} trong bán kính ${radiusKm}km`,
        };
      } catch (error) {
        this.logger.error('Public service search error:', error);
        throw new BadRequestException(
          'Public service search failed: ' + (error.message || 'Unknown error'),
        );
      }
    }
  }

  async test(contents: string) {
    if (!this.genAI) {
      throw new BadRequestException('Gemini not configured');
    }

    // Validate input
    if (!contents || typeof contents !== 'string' || contents.trim() === '') {
      throw new BadRequestException(
        'Invalid input: contents must be a non-empty string',
      );
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
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

        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          this.logger.error('No JSON found in response');
          throw new BadRequestException(
            'Invalid response format: no JSON found',
          );
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
      const publicServiceKeywords = [
        'bệnh viện',
        'trường học',
        'nhà vệ sinh',
        'sân chơi',
        'trạm xe buýt',
        'nước uống',
      ];
      const locationInfoKeywords = [
        'giới thiệu',
        'lịch sử',
        'thông tin',
        'có gì',
        'đặc biệt',
        'nổi tiếng',
      ];

      let questionType = 'unknown';

      if (
        locationInfoKeywords.some((keyword) => lowerContent.includes(keyword))
      ) {
        questionType = 'location_info';
      } else if (
        publicServiceKeywords.some((keyword) => lowerContent.includes(keyword))
      ) {
        questionType = 'public_service_search';
      } else if (
        lowerContent.includes('tìm') ||
        lowerContent.includes('ở đâu') ||
        lowerContent.includes('gần')
      ) {
        questionType = 'location_search';
      } else {
        questionType = 'normal_question';
      }

      return {
        questionType,
        originalQuestion: contents,
      };
    }
  }

  async ChatFunctionCalling(contents: string) {
    if (!contents || typeof contents !== 'string') {
      throw new BadRequestException(
        'Invalid input: contents must be a non-empty string',
      );
    }

    const toolsDefinition = this.chatToolsRegistry.toolsSchema;

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-pro',
        systemInstruction: `You are an intelligent, friendly, and flexible virtual assistant. **ALWAY RESPONSE ENGLISH**
                                    CORE RULES FOR USING TOOLS:
                                    1. **When to use location search Tool:** 
                                        - When user searches for services/places (ATM, restaurants, hospitals, etc.)
                                        - **IMPORTANT COORDINATE RULES:**
                                          a. **IF specific location name is mentioned** (e.g., "at Hoan Kiem Lake", "near Ben Thanh Market", "in Hanoi"):
                                             → CALL fetchGeocodeByName(name="location name") FIRST to get coordinates
                                             → THEN call searchNearby or searchNearbyWithTopology with those coordinates
                                          b. **IF keywords "near me", "nearby", "around here" are present**:
                                             → Use coordinates from context.currentLocation
                                          c. **IF NO specific location AND NO "near me" keyword**:
                                             → DO NOT call tool, respond "Please specify a location or say 'near me'"
                                        - Prioritize searchNearbyWithTopology when searching for relationships (e.g., "parks near bus stops")
                                        - Prioritize using Wikidata search function to get location information (e.g., coordinates, description, images).
                                    2. **When to use Internal Knowledge:**
                                        - If user asks about history, culture, definitions, advice, or social conversation (e.g., "Tell me about Hanoi", "What's good to eat in Saigon?"), USE YOUR KNOWLEDGE to answer.
                                        - DO NOT respond "I don't know" or "I have no information" just because no suitable tool was found. Answer based on what you've been trained on.
                                    3. **Hybrid:** If you call a tool and receive results (e.g., coordinates), use those results combined with natural language to respond. Don't just return raw data.
                                    4. **HANDLING TOPOLOGY RESULTS:**
                                        - If results contain "noTopologyFound: true", it means no topology relationship was found but search results STILL EXIST.
                                        - Inform the user: "I couldn't find [type A] near [type B], but here's a list of [type A] in the area:"
                                        - Still display the results list in items to the user.
                                    
                                    EXAMPLES:
                                    - "Find parks near bus stops at Hoan Kiem Lake" → fetchGeocodeByName("Hoan Kiem Lake") → searchNearbyWithTopology
                                    - "Find restaurants nearby" → searchNearby with context.currentLocation (has "nearby")
                                    - "Find ATMs in Hanoi" → fetchGeocodeByName("Hanoi") → searchNearby
                                    - "Find cafes" (no location) → Respond: "Where would you like to search? Or say 'near me' to use your current location."
                                    
                                    PHONG CÁCH TRẢ LỜI:
                                    - Trả lời theo ngôn ngữ của câu hỏi (Tiếng Việt cho câu hỏi tiếng Việt, English cho câu hỏi tiếng Anh).
                                    - Giọng văn tự nhiên, hữu ích, như một hướng dẫn viên du lịch thực thụ.
                                    - Nếu tool trả về lỗi hoặc không tìm thấy, hãy xin lỗi và cố gắng đưa ra thông tin gợi ý liên quan từ kiến thức của bạn.`,
        generationConfig: {
          temperature: 0.3,
        },
        tools: [{ functionDeclarations: toolsDefinition }],
      });

      const chat = model.startChat();
      let result = await chat.sendMessage(contents);
      let response = result.response;
      let functionCalls = response.functionCalls();
      let functionResult: any[] = [];

      while (functionCalls && functionCalls.length > 0) {
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
          result: toolResult,
        });

        result = await chat.sendMessage([
          {
            functionResponse: {
              name: name,
              response: toolResult,
            },
          },
        ]);

        response = result.response;
        functionCalls = response.functionCalls();
      }

      return {
        finalResponse: response.text(),
        functionCalls: functionResult,
      };
    } catch (error) {
      this.logger.error('Function calling error:', error);
      throw new BadRequestException(
        'Function calling failed: ' + (error.message || 'Unknown error'),
      );
    }
  }

  @ChatTool({
    name: 'fetchGeocodeByName',
    description:
      'Fetches geocode (latitude and longitude) for a given location name using OpenCage Geocoding API. Only use this tool when you need to get coordinates for a location that cannot be found via Wikidata.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING },
      },
      required: ['name'],
    },
  })
  private async fetchGeocodeByName({ name }: { name: string }) {
    const geoResponse = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(name)}&key=${process.env.OPEN_CAGE_API_KEY}&countrycode=vn&limit=1`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (!geoResponse.ok) {
      this.logger.warn(
        `Geocoding API failed with status: ${geoResponse.status}`,
      );
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
