import { sortVenuesByDistance } from './venues.service';

describe('venue search ranking', () => {
  it('orders nearby places by distance and leaves coordinate-less venues last', () => {
    const rows = [
      { id: 'far', latitude: -26.2, longitude: 28.1 },
      { id: 'unknown', latitude: null, longitude: null },
      { id: 'near', latitude: -26.2, longitude: 28.01 },
    ];
    expect(sortVenuesByDistance(rows, -26.2, 28)).toEqual([
      rows[2], rows[0], rows[1],
    ]);
  });
});
