import type { VenueTags } from './types';

export interface VenueEventSelection {
  id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  tags: VenueTags | null;
  source: 'geoapify' | 'custom';
}

export function mapVenueToEventFields(
  venue: VenueEventSelection | null,
  address: string,
): {
  location: string;
  venueId: string | null;
  venueSource: 'geoapify' | 'custom' | null;
  venueTags: VenueTags | null;
  venueAddress: string | null;
  weatherLocation: string | null;
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  weatherTimezone: null;
};
