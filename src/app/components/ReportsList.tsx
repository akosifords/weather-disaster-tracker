import { useState } from 'react';
import { Users, MapPin, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { UserReport } from './ReportForm';
import type { AlertType, AlertSeverity } from './DisasterAlerts';
import { formatDateTimePH } from '../lib/datetime';
import { formatBarangayLocation } from '../lib/barangay';

interface ReportsListProps {
  reports: UserReport[];
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

export function ReportsList({ reports }: ReportsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [expandedReportIds, setExpandedReportIds] = useState<Record<string, boolean>>({});

  const toggleExpanded = (reportId: string) => {
    setExpandedReportIds((prev) => ({
      ...prev,
      [reportId]: !prev[reportId],
    }));
  };

  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      searchTerm === '' ||
      report.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reporterName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || report.type === filterType;
    const matchesSeverity = filterSeverity === 'all' || report.severity === filterSeverity;

    return matchesSearch && matchesType && matchesSeverity;
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="flood">Flood</SelectItem>
                <SelectItem value="fire">Fire</SelectItem>
                <SelectItem value="storm">Storm</SelectItem>
                <SelectItem value="wind">Wind</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>

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
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${getSeverityColor(report.severity)} text-white border-0 shadow-md capitalize`}>
                        {report.severity}
                      </Badge>
                      <Badge variant="outline" className="capitalize border-2">
                        {report.type}
                      </Badge>
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
                      {formatBarangayLocation(report)}
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
