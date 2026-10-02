import { apiFetch, ApiError } from "@/lib/api";
import { apiUrl } from "@/lib/api-url";
import type { FriendlyOpponentLineup } from "@/features/matches/types";
import type {
  ConfirmLineupInput,
  CreateEventInput,
  EventLineup,
  EventWeather,
  MatchRecord,
  StartMatchInput,
  TeamEvent,
  TeamVenue,
  VenueLookupResponse,
  VenueTags,
  UpdateEventInput,
} from "./types";

export function fetchEvents() {
  return apiFetch<TeamEvent[]>("/events");
}

export function fetchEvent(id: string) {
  return apiFetch<TeamEvent>(`/events/${id}`);
}

export function fetchEventWeather(id: string) {
  return apiFetch<EventWeather>(`/events/${id}/weather`);
}

/** The opposing Gaffer team's confirmed lineup for a linked fixture. */
export function fetchFriendlyOpponentLineup(eventId: string) {
  return apiFetch<FriendlyOpponentLineup>(
    `/events/${eventId}/opponent-lineup`,
  );
}

export function fetchTeamVenues() {
  return apiFetch<TeamVenue[]>('/venues');
}

export function searchVenues(input: {
  query: string;
  country?: string;
  worldwide?: boolean;
  latitude?: number;
  longitude?: number;
}) {
  const params = new URLSearchParams({ q: input.query });
  if (input.country) params.set('country', input.country);
  if (input.worldwide) params.set('worldwide', 'true');
  if (input.latitude != null && input.longitude != null) {
    params.set('lat', String(input.latitude));
    params.set('lng', String(input.longitude));
  }
  return apiFetch<VenueLookupResponse>(`/venues/search?${params}`);
}

export function findNearbyVenues(latitude: number, longitude: number, radius = 5000) {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude), radius: String(radius) });
  return apiFetch<VenueLookupResponse>(`/venues/nearby?${params}`);
}

export function reverseVenueLocation(latitude: number, longitude: number) {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  return apiFetch<{ areaLabel: string | null; unavailableReason: string | null }>(`/venues/reverse?${params}`);
}

export function saveVenue(input: {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  tags?: VenueTags | null;
  source?: 'geoapify' | 'custom';
  externalId?: string | null;
}) {
  return apiFetch<TeamVenue>('/venues', { method: 'POST', body: JSON.stringify(input) });
}

export function createEvent(input: CreateEventInput) {
  return apiFetch<TeamEvent>("/events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEvent(id: string, input: UpdateEventInput) {
  return apiFetch<TeamEvent>(`/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function cancelEvent(id: string) {
  return apiFetch<TeamEvent>(`/events/${id}`, {
    method: "DELETE",
  });
}

export function startMatch(eventId: string, input: StartMatchInput) {
  return apiFetch<MatchRecord>(`/events/${eventId}/start-match`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * The signed-in team's confirmed pre-match lineup, or null when none is
 * stored yet. The backend serializes a null body as an empty 200, which
 * `apiFetch` rejects, so this uses a raw fetch and treats absence as null.
 */
export async function fetchEventLineup(
  eventId: string,
): Promise<EventLineup | null> {
  const response = await fetch(apiUrl(`/events/${eventId}/lineup`), {
    credentials: "include",
  });

  if (!response.ok) {
    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const body = isJson ? await response.json().catch(() => null) : null;
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : undefined) ?? "Request failed.";
    throw new ApiError(message, response.status);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as EventLineup) : null;
}

/** Confirms (or replaces) the pre-match lineup without starting the match. */
export function confirmEventLineup(
  eventId: string,
  input: ConfirmLineupInput,
) {
  return apiFetch<EventLineup>(`/events/${eventId}/lineup`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
