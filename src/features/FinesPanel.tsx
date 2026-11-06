import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, ListItem, Loading, Row, SectionTitle, Sheet, Text, useConfirm } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { rpc } from '@/lib/api';
import { useAction } from '@/hooks/useAction';
import { formatDate, formatPence, poundsToPence } from '@/domain/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export interface LateStatus {
  enabled: boolean;
  base_pence: number;
  cap_pence: number;
  reset_after: number;
  level: number;
  on_time_streak: number;
  next_fine_pence: number;
  sessions_to_reset: number | null;
  owed_pence: number;
  fines: { id: string; session_id: string; session_name: string; date: string; level: number; amount_pence: number; original_pence: number; status: string; note: string | null }[];
}

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'neutral' | 'primary' }> = {
  owed: { label: 'Owed · added to next payment', tone: 'warning' },
  included: { label: 'On a bill', tone: 'primary' },
  paid: { label: 'Paid', tone: 'success' },
  waived: { label: 'Waived', tone: 'neutral' },
};

export function useLateStatus(groupId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['late-status', groupId],
    enabled: !!groupId && enabled,
    queryFn: () => rpc<LateStatus>('get_late_status', { p_group: groupId }),
  });
}

/** Compact explainer shown to a player before they commit to a session. */
export function LateStatusCard({ status }: { status: LateStatus }) {
  const { colors } = useTheme();
  if (!status.enabled) return null;
  return (
    <Card variant="alt">
      <View style={{ gap: 4 }}>
        <Text variant="smallStrong">Late fines apply in this group</Text>
        <Text variant="small" tone="muted">
          {status.level === 0
            ? `Arrive late and you’ll be fined ${formatPence(status.next_fine_pence)}. Each late arrival doubles it (max ${formatPence(status.cap_pence)}).`
            : `You’ve been late ${status.level} time${status.level > 1 ? 's' : ''} recently — arriving late next costs ${formatPence(status.next_fine_pence)}. Be on time ${status.sessions_to_reset} more session${status.sessions_to_reset === 1 ? '' : 's'} in a row to reset.`}
        </Text>
        {status.owed_pence > 0 && <Text variant="small" color={colors.warning}>You owe {formatPence(status.owed_pence)} in fines — it’s added to your next payment.</Text>}
      </View>
    </Card>
  );
}

