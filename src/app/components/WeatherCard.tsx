import { Cloud, CloudRain, CloudSnow, Sun, Wind, Thermometer, Droplets, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  visibility: number;
  feelsLike: number;
}

interface WeatherCardProps {
  weather: WeatherData;
}

const getWeatherIcon = (condition: string) => {
  const conditionLower = condition.toLowerCase();
  if (conditionLower.includes('rain')) return CloudRain;
  if (conditionLower.includes('snow')) return CloudSnow;
  if (conditionLower.includes('cloud')) return Cloud;
  if (conditionLower.includes('sun') || conditionLower.includes('clear')) return Sun;
  return Cloud;
};

export function WeatherCard({ weather }: WeatherCardProps) {
  const WeatherIcon = getWeatherIcon(weather.condition);

  return (
    <Card className="w-full bg-card shadow-sm overflow-hidden">
      <div className="h-1 w-full brand-stripe-45" />
      <CardHeader className="border-b pb-4 relative">
        <div className="pointer-events-none absolute inset-0 opacity-[0.10] bg-[radial-gradient(circle_at_1px_1px,rgba(250,250,250,0.9)_1px,transparent_0)] [background-size:18px_18px]" />
        <CardTitle className="text-sm tracking-[0.18em] uppercase font-mono text-muted-foreground">
          Current conditions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{weather.location}</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-5xl font-semibold tracking-tight">
                  {weather.temperature}°
                </span>
                <span className="text-lg text-muted-foreground">C</span>
              </div>
              <p className="mt-2 text-sm">{weather.condition}</p>
            </div>
            <div className="relative flex size-16 items-center justify-center rounded-2xl border bg-background/40 overflow-hidden">
              <div className="absolute inset-0 opacity-[0.9] brand-glow" />
              <WeatherIcon className="size-10 text-foreground/85" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="flex items-center gap-3 rounded-xl border bg-background/40 p-3">
              <Thermometer className="w-5 h-5 text-foreground/70" />
              <div>
                <p className="text-xs text-muted-foreground font-mono tracking-[0.12em] uppercase">Feels like</p>
                <p className="text-lg font-medium">{weather.feelsLike}°C</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-background/40 p-3">
              <Droplets className="w-5 h-5 text-foreground/70" />
              <div>
                <p className="text-xs text-muted-foreground font-mono tracking-[0.12em] uppercase">Humidity</p>
                <p className="text-lg font-medium">{weather.humidity}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-background/40 p-3">
              <Wind className="w-5 h-5 text-foreground/70" />
              <div>
                <p className="text-xs text-muted-foreground font-mono tracking-[0.12em] uppercase">Wind speed</p>
                <p className="text-lg font-medium">{weather.windSpeed} km/h</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-background/40 p-3">
              <Eye className="w-5 h-5 text-foreground/70" />
              <div>
                <p className="text-xs text-muted-foreground font-mono tracking-[0.12em] uppercase">Visibility</p>
                <p className="text-lg font-medium">{weather.visibility} km</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}