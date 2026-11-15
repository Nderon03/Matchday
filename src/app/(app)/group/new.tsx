import React, { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Header, Input, Screen, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { fieldErrors, groupSchema } from '@/domain/validation';
import { GroupAccessPicker, accessToSettings, type GroupAccess } from '@/features/GroupAccess';
import { ScreenHelp } from '@/features/ScreenHelp';

export default function NewGroup() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [access, setAccess] = useState<GroupAccess>('invite');
  const { visibility, join_policy: joinPolicy } = accessToSettings(access);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = groupSchema.safeParse({ name, description: description || undefined, visibility, join_policy: joinPolicy });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setBusy(true);
    try {
      const id = await rpc<string>('create_group', { p_name: name, p_description: description || null, p_visibility: visibility, p_join_policy: joinPolicy, p_location: null, p_rules: null });
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Group created');
      // straight on to the first game: the quickest way to a squad is a game to invite them to
      router.replace({ pathname: '/session/new', params: { groupId: id, groupName: name.trim(), first: '1' } });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <Header title="New group" right={<ScreenHelp id="group-new" />} />
      <Input label="Group name" value={name} onChangeText={setName} placeholder="e.g. Wednesday Football" error={errors.name} maxLength={60} />
      <Input label="About (optional)" value={description} onChangeText={setDescription} multiline placeholder="e.g. Weekly 7-a-side for friends from work. Pay before kick-off." maxLength={2000} />
      <GroupAccessPicker value={access} onChange={setAccess} />
      <Button title="Create group" size="lg" loading={busy} onPress={submit} />
      <Text variant="caption" tone="muted" align="center">
        You can change any of this later in group settings, along with stats, payments and late fines.
      </Text>
    </Screen>
  );
}
