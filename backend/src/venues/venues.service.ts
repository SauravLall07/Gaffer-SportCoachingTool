import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { geoapifyDailyUsage, venues } from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type { CreateVenueDto } from './venues.schemas';

const DAILY_CREDIT_CAP = 2500;
const CACHE_TTL_MS = 2 * 60 * 1000;
const USER_RATE_WINDOW_MS = 60 * 1000;
const USER_RATE_LIMIT = 30;
const API_BASE = 'https://api.geoapify.com';
const SPORTS_CATEGORIES = [
  'sport.pitch',
  'sport.sports_centre',
  'sport.sports_hall',
  'sport.stadium',
  'activity.sport_club',
];
const VENUE_CATEGORIES = new Set(SPORTS_CATEGORIES);

type UsageEndpoint = 'search' | 'nearby' | 'reverse';
type ProviderResult = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters?: number;
};

export type ProviderLookup = {
  results: ProviderResult[];
  unavailableReason: string | null;
};

type GeoFeature = {
  properties?: Record<string, unknown>;
};

const searchCache = new Map<string, { expiresAt: number; value: ProviderLookup }>();
const inFlightLookups = new Map<string, Promise<unknown>>();
const userCalls = new Map<string, { startedAt: number; count: number }>();

/** Rank nearby results by exact distance, with missing coordinates last. */
export function sortVenuesByDistance<T extends { latitude: number | null; longitude: number | null }>(
  rows: T[],
  latitude: number,
  longitude: number,
): T[] {
  return [...rows].sort((a, b) => distance(a, latitude, longitude) - distance(b, latitude, longitude));
}

