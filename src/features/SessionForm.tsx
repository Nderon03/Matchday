/**
 * Create / edit session form. Only the essentials: Optimised for speed: one control per choice (swipe through),
 * a calendar and a typed time, sensible defaults, prefill from templates, duplicates and groups.
 */
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Row, SectionTitle, SwipeSelect, Text, useToast } from '@/components/ui';
import { PeoplePicker } from '@/components/football/PeoplePicker';
import { useFriends, useMyGroups, type PublicProfile } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { q, rpc } from '@/lib/api';
import { fieldErrors, sessionSchema } from '@/domain/validation';
import { formatPence, poundsToPence } from '@/domain/format';
import { DURATIONS, combine, dayLabel, isValidTime, nextDays, tidyTime, typeTime } from '@/features/sessionDates';
import { DatePickerSheet } from '@/features/DatePickerSheet';
import { lookupPostcode, normalisePostcode, type Place } from '@/lib/postcodes';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { toggleIn } from '@/domain/sets';
import { useAuth } from '@/providers/AuthProvider';
import { usePriceLabel } from '@/hooks/useFees';
import type { PaymentMode, Session, SessionVisibility } from '@/types/db';

export interface SessionFormInitial {
  name?: string;
  group_id?: string | null;
  starts_at?: string;
  duration_minutes?: number;
  location?: string | null;
  venue?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  format_size?: number;
  max_attendance?: number;
  visibility?: SessionVisibility;
  description?: string | null;
  payment_mode?: PaymentMode;
  price_pence?: number;
  invitee_ids?: string[];
  template_id?: string | null;
}

