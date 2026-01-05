import React, { useEffect, useMemo, useState } from 'react';
import type { DisasterAlert } from './components/DisasterAlerts';
import type { UserReport } from './components/ReportForm';
import { MapView } from './components/MapView';
// SevereReportsOverlay intentionally hidden on main map view
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { useReports } from './hooks/useReports';
import { useAreaSeverity } from './hooks/useAreaSeverity';
import { AreaSeverityOverlay } from './components/AreaSeverityOverlay';
import { ReportForm } from './components/ReportForm';
import { useSubmitReport } from './hooks/useSubmitReport';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { Button } from './components/ui/button';
import { Plus } from 'lucide-react';
import { coordsKey, getApproxCoordinates } from './lib/geo';
import { coordsForReport } from './lib/barangay';
import type { AreaSeverityRanking } from '../../api/_lib/types';
import { ReportsList } from './components/ReportsList';

// Mock disaster alerts
const initialAlerts: DisasterAlert[] = [
  {
    id: '1',
    type: 'storm',
    title: 'Severe Thunderstorm Warning (PAGASA)',
    description:
      'Heavy rainfall with gusty winds expected. Avoid flood-prone roads and secure loose objects.',
    severity: 'high',
    location: 'Metro Manila',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    active: true,
  },
  {
    id: '2',
    type: 'flood',
    title: 'Flood Advisory',
    description:
      'Rising water levels possible in low-lying areas. Monitor local advisories and avoid unnecessary travel.',
    severity: 'medium',
    location: 'Marikina, Metro Manila',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    active: true,
  },
];

// Mock user reports
const initialReports: UserReport[] = [
  {
    id: '1',
    reporterName: 'John Smith',
    location: 'Marikina, Metro Manila',
    type: 'flood',
    severity: 'medium',
    description:
      'Street flooding near a main road. Water ~15–20cm deep, cars slowing down. Drainage seems overwhelmed.',
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    source: 'community',
  },
  {
    id: '2',
    reporterName: 'Sarah Johnson',
    location: 'Tacloban City, Leyte',
    type: 'storm',
    severity: 'high',
    description:
      'Strong winds with intermittent heavy rain. Some debris on roads and brief power fluctuations reported.',
    timestamp: new Date(Date.now() - 1000 * 60 * 20),
    source: 'community',
  },
  {
    id: '3',
    reporterName: 'Mike Chen',
    location: 'Cebu City, Cebu',
    type: 'wind',
    severity: 'low',
    description:
      'Moderate winds with light rain. Minor debris reported, generally passable roads.',
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    source: 'community',
  },
];

