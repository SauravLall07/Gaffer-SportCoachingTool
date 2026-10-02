export function VenueAttribution({ source, compact = false }: { source?: string | null; compact?: boolean }) {
  if (source !== 'geoapify') return null;
  return (
    <span className={`text-muted-foreground ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
      <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2">Powered by Geoapify</a>
      {' · '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-2">© OpenStreetMap contributors</a>
    </span>
  );
}
