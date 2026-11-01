import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar, Badge, Button, Card, Chip, ErrorState, Header, Input, Loading, Row, Screen, SectionTitle, Segmented, Stepper, Text, useToast } from '@/components/ui';
import { keys, useGroup, type GroupDetail } from '@/hooks/queries';
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
  const { run, busy } = useAction([keys.group(id), keys.groups]);
  const reports = useQuery({ queryKey: ['group', id, 'reports'], queryFn: () => q<any[]>(supabase.from('reports').select('*').eq('group_id', id).eq('status', 'open').order('created_at', { ascending: false })) });
  const { myRole, members, group: g, settings } = data;
  const [form, setForm] = useState({ name: g.name, description: g.description ?? '', location: g.location ?? '', rules: g.rules ?? '', visibility: g.visibility as GroupVisibility, join_policy: g.join_policy as GroupJoinPolicy });
  const [cfg, setCfg] = useState(settings ? {
    track_assists: settings.track_assists, leaderboard_min_appearances: settings.leaderboard_min_appearances, voting_window_hours: settings.voting_window_hours,
    rating_min_votes: settings.rating_min_votes, default_motm_mode: settings.default_motm_mode,
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
      <Input label="Location" value={form.location} onChangeText={(v) => setForm({ ...form, location: v })} />
      <Input label="Rules" value={form.rules} onChangeText={(v) => setForm({ ...form, rules: v })} multiline />
      <SectionTitle title="Visibility & joining" />
      <Segmented value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v })} options={[{ value: 'private', label: 'Private' }, { value: 'public', label: 'Public' }]} />
      <Segmented value={form.join_policy} onChange={(v) => setForm({ ...form, join_policy: v })} options={[{ value: 'open', label: 'Open' }, { value: 'request', label: 'Request' }, { value: 'invite_only', label: 'Invite only' }]} />
      {!!cfg && (
        <>
          <SectionTitle title="Statistics" />
          <Card>
            <View style={{ gap: space.lg }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ flex: 1 }}>Track assists</Text>
                <Switch value={cfg.track_assists} onValueChange={(v) => setCfg({ ...cfg, track_assists: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}><Text>Min. appearances for % tables</Text></View>
                <Stepper value={cfg.leaderboard_min_appearances} onChange={(v) => setCfg({ ...cfg, leaderboard_min_appearances: v })} min={1} max={100} label="Minimum appearances" />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}><Text>Default voting window (hours)</Text></View>
                <Stepper value={cfg.voting_window_hours} onChange={(v) => setCfg({ ...cfg, voting_window_hours: v })} min={1} max={336} label="Voting window hours" />
              </Row>
              <View style={{ gap: space.sm }}>
                <Text>Ratings needed for a session rating</Text>
                <Row gap={space.sm} wrap>
                  <Chip label="Automatic" selected={cfg.rating_min_votes == null} onPress={() => setCfg({ ...cfg, rating_min_votes: null })} />
                  {[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} selected={cfg.rating_min_votes === n} onPress={() => setCfg({ ...cfg, rating_min_votes: n })} />)}
                </Row>
                <Text variant="caption" tone="muted">Automatic scales with attendance (40% of other players, between 2 and 5).</Text>
              </View>
              <View style={{ gap: space.sm }}>
                <Text>Default MOTM</Text>
                <Segmented value={cfg.default_motm_mode} onChange={(v) => setCfg({ ...cfg, default_motm_mode: v })} options={[{ value: 'session', label: 'Per session' }, { value: 'fixture', label: 'Per game' }]} />
              </View>
            </View>
          </Card>
        </>
      )}
      <Button title="Save changes" size="lg" loading={busy === 'save'} onPress={save} />

      <SectionTitle title="Members & roles" />
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
                <Chip label="Remove" onPress={() => run(`rm-${m.user_id}`, () => rpc('remove_group_member', { p_group: id, p_user: m.user_id }), 'Member removed')} />
              </Row>
            )}
          </View>
        ))}
      </Card>

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
      {!isOwner && <Button title="Leave group" variant="danger" onPress={() => run('leave', async () => { await rpc('remove_group_member', { p_group: id, p_user: userId }); router.replace('/leagues'); }, 'You left the group')} />}
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
