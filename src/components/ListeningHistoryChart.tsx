import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { HistoryItem } from '../types';

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildInitialDailyListeningSeconds(): Record<string, number> {
  const now = new Date();
  // Seed realistic baseline listening activity across the last 7 days (in seconds)
  const sampleDailySeconds = [3900, 5400, 2700, 6300, 4500, 7200, 2400];
  const initialMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = getLocalDateKey(d);
    initialMap[key] = sampleDailySeconds[6 - i] || 1800;
  }
  return initialMap;
}

interface DailyPoint {
  dateKey: string;
  dayLabel: string;
  fullDateLabel: string;
  hours: number;
  minutes: number;
  totalSeconds: number;
  isToday: boolean;
}

interface ListeningHistoryChartProps {
  dailyListeningSeconds: Record<string, number>;
  history: HistoryItem[];
  compact?: boolean;
}

const SHORT_WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatListeningSummary(totalSec: number): string {
  const totalMinutes = Math.round(totalSec / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hrs = (totalSec / 3600).toFixed(1);
  return `${hrs} h`;
}

export const ListeningHistoryChart: React.FC<ListeningHistoryChartProps> = ({
  dailyListeningSeconds,
  history,
  compact = false,
}) => {
  const { chartData, total7DaysSec, avgDailySec } = useMemo(() => {
    const now = new Date();
    const todayKey = getLocalDateKey(now);

    // Also include any listening positions recorded in history items by date
    const historySecByDate: Record<string, number> = {};
    for (const item of history) {
      const k = getLocalDateKey(new Date(item.playedAt));
      const listenedSec = Math.max(item.lastPosition || 0, 180);
      historySecByDate[k] = (historySecByDate[k] || 0) + listenedSec;
    }

    const points: DailyPoint[] = [];
    let sumSec = 0;

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = getLocalDateKey(d);
      const storedSec = dailyListeningSeconds[key] ?? 0;
      const effectiveSec = Math.max(storedSec, historySecByDate[key] ?? 0);
      sumSec += effectiveSec;

      const hours = Number((effectiveSec / 3600).toFixed(2));
      const minutes = Math.round(effectiveSec / 60);
      const isToday = key === todayKey;

      points.push({
        dateKey: key,
        dayLabel: isToday ? 'Hoy' : SHORT_WEEKDAYS[d.getDay()],
        fullDateLabel: d.toLocaleDateString('es-ES', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
        }),
        hours,
        minutes,
        totalSeconds: effectiveSec,
        isToday,
      });
    }

    return {
      chartData: points,
      total7DaysSec: sumSec,
      avgDailySec: Math.round(sumSec / 7),
    };
  }, [dailyListeningSeconds, history]);

  return (
    <div
      className={`${
        compact ? 'px-2.5 py-2' : 'px-3 sm:px-4 py-2.5 sm:py-3'
      } border-b border-slate-200 dark:border-white/[0.06] bg-slate-50/90 dark:bg-[#090A0F]/60 shrink-0 transition-colors`}
    >
      {/* Header Row: Title + Clean Unboxed Total & Daily Average */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            Horas de escucha diarias (Últimos 7 días)
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 font-mono-tabular shrink-0">
          <span>
            Total: <strong className="text-amber-600 dark:text-amber-400 font-semibold">{formatListeningSummary(total7DaysSec)}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Media: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{formatListeningSummary(avgDailySec)}/día</strong>
          </span>
        </div>
      </div>

      {/* Recharts Rounded Amber BarChart */}
      <div className={compact ? 'h-24 w-full' : 'h-32 sm:h-36 w-full'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 6, right: 4, left: -24, bottom: 0 }}
            barCategoryGap="24%"
          >
            <XAxis
              dataKey="dayLabel"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              dy={4}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748B', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              tickFormatter={(val: number) => `${val}h`}
              width={44}
              allowDecimals={true}
            />
            <Tooltip
              cursor={{ fill: 'rgba(245, 158, 11, 0.1)', radius: 6 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0].payload as DailyPoint;
                return (
                  <div className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#090A0F] border border-amber-500/40 shadow-xl text-[11px] font-mono-tabular">
                    <p className="font-sans font-semibold text-slate-800 dark:text-slate-200 capitalize">
                      {point.fullDateLabel} {point.isToday ? '(Hoy)' : ''}
                    </p>
                    <p className="text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                      {point.hours} h ({point.minutes} min)
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="hours" radius={[6, 6, 2, 2]} maxBarSize={28}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.dateKey}
                  fill={entry.isToday ? '#F59E0B' : 'rgba(245, 158, 11, 0.58)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
