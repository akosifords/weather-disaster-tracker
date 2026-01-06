import { useMemo, useState } from 'react';
import { Users, MapPin, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { UserReport } from './ReportForm';
import type { AlertSeverity } from './DisasterAlerts';
import { formatDateTimePH } from '../lib/datetime';
import { formatCoordinates, PH_CENTER } from '../lib/geo';

interface ReportsListProps {
  reports: UserReport[];
  onSelectReport?: (report: UserReport) => void;
}

const getSeverityColor = (severity: AlertSeverity) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-500 hover:bg-red-600';
    case 'high':
      return 'bg-orange-500 hover:bg-orange-600';
    case 'medium':
      return 'bg-yellow-500 hover:bg-yellow-600';
    case 'low':
      return 'bg-blue-500 hover:bg-blue-600';
    default:
      return 'bg-gray-500 hover:bg-gray-600';
  }
};

export function ReportsList({ reports, onSelectReport }: ReportsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [expandedReportIds, setExpandedReportIds] = useState<Record<string, boolean>>({});

  const mostAffected = useMemo(() => {
    const clusters: Array<{
      center: [number, number];
      sumLat: number;
      sumLng: number;
      count: number;
    }> = [];
    const radiusM = 2500;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const haversineMeters = (a: [number, number], b: [number, number]) => {
      const dLat = toRad(b[0] - a[0]);
      const dLng = toRad(b[1] - a[1]);
      const lat1 = toRad(a[0]);
      const lat2 = toRad(b[0]);
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * 6378137 * Math.asin(Math.min(1, Math.sqrt(s)));
    };

    for (const report of reports) {
      const coords = report.coordinates ?? PH_CENTER;
      let matched = false;
      for (const cluster of clusters) {
        if (haversineMeters(coords, cluster.center) <= radiusM) {
          cluster.count += 1;
          cluster.sumLat += coords[0];
          cluster.sumLng += coords[1];
          cluster.center = [
            cluster.sumLat / cluster.count,
            cluster.sumLng / cluster.count,
          ];
          matched = true;
          break;
        }
      }
      if (!matched) {
        clusters.push({
          center: coords,
          sumLat: coords[0],
          sumLng: coords[1],
          count: 1,
        });
      }
    }

    if (clusters.length === 0) return null;
    return clusters.reduce((best, current) => (current.count > best.count ? current : best));
  }, [reports]);

  const toggleExpanded = (reportId: string) => {
    setExpandedReportIds((prev) => ({
      ...prev,
      [reportId]: !prev[reportId],
    }));
  };

  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      searchTerm === '' ||
      report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reporterName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity = filterSeverity === 'all' || report.severity === filterSeverity;

    return matchesSearch && matchesSeverity;
  });

  return (
    <Card className="w-full bg-card shadow-sm">
      <div className="h-1 w-full brand-stripe-45" />
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-sm tracking-[0.18em] uppercase font-mono text-muted-foreground">
            Reports
          </CardTitle>
          <Badge variant="secondary" className="rounded-full font-mono text-[10px] tracking-[0.18em] uppercase">
            <Users className="w-3 h-3 mr-1" />
            {reports.length} Reports
          </Badge>
        </div>
        {mostAffected && (
          <div className="mb-3 rounded-lg border bg-background/50 px-3 py-2 text-[11px] text-muted-foreground">
            Most affected center: {formatCoordinates(mostAffected.center)} ({mostAffected.count})
          </div>
        )}

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {filteredReports.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-background/40 rounded-xl border">
            <MapPin className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-lg">No reports found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="rounded-xl border bg-background/40 p-5 shadow-sm transition-shadow hover:shadow-md"
                role={onSelectReport ? 'button' : undefined}
                tabIndex={onSelectReport ? 0 : undefined}
                onClick={() => onSelectReport?.(report)}
                onKeyDown={(event) => {
                  if (!onSelectReport) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectReport(report);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {report.severity !== 'low' && (
                        <Badge className={`${getSeverityColor(report.severity)} text-white border-0 shadow-md capitalize`}>
                          {report.severity}
                        </Badge>
                      )}
                      {report.source === 'pagasa' && (
                        <Badge variant="secondary" className="rounded-full font-mono text-[10px] tracking-[0.18em] uppercase">
                          PAGASA
                        </Badge>
                      )}
                    </div>
                    <p
                      className={[
                        'text-foreground/90 leading-relaxed',
                        expandedReportIds[report.id] ? '' : 'line-clamp-2',
                      ].join(' ')}
                    >
                      {report.description}
                    </p>
                    {report.description.length > 140 && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(report.id)}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClickCapture={(event) => event.stopPropagation()}
                        className="mt-2 text-xs uppercase tracking-[0.18em] font-mono text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {expandedReportIds[report.id] ? 'Less' : 'More'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-foreground/70" />
                      {report.reporterName}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-foreground/70" />
                      {formatCoordinates(report.coordinates)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTimePH(report.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
