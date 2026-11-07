import React, { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar, Button, Card, ErrorState, Header, Input, ListItem, Loading, Row, Screen, SectionTitle, Sheet, Stepper, SwipeSelect, Text, useConfirm, useToast } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
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
import { ScreenHelp, Spot } from '@/features/ScreenHelp';

export default function GroupSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  if (group.isLoading) return <Screen><Header title="Group settings" /><Loading /></Screen>;
  if (!group.data) return <Screen><Header title="Group settings" /><ErrorState error={group.error} onRetry={group.refetch} /></Screen>;
  return <GroupSettingsForm id={id} data={group.data} />;
}

const ROLE_LABEL: Record<GroupRole, string> = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', member: 'Member' };
const ROLE_HINT: Record<GroupRole, string> = {
  owner: 'Full control.', admin: 'Settings, members, games and fines.', moderator: 'Removes comments and handles reports.', member: 'Plays and invites friends.',
};

/** One compact settings line: icon, title, a short hint, and the control on the right. */
function SettingRow({ icon, title, hint, children, last }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; children: React.ReactNode; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm + 2,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={2}>{title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

function GroupSettingsForm({ id, data }: { id: string; data: GroupDetail }) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [managing, setManaging] = useState<GroupDetail['members'][number] | null>(null);
  const { run, busy } = useAction([keys.group(id), keys.groups]);
  const reports = useQuery({ queryKey: ['group', id, 'reports'], queryFn: () => q<any[]>(supabase.from('reports').select('*').eq('group_id', id).eq('status', 'open').order('created_at', { ascending: false })) });
  const { myRole, members, group: g, settings } = data;
  const [form, setForm] = useState({ name: g.name, description: g.description ?? '', location: g.location ?? '', visibility: g.visibility as GroupVisibility, join_policy: g.join_policy as GroupJoinPolicy });
  const [cfg, setCfg] = useState(settings ? {
    track_assists: settings.track_assists, leaderboard_min_appearances: settings.leaderboard_min_appearances, voting_window_hours: settings.voting_window_hours,
    rating_min_votes: settings.rating_min_votes,
    late_fines_enabled: settings.late_fines_enabled, late_fine_base_pence: settings.late_fine_base_pence,
    late_fine_cap_pence: settings.late_fine_cap_pence, late_fine_reset_after: settings.late_fine_reset_after,
    require_settled: settings.require_settled,
  } : null);
  const isOwner = myRole === 'owner';

  const save = () => run('save', async () => {
    await q(supabase.from('groups').update({ name: form.name, description: form.description || null, location: form.location || null, visibility: form.visibility, join_policy: form.join_policy }).eq('id', id).select().single());
    if (cfg) await q(supabase.from('group_settings').update(cfg).eq('group_id', id).select().single());
  }, 'Saved');

  const upload = (field: 'logo_url' | 'cover_url') => run(field, async () => {
    const url = await pickAndUpload('group-images', id, field === 'logo_url' ? [1, 1] : [16, 9]);
    if (url) await q(supabase.from('groups').update({ [field]: url }).eq('id', id).select().single());
  });

  return (
    <Screen edges={['top', 'bottom']} maxWidth={680}>
      <Header title="Group settings" subtitle={g.name} right={<ScreenHelp id="group-settings" />} />
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <Pressable onPress={() => upload('logo_url')} accessibilityRole="button" accessibilityLabel="Change logo">
          <Avatar uri={g.logo_url} name={g.name} size={64} />
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.bg }}>
            <Ionicons name={busy === 'logo_url' ? 'hourglass-outline' : 'camera'} size={12} color={colors.onPrimary} />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Input label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <Text variant="caption" tone="primary" accessibilityRole="button" onPress={() => upload('cover_url')}>{busy === 'cover_url' ? 'Uploading…' : 'Change cover photo'}</Text>
        </View>
      </Row>
      <Input label="About" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline maxLength={2000}
        placeholder="Who you are, where you play and any house rules (e.g. pay before kick-off)" />
      <GroupAccessPicker value={accessOf(form)} onChange={(a) => setForm({ ...form, ...accessToSettings(a) })} />
      {!!cfg && (
        <>
          <SectionTitle title="Game rules" />
          <Spot id="gs.rules"><Card padded={false}>
            <SettingRow icon="git-merge-outline" title="Track assists" hint="Players can claim assists">
              <Switch value={cfg.track_assists} onValueChange={(v) => setCfg({ ...cfg, track_assists: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Track assists" />
            </SettingRow>
            <SettingRow icon="podium-outline" title="Games for tables" hint="Minimum to rank on win % and rating">
              <Stepper size="sm" value={cfg.leaderboard_min_appearances} onChange={(v) => setCfg({ ...cfg, leaderboard_min_appearances: v })} min={1} max={100} label="Games needed for average tables" />
            </SettingRow>
            <SettingRow icon="star-outline" title="Voting window" hint="For MOTM and ratings">
              <View style={{ width: 124 }}>
                <SwipeSelect compact dots={false} accessibilityLabel="Voting window" value={cfg.voting_window_hours} onChange={(v) => setCfg({ ...cfg, voting_window_hours: v })}
                  options={[...new Set([6, 12, 24, 48, 72, 168, cfg.voting_window_hours])].sort((x, y) => x - y).map((h) => ({ value: h, label: h === 168 ? '1 week' : `${h} h` }))} />
              </View>
            </SettingRow>
            <SettingRow icon="wallet-outline" title="Settle up before playing" hint="Unpaid bills block the next game">
              <Switch value={cfg.require_settled} onValueChange={(v) => setCfg({ ...cfg, require_settled: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Settle up before playing" />
            </SettingRow>
            <SettingRow icon="time-outline" title="Late fines" hint="Paid games only" last={!cfg.late_fines_enabled}>
              <Switch value={cfg.late_fines_enabled} onValueChange={(v) => setCfg({ ...cfg, late_fines_enabled: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} accessibilityLabel="Late fines" />
            </SettingRow>
            {cfg.late_fines_enabled && (
              <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm }}>
                <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                  <SwipeSelect compact label="First fine" value={cfg.late_fine_base_pence} onChange={(v) => setCfg({ ...cfg, late_fine_base_pence: v })}
                    options={[...new Set([50, 100, 200, cfg.late_fine_base_pence])].sort((x, y) => x - y).map((v) => ({ value: v, label: formatPence(v) }))} />
                  <SwipeSelect compact label="Maximum" value={cfg.late_fine_cap_pence} onChange={(v) => setCfg({ ...cfg, late_fine_cap_pence: v })}
                    options={[...new Set([400, 800, 1000, 1500, cfg.late_fine_cap_pence])].sort((x, y) => x - y).map((v) => ({ value: v, label: formatPence(v) }))} />
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="small" style={{ flex: 1 }}>On-time games to reset</Text>
                  <Stepper size="sm" value={cfg.late_fine_reset_after} onChange={(v) => setCfg({ ...cfg, late_fine_reset_after: v })} min={1} max={20} label="On-time sessions to reset" />
                </Row>
                <Text variant="caption" tone="muted">
                  Doubles each time: {[0, 1, 2, 3].map((n) => formatPence(Math.min(cfg.late_fine_cap_pence, cfg.late_fine_base_pence * 2 ** n))).join(' → ')}. Added to their next payment in this group.
                </Text>
              </View>
            )}
          </Card></Spot>
        </>
      )}
      <Button title="Save changes" size="lg" loading={busy === 'save'} onPress={save} />

      <SectionTitle title={`Members · ${members.length}`} />
      <Spot id="gs.members"><Card padded={false}>
        {members.map((m, i) => {
          const canManage = m.role !== 'owner' && m.user_id !== userId;
          return (
            <Pressable key={m.user_id} disabled={!canManage} onPress={() => setManaging(m)} accessibilityRole={canManage ? 'button' : undefined}
              accessibilityLabel={canManage ? `${m.profile.display_name}, ${m.role}. Manage` : undefined}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm,
                borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
              <Avatar uri={m.profile.avatar_url} name={m.profile.display_name} size={32} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{m.profile.display_name}{m.user_id === userId ? ' (you)' : ''}</Text>
                <Text variant="caption" tone={m.role === 'owner' ? 'primary' : 'muted'}>{ROLE_LABEL[m.role as GroupRole] ?? m.role}</Text>
              </View>
              {canManage && <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
            </Pressable>
          );
        })}
      </Card></Spot>
      <Sheet visible={!!managing} onClose={() => setManaging(null)} title={managing?.profile.display_name ?? ''}>
        {!!managing && (
          <View>
            <View style={{ paddingBottom: space.sm }}>
              <SwipeSelect label="Role" value={managing.role as GroupRole}
                onChange={(r) => { const m = managing; setManaging({ ...m, role: r }); run(`role-${m.user_id}`, () => rpc('set_member_role', { p_group: id, p_user: m.user_id, p_role: r }), 'Role updated'); }}
                options={(isOwner ? (['member', 'moderator', 'admin'] as GroupRole[]) : (['member', 'moderator'] as GroupRole[])).concat(
                  !isOwner && managing.role === 'admin' ? ['admin' as GroupRole] : []).map((r) => ({ value: r, label: ROLE_LABEL[r], detail: ROLE_HINT[r] }))} />
            </View>
            {!!isOwner && (
              <ListItem title="Transfer ownership" left={<Ionicons name="key-outline" size={20} color={colors.textMuted} />} onPress={async () => {
                const m = managing;
                setManaging(null);
                if (await confirm({ title: `Make ${m.profile.display_name} the owner?`, message: 'You’ll become an admin. Only the new owner can give it back.', confirmLabel: 'Transfer' })) {
                  run(`own-${m.user_id}`, () => rpc('transfer_group_ownership', { p_group: id, p_new_owner: m.user_id }), 'Ownership transferred');
                }
              }} />
            )}
            <ListItem title="Remove from group" danger left={<Ionicons name="person-remove-outline" size={20} color={colors.danger} />}
              onPress={() => { const m = managing; setManaging(null); removeGroupMember({ confirm, run, groupId: id, userId: m.user_id, name: m.profile.display_name }); }} />
          </View>
        )}
      </Sheet>

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
        <Button title="Delete group" variant="danger" loading={busy === 'delete'} onPress={async () => {
          const ok = await confirm({
            title: `Delete ${g.name}?`,
            message: `This removes the group, its tables, seasons and upcoming games for all ${members.length} members. It can’t be undone. Players keep their career stats.`,
            confirmLabel: 'Delete group', cancelLabel: 'Keep it', destructive: true,
          });
          if (!ok) return;
          run('delete', async () => {
            const { error } = await supabase.from('groups').delete().eq('id', id);
            if (error) throw error;
            toast.show('Group deleted. Players keep their career statistics.');
            router.replace('/leagues');
          });
        }} />
      )}
    </Screen>
  );
}
