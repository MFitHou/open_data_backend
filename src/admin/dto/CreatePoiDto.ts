/**
 * Copyright (C) 2025 MFitHou
 */

export class CreatePoiDto {
  type: string; // atm, hospital, toilet, bus-stop
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  description?: string;
}

export class StatsResponseDto {
  totalPois: number;
  monitoringPoints: number;
  totalReports: number;
  breakdown: {
    atms: number;
    hospitals: number;
    toilets: number;
    busStops: number;
  };
}
