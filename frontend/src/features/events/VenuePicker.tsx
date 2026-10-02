import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Loader2, LocateFixed, Plus, Save, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveVenue, fetchTeamVenues, findNearbyVenues, reverseVenueLocation, searchVenues } from './api';
import type { TeamVenue, VenueSearchResult, VenueTags } from './types';
import { updateTeamCountryCode } from '@/services/teams';
import { useAuth } from '@/hooks/useAuth';

export type VenueChoice = {
  id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  tags: VenueTags | null;
  source: 'geoapify' | 'custom';
};

interface VenuePickerProps {
  countryCode?: string | null;
  value?: VenueChoice | null;
  onChange: (venue: VenueChoice | null) => void;
}

const fieldClass = 'h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground';

function toChoice(venue: TeamVenue | VenueSearchResult): VenueChoice {
  return {
    id: 'source' in venue ? venue.id : null,
    name: venue.name,
    address: venue.address,
    latitude: venue.latitude,
    longitude: venue.longitude,
    tags: 'tags' in venue ? venue.tags : null,
    source: 'source' in venue ? venue.source : 'geoapify',
  };
}

function secondaryLine(address: string | null) {
  if (!address) return 'Address not available';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.slice(1, 3).join(', ') || address;
}

function GeoapifyAttribution() {
  return (
    <span className="text-xs">
      <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline">Powered by Geoapify</a>
      {' · '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a>
    </span>
  );
}

export function VenuePicker({ countryCode, value, onChange }: VenuePickerProps) {
  const { refreshSession } = useAuth();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [venues, setVenues] = useState<TeamVenue[]>([]);
  const [query, setQuery] = useState(value?.name ?? '');
  const [results, setResults] = useState<VenueSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchComplete, setSearchComplete] = useState(false);
  const [worldwide, setWorldwide] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nearMeMessage, setNearMeMessage] = useState<string | null>(null);
  const [areaLabel, setAreaLabel] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearby, setNearby] = useState<VenueSearchResult[]>([]);
  const [radius, setRadius] = useState(5000);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [customLatitude, setCustomLatitude] = useState('');
  const [customLongitude, setCustomLongitude] = useState('');
  const [customFormat, setCustomFormat] = useState<VenueTags['format'] | ''>('');
  const [customSurface, setCustomSurface] = useState<VenueTags['surface'] | ''>('');
  const [customSetting, setCustomSetting] = useState<VenueTags['setting'] | ''>('');
  const [busy, setBusy] = useState(false);
  const [editCountry, setEditCountry] = useState(countryCode ?? '');
  const [countryMessage, setCountryMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchTeamVenues().then((items) => { if (active) setVenues(items); }).catch(() => {
      if (active) setErrorMessage('Your saved venues could not be loaded. You can still add a custom venue.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (value) setQuery(value.name);
    else if (!query) setQuery('');
  }, [value?.id, value?.name]);

  useEffect(() => setEditCountry(countryCode ?? ''), [countryCode]);

  useEffect(() => {
    const term = query.trim();
    if (!isOpen || value || term.length < 2) {
      setResults([]);
      setSearchComplete(false);
      setLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setErrorMessage(null);
      void searchVenues({
        query: term,
        country: countryCode || deviceCountryCode(),
        worldwide,
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
      }).then((response) => {
        if (active) {
          setResults(response.results);
          setErrorMessage(response.unavailableReason);
          setSearchComplete(true);
          setActiveIndex(0);
        }
      }).catch(() => {
        if (active) {
          setResults([]);
          setErrorMessage('Venue search is temporarily unavailable. Your venues and custom venues are still available.');
          setSearchComplete(true);
        }
      }).finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, isOpen, value, countryCode, worldwide, userLocation]);

  const selectVenue = (venue: TeamVenue | VenueSearchResult) => {
    onChange(toChoice(venue));
    setQuery(venue.name);
    setResults([]);
    setNearby([]);
    setIsOpen(false);
    setShowCustom(false);
    setErrorMessage(null);
  };

  const addCustom = async () => {
    if (!customName.trim()) return;
    const latitude = customLatitude.trim() ? Number(customLatitude) : null;
    const longitude = customLongitude.trim() ? Number(customLongitude) : null;
    if ((latitude == null) !== (longitude == null) || (latitude != null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude != null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))) {
      setErrorMessage('Enter both valid coordinates, or leave both blank.');
      return;
    }
    setBusy(true);
    try {
      const saved = await saveVenue({
        name: customName.trim(), address: customAddress.trim() || null,
        latitude, longitude, notes: customNotes.trim() || null,
        tags: { ...(customFormat ? { format: customFormat } : {}), ...(customSurface ? { surface: customSurface } : {}), ...(customSetting ? { setting: customSetting } : {}) },
        source: 'custom',
      });
      setVenues((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
      selectVenue(saved);
      setCustomName(''); setCustomAddress(''); setCustomNotes(''); setCustomLatitude(''); setCustomLongitude('');
      setCustomFormat(''); setCustomSurface(''); setCustomSetting('');
    } catch {
      setErrorMessage('Could not save this custom venue. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  const saveSearchResult = async (venue: VenueSearchResult) => {
    setBusy(true);
    try {
      const saved = await saveVenue({
        name: venue.name, address: venue.address, latitude: venue.latitude,
        longitude: venue.longitude, source: 'geoapify', externalId: venue.id,
      });
      setVenues((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
      selectVenue(saved);
    } catch {
      setErrorMessage('Could not save the venue. You can still use it for this event.');
      selectVenue(venue);
    } finally { setBusy(false); }
  };

  const findNearMe = () => {
    setNearMeMessage(null); setErrorMessage(null);
    if (!navigator.geolocation) { setNearMeMessage('Location is unavailable in this browser. Search by name or add a custom venue.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const point = { latitude: coords.latitude, longitude: coords.longitude };
      setUserLocation(point);
      setIsOpen(true);
      try {
        const [area, found] = await Promise.all([
          reverseVenueLocation(point.latitude, point.longitude),
          findNearbyVenues(point.latitude, point.longitude, radius),
        ]);
        const label = area.areaLabel;
        setAreaLabel(label);
        setNearMeMessage(label ? `Near ${label}` : 'Nearby pitches');
        setErrorMessage(found.unavailableReason ?? area.unavailableReason);
        setNearby(found.results);
        if (!found.results.length && !found.unavailableReason) setNearMeMessage(`${label ? `No pitches found near ${label}.` : 'No pitches found nearby.'} Search by name or add a custom venue.`);
      } catch {
        setNearMeMessage('Nearby search is temporarily unavailable. Search by name or add a custom venue.');
      } finally { setBusy(false); }
    }, (error) => {
      setBusy(false);
      setNearMeMessage(error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Search by name or add a custom venue.'
        : error.code === error.TIMEOUT
          ? 'Could not get your location in time. Search by name or add a custom venue.'
          : 'Your location is unavailable. Search by name or add a custom venue.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  };

  const expandNearby = async () => {
    if (!userLocation) return;
    const nextRadius = Math.min(25000, radius * 2);
    setRadius(nextRadius);
    setBusy(true);
    try {
      const response = await findNearbyVenues(userLocation.latitude, userLocation.longitude, nextRadius);
      setNearby(response.results);
      setErrorMessage(response.unavailableReason);
    } catch {
      setErrorMessage('Nearby search is temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  };

  const visibleOptions = [
    ...venues.slice(0, 8),
    ...results,
    ...nearby,
  ];

  const moveActive = (direction: number) => {
    const length = visibleOptions.length;
    if (!length) return;
    const next = (activeIndex + direction + length) % length;
    setActiveIndex(next);
    optionRefs.current[next]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setIsOpen(true); moveActive(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); }
    if (event.key === 'Escape') setIsOpen(false);
    if (event.key === 'Enter' && visibleOptions[activeIndex]) {
      event.preventDefault(); selectVenue(visibleOptions[activeIndex]);
    }
  };

  const option = (venue: TeamVenue | VenueSearchResult, index: number, key: string) => (
    <div key={key} className="flex items-center gap-2 px-2 py-1">
      <button
        ref={(node) => { optionRefs.current[index] = node; }}
        id={`${id}-option-${index}`}
        type="button" role="option" aria-selected={activeIndex === index}
        className={`min-h-12 min-w-0 flex-1 rounded-md px-3 py-2 text-left hover:bg-muted ${activeIndex === index ? 'bg-muted' : ''}`}
        onMouseEnter={() => setActiveIndex(index)} onClick={() => selectVenue(venue)}
      >
        <span className="block truncate text-sm font-medium text-foreground">{venue.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{secondaryLine(venue.address)}</span>
        {'distanceMeters' in venue && venue.distanceMeters != null && <span className="text-xs text-muted-foreground">{venue.distanceMeters < 1000 ? `${venue.distanceMeters} m` : `${(venue.distanceMeters / 1000).toFixed(1)} km`} away</span>}
      </button>
      {!('source' in venue) && <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Save ${venue.name} to Your venues`} onClick={() => void saveSearchResult(venue)}><Save className="size-4" /></Button>}
    </div>
  );

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-input`} className="text-sm font-medium text-foreground">Venue</label>
      <div className="relative flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <input
            ref={inputRef} id={`${id}-input`} role="combobox" aria-autocomplete="list"
            aria-expanded={isOpen} aria-controls={`${id}-listbox`} aria-activedescendant={isOpen && visibleOptions.length ? `${id}-option-${activeIndex}` : undefined}
            className={`${fieldClass} pl-9 pr-9`} placeholder="Search football venues" value={query}
            onFocus={() => setIsOpen(true)} onChange={(event) => { setQuery(event.target.value); onChange(null); setIsOpen(true); setActiveIndex(0); }} onKeyDown={onKeyDown}
          />
          {query && <button type="button" aria-label="Clear venue" className="absolute right-2 top-2.5 rounded p-1 text-muted-foreground" onClick={() => { setQuery(''); onChange(null); setResults([]); inputRef.current?.focus(); }}><X className="size-4" /></button>}
        </div>
        <Button type="button" variant="outline" className="min-h-11 shrink-0 gap-2" onClick={findNearMe} disabled={busy}><LocateFixed className="size-4" /><span className="hidden sm:inline">Find pitches near me</span><span className="sm:hidden">Near me</span></Button>
      </div>
      {value && <div className="flex items-start gap-2 text-xs text-muted-foreground"><Check className="mt-0.5 size-3.5 text-primary" /><span>{value.address || 'Address optional'}{value.source === 'geoapify' && <span className="block"><GeoapifyAttribution /></span>}</span></div>}
      {nearMeMessage && <p role="status" className="text-xs text-muted-foreground">{nearMeMessage}</p>}
      {errorMessage && <p role="status" className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">{errorMessage}</p>}
      {isOpen && <div className="relative z-30">
        <div id={`${id}-listbox`} role="listbox" aria-label="Venue suggestions" className="mt-1 max-h-[min(55vh,24rem)] overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-xl">
          {venues.length > 0 && <section aria-label="Your venues"><h3 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your venues</h3>{venues.slice(0, 8).map((venue, i) => option(venue, i, `saved-${venue.id}`))}{venues.some((venue) => venue.source === 'geoapify') && <p className="px-3 py-1 text-[11px] text-muted-foreground"><GeoapifyAttribution /></p>}</section>}
          {(loading || query.trim().length >= 2 || nearby.length > 0) && <section aria-label="Search results"><h3 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search results</h3>{loading && <p role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Searching venues…</p>}{results.map((venue, i) => option(venue, Math.min(venues.length, 8) + i, `result-${venue.id}`))}{nearby.map((venue, i) => option(venue, Math.min(venues.length, 8) + results.length + i, `nearby-${venue.id}`))}{searchComplete && !loading && !results.length && !nearby.length && !errorMessage && <p className="px-3 py-3 text-sm text-muted-foreground">No matching pitches. Try another search or add a custom venue.</p>}{(results.length > 0 || nearby.length > 0) && <p className="px-3 py-1 text-[11px] text-muted-foreground"><GeoapifyAttribution /></p>}</section>}
          {areaLabel && <p className="px-3 py-1 text-xs text-muted-foreground">Area: {areaLabel}</p>}
          <div className="sticky bottom-0 mt-2 border-t border-border bg-popover p-2">
            <div className="flex items-center justify-between gap-3 px-1 py-1.5"><span className="text-sm font-medium text-foreground">Search worldwide</span><input aria-label="Search worldwide" type="checkbox" checked={worldwide} onChange={(event) => setWorldwide(event.target.checked)} className="size-5 accent-primary" /></div>
            <div className="flex items-end gap-2 px-1 py-2"><label className="flex-1 text-xs text-muted-foreground">Team country (2-letter code)
              <input aria-label="Team country code" maxLength={2} autoCapitalize="none" placeholder={deviceCountryCode()?.toUpperCase() ?? 'ZA'} value={editCountry} onChange={(event) => setEditCountry(event.target.value)} className={`${fieldClass} mt-1`} />
            </label><Button type="button" variant="outline" className="min-h-11" disabled={busy || !/^[a-z]{2}$/i.test(editCountry)} onClick={async () => { setBusy(true); try { const response = await updateTeamCountryCode(editCountry.toLowerCase()); await refreshSession(); setCountryMessage(`Search region set to ${response.team.countryCode?.toUpperCase()}.`); } catch { setCountryMessage('Could not update team country.'); } finally { setBusy(false); } }}>Set region</Button></div>
            {countryMessage && <p role="status" className="px-2 text-xs text-muted-foreground">{countryMessage}</p>}
            {userLocation && radius < 25000 && <Button type="button" variant="ghost" className="w-full justify-start" disabled={busy} onClick={() => void expandNearby()}>Expand nearby radius</Button>}
            {!showCustom ? <Button type="button" variant="outline" className="min-h-11 w-full justify-start gap-2" onClick={() => setShowCustom(true)}><Plus className="size-4" />Add a custom venue</Button> : <div className="space-y-2 rounded-md border border-border p-3">
              <h3 className="text-sm font-semibold">Add a custom venue</h3>
        <input autoFocus required aria-label="Custom venue name" className={fieldClass} placeholder="Venue name *" value={customName} onChange={(event) => setCustomName(event.target.value)} />
              <input aria-label="Custom venue address (optional)" className={fieldClass} placeholder="Address (optional)" value={customAddress} onChange={(event) => setCustomAddress(event.target.value)} />
              <div className="grid grid-cols-2 gap-2"><input className={fieldClass} inputMode="decimal" aria-label="Latitude" placeholder="Latitude" value={customLatitude} onChange={(event) => setCustomLatitude(event.target.value)} /><input className={fieldClass} inputMode="decimal" aria-label="Longitude" placeholder="Longitude" value={customLongitude} onChange={(event) => setCustomLongitude(event.target.value)} /></div>
              <input aria-label="Venue notes (optional)" className={fieldClass} placeholder="Notes (e.g. Pitch 3, behind clubhouse)" value={customNotes} onChange={(event) => setCustomNotes(event.target.value)} />
              <div className="grid grid-cols-2 gap-2"><select aria-label="Format" className={fieldClass} value={customFormat} onChange={(event) => setCustomFormat(event.target.value as typeof customFormat)}><option value="">Format</option>{['5', '7', '9', '11'].map((item) => <option key={item} value={item}>{item}-a-side</option>)}</select><select aria-label="Surface" className={fieldClass} value={customSurface} onChange={(event) => setCustomSurface(event.target.value as typeof customSurface)}><option value="">Surface</option>{['grass', 'astro', 'indoor'].map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="Venue setting" className={fieldClass} value={customSetting} onChange={(event) => setCustomSetting(event.target.value as typeof customSetting)}><option value="">Indoor / outdoor</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></div>
              <div className="flex gap-2"><Button type="button" className="min-h-11 flex-1" disabled={busy || !customName.trim()} onClick={() => void addCustom()}>{busy ? <Loader2 className="size-4 animate-spin" /> : 'Save venue'}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setShowCustom(false)}>Cancel</Button></div>
            </div>}
            <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)}>Close</Button></div>
          </div>
        </div>
      </div>}
    </div>
  );
}

function deviceCountryCode(): string | undefined {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return locale.match(/[-_]([A-Z]{2})$/i)?.[1]?.toLowerCase();
}
