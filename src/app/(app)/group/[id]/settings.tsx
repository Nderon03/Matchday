import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar, Badge, Button, Card, Chip, ErrorState, Header, Input, Loading, Row, Screen, SectionTitle, Stepper, Text, useConfirm, useToast } from '@/components/ui';
import { keys, useGroup, type GroupDetail } from '@/hooks/queries';
import { removeGroupMember } from '@/features/removePlayer';
import { GroupAccessPicker, accessOf, accessToSettings } from '@/features/GroupAccess';
import { formatPence } from '@/domain/format';
import { useAction } from '@/hooks/useAction';
import { useAuth } from '@/providers/AuthProvider';
import { q, rpc } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { pickAndUpload } from '@/lib/storage';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { useQuery } from '@tanstack/react-query';
import type { GroupJoinPolicy, GroupRole, GroupVisibility } from '@/types/db';

export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  if (group.isLoading) return <Screen><Header title="Group settings" /><Loading /></Screen>;
  if (!group.data) return <Screen><Header title="Group settings" /><ErrorState error={group.error} onRetry={group.refetch} /></Screen>;
  return <GroupSettingsForm id={id} data={group.data} />;
}

function GroupSettingsForm({ id, data }: { id: string; data: GroupDetail }) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { run, busy } = useAction([keys.group(id), keys.groups]);
  const reports = useQuery({ queryKey: ['group', id, 'reports'], queryFn: () => q<any[]>(supabase.from('reports').select('*').eq('group_id', id).eq('status', 'open').order('created_at', { ascending: false })) });
  const { myRole, members, group: g, settings } = data;
  const [form, setForm] = useState({ name: g.name, description: g.description ?? '', location: g.location ?? '', rules: g.rules ?? '', visibility: g.visibility as GroupVisibility, join_policy: g.join_policy as GroupJoinPolicy });
  const [cfg, setCfg] = useState(settings ? {
    track_assists: settings.track_assists, leaderboard_min_appearances: settings.leaderboard_min_appearances, voting_window_hours: settings.voting_window_hours,
    rating_min_votes: settings.rating_min_votes,
    late_fines_enabled: settings.late_fines_enabled, late_fine_base_pence: settings.late_fine_base_pence,
    late_fine_cap_pence: settings.late_fine_cap_pence, late_fine_reset_after: settings.late_fine_reset_after,
    require_settled: settings.require_settled,
  } : null);
  const isOwner = myRole === 'owner';

  const save = () => run('save', async () => {
    await q(supabase.from('groups').update({ name: form.name, description: form.description || null, location: form.location || null, rules: form.rules || null, visibility: form.visibility, join_policy: form.join_policy }).eq('id', id).select().single());
    if (cfg) await q(supabase.from('group_settings').update(cfg).eq('group_id', id).select().single());
  }, 'Saved');

  const upload = (field: 'logo_url' | 'cover_url') => run(field, async () => {
    const url = await pickAndUpload('group-images', id, field === 'logo_url' ? [1, 1] : [16, 9]);
    if (url) await q(supabase.from('groups').update({ [field]: url }).eq('id', id).select().single());
  });

  return (
    <Screen edges={['top', 'bottom']} maxWidth={680}>
      <Header title="Group settings" subtitle={g.name} />
      <Row gap={space.md}>
        <Avatar uri={g.logo_url} name={g.name} size={64} />
        <View style={{ gap: space.xs }}>
          <Button title="Change logo" size="sm" variant="secondary" loading={busy === 'logo_url'} onPress={() => upload('logo_url')} />
          <Button title="Change cover" size="sm" variant="ghost" loading={busy === 'cover_url'} onPress={() => upload('cover_url')} />
        </View>
      </Row>
      <Input label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
      <Input label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />
      <Input label="Rules" value={form.rules} onChangeText={(v) => setForm({ ...form, rules: v })} multiline hint="Shown to members on the group page, e.g. pay before kick-off." />
      <GroupAccessPicker value={accessOf(form)} onChange={(a) => setForm({ ...form, ...accessToSettings(a) })} />
      {!!cfg && (
        <>
          <SectionTitle title="Statistics" />
          <Card>
            <View style={{ gap: space.lg }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text>Track assists</Text>
                  <Text variant="caption" tone="muted">Players can claim assists as well as goals, and assists appear on leaderboards.</Text>
                </View>
                <Switch value={cfg.track_assists} onValueChange={(v) => setCfg({ ...cfg, track_assists: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Track assists" />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text>Games needed for average tables</Text>
                  <Text variant="caption" tone="muted">How many games someone must play to appear in win %, rating and per-game tables, so one lucky game doesn’t top them.</Text>
                </View>
                <Stepper value={cfg.leaderboard_min_appearances} onChange={(v) => setCfg({ ...cfg, leaderboard_min_appearances: v })} min={1} max={100} label="Minimum appearances" />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text>Voting window (hours)</Text>
                  <Text variant="caption" tone="muted">How long players have after full time to vote for MOTM and rate each other.</Text>
                </View>
                <Stepper value={cfg.voting_window_hours} onChange={(v) => setCfg({ ...cfg, voting_window_hours: v })} min={1} max={336} label="Voting window hours" />
              </Row>
            </View>
          </Card>
        </>
      )}
      {cfg && (
        <>
          <SectionTitle title="Payments" />
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Settle up before playing</Text>
                <Text variant="caption" tone="muted">Players with an unpaid bill from an earlier game can’t join the next one until they pay or you mark it paid in cash. Hosts can still add someone directly.</Text>
              </View>
              <Switch value={cfg.require_settled} onValueChange={(v) => setCfg({ ...cfg, require_settled: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Settle up before playing" />
            </Row>
          </Card>
          <SectionTitle title="Late fines" />
          <Card>
            <View style={{ gap: space.lg }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">Fine players who arrive late</Text>
                  <Text variant="caption" tone="muted">Paid sessions only. Hosts mark lateness on the attendance screen and can waive any fine.</Text>
                </View>
                <Switch value={cfg.late_fines_enabled} onValueChange={(v) => setCfg({ ...cfg, late_fines_enabled: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Late fines" />
              </Row>
              {cfg.late_fines_enabled && (
                <>
                  <View style={{ gap: space.sm }}>
                    <Text>First fine</Text>
                    <Row gap={space.sm} wrap>
                      {[50, 100, 200].map((v) => <Chip key={v} label={formatPence(v)} selected={cfg.late_fine_base_pence === v} onPress={() => setCfg({ ...cfg, late_fine_base_pence: v })} />)}
                    </Row>
                  </View>
                  <View style={{ gap: space.sm }}>
                    <Text>Maximum fine</Text>
                    <Row gap={space.sm} wrap>
                      {[400, 800, 1000, 1500].map((v) => <Chip key={v} label={formatPence(v)} selected={cfg.late_fine_cap_pence === v} onPress={() => setCfg({ ...cfg, late_fine_cap_pence: v })} />)}
                    </Row>
                  </View>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}><Text>On-time sessions in a row to reset</Text></View>
                    <Stepper value={cfg.late_fine_reset_after} onChange={(v) => setCfg({ ...cfg, late_fine_reset_after: v })} min={1} max={20} label="On-time sessions to reset" />
                  </Row>
                  <Text variant="caption" tone="muted">
                    Each late arrival doubles the fine: {[0, 1, 2, 3, 4].map((n) => formatPence(Math.min(cfg.late_fine_cap_pence, cfg.late_fine_base_pence * 2 ** n))).join(' → ')}.
                    {' '}Fines are added to the player’s next payment in this group.
                  </Text>
                </>
              )}
            </View>
          </Card>
        </>
      )}
      <Button title="Save changes" size="lg" loading={busy === 'save'} onPress={save} />

      <SectionTitle title="Members & roles" />
      <Text variant="caption" tone="muted">Owner: full control. Admin: manage settings, members, sessions and fines. Moderator: remove comments and handle reports. Member: play and invite friends.</Text>
      <Card padded={false}>
        {members.map((m, i) => (
          <View key={m.user_id} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, gap: space.sm }}>
            <Row gap={space.md}>
              <Avatar uri={m.profile.avatar_url} name={m.profile.display_name} size={32} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>{m.profile.display_name}{m.user_id === userId ? ' (you)' : ''}</Text>
              <Badge label={m.role} tone={m.role === 'owner' ? 'primary' : 'neutral'} />
            </Row>
            {m.role !== 'owner' && m.user_id !== userId && (
              <Row gap={space.sm} wrap>
                {(isOwner ? (['admin', 'moderator', 'member'] as GroupRole[]) : (['moderator', 'member'] as GroupRole[])).filter((r) => r !== m.role).map((r) => (
                  <Chip key={r} label={`Make ${r}`} onPress={() => run(`role-${m.user_id}`, () => rpc('set_member_role', { p_group: id, p_user: m.user_id, p_role: r }), 'Role updated')} />
                ))}
                {!!isOwner && <Chip label="Transfer ownership" onPress={() => run(`own-${m.user_id}`, () => rpc('transfer_group_ownership', { p_group: id, p_new_owner: m.user_id }), 'Ownership transferred')} />}
                <Chip label="Remove" onPress={() => removeGroupMember({ confirm, run, groupId: id, userId: m.user_id, name: m.profile.display_name })} />
              </Row>
            )}
          </View>
        ))}
      </Card>

      {data.removals.length > 0 && (
        <>
          <SectionTitle title={`Removed players · ${data.removals.length}`} />
          <Text variant="caption" tone="muted">They can’t rejoin through links or requests. Allow them back to add them to the group again.</Text>
          <Card padded={false}>
            {data.removals.map((r, i) => (
              <Row key={r.user_id} gap={space.md} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={32} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{r.profile.display_name}</Text>
                  <Text variant="caption" tone="muted">{r.reason ? `Reason: ${r.reason}` : 'No reason given'}</Text>
                </View>
                <Button title="Invite back" size="sm" variant="secondary" loading={busy === `re-${r.user_id}`}
                  onPress={() => run(`re-${r.user_id}`, () => rpc('readmit_group_member', { p_group: id, p_user: r.user_id }), `Invitation sent to ${r.profile.display_name}`)} />
              </Row>
            ))}
          </Card>
        </>
      )}

      <SectionTitle title={`Moderation · ${reports.data?.length ?? 0} open`} />
      {reports.data?.map((r) => (
        <Card key={r.id}>
          <View style={{ gap: space.sm }}>
            <Text variant="smallStrong">{r.target_type} reported</Text>
            <Text variant="small" tone="muted">{r.reason}</Text>
            <Row gap={space.sm} wrap>
              <Button title="Dismiss" size="sm" variant="secondary" onPress={() => run(`r-${r.id}`, () => rpc('resolve_report', { p_report: r.id, p_action: 'dismiss' }), 'Dismissed')} />
              {r.target_type === 'user' && <Button title="Remove member" size="sm" variant="danger" onPress={() => run(`r-${r.id}`, () => rpc('resolve_report', { p_report: r.id, p_action: 'remove_member' }), 'Member removed')} />}
              {r.target_type === 'comment' && <Button title="Delete comment" size="sm" variant="danger" onPress={() => run(`r-${r.id}`, () => rpc('resolve_report', { p_report: r.id, p_action: 'delete_comment' }), 'Comment deleted')} />}
              {r.target_type === 'activity' && <Button title="Delete post" size="sm" variant="danger" onPress={() => run(`r-${r.id}`, () => rpc('resolve_report', { p_report: r.id, p_action: 'delete_activity' }), 'Post deleted')} />}
            </Row>
          </View>
        </Card>
      ))}

      <SectionTitle title="Danger zone" />
      {!isOwner && <Button title="Leave group" variant="danger" onPress={async () => {
        if (await confirm({ title: 'Leave this group?', message: 'You can rejoin later if the group allows it. Your stats are kept.', confirmLabel: 'Leave', destructive: true })) {
          run('leave', async () => { await rpc('remove_group_member', { p_group: id, p_user: userId }); router.replace('/leagues'); }, 'You left the group');
        }
      }} />}
      {!!isOwner && (
        <Button title="Delete group" variant="danger" onPress={() => run('delete', async () => {
          const { error } = await supabase.from('groups').delete().eq('id', id);
          if (error) throw error;
          toast.show('Group deleted. Players keep their career statistics.');
          router.replace('/leagues');
        })} />
      )}
    </Screen>
  );
}
