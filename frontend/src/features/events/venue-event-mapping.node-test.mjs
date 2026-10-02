import test from 'node:test';
import assert from 'node:assert/strict';
import { mapVenueToEventFields } from './venue-event-mapping.mjs';

test('maps a selected venue and its coordinates to event and forecast fields', () => {
  assert.deepEqual(mapVenueToEventFields({
    id: 'venue-1', name: 'Riverside Pitch', address: 'Parktown, Johannesburg',
    latitude: -26.18, longitude: 28.03, source: 'geoapify',
    tags: { format: '11', surface: 'grass' },
  }, '  Editable address  '), {
    location: 'Riverside Pitch', venueId: 'venue-1', venueSource: 'geoapify',
    venueTags: { format: '11', surface: 'grass' },
    venueAddress: 'Editable address', weatherLocation: 'Riverside Pitch',
    weatherLatitude: -26.18, weatherLongitude: 28.03, weatherTimezone: null,
  });
});

test('allows event creation without a provider result or saved venue', () => {
  assert.deepEqual(mapVenueToEventFields(null, ''), {
    location: '', venueId: null, venueSource: null, venueTags: null,
    venueAddress: null, weatherLocation: null, weatherLatitude: null,
    weatherLongitude: null, weatherTimezone: null,
  });
});

test('uses a coach-edited address, falling back to the venue address when blank', () => {
  const venue = { name: 'Local Pitch', address: 'Club Road', latitude: null, longitude: null };
  assert.equal(mapVenueToEventFields(venue, '  Directions gate  ').venueAddress, 'Directions gate');
  assert.equal(mapVenueToEventFields(venue, ' ').venueAddress, 'Club Road');
});
