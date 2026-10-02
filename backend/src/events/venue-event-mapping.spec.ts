import { mapVenueToEventFields } from './venue-event-mapping';

describe('mapVenueToEventFields', () => {
  it('uses the team saved venue as the event and forecast snapshot', () => {
    expect(
      mapVenueToEventFields(
        {
          id: 'venue-1',
          name: 'Riverside Football Ground',
          source: 'geoapify',
          tags: { format: '11', surface: 'grass' },
          address: '12 River Road, Parktown, Johannesburg',
          latitude: -26.18,
          longitude: 28.03,
        },
        {
          location: 'Stale client venue',
          venueAddress: 'Coach-edited address',
          weatherLatitude: 0,
          weatherLongitude: 0,
        },
      ),
    ).toEqual({
      location: 'Riverside Football Ground',
      venueId: 'venue-1',
      venueSource: 'geoapify',
      venueTags: { format: '11', surface: 'grass' },
      venueAddress: 'Coach-edited address',
      weatherLocation: 'Riverside Football Ground',
      weatherLatitude: -26.18,
      weatherLongitude: 28.03,
      weatherTimezone: null,
    });
  });

  it('keeps a selected unsaved provider result on the event snapshot', () => {
    expect(
      mapVenueToEventFields(null, {
        location: 'Community Sports Field',
        venueId: null,
        venueSource: 'geoapify',
        venueAddress: 'Parktown, Johannesburg',
        weatherLatitude: -26.18,
        weatherLongitude: 28.03,
      }),
    ).toMatchObject({
      location: 'Community Sports Field',
      venueId: null,
      venueSource: 'geoapify',
      weatherLatitude: -26.18,
      weatherLongitude: 28.03,
    });
  });
});
