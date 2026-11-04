import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Row, Text } from '@/components/ui';
import { invoke } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';

interface Weather { at: string; temp_c: number; wind_mph: number; precip_mm: number | null; summary: string; icon: string }

/** Forecast for kick-off, shown once the game is within ~9 days (MET Norway, CC BY 4.0). */
export function KickoffWeather({ sessionId, startsAt, hasPlace, active }: { sessionId: string; startsAt: string; hasPlace: boolean; active: boolean }) {
  const { colors } = useTheme();
  const [now] = useState(() => Date.now());
  const ahead = new Date(startsAt).getTime() - now;
  const inRange = hasPlace && active && ahead > -3 * 3600_000 && ahead < 9 * 86400_000;
  const q = useQuery({
    queryKey: ['weather', sessionId, startsAt],
    queryFn: () => invoke<{ weather: Weather | null }>('session-weather', { session_id: sessionId }),
    enabled: inRange,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const w = q.data?.weather;
  if (!inRange || !w) return null;
  const wet = (w.precip_mm ?? 0) >= 0.2;
  return (
    <View accessible accessibilityLabel={`Forecast at kick-off: ${w.temp_c} degrees, ${w.summary}, wind ${w.wind_mph} miles per hour`}>
    <Row gap={8} style={{ alignItems: 'flex-start' }}>
      <Ionicons name={w.icon as any} size={17} color={colors.textMuted} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text>{w.temp_c}°C · {w.summary}{wet ? ` (${w.precip_mm} mm)` : ''} · wind {w.wind_mph} mph</Text>
        <Text variant="caption" tone="faint">Forecast for kick-off · MET Norway</Text>
      </View>
    </Row>
    </View>
  );
}
