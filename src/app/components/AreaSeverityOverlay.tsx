import { useEffect, useState } from 'react';
import { X, Flame } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import type { AreaSeverityRanking } from '../../../api/_lib/types';
import type { AlertSeverity } from './DisasterAlerts';
interface AreaSeverityOverlayProps {
  rankings: AreaSeverityRanking[];
  onFocusArea: (ranking: AreaSeverityRanking) => void;
  loading?: boolean;
}

const severityStyles: Record<AlertSeverity, string> = {
  low: 'border-blue-500/40 text-blue-200 bg-blue-500/10',
  medium: 'border-yellow-500/40 text-yellow-200 bg-yellow-500/10',
  high: 'border-orange-500/40 text-orange-200 bg-orange-500/10',
  critical: 'border-red-500/40 text-red-200 bg-red-500/10',
};

const severityIcons: Record<AlertSeverity, string> = {
  low: '🟦',
  medium: '🟨',
  high: '🟧',
  critical: '🟥',
};

export function AreaSeverityOverlay({ rankings, onFocusArea, loading }: AreaSeverityOverlayProps) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (window.innerWidth < 640) {
      setOpen(false);
    }
  }, []);

  // Filter to show only medium and above
  const significantRankings = rankings.filter(r =>
    r.severity !== 'low' && r.score >= 2
  );

  if (significantRankings.length === 0 && !loading) return null;

  return (
    <div className="absolute left-3 right-3 bottom-3 top-auto z-30 w-[min(380px,calc(100vw-1.5rem))] sm:left-3 sm:right-auto sm:bottom-auto sm:top-3 sm:w-[min(380px,calc(100vw-1.5rem))]">
      {open ? (
        <Card className="shadow-lg bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm tracking-[0.18em] uppercase font-mono text-muted-foreground">
                  <Flame className="size-4 text-primary" />
                  Hotspot Areas
                </CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">
                  Areas ranked by severity score
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="border-0 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
                  {significantRankings.length}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                <div className="animate-pulse">Calculating area severity...</div>
              </div>
            ) : (
              <>
                <ScrollArea className="max-h-[36vh] pr-2 sm:max-h-[48vh]">
                  <div className="space-y-2">
                    {significantRankings.slice(0, 15).map((ranking, index) => {
                      const totalReports =
                        ranking.reportCounts.critical +
                        ranking.reportCounts.high +
                        ranking.reportCounts.medium +
                        ranking.reportCounts.low;

                      return (
                        <button
                          key={`${ranking.areaIdentifier}-${index}`}
                          type="button"
                          onClick={() => onFocusArea(ranking)}
                          className="w-full rounded-xl border bg-background/35 p-3 text-left transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg leading-none">
                                  {severityIcons[ranking.severity]}
                                </span>
                                <div className="truncate text-sm font-medium">
                                  {ranking.areaIdentifier}
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="font-mono capitalize">
                                  Severity: {ranking.severity}
                                </span>
                                <span>•</span>
                                <span>
                                  {totalReports} report{totalReports !== 1 ? 's' : ''}
                                </span>
                              </div>
                              {/* Report breakdown */}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {(ranking.needsRescueCount ?? 0) > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 border-red-500/50 text-red-200 bg-red-500/15"
                                  >
                                    {ranking.needsRescueCount} rescue
                                  </Badge>
                                )}
                                {ranking.reportCounts.critical > 0 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/40 text-red-200">
                                    {ranking.reportCounts.critical} critical
                                  </Badge>
                                )}
                                {ranking.reportCounts.high > 0 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500/40 text-orange-200">
                                    {ranking.reportCounts.high} high
                                  </Badge>
                                )}
                                {ranking.reportCounts.medium > 0 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500/40 text-yellow-200">
                                    {ranking.reportCounts.medium} medium
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge
                                variant="outline"
                                className={[
                                  'capitalize border-2 font-bold',
                                  severityStyles[ranking.severity],
                                ].join(' ')}
                              >
                                {ranking.severity}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {ranking.areaType}
                              </Badge>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>

                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono tracking-[0.14em] uppercase">
                    Top {Math.min(15, significantRankings.length)} areas
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="secondary"
          className="w-full justify-between shadow-lg bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70"
          onClick={() => setOpen(true)}
        >
          <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <Flame className="size-4 text-primary" />
            Hotspot Areas
          </span>
          <Badge className="border-0 bg-primary text-primary-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            {significantRankings.length}
          </Badge>
        </Button>
      )}
    </div>
  );
}
