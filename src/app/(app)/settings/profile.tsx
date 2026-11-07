import React, { useState } from 'react';
import { View } from 'react-native';
import { router, usePreventRemove } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Divider, Header, Input, ListItem, Screen, SwipeSelect, Text, useConfirm, useToast } from '@/components/ui';
import { ClubShield, Flag } from '@/components/football/Identity';
import { CardStylePicker, useMyCardData, type CardDraft } from '@/features/CardStylePicker';
import { ClubPicker, CountryPicker, clubName, countryName } from '@/features/IdentityPickers';
import { useAuth } from '@/providers/AuthProvider';
import { useUsernameCheck } from '@/hooks/useUsernameCheck';
import { keys } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/lib/api';
import { pickAndUpload } from '@/lib/storage';
import { fieldErrors, profileSchema } from '@/domain/validation';
import { POSITION_LABEL } from '@/domain/format';
import { space } from '@/theme/tokens';
import type { PlayerPosition } from '@/types/db';
import { ScreenHelp, Spot } from '@/features/ScreenHelp';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Edit profile. Nothing is saved until you press Save (photo, card style, title and medals
 * included); leaving with changes asks whether to discard them.
 */
export default function EditProfile() {
  const { profile, userId, refreshProfile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const card = useMyCardData();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [position, setPosition] = useState<PlayerPosition>(profile?.position ?? 'ANY');
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null);
  const [nationality, setNationality] = useState<string | null>(profile?.nationality ?? null);
  const [club, setClub] = useState<string | null>(profile?.supported_club ?? null);
  const savedCard: CardDraft | null = card ? { style: card.card_style ?? 'classic', title: card.title ?? null, medals: card.medals ?? [] } : null;
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
  const draft = cardDraft ?? savedCard;
  const [picker, setPicker] = useState<'country' | 'club' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const check = useUsernameCheck(username, profile?.username);

  const dirty = !!profile && (
    displayName !== profile.display_name || username !== profile.username || bio !== (profile.bio ?? '') || position !== profile.position
    || avatar !== (profile.avatar_url ?? null) || nationality !== (profile.nationality ?? null) || club !== (profile.supported_club ?? null)
    || (!!cardDraft && !!savedCard && !same(cardDraft, savedCard)));

  // leaving with unsaved changes (back button, swipe, Android back, closing the tab): ask first
  const [leaving, setLeaving] = useState(false);
  const allowLeave = usePreventRemove(dirty && !leaving, ({ repeat }) => {
    confirm({ title: 'Discard your changes?', message: 'You haven’t saved them. Save first to keep them.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', destructive: true })
      .then((ok) => { if (ok) { setLeaving(true); repeat(); } });
  });

  const save = async () => {
    const parsed = profileSchema.safeParse({ display_name: displayName, bio, position });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setBusy(true);
    try {
      if (username !== profile?.username) await rpc('complete_onboarding', { p_username: username, p_display_name: displayName, p_position: position });
      const { error } = await supabase.from('profiles')
        .update({ display_name: displayName.trim(), bio: bio.trim() || null, position, nationality, supported_club: club, avatar_url: avatar }).eq('id', userId!);
      if (error) throw error;
      if (cardDraft && savedCard) {
        if (cardDraft.style !== savedCard.style) await rpc('set_card_style', { p_style: cardDraft.style });
        if (cardDraft.title !== savedCard.title) await rpc('set_card_title', { p_title: cardDraft.title });
        if (!same(cardDraft.medals, savedCard.medals)) await rpc('set_card_medals', { p_codes: cardDraft.medals });
      }
      await refreshProfile();
      qc.invalidateQueries({ queryKey: ['player'] });
      qc.invalidateQueries({ queryKey: keys.myAchievements });
      toast.success('Profile saved');
      setLeaving(true);
      allowLeave();
      router.back();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} maxWidth={560}>
      <Header title="Edit profile" right={<ScreenHelp id="edit-profile" ready={!!draft} />} />
      {!!draft && (
        <CardStylePicker
          draft={draft}
          onDraft={setCardDraft}
          overrides={{ display_name: displayName || profile?.display_name || '', avatar_url: avatar, position, nationality, supported_club: club }}
          actions={(
            <Spot id="ep.photo" style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'center', alignSelf: 'center' }}>
              <Button title="Change photo" size="sm" variant="secondary" icon="camera-outline" loading={uploading} onPress={async () => {
                try {
                  setUploading(true);
                  // the picture is uploaded now but only used once you save
                  const url = await pickAndUpload('avatars', userId!);
                  if (url) setAvatar(url);
                } catch (e) { toast.error(e); } finally { setUploading(false); }
              }} />
              {!!avatar && <Button title="Remove" size="sm" variant="ghost" onPress={() => setAvatar(null)} />}
            </Spot>
          )}
        />
      )}
      <Spot id="ep.name"><Input label="Display name" value={displayName} onChangeText={setDisplayName} error={errors.display_name} maxLength={40} /></Spot>
      <Spot id="ep.username"><Input label="Username" value={username} onChangeText={(v) => setUsername(v.replace(/\s/g, ''))} autoCapitalize="none" icon="at"
        error={check.state === 'taken' || check.state === 'invalid' ? check.message : null} hint={check.message ?? undefined} /></Spot>
      <Spot id="ep.bio"><Input label="Bio" value={bio} onChangeText={setBio} multiline maxLength={280} error={errors.bio} placeholder="e.g. Left foot only. Always up for a game." /></Spot>
      <Spot id="ep.position"><SwipeSelect label="Preferred position" value={position} onChange={setPosition} options={(['ANY', 'GK', 'DEF', 'MID', 'FWD'] as PlayerPosition[]).map((p) => ({ value: p, label: POSITION_LABEL[p], icon: (p === 'GK' ? 'hand-left-outline' : p === 'ANY' ? 'shuffle-outline' : 'football-outline') as 'football-outline' }))} /></Spot>
      <Spot id="ep.identity" style={{ gap: space.sm }}>
      <Text variant="smallStrong" tone="muted">On your player card (optional)</Text>
      <Card padded={false} style={{ paddingHorizontal: space.lg }}>
        <ListItem title="Nationality" subtitle={countryName(nationality) ?? 'Not shown'} left={nationality ? <Flag code={nationality} height={18} /> : undefined} onPress={() => setPicker('country')} />
        <Divider />
        <ListItem title="Club you support" subtitle={clubName(club) ?? 'Not shown'} left={club ? <ClubShield club={club} size={26} /> : undefined} onPress={() => setPicker('club')} />
      </Card>
      </Spot>
      <CountryPicker visible={picker === 'country'} value={nationality} onClose={() => setPicker(null)} onPick={(c) => { setNationality(c); setPicker(null); }} />
      <ClubPicker visible={picker === 'club'} value={club} onClose={() => setPicker(null)} onPick={(c) => { setClub(c); setPicker(null); }} />
      <Spot id="ep.save"><Button title={dirty ? 'Save changes' : 'Save'} size="lg" loading={busy} disabled={uploading || check.state === 'taken' || check.state === 'invalid'} onPress={save} /></Spot>
    </Screen>
  );
}
