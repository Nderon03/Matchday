import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconButton, Row, Sheet, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { monthGrid, sameDay } from './sessionDates';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_AHEAD = 12;

/** Month calendar for picking a session date (today up to a year ahead). */
export function DatePickerSheet({ visible, value, onClose, onPick }: {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onPick: (d: Date) => void;
}) {
  const { colors } = useTheme();
  const [today] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); });
  const [view, setView] = useState(() => ({ y: value.getFullYear(), m: value.getMonth() }));
  const monthIndex = (view.y - today.getFullYear()) * 12 + (view.m - today.getMonth());
  const shift = (by: number) => setView(({ y, m }) => { const d = new Date(y, m + by, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const last = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD + 1, 0);
  const cells = monthGrid(view.y, view.m);
  const title = new Date(view.y, view.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a date">
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="chevron-back" label="Previous month" disabled={monthIndex <= 0} onPress={() => shift(-1)} />
        <Text variant="h3">{title}</Text>
        <IconButton icon="chevron-forward" label="Next month" disabled={monthIndex >= MONTHS_AHEAD} onPress={() => shift(1)} />
      </Row>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w) => <Text key={w} variant="caption" tone="muted" align="center" style={{ flex: 1 }}>{w}</Text>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const disabled = d < today || d > last;
          const selected = sameDay(d, value);
          const isToday = sameDay(d, today);
          return (
            <View key={d.toISOString()} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <Pressable
                disabled={disabled}
                onPress={() => { onPick(d); onClose(); }}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                style={{
                  flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md,
                  backgroundColor: selected ? colors.primary : 'transparent',
                  borderWidth: isToday && !selected ? 1 : 0, borderColor: colors.primary,
                }}
              >
                <Text variant="bodyStrong" color={selected ? colors.bg : disabled ? colors.textFaint : colors.text}>{d.getDate()}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}
