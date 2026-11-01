import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { AppError, toAppError } from './errors';

/** Let the user pick an image and upload it to Supabase Storage. Returns the public URL. */
export async function pickAndUpload(bucket: 'avatars' | 'group-images', folder: string, aspect: [number, number] = [1, 1]) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted && Platform.OS !== 'web') throw new AppError('permission', 'Allow photo access in Settings to upload a picture.');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.8 });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  const path = `${folder}/${Date.now()}.${ext}`;
  const body = await (await fetch(asset.uri)).arrayBuffer();
  if (body.byteLength > 8 * 1024 * 1024) throw new AppError('too_large', 'That image is too large (max 8 MB).');
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
  if (error) throw toAppError(error);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
