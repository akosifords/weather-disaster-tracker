import { useEffect, useMemo, useState } from 'react';
import { X, Siren, LocateFixed } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import type { UserReport } from './ReportForm';
import type { AlertSeverity } from './DisasterAlerts';
import { coordsKey, getApproxCoordinates } from '../lib/geo';
import { formatDateTimePH } from '../lib/datetime';
import { formatBarangayLocation } from '../lib/barangay';

interface SevereReportsOverlayProps {
  reports: UserReport[];
  onFocusHotspot: (key: string) => void;
}

const isSevere = (s: AlertSeverity) => s === 'high' || s === 'critical';

const severityStyles: Record<AlertSeverity, string> = {
  low: 'border-blue-500/40 text-blue-200 bg-blue-500/10',
  medium: 'border-yellow-500/40 text-yellow-200 bg-yellow-500/10',
  high: 'border-orange-500/40 text-orange-200 bg-orange-500/10',
  critical: 'border-red-500/40 text-red-200 bg-red-500/10',
};

export function SevereReportsOverlay({ reports, onFocusHotspot }: SevereReportsOverlayProps) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (window.innerWidth < 640) {
      setOpen(false);
    }
  }, []);

  const severeReports = useMemo(() => {
    const severe = reports.filter((r) => isSevere(r.severity));
    severe.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return severe;
  }, [reports]);

  if (severeReports.length === 0) return null;

  return (
    <div className="absolute left-3 right-3 bottom-3 top-auto z-20 -translate-y-10 sm:translate-y-0 sm:left-auto sm:right-3 sm:bottom-auto sm:top-3 sm:w-[min(420px,calc(100vw-1.5rem))]">
      {open ? (
        <Card className="shadow-lg bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm tracking-[0.18em] uppercase font-mono text-muted-foreground">
                  <Siren className="size-4 text-primary" />
                  Severe reports
                </CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">
                  High + Critical (tap a card to zoom)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="border-0 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
                  {severeReports.length}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[38vh] pr-2 sm:max-h-[52vh]">
              <div className="space-y-2">
                {severeReports.slice(0, 20).map((report) => {
                  const coords = report.coordinates ?? getApproxCoordinates(report.location);
                  const key = coordsKey(coords);
                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => onFocusHotspot(key)}
                      className="w-full rounded-xl border bg-background/35 p-3 text-left transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {formatBarangayLocation(report)}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {report.description}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge
                            variant="outline"
                            className={[
                              'capitalize border-2',
                              severityStyles[report.severity],
                            ].join(' ')}
                          >
                            {report.severity}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {report.type}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span className="font-mono tracking-[0.14em] uppercase">
                          {report.source ?? 'community'}
                        </span>
                        <span>{formatDateTimePH(report.timestamp)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono tracking-[0.14em] uppercase">Showing latest 20</span>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-[10px] tracking-[0.18em] uppercase"
                onClick={() => onFocusHotspot(coordsKey(getApproxCoordinates(severeReports[0].location)))}
              >
                <LocateFixed className="size-4 mr-2" />
                Zoom latest
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="secondary"
          className="w-full justify-between shadow-lg bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70"
          onClick={() => setOpen(true)}
        >
          <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <Siren className="size-4 text-primary" />
            Severe reports
          </span>
          <Badge className="border-0 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            {severeReports.length}
          </Badge>
        </Button>
      )}
    </div>
  );
}
