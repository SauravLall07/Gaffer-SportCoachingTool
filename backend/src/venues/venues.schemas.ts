import { z } from 'zod';

export const venueTagsSchema = z.object({
  format: z.enum(['5', '7', '9', '11']).optional(),
  surface: z.enum(['grass', 'astro', 'indoor']).optional(),
  setting: z.enum(['indoor', 'outdoor']).optional(),
}).nullable().optional();

export const createVenueSchema = z.object({
  name: z.string().trim().min(1).max(150),
  address: z.string().trim().max(300).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  tags: venueTagsSchema,
  source: z.enum(['geoapify', 'custom']).default('custom'),
  externalId: z.string().trim().max(200).nullable().optional(),
}).refine((value) => (value.latitude == null) === (value.longitude == null), {
  message: 'Latitude and longitude must be provided together.',
});

export type CreateVenueDto = z.infer<typeof createVenueSchema>;

export const venueSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  worldwide: z.enum(['true', 'false']).optional(),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const nearbyVenueQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(1000).max(20000).optional(),
});

export const reverseGeocodeQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});
