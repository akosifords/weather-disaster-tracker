import { TriangleAlert, Flame, CloudLightning, Wind, CloudRain, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { formatDateTimePH } from '../lib/datetime';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertType = 'flood' | 'fire' | 'storm' | 'wind' | 'other';

export interface DisasterAlert {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  severity: AlertSeverity;
  location: string;
  timestamp: Date;
  active: boolean;
}

interface DisasterAlertsProps {
  alerts: DisasterAlert[];
  onDismiss?: (id: string) => void;
}

const getAlertIcon = (type: AlertType) => {
  switch (type) {
    case 'flood':
      return CloudRain;
    case 'fire':
      return Flame;
    case 'storm':
      return CloudLightning;
    case 'wind':
      return Wind;
    default:
      return TriangleAlert;
  }
};

const getSeverityColor = (severity: AlertSeverity) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-500';
    case 'high':
      return 'bg-orange-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'low':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
};

export function DisasterAlerts({ alerts, onDismiss }: DisasterAlertsProps) {
  const activeAlerts = alerts.filter(alert => alert.active);

  return (
    <Card className="w-full bg-card shadow-sm">
      <div className="h-1 w-full brand-stripe-45" />
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm tracking-[0.18em] uppercase font-mono text-muted-foreground">
            Active alerts (emergency)
          </CardTitle>
          <Badge variant="secondary" className="rounded-full font-mono text-[10px] tracking-[0.18em] uppercase">
            {activeAlerts.length} Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {activeAlerts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-background/40 rounded-xl border">
            <TriangleAlert className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-lg">No active alerts in your area</p>
            <p className="text-sm mt-1">You're all clear!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map((alert) => {
              const AlertIcon = getAlertIcon(alert.type);
              return (
                <div
                  key={alert.id}
                  className="relative flex gap-4 rounded-xl border bg-background/40 p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${getSeverityColor(alert.severity)}`} />

                  <div className="flex size-11 flex-shrink-0 items-center justify-center rounded-xl border bg-background/35">
                    <AlertIcon className="size-5 text-foreground/85" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{alert.title}</h4>
                          <Badge 
                            variant="outline" 
                            className={`capitalize border-2 ${
                              alert.severity === 'critical' ? 'border-red-500/50 text-red-200 bg-red-500/15' :
                              alert.severity === 'high' ? 'border-orange-500/50 text-orange-200 bg-orange-500/15' :
                              alert.severity === 'medium' ? 'border-yellow-500/50 text-yellow-200 bg-yellow-500/15' :
                              'border-blue-500/50 text-blue-200 bg-blue-500/15'
                            }`}
                          >
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {alert.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            {alert.location}
                          </span>
                          <span>{formatDateTimePH(alert.timestamp)}</span>
                        </div>
                      </div>
                      {onDismiss && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDismiss(alert.id)}
                          className="flex-shrink-0 hover:bg-red-500/15 hover:text-red-200"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}