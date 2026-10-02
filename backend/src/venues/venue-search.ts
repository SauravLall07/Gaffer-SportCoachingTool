export interface VenueSearchCandidate {
  id: string;
  name: string;
  address: string | null;
  secondary: string | null;
  latitude: number;
  longitude: number;
  source: 'geoapify';
  externalId: string | null;
  categories: string[];
  distanceMeters?: number;
}

export function rankVenueCandidates(
  candidates: VenueSearchCandidate[],
  query: string,
  origin?: { latitude: number; longitude: number },
): VenueSearchCandidate[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [...candidates]
    .map((candidate) => {
      const name = candidate.name.toLocaleLowerCase();
      const categories = candidate.categories.join(' ').toLocaleLowerCase();
      const textMatch = name === normalizedQuery ? 0 : name.startsWith(normalizedQuery) ? 1 : name.includes(normalizedQuery) ? 2 : 3;
      const sportMatch = /sport|pitch|field|football|soccer|stadium|rugby|club/.test(
        `${name} ${categories}`,
      ) ? 0 : 1;
      const distance = origin
        ? haversineDistanceMeters(origin, candidate)
        : Number.POSITIVE_INFINITY;
      return { candidate: { ...candidate, distanceMeters: Number.isFinite(distance) ? distance : candidate.distanceMeters }, textMatch, sportMatch, distance };
    })
    .sort((a, b) =>
      a.textMatch - b.textMatch ||
      a.sportMatch - b.sportMatch ||
      a.distance - b.distance ||
      a.candidate.name.localeCompare(b.candidate.name),
    )
    .map(({ candidate }) => candidate);
}

export function haversineDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
