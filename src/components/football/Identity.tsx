import React from 'react';
import { View } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';
import { COUNTRY_BY_CODE } from '@/data/countries';
import { CLUB_BY_ID, type Club } from '@/data/clubs';
import { Text } from '@/components/ui';

/** A country flag (3:2) from the bundled set, with a hairline edge so white flags still show. */
export function Flag({ code, height = 16 }: { code: string | null | undefined; height?: number }) {
  const c = code ? COUNTRY_BY_CODE[code] : null;
  if (!c) return null;
  const width = Math.round(height * 1.5);
  return (
    <View accessible accessibilityLabel={c.name} style={{ width, height, borderRadius: 2, overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)' }}>
      <SvgXml xml={c.svg} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
    </View>
  );
}

/** Light text on dark colours, dark text on light ones. */
function ink(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111111' : '#FFFFFF';
}

/**
 * A club shown as a simple shield in its colours with its short name. Deliberately not the
 * official crest (those are trademarks).
 */
export function ClubShield({ club, size = 28 }: { club: Club | string | null | undefined; size?: number }) {
  const c = typeof club === 'string' ? CLUB_BY_ID[club] : club;
  if (!c) return null;
  const w = size * 0.86;
  return (
    <View accessible accessibilityLabel={`Supports ${c.name}`} style={{ width: w, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={w} height={size} viewBox="0 0 86 100" style={{ position: 'absolute' }}>
        <Path d="M43 2 L84 14 V48 C84 74 66 90 43 98 C20 90 2 74 2 48 V14 Z" fill={c.primary} stroke={c.secondary} strokeWidth={5} />
        <Path d="M2 62 C20 56 66 56 84 62 V48 C84 50 2 50 2 48 Z" fill={c.secondary} opacity={0.9} />
      </Svg>
      <Text style={{ fontSize: Math.max(7, size * 0.26), lineHeight: Math.max(8, size * 0.3), fontWeight: '800', color: ink(c.primary), marginTop: -size * 0.16, letterSpacing: 0.2 }}>
        {c.short}
      </Text>
    </View>
  );
}