function distance(point: { latitude: number | null; longitude: number | null }, lat: number, lng: number) {
  if (point.latitude == null || point.longitude == null) return Number.POSITIVE_INFINITY;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(point.latitude - lat);
  const dLng = radians(point.longitude - lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat)) * Math.cos(radians(point.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function coordsCacheKey(lat: number, lng: number, radius?: number) {
  return `${lat}:${lng}:${radius ?? ''}`;
}

function propertyNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeFeature(feature: GeoFeature): ProviderResult | null {
  const p = feature.properties ?? {};
  const name = typeof p.name === 'string' ? p.name : '';
  const id = typeof p.place_id === 'string' ? p.place_id : '';
  if (!name || !id) return null;
  const lat = propertyNumber(p.lat);
  const lng = propertyNumber(p.lon);
  const address = typeof p.formatted === 'string'
    ? p.formatted
    : [p.address_line1, p.address_line2].filter((part) => typeof part === 'string').join(', ') || null;
  return { id, name, address, latitude: lat, longitude: lng };
}

@Injectable()
export class VenuesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  async list(userId: string) {
    const team = await this.teamsService.findTeamForUser(userId);
    if (!team) return [];
    return this.databaseService.database
      .select()
      .from(venues)
      .where(eq(venues.teamId, team.id))
      .orderBy(sql`${venues.lastUsedAt} DESC NULLS LAST`, asc(venues.name));
  }

  async create(userId: string, input: CreateVenueDto) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const [venue] = await this.databaseService.database
      .insert(venues)
      .values({
        teamId: team.id,
        ...input,
        source: input.source,
        externalId: input.source === 'geoapify' ? input.externalId ?? null : null,
      })
      .onConflictDoUpdate({
        target: [venues.teamId, venues.source, venues.externalId],
        set: {
          name: input.name,
          address: input.address ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          notes: input.notes ?? null,
          tags: input.tags ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return venue;
  }

  async search(userId: string, options: {
    query: string; worldwide: boolean; latitude?: number; longitude?: number; countryCode?: string;
  }): Promise<ProviderLookup> {
    const query = options.query.trim();
    if (query.length < 2) return { results: [], unavailableReason: null };
    if (query.length > 100) throw new BadRequestException('Venue search must be 100 characters or fewer.');
    const team = await this.teamsService.findTeamForUser(userId);
    const country = options.countryCode?.match(/^[a-z]{2}$/i)?.[0].toLowerCase() ?? team?.countryCode;
    const hasValidBias = options.latitude != null && options.longitude != null
      && Math.abs(options.latitude) <= 90 && Math.abs(options.longitude) <= 180;
    const bias = hasValidBias
      ? `proximity:${options.longitude},${options.latitude}`
      : null;
    const key = `search:${query.toLocaleLowerCase()}:${options.worldwide ? '*' : country ?? 'auto'}:${bias ? coordsCacheKey(options.latitude!, options.longitude!) : ''}`;
    return this.cached(key, () => this.providerRequest(userId, 'search', async (apiKey) => {
      const params = new URLSearchParams({
        text: query,
        type: 'amenity',
        format: 'json',
        limit: '20',
        apiKey,
      });
      if (!options.worldwide && country) params.set('filter', `countrycode:${country}`);
      if (bias) params.set('bias', bias);
      const response = await fetch(`${API_BASE}/v1/geocode/autocomplete?${params}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Geoapify returned ${response.status}`);
      const body = await response.json() as { results?: Record<string, unknown>[] };
      const results = (body.results ?? []).filter((p) => {
        const cats = Array.isArray(p.categories)
          ? p.categories
          : typeof p.category === 'string'
            ? [p.category]
            : [];
        return cats.some((category) => typeof category === 'string' && [...VENUE_CATEGORIES].some((wanted) => category === wanted || category.startsWith(`${wanted}.`)));
      }).map((p) => normalizeFeature({ properties: p })).filter((p): p is ProviderResult => p !== null);
      return { results, unavailableReason: null };
    }));
  }

  async nearby(userId: string, lat?: number, lng?: number, radius = 5000): Promise<ProviderLookup> {
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException('Provide valid coordinates to find nearby pitches.');
    }
    const safeRadius = Math.min(25000, Math.max(500, radius));
    const key = `nearby:${coordsCacheKey(lat, lng, safeRadius)}`;
    return this.cached(key, () => this.providerRequest(userId, 'nearby', async (apiKey) => {
      const params = new URLSearchParams({
        categories: SPORTS_CATEGORIES.join(','),
        filter: `circle:${lng},${lat},${safeRadius}`,
        bias: `proximity:${lng},${lat}`,
        limit: '20',
        apiKey,
      });
      const response = await fetch(`${API_BASE}/v2/places?${params}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Geoapify returned ${response.status}`);
      const body = await response.json() as { features?: GeoFeature[] };
      const results = (body.features ?? []).map(normalizeFeature).filter((p): p is ProviderResult => p !== null)
        .map((p) => ({ ...p, distanceMeters: Math.round(distance(p, lat, lng)) }));
      return { results: sortVenuesByDistance(results, lat, lng), unavailableReason: null };
    }));
  }

  async reverse(userId: string, lat?: number, lng?: number): Promise<{ areaLabel: string | null; unavailableReason: string | null }> {
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException('Provide valid coordinates to look up the nearby area.');
    }
    const key = `reverse:${coordsCacheKey(lat, lng)}`;
    const result = await this.cached(key, () => this.providerRequest(userId, 'reverse', async (apiKey) => {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json', apiKey });
      const response = await fetch(`${API_BASE}/v1/geocode/reverse?${params}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Geoapify returned ${response.status}`);
      const body = await response.json() as { results?: Record<string, unknown>[] };
      const place = body.results?.[0];
      const label = place
        ? [place.suburb ?? place.neighbourhood ?? place.district, place.city ?? place.county]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join(', ')
        : null;
      return { results: [], unavailableReason: null, areaLabel: label || null };
    }));
    return { areaLabel: (result as ProviderLookup & { areaLabel?: string | null }).areaLabel ?? null, unavailableReason: result.unavailableReason };
  }

  private async cached<T extends ProviderLookup>(key: string, request: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = searchCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value as T;
    if (cached) searchCache.delete(key);
    const pending = inFlightLookups.get(key);
    if (pending) return pending as Promise<T>;
    let lookup: Promise<T>;
    lookup = request()
      .then((result) => {
        if (!result.unavailableReason) {
          if (searchCache.size >= 500) {
            const oldestKey = searchCache.keys().next().value as string | undefined;
            if (oldestKey) searchCache.delete(oldestKey);
          }
          searchCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
        }
        return result;
      })
      .finally(() => {
        if (inFlightLookups.get(key) === lookup) inFlightLookups.delete(key);
      });
    inFlightLookups.set(key, lookup);
    return lookup;
  }

  private async providerRequest<T extends ProviderLookup>(userId: string, endpoint: UsageEndpoint, request: (apiKey: string) => Promise<T>): Promise<T> {
    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) return { results: [], unavailableReason: 'Venue search is unavailable. You can still use your venues or add a custom venue.' } as unknown as T;
    if (!this.allowUserRequest(userId)) return { results: [], unavailableReason: 'You have reached the venue search limit for now. Your venues and custom venues are still available.' } as unknown as T;
    const reserved = await this.reserveCredit(endpoint);
    if (!reserved) return { results: [], unavailableReason: 'Venue search has reached today\'s safety limit. Your venues and custom venues are still available.' } as unknown as T;
    try {
      return await request(apiKey);
    } catch {
      // Keep the reservation on failures/timeouts: the provider may have
      // received and charged the request before the connection failed.
      return { results: [], unavailableReason: 'Venue search is temporarily unavailable. Your venues and custom venues are still available.' } as unknown as T;
    }
  }

  private allowUserRequest(userId: string): boolean {
    const now = Date.now();
    const current = userCalls.get(userId);
    if (!current || now - current.startedAt >= USER_RATE_WINDOW_MS) {
      userCalls.set(userId, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= USER_RATE_LIMIT) return false;
    current.count += 1;
    return true;
  }

  private async reserveCredit(endpoint: UsageEndpoint): Promise<boolean> {
    const usageDate = new Date().toISOString().slice(0, 10);
    const column = endpoint === 'search' ? geoapifyDailyUsage.searchCredits : endpoint === 'nearby' ? geoapifyDailyUsage.nearbyCredits : geoapifyDailyUsage.reverseCredits;
    const [row] = await this.databaseService.database
      .insert(geoapifyDailyUsage)
      .values({ usageDate, [endpoint === 'search' ? 'searchCredits' : endpoint === 'nearby' ? 'nearbyCredits' : 'reverseCredits']: 1 })
      .onConflictDoUpdate({
        target: geoapifyDailyUsage.usageDate,
        set: { [endpoint === 'search' ? 'searchCredits' : endpoint === 'nearby' ? 'nearbyCredits' : 'reverseCredits']: sql`${column} + 1` },
        setWhere: sql`${geoapifyDailyUsage.searchCredits} + ${geoapifyDailyUsage.nearbyCredits} + ${geoapifyDailyUsage.reverseCredits} + 1 <= ${DAILY_CREDIT_CAP}`,
      })
      .returning({ usageDate: geoapifyDailyUsage.usageDate });
    return Boolean(row);
  }
}
