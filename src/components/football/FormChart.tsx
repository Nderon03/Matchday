import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { Text } from '@/components/ui';

/** Rating history line chart (1–10 scale). */
export function RatingChart({ points, height = 140 }: { points: { rating: number; played_at: string }[]; height?: number }) {
  const { colors } = useTheme();
  const [width, setWidth] = React.useState(0);
  if (points.length < 2) {
    return <Text tone="muted" variant="small">Rating history appears after two rated sessions.</Text>;
  }
  const pad = 24;
  const min = Math.max(1, Math.floor(Math.min(...points.map((p) => p.rating)) - 1));
  const max = Math.min(10, Math.ceil(Math.max(...points.map((p) => p.rating)) + 1));
  const x = (i: number) => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = (v: number) => pad / 2 + ((max - v) * (height - pad)) / Math.max(1, max - min);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.rating)}`).join(' ');
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityLabel={`Rating history: ${points.map((p) => p.rating.toFixed(1)).join(', ')}`}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[min, (min + max) / 2, max].map((v) => (
            <React.Fragment key={v}>
              <Line x1={pad} x2={width - pad} y1={y(v)} y2={y(v)} stroke={colors.border} strokeDasharray="3,4" />
              <SvgText x={2} y={y(v) + 4} fill={colors.textFaint} fontSize={10} fontFamily={fonts.medium}>{v.toFixed(0)}</SvgText>
            </React.Fragment>
          ))}
          <Path d={d} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
          {points.map((p, i) => (
            <Circle key={i} cx={x(i)} cy={y(p.rating)} r={i === points.length - 1 ? 5 : 3} fill={i === points.length - 1 ? colors.primary : colors.surface} stroke={colors.primary} strokeWidth={2} />
          ))}
        </Svg>
      )}
    </View>
  );
}

/** Compact last-five form pills. */
export function FormPills({ ratings }: { ratings: (number | null)[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {ratings.map((r, i) => {
        const tone = r == null ? colors.elevated : r >= 7.5 ? colors.success : r >= 6 ? colors.warning : colors.danger;
        return (
          <View key={i} style={{ minWidth: 34, paddingHorizontal: 4, height: 22, borderRadius: 6, backgroundColor: r == null ? colors.elevated : `${tone}26`, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" color={r == null ? colors.textFaint : tone}>{r == null ? '–' : r.toFixed(1)}</Text>
          </View>
        );
      })}
    </View>
  );
}
