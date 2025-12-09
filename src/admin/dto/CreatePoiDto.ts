/**
 * Copyright (C) 2025 MFitHou
 */

export class CreatePoiDto {
  name: string;
  type: string; // atm, hospital, toilet, bus-stop
  lat: number;
  lon: number;
  address?: string;
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
