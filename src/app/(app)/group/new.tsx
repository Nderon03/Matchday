import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Header, Input, Screen, SectionTitle, Text, useToast } from '@/components/ui';
import { rpc } from '@/lib/api';
import { fieldErrors, groupSchema } from '@/domain/validation';
import { space } from '@/theme/tokens';
import { GroupAccessPicker, accessToSettings, type GroupAccess } from '@/features/GroupAccess';

export default function NewGroup() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [rules, setRules] = useState('');
  const [access, setAccess] = useState<GroupAccess>('invite');
  const { visibility, join_policy: joinPolicy } = accessToSettings(access);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = groupSchema.safeParse({ name, description: description || undefined, visibility, join_policy: joinPolicy, location: location || undefined, rules: rules || undefined });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setBusy(true);
    try {
      const id = await rpc<string>('create_group', { p_name: name, p_description: description || null, p_visibility: visibility, p_join_policy: joinPolicy, p_location: location || null, p_rules: rules || null });
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
      <Input label="Area (optional)" value={location} onChangeText={setLocation} placeholder="e.g. Mill Hill, London" icon="location-outline"
        hint="Helps people find the group when searching Discover." />
      <View style={{ gap: space.sm }}>
        <SectionTitle title="Who can join" />
        <GroupAccessPicker value={access} onChange={setAccess} />
        <Text variant="caption" tone="faint">You can change this later in the group’s settings.</Text>
      </View>
      <Input label="Group rules (optional)" value={rules} onChangeText={setRules} multiline placeholder="e.g. Pay before kick-off. No slide tackles." maxLength={4000} />
      <Button title="Create group" size="lg" loading={busy} onPress={submit} />
    </Screen>
  );
}
