/** Maps the coach's selected venue snapshot to the event persistence fields. */
export function mapVenueToEventFields(venue, address) {
  return {
    location: venue?.name ?? '',
    venueId: venue?.id ?? null,
    venueSource: venue?.source ?? null,
    venueTags: venue?.tags ?? null,
    venueAddress: address.trim() || venue?.address || null,
    weatherLocation: venue?.name ?? null,
    weatherLatitude: venue?.latitude ?? null,
    weatherLongitude: venue?.longitude ?? null,
    weatherTimezone: null,
  };
}
