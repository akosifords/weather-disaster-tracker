import { useState } from 'react';
import { Send, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import type { AlertType, AlertSeverity } from './DisasterAlerts';

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
}

export function ReportForm({ onSubmit }: ReportFormProps) {
  const [reporterName, setReporterName] = useState('');
  const [location, setLocation] = useState('');
  const [barangay, setBarangay] = useState('');
  const [type, setType] = useState<AlertType>('other');
  const [severity, setSeverity] = useState<AlertSeverity>('low');
  const [description, setDescription] = useState('');
  const [needsRescue, setNeedsRescue] = useState(false);
  const [coordinates, setCoordinates] = useState<[number, number] | undefined>();
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [gpsError, setGpsError] = useState('');

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('GPS not available in this browser.');
      return;
    }

    setGpsStatus('loading');
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setCoordinates([lat, lng]);
        setLocation(`Near ${lat}, ${lng}`);
        setGpsStatus('ready');
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
    
    const resolvedLocation = location.trim() || barangay.trim();

    if (!reporterName || !resolvedLocation || !description) {
      return;
    }

    onSubmit({
      reporterName,
      location: resolvedLocation,
      barangay: barangay.trim() || undefined,
      type,
      severity,
      description,
      needsRescue,
      coordinates,
    });

    // Reset form
    setReporterName('');
    setLocation('');
    setBarangay('');
    setType('other');
    setSeverity('low');
    setDescription('');
    setNeedsRescue(false);
    setCoordinates(undefined);
    setGpsStatus('idle');
    setGpsError('');
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="John Doe"
                required
                className="bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="location">Location</Label>
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
              </div>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City or street"
                required={barangay.trim() === ''}
                className="bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500"
              />
              {gpsStatus === 'ready' && (
                <p className="text-xs text-emerald-300">GPS location added.</p>
              )}
              {gpsStatus === 'error' && gpsError && (
                <p className="text-xs text-red-300">{gpsError}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="barangay">Barangay (optional)</Label>
              <Input
                id="barangay"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                placeholder="Barangay name"
                className="bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Event Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as AlertType)}>
                <SelectTrigger id="type" className="bg-neutral-900 border-neutral-800 text-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flood">Flood</SelectItem>
                  <SelectItem value="fire">Fire</SelectItem>
                  <SelectItem value="storm">Storm</SelectItem>
                  <SelectItem value="wind">Wind</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severity Level</Label>
              <Select value={severity} onValueChange={(value) => setSeverity(value as AlertSeverity)}>
                <SelectTrigger id="severity" className="bg-neutral-900 border-neutral-800 text-white">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                      Low
                    </span>
                  </SelectItem>
                  <SelectItem value="medium">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                      Medium
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                      High
                    </span>
                  </SelectItem>
                  <SelectItem value="critical">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500"></span>
                      Critical
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's happening?"
              rows={5}
              required
              className="resize-none bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500"
            />
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
