import { useEffect, useState } from 'react';
import { Send, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import type { AlertType, AlertSeverity } from './DisasterAlerts';
import { fetchCityOptions, resolveBarangayFromCoordsDetailed } from '../lib/barangay';

export interface UserReport {
  id: string;
  reporterName: string;
  location: string;
  /**
   * Resolved administrative location (barangay-first).
   * Populated via reverse-lookup from coordinates when available.
   */
  barangay?: string;
  city?: string; // city/municipality
  province?: string;
  region?: string;
  type: AlertType;
  severity: AlertSeverity;
  description: string;
  timestamp: Date;
  needsRescue?: boolean;
  /**
   * Where this report came from.
   * - community: submitted via the in-app form
   * - pagasa: official data pulled from PAGASA endpoints
   */
  source?: 'community' | 'pagasa';
  /**
   * Optional coordinates for map plotting (preferred over fuzzy location parsing).
   */
  coordinates?: [number, number];
  /**
   * Optional URL to the original source (bulletin/advisory/etc).
   */
  sourceUrl?: string;
  /**
   * Optional stable identifier from upstream systems.
   */
  externalId?: string;
}

interface ReportFormProps {
  onSubmit: (report: Omit<UserReport, 'id' | 'timestamp'>) => void;
  onRequestMapPick?: () => void;
  pickLocation?: [number, number] | null;
}

export function ReportForm({ onSubmit, onRequestMapPick, pickLocation }: ReportFormProps) {
  const [city, setCity] = useState('');
  const [specificLocation, setSpecificLocation] = useState('');
  const [description, setDescription] = useState('');
  const [needsRescue, setNeedsRescue] = useState(false);
  const [coordinates, setCoordinates] = useState<[number, number] | undefined>();
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [gpsError, setGpsError] = useState('');
  const [locationSource, setLocationSource] = useState<'gps' | 'map' | null>(null);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    setCityLoading(true);
    fetchCityOptions({ signal: ctrl.signal })
      .then((options) => setCityOptions(options))
      .catch(() => setCityOptions([]))
      .finally(() => setCityLoading(false));
    return () => ctrl.abort();
  }, []);

  const applyCoordinates = async (coords: [number, number], source: 'gps' | 'map') => {
    setCoordinates(coords);
    setLocationSource(source);
    setGpsStatus('ready');
    setGpsError('');
    setFormError('');

    try {
      const resolved = await resolveBarangayFromCoordsDetailed(coords);
      if (resolved.status === 'hit' && resolved.data.city) {
        setCity((prev) => (prev ? prev : resolved.data.city ?? ''));
        setCityOptions((prev) =>
          resolved.data.city && !prev.includes(resolved.data.city) ? [resolved.data.city, ...prev] : prev,
        );
        return;
      }
    } catch {
      // Ignore lookup errors and let the user choose manually.
    }

    setGpsError('Location set. Please choose your city and enter a specific location.');
  };

  useEffect(() => {
    if (!pickLocation) return;
    applyCoordinates(pickLocation, 'map');
  }, [pickLocation]);

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('GPS not available in this browser.');
      return;
    }

    setGpsStatus('loading');
    setGpsError('');
    setFormError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        await applyCoordinates([lat, lng], 'gps');
      },
      (err) => {
        setGpsStatus('error');
        setGpsError(err.message || 'Unable to get GPS location.');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!city || !specificLocation || !description) {
      setFormError('Please choose your city, enter a specific location, then add a short description.');
      return;
    }

    onSubmit({
      reporterName: 'Anonymous',
      location: `${specificLocation.trim()}, ${city.trim()}`,
      city: city.trim(),
      type: 'flood',
      severity: 'low',
      description,
      needsRescue,
      coordinates,
    });

    // Reset form
    setCity('');
    setSpecificLocation('');
    setDescription('');
    setNeedsRescue(false);
    setCoordinates(undefined);
    setGpsStatus('idle');
    setGpsError('');
    setLocationSource(null);
    setFormError('');
  };

  return (
    <Card className="w-full bg-neutral-950/60 text-white border border-neutral-800 shadow-2xl">
      <div className="h-1 w-full bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400" />
      <CardHeader className="border-b border-neutral-800 pb-4">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-red-400" />
          Report an incident
        </CardTitle>
        <CardDescription>
          Share conditions in your area
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="city">City / Municipality</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleUseGps}
                  disabled={gpsStatus === 'loading'}
                  className="h-7 px-2 text-xs"
                >
                  {gpsStatus === 'loading' ? 'Locating…' : 'Use GPS'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRequestMapPick}
                  disabled={!onRequestMapPick}
                  className="h-7 px-2 text-xs"
                >
                  Pick on map
                </Button>
              </div>
            </div>
            <Select
              value={city}
              onValueChange={(value) => {
                setCity(value);
                setFormError('');
              }}
            >
              <SelectTrigger id="city" className="bg-neutral-900 border-neutral-800 text-white">
                <SelectValue placeholder={cityLoading ? 'Loading cities…' : 'Select city'} />
              </SelectTrigger>
              <SelectContent>
                {cityLoading ? (
                  <SelectItem value="loading" disabled>
                    Loading…
                  </SelectItem>
                ) : cityOptions.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    No cities available
                  </SelectItem>
                ) : (
                  cityOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {gpsStatus === 'ready' && !gpsError && coordinates && (
              <p className="text-xs text-emerald-300">
                {locationSource === 'map' ? 'Map pin set.' : 'GPS checked.'}
              </p>
            )}
            {gpsError && (
              <p className={`text-xs ${gpsStatus === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
                {gpsError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="specific-location">Specific location</Label>
            <Input
              id="specific-location"
              value={specificLocation}
              onChange={(e) => {
                setSpecificLocation(e.target.value);
                setFormError('');
              }}
              placeholder="Street, landmark, or neighborhood"
              maxLength={200}
              required
              className="bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Short description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's happening?"
              rows={4}
              maxLength={220}
              required
              className="resize-none bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500"
            />
            {formError && <p className="text-xs text-red-300">{formError}</p>}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
            <Checkbox
              id="needs-rescue"
              checked={needsRescue}
              onCheckedChange={(value) => setNeedsRescue(Boolean(value))}
            />
            <div className="grid gap-1">
              <Label htmlFor="needs-rescue" className="cursor-pointer">
                Needs rescue
              </Label>
              <p className="text-xs text-muted-foreground">
                Check if immediate rescue is needed.
              </p>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full font-mono tracking-[0.18em] uppercase bg-red-500 text-white hover:bg-red-600"
            size="lg"
          >
            <Send className="w-4 h-4 mr-2" />
            Submit
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
