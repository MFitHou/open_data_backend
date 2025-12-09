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
 *
 * POI Type classification constants and utilities
 * Centralized definitions to avoid duplication across the codebase
 */

// POI Types classification
export const AMENITY_TYPES = [
  'atm', 'bank', 'restaurant', 'cafe', 'hospital', 'school',
  'pharmacy', 'police', 'fire_station', 'parking', 'fuel',
  'supermarket', 'library', 'charging_station', 'convenience_store',
  'post_office', 'kindergarten', 'university', 'toilet', 'toilets',
  'public_toilet', 'community_center', 'marketplace', 'warehouse',
  'drinking_water', 'waste_basket', 'clinic', 'dentist', 'veterinary',
  'cinema', 'theatre', 'museum', 'gym', 'swimming_pool', 'place_of_worship'
] as const;

export const HIGHWAY_TYPES = ['bus_stop'] as const;

export const LEISURE_TYPES = ['park', 'playground'] as const;

export type AmenityType = typeof AMENITY_TYPES[number];
export type HighwayType = typeof HIGHWAY_TYPES[number];
export type LeisureType = typeof LEISURE_TYPES[number];

/**
 * Classify a POI type into amenity, highway, or leisure category
 */
export function classifyPoiType(type: string): {
  amenity: string | null;
  highway: string | null;
  leisure: string | null;
} {
  const typeKey = type.toLowerCase();
  
  if (AMENITY_TYPES.includes(typeKey as AmenityType)) {
    return {
      amenity: typeKey === 'public_toilet' ? 'toilets' : typeKey,
      highway: null,
      leisure: null,
    };
  }
  
  if (HIGHWAY_TYPES.includes(typeKey as HighwayType)) {
    return {
      amenity: null,
      highway: typeKey,
      leisure: null,
    };
  }
  
  if (LEISURE_TYPES.includes(typeKey as LeisureType)) {
    return {
      amenity: null,
      highway: null,
      leisure: typeKey,
    };
  }
  
  // Default to amenity for unknown types
  return {
    amenity: typeKey,
    highway: null,
    leisure: null,
  };
}

/**
 * Parse POI type from URI
 * URI format: urn:ngsi-ld:PointOfInterest:Hanoi:<type>:<id>
 */
export function parseTypeFromUri(uri: string): {
  amenity: string | null;
  highway: string | null;
  leisure: string | null;
} | null {
  const uriMatch = uri.match(/PointOfInterest:[^:]+:([^:]+):/i);
  if (!uriMatch) {
    return null;
  }
  return classifyPoiType(uriMatch[1]);
}
