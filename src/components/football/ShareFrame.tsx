import React, { forwardRef, useState } from 'react';
import { View, type HostInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { StadiumHero } from '@/features/AuthShell';
import { fonts, radius, space } from '@/theme/tokens';

const BG = '#06140C';
const PITCH = '#22C55E';

/**
 * The one look for everything shared from MATCHDAY (results, Team of the Month, Wrapped):
 * a floodlit band with the MATCHDAY mark and a scoreboard label on top, the content, and
 * matchdayapp.org underneath. Whatever gets posted, people can tell it's from MATCHDAY.
 */
export const ShareFrame = forwardRef<HostInstance, { label: string; children: React.ReactNode }>(function ShareFrame({ label, children }, ref) {
  const [w, setW] = useState(0);
  return (
    <View ref={ref} collapsable={false} onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: BG, borderWidth: 1, borderColor: `${PITCH}44` }}>
      {w > 0 && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="none">
          <StadiumHero height={96} width={w} fadeTo={BG} ball={false} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: PITCH, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="football" size={13} color="#04130A" />
          </View>
          <Text style={{ color: '#F4F6F8', fontWeight: '800', letterSpacing: 2.5, fontSize: 12 }}>MATCHDAY</Text>
        </View>
        <Text style={{ color: PITCH, fontFamily: fonts.score, fontSize: 15, letterSpacing: 2.5 }}>{label.toUpperCase()}</Text>
      </View>
      <View style={{ paddingHorizontal: space.md }}>{children}</View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md }}>
        <Text style={{ color: '#9FB3A8', fontSize: 11, letterSpacing: 0.4 }}>Your football. Your squad.</Text>
        <Text style={{ color: '#F4F6F8', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>matchdayapp.org</Text>
      </View>
    </View>
  );
});