export default function App() {
  const [alerts, setAlerts] = useState<DisasterAlert[]>(initialAlerts);
  const [mapFocusKey, setMapFocusKey] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<[number, number] | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'reports'>('map');
  const reportsQuery = useMemo(() => ({ limit: 100 }), []);
  const areaSeverityQuery = useMemo(() => ({ timeWindowHours: 168, limit: 20 }), []);
  const { submitReport, submitting } = useSubmitReport();

  // Fetch community reports with Realtime subscriptions
  // Fallback to mock data if backend is not available
  const { reports: dbReports, error: reportsError } = useReports({
    query: reportsQuery,
    enableRealtime: true, // Enable Supabase Realtime (WebSocket subscriptions for instant updates)
  });

  // Use database reports if available, otherwise fall back to initial mock data
  const communityReports = dbReports.length > 0 ? dbReports : initialReports;

  // Fetch area severity rankings (no auto-refresh, will update when new reports arrive via Realtime)
  const { rankings: areaSeverity, loading: severityLoading } = useAreaSeverity({
    query: areaSeverityQuery, // Last 7 days, top 20 areas
    autoRefresh: false, // Disabled - will refetch when Realtime event triggers
  });

  // Show error toast only once when report fetching fails
  useEffect(() => {
    if (reportsError) {
      console.warn('Backend not available, using mock data:', reportsError.message);
      // Only show toast in production
      const isProd = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD ?? false;
      if (isProd) {
        toast.error('Failed to load community reports', {
          description: reportsError.message,
        });
      }
    }
  }, [reportsError]);

  // Community reports are already enriched by the backend
  const allReports = communityReports;

  // (Intentionally map-first landing; dashboard/report submission UI removed from landing)
  const handleSubmitReport = async (report: Omit<UserReport, 'id' | 'timestamp'>) => {
    const saved = await submitReport(report);
    if (saved) {
      toast.success('Report submitted', {
        description: 'Thanks for helping keep your community informed.',
      });
      setReportOpen(false);
      setPickedCoords(null);
    } else {
      toast.error('Report submission failed', {
        description: 'Please try again in a moment.',
      });
    }
  };

  const handleRequestMapPick = () => {
    setReportOpen(false);
    setPickedCoords(null);
    setPickMode(true);
    setActiveTab('map');
  };

  const handlePickedLocation = (coords: [number, number]) => {
    setPickedCoords(coords);
    setPickMode(false);
    setReportOpen(true);
  };

  const handleCancelPick = () => {
    setPickMode(false);
  };
  const handleFocusArea = (ranking: AreaSeverityRanking) => {
    const normalize = (value: string) => value.trim().toLowerCase();
    const normalizeCity = (value: string) => normalize(value.replace(/^City of\s+/i, ''));
    const target = normalize(ranking.areaIdentifier);

    const match = allReports.reduce<UserReport | null>((best, report) => {
      const city = report.city ? normalizeCity(report.city) : '';
      const barangay = report.barangay ? normalize(report.barangay) : '';
      const location = normalize(report.location ?? '');
      const label = barangay && city ? `${barangay}, ${city}` : city;

      const isDirect =
        (barangay && city && label === target) ||
        (!barangay && city && city === target) ||
        (location && (location.includes(target) || target.includes(location)));

      if (!isDirect) return best;
      if (!best) return report;
      return report.timestamp > best.timestamp ? report : best;
    }, null);

    if (match) {
      setMapFocusKey(coordsKey(coordsForReport(match)));
      return;
    }

    setMapFocusKey(coordsKey(getApproxCoordinates(ranking.areaIdentifier)));
  };

  return (
    <div className="h-screen min-h-[100dvh] bg-background text-foreground flex flex-col [background-image:radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.05)_1px,transparent_0)] [background-size:22px_22px]">
      <Toaster />
      
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-30">
        {/* Caution stripe */}
        <div className="h-1 w-full brand-stripe-45" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
            PH Flood Disaster Tracker
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={activeTab === 'map' ? 'secondary' : 'ghost'}
              size="sm"
              className="font-mono text-[10px] tracking-[0.18em] uppercase"
              onClick={() => setActiveTab('map')}
            >
              Map
            </Button>
            <Button
              type="button"
              variant={activeTab === 'reports' ? 'secondary' : 'ghost'}
              size="sm"
              className="font-mono text-[10px] tracking-[0.18em] uppercase"
              onClick={() => setActiveTab('reports')}
            >
              Reports
            </Button>
            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="font-mono text-[10px] tracking-[0.18em] uppercase"
                  disabled={submitting}
                >
                  <Plus className="mr-2 size-4" />
                  Report
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 text-white border border-neutral-800 p-0 sm:max-w-2xl">
                <DialogHeader className="space-y-2 px-4 pt-6">
                  <div className="flex items-center justify-between">
                    <DialogTitle className="font-mono tracking-[0.28em] uppercase text-xs text-neutral-400">
                      Emergency Report
                    </DialogTitle>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight text-white">
                        Emergency Report
                      </h2>
                      <p className="mt-1 text-sm text-neutral-400">
                        Quick details. Mark rescue if needed.
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-red-200">
                      Priority Signal
                    </div>
                  </div>
                </DialogHeader>
                <div className="px-4 pb-6">
                  <div className="mb-4 grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-xs text-neutral-400">
                    <div className="font-mono uppercase tracking-[0.18em] text-neutral-500">Safety</div>
                    <div>Only submit if safe. For life-threatening emergencies, contact local authorities.</div>
                  </div>
                  <ReportForm
                    onSubmit={handleSubmitReport}
                    onRequestMapPick={handleRequestMapPick}
                    pickLocation={pickedCoords}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'map' ? (
          <div className="relative h-full w-full">
            <MapView
              reports={allReports}
              variant="full"
              visualization="barangay"
              focusKey={mapFocusKey}
              pickMode={pickMode}
              pickLocation={pickedCoords}
              onPickLocation={handlePickedLocation}
            />
            <AreaSeverityOverlay rankings={areaSeverity} onFocusArea={handleFocusArea} loading={severityLoading} />
            {pickMode && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
                <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-red-500/40 bg-neutral-900/90 px-4 py-2 text-xs text-red-100 shadow-lg">
                  <span className="font-mono uppercase tracking-[0.18em]">Tap map to drop pin</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 px-3 text-[10px] font-mono uppercase tracking-[0.18em]"
                    onClick={handleCancelPick}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full w-full overflow-auto p-4 md:p-6">
            <ReportsList reports={allReports} />
          </div>
        )}
      </main>
    </div>
  );
}
