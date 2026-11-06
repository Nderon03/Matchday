import React, { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Header, Input, Screen, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { fieldErrors, groupSchema } from '@/domain/validation';
import { GroupAccessPicker, accessToSettings, type GroupAccess } from '@/features/GroupAccess';

export default function NewGroup() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [access, setAccess] = useState<GroupAccess>('invite');
  const { visibility, join_policy: joinPolicy } = accessToSettings(access);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = groupSchema.safeParse({ name, description: description || undefined, visibility, join_policy: joinPolicy, rules: rules || undefined });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setBusy(true);
    try {
      const id = await rpc<string>('create_group', { p_name: name, p_description: description || null, p_visibility: visibility, p_join_policy: joinPolicy, p_location: null, p_rules: rules || null });
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Group created — invite your squad');
      router.replace(`/group/${id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={640}>
      <Header title="New group" />
      <Input label="Group name" value={name} onChangeText={setName} placeholder="e.g. Wednesday Football" error={errors.name} maxLength={60} />
      <Input label="Description" value={description} onChangeText={setDescription} multiline placeholder="e.g. Weekly 7-a-side for friends from work" maxLength={1000} />
      <GroupAccessPicker value={access} onChange={setAccess} />
      <Input label="Group rules (optional)" value={rules} onChangeText={setRules} multiline placeholder="e.g. Pay before kick-off. No slide tackles." maxLength={4000} />
      <Button title="Create group" size="lg" loading={busy} onPress={submit} />
    </Screen>
  );
}
