import type { VenueTags } from '../database/schema';

export interface EventVenueSnapshot {
  id: string;
  name: string;
  source: string;
  tags: VenueTags | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface EventVenueInput {
  location?: string;
  venueId?: string | null;
  venueSource?: 'geoapify' | 'custom' | null;
  venueTags?: VenueTags | null;
  venueAddress?: string | null;
  weatherLocation?: string | null;
  weatherLatitude?: number | null;
  weatherLongitude?: number | null;
  weatherTimezone?: string | null;
}

/** Saved team venues are authoritative; unsaved search results use the selected snapshot. */
export function mapVenueToEventFields(
  selected: EventVenueSnapshot | null,
  input: EventVenueInput,
) {
  return {
    location: selected ? selected.name : input.location ?? '',
    venueId: selected ? selected.id : input.venueId ?? null,
    venueSource: selected ? selected.source : input.venueSource ?? null,
    venueTags: selected ? selected.tags : input.venueTags ?? null,
    venueAddress: input.venueAddress !== undefined
      ? input.venueAddress
      : selected?.address ?? null,
    weatherLocation: selected ? selected.name : input.weatherLocation ?? null,
    weatherLatitude: selected ? selected.latitude : input.weatherLatitude ?? null,
    weatherLongitude: selected ? selected.longitude : input.weatherLongitude ?? null,
    weatherTimezone: input.weatherTimezone ?? null,
  };
}