export function FinesPanel({ groupId, isAdmin }: { groupId: string; isAdmin: boolean }) {
  const confirm = useConfirm();
  const mine = useLateStatus(groupId);
  const all = useQuery({
    queryKey: ['group-fines', groupId],
    enabled: isAdmin,
    queryFn: () => rpc<any[]>('get_group_fines', { p_group: groupId }),
  });
  const { run, busy } = useAction([['group-fines', groupId], ['late-status', groupId]]);
  const [adjust, setAdjust] = useState<{ id: string; name: string; amount: string } | null>(null);
  const [menu, setMenu] = useState<any | null>(null);
  const { colors } = useTheme();

  const act = (fineId: string, action: 'waive' | 'paid_cash', label: string, note?: string | null) =>
    run(`${action}-${fineId}`, () => rpc('update_late_fine', { p_fine: fineId, p_action: action, p_note: note ?? null }), label);

  const owedByPlayer = new Map<string, { name: string; total: number }>();
  for (const f of all.data ?? []) {
    if (f.status === 'owed') {
      const cur = owedByPlayer.get(f.user_id) ?? { name: f.display_name, total: 0 };
      cur.total += f.amount_pence;
      owedByPlayer.set(f.user_id, cur);
    }
  }

  return (
    <View style={{ gap: space.md }}>
      {mine.isLoading && <Loading />}
      {!!mine.data && !mine.data.enabled && (
        <EmptyState icon="time-outline" title="Late fines are off" message={isAdmin ? 'Turn them on in group settings.' : 'This group doesn’t use late fines.'}
          action={isAdmin ? { label: 'Group settings', onPress: () => router.push(`/group/${groupId}/settings`) } : undefined} />
      )}
      {!!mine.data?.enabled && (
        <>
          <SectionTitle title="Your fines" />
          <LateStatusCard status={mine.data} />
          {mine.data.fines.map((f) => (
            <Row key={f.id} gap={space.md}>
              <View style={{ flex: 1 }}>
                <Text variant="small">{f.session_name} · {formatDate(f.date)}</Text>
                <Text variant="caption" tone="muted">{STATUS[f.status]?.label}{f.note ? ` · ${f.note}` : ''}</Text>
              </View>
              <Text variant="smallStrong">{formatPence(f.amount_pence)}</Text>
            </Row>
          ))}
        </>
      )}

      {isAdmin && !!mine.data?.enabled && (
        <>
          <SectionTitle title="Group fines" />
          {all.isLoading && <Loading />}
          {!!all.error && <ErrorState error={all.error} onRetry={all.refetch} compact />}
          {all.data?.length === 0 && <Text tone="muted" variant="small">No fines yet. Mark players as “Arrived late” on a session’s attendance screen.</Text>}
          {[...owedByPlayer.entries()].map(([uid, o]) => (
            <Card key={uid} variant="alt">
              <Row gap={space.md}>
                <Text style={{ flex: 1 }}>{o.name} owes {formatPence(o.total)}</Text>
                <Button title="Request payment" size="sm" loading={busy === `req-${uid}`}
                  onPress={() => run(`req-${uid}`, () => rpc('request_late_fine_payment', { p_group: groupId, p_user: uid }), `Payment request sent to ${o.name}`)} />
              </Row>
            </Card>
          ))}
          {all.data?.map((f) => {
            const open = f.status === 'owed' || f.status === 'included';
            return (
              <Card key={f.fine_id}>
                <View style={{ gap: space.sm }}>
                  <Row gap={space.md}>
                    <Avatar uri={f.avatar_url} name={f.display_name} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{f.display_name} · {formatPence(f.amount_pence)}</Text>
                      <Text variant="caption" tone="muted">
                        {f.session_name}, {formatDate(f.played_at)} · late #{f.level}{f.amount_pence !== f.original_pence && f.status !== 'waived' ? ` (was ${formatPence(f.original_pence)})` : ''}{f.note ? ` · ${f.note}` : ''}
                      </Text>
                    </View>
                    <Badge label={STATUS[f.status]?.label.split(' ·')[0] ?? f.status} tone={STATUS[f.status]?.tone ?? 'neutral'} align="center" />
                    {open && <IconButton icon="ellipsis-horizontal" size={32} label={`Manage ${f.display_name}’s fine`} onPress={() => setMenu(f)} />}
                  </Row>
                </View>
              </Card>
            );
          })}
        </>
      )}

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu ? `${menu.display_name} · ${formatPence(menu.amount_pence)}` : ''}>
        {!!menu && (
          <View>
            <ListItem title="Waive" left={<Ionicons name="hand-left-outline" size={20} color={colors.textMuted} />} onPress={async () => {
              const f = menu; setMenu(null);
              const r = await confirm({ title: `Waive ${f.display_name}’s fine?`, message: 'They won’t be charged, and this late arrival won’t make future fines bigger.', confirmLabel: 'Waive', reasonLabel: 'Note (optional, shown to them)' });
              if (r) act(f.fine_id, 'waive', 'Fine waived', typeof r === 'object' ? r.reason : null);
            }} />
            <ListItem title="Change amount" left={<Ionicons name="create-outline" size={20} color={colors.textMuted} />}
              onPress={() => { const f = menu; setMenu(null); setAdjust({ id: f.fine_id, name: f.display_name, amount: (f.amount_pence / 100).toFixed(2) }); }} />
            <ListItem title="Paid in cash" left={<Ionicons name="cash-outline" size={20} color={colors.textMuted} />} onPress={async () => {
              const f = menu; setMenu(null);
              if (await confirm({ title: 'Mark as paid in cash?', message: `${f.display_name} paid ${formatPence(f.amount_pence)} outside the app.`, confirmLabel: 'Mark paid' })) act(f.fine_id, 'paid_cash', 'Marked as paid');
            }} />
          </View>
        )}
      </Sheet>
      <Sheet visible={!!adjust} onClose={() => setAdjust(null)} title={`Change ${adjust?.name ?? ''}’s fine`}>
        <Input label="New amount (£)" value={adjust?.amount ?? ''} onChangeText={(v) => setAdjust((a) => (a ? { ...a, amount: v } : a))} keyboardType="decimal-pad" />
        <Button title="Save" loading={busy === 'adjust'} onPress={async () => {
          const pence = poundsToPence(adjust?.amount ?? '');
          if (pence == null || !adjust) return;
          const ok = await run('adjust', () => rpc('update_late_fine', { p_fine: adjust.id, p_action: 'adjust', p_amount: pence }), 'Fine updated');
          if (ok !== undefined) setAdjust(null);
        }} />
      </Sheet>
    </View>
  );
}
