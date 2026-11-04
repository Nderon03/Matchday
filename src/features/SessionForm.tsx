/**
 * Create / edit session form. Optimised for speed: sensible defaults, chips instead of
 * pickers, prefill from templates, duplicates and groups.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, Switch, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, Input, Row, SectionTitle, Segmented, Stepper, Text, useToast } from '@/components/ui';
import { PeoplePicker } from '@/components/football/PeoplePicker';
import { useFriends, useMyGroups, type PublicProfile } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { q, rpc } from '@/lib/api';
import { fieldErrors, sessionSchema } from '@/domain/validation';
import { formatPence, poundsToPence } from '@/domain/format';
import { combine, dayLabel, isValidTime, nextDays, sameDay } from '@/features/sessionDates';
import { DatePickerSheet } from '@/features/DatePickerSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { toggleIn } from '@/domain/sets';
import { useAuth } from '@/providers/AuthProvider';
import { usePriceLabel } from '@/hooks/useFees';
import type { PaymentMode, Recurrence, Session, SessionVisibility } from '@/types/db';

export interface SessionFormInitial {
  name?: string;
  group_id?: string | null;
  starts_at?: string;
  duration_minutes?: number;
  location?: string | null;
  venue?: string | null;
  format_size?: number;
  max_attendance?: number;
  visibility?: SessionVisibility;
  description?: string | null;
  payment_mode?: PaymentMode;
  price_pence?: number;
  invitee_ids?: string[];
  template_id?: string | null;
  motm_mode?: 'session' | 'fixture';
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
  const daysRef = useRef<ScrollViewInstance>(null);
  const [time, setTime] = useState(startDefault ? `${String(startDefault.getHours()).padStart(2, '0')}:${String(startDefault.getMinutes()).padStart(2, '0')}` : '19:00');
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 60);
  const [format, setFormat] = useState(initial?.format_size ?? 5);
  const [maxAttendance, setMax] = useState(initial?.max_attendance ?? (initial?.format_size ?? 5) * 2);
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [visibility, setVisibility] = useState<SessionVisibility>(initial?.visibility ?? (initial?.group_id ? 'group' : 'private'));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initial?.payment_mode ?? 'free');
  const [price, setPrice] = useState(initial?.price_pence ? (initial.price_pence / 100).toFixed(2) : '');
  const [invitees, setInvitees] = useState<Set<string>>(new Set(initial?.invitee_ids ?? []));
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [deadlineHours, setDeadlineHours] = useState<number | null>(null);
  const [motmMode, setMotmMode] = useState<'session' | 'fixture'>(initial?.motm_mode ?? 'session');
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
    if (id && !name) setName(groups.data?.find((g) => g.id === id)?.name ?? '');
  };

  const submit = async () => {
    const pricePence = paymentMode === 'free' ? 0 : poundsToPence(price) ?? -1;
    if (!isValidTime(time)) return setErrors({ time: 'Use 24-hour time, e.g. 19:30' });
    if (pricePence < 0) return setErrors({ price_pence: 'Enter an amount like 6 or 6.50' });
    const startsAt = combine(date, time);
    const payload = {
      name, starts_at: startsAt, duration_minutes: duration, location: location || undefined, venue: venue || undefined,
      format_size: format, max_attendance: maxAttendance, visibility, description: description || undefined,
      payment_mode: paymentMode, price_pence: pricePence, group_id: groupId, invitee_ids: [...invitees],
    };
    const parsed = sessionSchema.safeParse(payload);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      const body = {
        ...payload,
        starts_at: startsAt.toISOString(),
        motm_mode: motmMode,
        template_id: initial?.template_id ?? null,
        rsvp_deadline: deadlineHours != null ? new Date(startsAt.getTime() - deadlineHours * 3600_000).toISOString() : '',
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
        if (recurrence !== 'none' || saveTemplate) {
          await rpc('save_session_as_template', { p_session: id, p_name: name, p_recurrence: recurrence, p_auto: recurrence !== 'none' });
          qc.invalidateQueries({ queryKey: ['templates'] });
        }
        qc.invalidateQueries({ queryKey: ['sessions'] });
        qc.invalidateQueries({ queryKey: ['home'] });
        toast.success(invitees.size ? `Session created · ${invitees.size} invited` : 'Session created');
        router.replace(`/session/${id}`);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const days = nextDays(14);
  const pickedLater = !days.some((d) => sameDay(d, date));

  return (
    <View style={{ gap: space.xl }}>
      <Input label="Session name" value={name} onChangeText={setName} placeholder="Wednesday Football" maxLength={60} error={errors.name} />

      {!!groups.data?.length && (
        <View style={{ gap: space.sm }}>
          <SectionTitle title="Group" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            <Chip label="No group" selected={!groupId} onPress={() => selectGroup(null)} />
            {groups.data.map((g) => <Chip key={g.id} label={g.name} selected={groupId === g.id} onPress={() => selectGroup(g.id)} />)}
          </ScrollView>
        </View>
      )}

      <View style={{ gap: space.sm }}>
        <SectionTitle title="When" />
        <ScrollView ref={daysRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {pickedLater && <Chip label={dayLabel(date)} selected onPress={() => setCalendarOpen(true)} />}
          {days.map((d) => <Chip key={d.toDateString()} label={dayLabel(d)} selected={sameDay(d, date)} onPress={() => setDate(d)} />)}
          <Chip label="📅 Pick a date" onPress={() => setCalendarOpen(true)} />
        </ScrollView>
        {calendarOpen && <DatePickerSheet visible value={date} onClose={() => setCalendarOpen(false)} onPick={(d) => { setDate(d); setTimeout(() => daysRef.current?.scrollTo({ x: 0, animated: true }), 60); }} />}
        {!!errors.starts_at && <Text variant="caption" tone="danger">{errors.starts_at}</Text>}
        <Row gap={space.sm} wrap>
          {['18:00', '19:00', '20:00', '21:00'].map((t) => <Chip key={t} label={t} selected={time === t} onPress={() => setTime(t)} />)}
          <View style={{ width: 110 }}>
            <Input value={time} onChangeText={setTime} placeholder="19:30" keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel="Kick-off time" error={errors.time} />
          </View>
        </Row>
        <Row gap={space.sm} wrap>
          {([[45, '45 min'], [60, '1 hour'], [90, '1h 30'], [120, '2 hours']] as const).map(([m, label]) => <Chip key={m} label={label} selected={duration === m} onPress={() => setDuration(m)} />)}
        </Row>
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle title="Format" />
        <Row gap={space.sm} wrap>
          {[5, 6, 7, 8, 9, 10, 11].map((n) => <Chip key={n} label={`${n}-a-side`} selected={format === n} onPress={() => { setFormat(n); if (!editing) setMax(n * 2); }} />)}
        </Row>
        <Card variant="alt">
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Maximum players</Text>
              <Text variant="small" tone="muted">Extra players join the waiting list.</Text>
            </View>
            <Stepper value={maxAttendance} onChange={setMax} min={2} max={60} label="Maximum players" />
          </Row>
        </Card>
      </View>

      <View style={{ gap: space.md }}>
        <SectionTitle title="Where" />
        <Input label="Venue" value={venue} onChangeText={setVenue} placeholder="Powerleague Shoreditch, Pitch 3" icon="business-outline" />
        <Input label="Address / area" value={location} onChangeText={setLocation} placeholder="Braithwaite St, London E1" icon="location-outline" />
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle title="Payment" />
        <Segmented value={paymentMode} onChange={setPaymentMode} options={[{ value: 'free', label: 'Free' }, { value: 'upfront', label: 'Pay upfront' }, { value: 'after', label: 'Pay after' }]} />
        {paymentMode !== 'free' && (
          <>
            <Input label="Your price per player (£)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="e.g. 6.00" icon="cash-outline" error={errors.price_pence}
              hint="This is what you receive from each player." />
            {!!poundsToPence(price) && (
              <Card variant="alt">
                <View style={{ gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="small">You receive</Text>
                    <Text variant="smallStrong">{formatPence(poundsToPence(price)!)}</Text>
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="small" tone="muted">Booking fee (paid by the player)</Text>
                    <Text variant="small" tone="muted">{formatPence(priceLabel(poundsToPence(price)!).feePence)}</Text>
                  </Row>
                  <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4 }}>
                    <Text variant="smallStrong">Each player pays</Text>
                    <Text variant="smallStrong">{priceLabel(poundsToPence(price)!).total}</Text>
                  </Row>
                  <Text variant="caption" tone="faint">The booking fee covers card processing and keeps MATCHDAY running. Players see the full price before they join.</Text>
                </View>
              </Card>
            )}
            <Text variant="caption" tone="muted">
              {paymentMode === 'upfront'
                ? 'Players authorise their card when they confirm (from 6 days before kick-off). They are only charged once you confirm the game took place. Holds are released automatically if you don’t confirm within 24 hours.'
                : 'Players get a payment request once you complete the session.'}{' '}
              Payments go straight to your Stripe account — set it up in Settings → Payouts.
            </Text>
          </>
        )}
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle title="Who can see & join" />
        <Segmented
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'private', label: 'Invite only' },
            ...(groupId ? [{ value: 'group' as const, label: 'Group' }] : []),
            { value: 'public', label: 'Public' },
          ]}
        />
        <Text variant="caption" tone="muted">
          {visibility === 'public' ? 'Anyone on MATCHDAY can find this game in “Find a game” and join, so make sure the venue and area are filled in.'
            : visibility === 'group' ? 'Members of the group can see and join.' : 'Only people you invite can see and join.'}
        </Text>
        {!!errors.visibility && <Text variant="caption" tone="danger">{errors.visibility}</Text>}
        <Row gap={space.sm} wrap>
          <Text variant="small" tone="muted">Withdrawal deadline:</Text>
          {[null, 2, 12, 24].map((h) => <Chip key={String(h)} label={h == null ? 'None' : `${h}h before`} selected={deadlineHours === h} onPress={() => setDeadlineHours(h)} />)}
        </Row>
      </View>

      <View style={{ gap: space.sm }}>
        <SectionTitle title={`Invite players${invitees.size ? ` · ${invitees.size}` : ''}`} action={people.length ? (invitees.size === people.length ? 'Clear' : 'Select all') : undefined}
          onAction={() => setInvitees(invitees.size === people.length ? new Set() : new Set(people.map((p) => p.id)))} />
        {!editing && <Text variant="caption" tone="muted">You’re in the squad automatically as host.</Text>}
        <PeoplePicker
          people={people}
          selected={invitees}
          disabledIds={editing ? new Set(initial?.invitee_ids ?? []) : undefined}
          onToggle={(id) => setInvitees((s) => toggleIn(s, id))}
        />
      </View>

      <Input label="Notes (optional)" value={description} onChangeText={setDescription} multiline placeholder="Bring both bibs. Astro boots only." maxLength={1000} />

      <View style={{ gap: space.sm }}>
        <SectionTitle title="Man of the Match" />
        <Segmented value={motmMode} onChange={setMotmMode} options={[{ value: 'session', label: 'Whole session' }, { value: 'fixture', label: 'Every game' }]} />
      </View>

      {!editing && (
        <Card variant="alt">
          <View style={{ gap: space.md }}>
            <Text variant="bodyStrong">Make it a regular game</Text>
            <Row gap={space.sm} wrap>
              {(['none', 'weekly', 'fortnightly', 'monthly'] as Recurrence[]).map((r) => (
                <Chip key={r} label={r === 'none' ? 'One-off' : r[0].toUpperCase() + r.slice(1)} selected={recurrence === r} onPress={() => setRecurrence(r)} />
              ))}
            </Row>
            {recurrence !== 'none' && (
              <Text variant="caption" tone="muted">The next game is created automatically a week ahead and the squad is invited again. Everyone confirms each week separately.</Text>
            )}
            {recurrence === 'none' && (
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="small">Save as a reusable template</Text>
                <Switch value={saveTemplate} onValueChange={setSaveTemplate} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Save as template" />
              </Row>
            )}
          </View>
        </Card>
      )}

      <Button
        title={editing ? 'Save changes' : `Create session${paymentMode !== 'free' && poundsToPence(price) ? ` · players pay ${priceLabel(poundsToPence(price)!).total}` : ''}`}
        size="lg"
        loading={busy}
        onPress={submit}
      />
    </View>
  );
}