export function SessionForm({ initial, editing }: { initial?: SessionFormInitial; editing?: Session }) {
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const groups = useMyGroups();
  const friends = useFriends();
  const { userId } = useAuth();
  const priceLabel = usePriceLabel();

  const startDefault = initial?.starts_at ? new Date(initial.starts_at) : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [groupId, setGroupId] = useState<string | null>(initial?.group_id ?? null);
  const [date, setDate] = useState<Date>(startDefault ?? nextDays(2)[1]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [time, setTime] = useState(startDefault ? `${String(startDefault.getHours()).padStart(2, '0')}:${String(startDefault.getMinutes()).padStart(2, '0')}` : '19:00');
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 60);
  const [format, setFormat] = useState(initial?.format_size ?? 5);
  // a 5-a-side is 10 players, 6-a-side 12 and so on (an existing game keeps its size unless the format changes)
  const maxAttendance = editing && format === (initial?.format_size ?? format) && initial?.max_attendance ? initial.max_attendance : format * 2;
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [postcode, setPostcode] = useState(initial?.postcode ?? '');
  // the looked-up place for the postcode (coordinates let players search by distance)
  const [place, setPlace] = useState<Place | null>(
    initial?.postcode && initial.latitude != null && initial.longitude != null
      ? { label: initial.postcode, postcode: initial.postcode, latitude: initial.latitude, longitude: initial.longitude } : null);
  const [placeState, setPlaceState] = useState<'idle' | 'checking' | 'ok' | 'unknown'>(place ? 'ok' : 'idle');
  const checkPostcode = async (value: string) => {
    if (!normalisePostcode(value)) { setPlace(null); setPlaceState(value.trim() ? 'unknown' : 'idle'); return; }
    setPlaceState('checking');
    const found = await lookupPostcode(value);
    setPlace(found);
    setPlaceState(found ? 'ok' : 'unknown');
    // the area comes from the postcode (shown on the game and used by "Find a game")
    if (found?.area) setLocation(found.area);
  };
  const [visibility, setVisibility] = useState<SessionVisibility>(initial?.visibility ?? (initial?.group_id ? 'group' : 'private'));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initial?.payment_mode ?? 'free');
  const [price, setPrice] = useState(initial?.price_pence ? (initial.price_pence / 100).toFixed(2) : '');
  const [invitees, setInvitees] = useState<Set<string>>(new Set(initial?.invitee_ids ?? []));
  // the star: keep these settings as a preset to start from next time (Create → Presets)
  const [savePreset, setSavePreset] = useState(false);
  const [notesOpen, setNotesOpen] = useState(!!initial?.description);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const groupMembers = useQuery({
    queryKey: ['group', groupId, 'members-lite'],
    enabled: !!groupId,
    queryFn: () => q<any[]>(supabase.from('group_members').select('profile:profiles(id, username, display_name, avatar_url, position)').eq('group_id', groupId!)),
  });

  // keep max attendance sensible when the format changes

  const people = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    for (const f of friends.data?.friends ?? []) map.set(f.id, f);
    for (const m of groupMembers.data ?? []) if (m.profile) map.set(m.profile.id, m.profile);
    if (userId) map.delete(userId); // the host is in the squad automatically
    return [...map.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [friends.data, groupMembers.data, userId]);

  const selectGroup = (id: string | null) => {
    setGroupId(id);
    if (id && visibility === 'private') setVisibility('group');
    if (!id && visibility === 'group') setVisibility('private');
  };

  const submit = async () => {
    const pricePence = paymentMode === 'free' ? 0 : poundsToPence(price) ?? -1;
    if (!isValidTime(tidyTime(time))) return setErrors({ time: 'Enter a time like 19:30' });
    if (pricePence < 0) return setErrors({ price_pence: 'Enter an amount like 6 or 6.50' });
    const startsAt = combine(date, tidyTime(time));
    const payload = {
      name, starts_at: startsAt, duration_minutes: duration, location: location || undefined, venue: venue || undefined, postcode: place?.postcode ?? '',
      format_size: format, max_attendance: maxAttendance, visibility, description: description || undefined,
      payment_mode: paymentMode, price_pence: pricePence, group_id: groupId, invitee_ids: [...invitees],
    };
    const parsed = sessionSchema.safeParse(payload);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      if (errs.postcode && postcode.trim()) errs.postcode = placeState === 'checking' ? 'Still checking the postcode…' : 'We couldn’t find that postcode. Check it and try again.';
      return setErrors(errs);
    }
    setErrors({});
    setBusy(true);
    try {
      const body = {
        ...payload,
        starts_at: startsAt.toISOString(),
        latitude: place?.latitude ?? null,
        longitude: place?.longitude ?? null,
        template_id: initial?.template_id ?? null,
      };
      if (editing) {
        await rpc('update_session', { p_session: editing.id, p: body });
        const newInvites = [...invitees].filter((id) => !(initial?.invitee_ids ?? []).includes(id));
        if (newInvites.length) await rpc('invite_to_session', { p_session: editing.id, p_users: newInvites });
        qc.invalidateQueries({ queryKey: ['session', editing.id] });
        toast.success('Session updated');
        router.back();
      } else {
        const id = await rpc<string>('create_session', { p: body });
        if (savePreset) {
          await rpc('save_session_as_template', { p_session: id, p_name: name, p_recurrence: 'none', p_auto: false });
          qc.invalidateQueries({ queryKey: ['templates'] });
        }
        qc.invalidateQueries({ queryKey: ['sessions'] });
        qc.invalidateQueries({ queryKey: ['home'] });
        toast.success(`Session created${invitees.size ? ` · ${invitees.size} invited` : ''}${savePreset ? ' · saved as a preset' : ''}`);
        router.replace(`/session/${id}`);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const groupOptions = [{ value: null as string | null, label: 'No group', icon: 'person-outline' as const }, ...(groups.data ?? []).map((g) => ({ value: g.id as string | null, label: g.name, icon: 'people-outline' as const }))];
  const visibilityOptions = [
    { value: 'private' as SessionVisibility, label: 'Invite only', icon: 'lock-closed-outline' as const, detail: 'Only people you invite can see and join.' },
    ...(groupId ? [{ value: 'group' as SessionVisibility, label: 'Group', icon: 'people-outline' as const, detail: 'Members of the group can see and join.' }] : []),
    { value: 'public' as SessionVisibility, label: 'Public', icon: 'globe-outline' as const, detail: 'Anyone on MATCHDAY can find it in “Find a game” and join.' },
  ];
  const pence = poundsToPence(price);

  return (
    <View style={{ gap: space.xl }}>
      <Input label="Session name" value={name} onChangeText={setName} placeholder="e.g. Wednesday Football" maxLength={60} error={errors.name} />

      {!!groups.data?.length && <SwipeSelect label="Group" value={groupId} onChange={selectGroup} options={groupOptions} />}

      <View style={{ gap: space.xs }}>
        <Text variant="smallStrong" tone="muted">Kick-off</Text>
        <Row gap={space.sm}>
          <Pressable onPress={() => setCalendarOpen(true)} accessibilityRole="button" accessibilityLabel={`Date: ${dayLabel(date)}. Change`}
            style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 52, paddingHorizontal: space.md,
              borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.elevated : colors.surfaceAlt })}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{dayLabel(date)}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textFaint} />
          </Pressable>
          <View style={{ width: 118, flexDirection: 'row', alignItems: 'center', gap: 6, height: 52, paddingHorizontal: space.md,
            borderRadius: radius.md, borderWidth: 1, borderColor: errors.time ? colors.danger : colors.border, backgroundColor: colors.surfaceAlt }}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <TextInput value={time} onChangeText={(v) => setTime(typeTime(v))} onBlur={() => setTime(tidyTime(time))}
              placeholder="19:00" placeholderTextColor={colors.textFaint} keyboardType="number-pad" maxLength={5} accessibilityLabel="Kick-off time"
              style={[{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '700', height: 50, padding: 0, includeFontPadding: false }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
          </View>
        </Row>
        {!!(errors.time || errors.starts_at) && <Text variant="caption" tone="danger">{errors.time ?? errors.starts_at}</Text>}
        {calendarOpen && <DatePickerSheet visible value={date} onClose={() => setCalendarOpen(false)} onPick={setDate} />}
      </View>

      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <SwipeSelect compact label="Format" value={format} onChange={setFormat}
          options={[5, 6, 7, 8, 9, 10, 11].map((n) => ({ value: n, label: `${n}-a-side` }))} />
        <SwipeSelect compact label="Length" value={duration} onChange={setDuration}
          options={DURATIONS.some((d) => d.value === duration) ? DURATIONS : [...DURATIONS, { value: duration, label: `${duration} min` }].sort((a, b) => a.value - b.value)} />
      </Row>
      <Text variant="caption" tone="faint" style={{ marginTop: -space.md }}>Up to {maxAttendance} players; anyone else joins the waiting list.</Text>

      <View style={{ gap: space.md }}>
        <Input label="Venue" value={venue} onChangeText={setVenue} placeholder="e.g. Powerleague Mill Hill, Pitch 3" icon="business-outline" />
        <Input label="Postcode" value={postcode} autoCapitalize="characters" autoCorrect={false} maxLength={9} icon="navigate-outline" placeholder="e.g. NW7 2EU"
          onChangeText={(v) => { setPostcode(v); if (normalisePostcode(v)) checkPostcode(v); else { setPlace(null); setPlaceState('idle'); } }}
          onBlur={() => checkPostcode(postcode)}
          error={errors.postcode ?? (placeState === 'unknown' ? 'We couldn’t find that postcode. Check it and try again.' : null)}
          hint={placeState === 'checking' ? 'Checking…' : placeState === 'ok' && place ? `✓ ${place.postcode}${place.area ? ` · ${place.area}` : ''}` : 'For directions, the forecast and nearby search.'} />
      </View>

      <View style={{ gap: space.sm }}>
        <SwipeSelect label="Payment" value={paymentMode} onChange={setPaymentMode} options={[
          { value: 'free', label: 'Free', icon: 'happy-outline', detail: 'No payment in the app.' },
          { value: 'upfront', label: 'Pay upfront', icon: 'card-outline', detail: 'Players’ cards are held when they join (from 6 days before) and only charged once you confirm the game happened.' },
          { value: 'after', label: 'Pay after', icon: 'receipt-outline', detail: 'Players get a payment request once you complete the session.' },
        ]} />
        {paymentMode !== 'free' && (
          <>
            <Input label="Your price per player (£)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="e.g. 6.00" icon="cash-outline" error={errors.price_pence} />
            {!!pence && (
              <Text variant="caption" tone="muted">
                You receive {formatPence(pence)} · players pay {priceLabel(pence).total} (incl. {formatPence(priceLabel(pence).feePence)} booking fee). Payouts go to your Stripe account (Settings → Payouts).
              </Text>
            )}
          </>
        )}
      </View>

      <View style={{ gap: space.xs }}>
        <SwipeSelect label="Who can join" value={visibility} onChange={setVisibility} options={visibilityOptions} />
        {!!errors.visibility && <Text variant="caption" tone="danger">{errors.visibility}</Text>}
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle title={`Invite players${invitees.size ? ` · ${invitees.size}` : ''}`} action={people.length ? (invitees.size === people.length ? 'Clear' : 'Select all') : undefined}
          onAction={() => setInvitees(invitees.size === people.length ? new Set() : new Set(people.map((p) => p.id)))} />
        <PeoplePicker
          people={people}
          selected={invitees}
          disabledIds={editing ? new Set(initial?.invitee_ids ?? []) : undefined}
          onToggle={(id) => setInvitees((s) => toggleIn(s, id))}
        />
      </View>

      {notesOpen ? (
        <Input label="Notes" value={description} onChangeText={setDescription} multiline placeholder="e.g. Bring both bibs. Astro boots only." maxLength={1000} />
      ) : (
        <Pressable onPress={() => setNotesOpen(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs }}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text variant="bodyStrong" tone="primary">Add notes</Text>
        </Pressable>
      )}

      <Text variant="caption" tone="faint">
        Players can drop out until 24 hours before kick-off; after that they tap to let you know and you take them off. Man of the Match is voted once for the whole session.
      </Text>

      <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
        {!editing && !initial?.template_id && (
          <Pressable onPress={() => setSavePreset((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: savePreset }}
            accessibilityLabel="Save as a preset"
            style={({ pressed }) => ({ width: 56, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
              borderColor: savePreset ? colors.warning : colors.border, backgroundColor: pressed ? colors.elevated : savePreset ? `${colors.warning}22` : colors.surfaceAlt })}>
            <Ionicons name={savePreset ? 'star' : 'star-outline'} size={22} color={savePreset ? colors.warning : colors.textMuted} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
      <Button
        title={editing ? 'Save changes' : `Create session${paymentMode !== 'free' && pence ? ` · players pay ${priceLabel(pence).total}` : ''}`}
        size="lg"
        loading={busy}
        onPress={submit}
      />
        </View>
      </Row>
      {savePreset && <Text variant="caption" tone="muted" style={{ marginTop: -space.md }}>★ Saved as a preset too: start from it next time in Create.</Text>}
    </View>
  );
}
