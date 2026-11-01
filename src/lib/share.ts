import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import type { RefObject } from 'react';
import type { HostInstance } from 'react-native';

/** Render a branded card to an image and open the native share sheet (or download on web). */
export async function shareViewAsImage(ref: RefObject<HostInstance | null>, filename: string, fallbackText: string) {
  if (Platform.OS === 'web') {
    try {
      const dataUrl = await captureRef(ref, { format: 'png', quality: 1, result: 'data-uri' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filename}.png`;
      a.click();
      return 'downloaded';
    } catch {
      if (navigator.share) await navigator.share({ text: fallbackText });
      else await navigator.clipboard.writeText(fallbackText);
      return 'text';
    }
  }
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share', UTI: 'public.png' });
    return 'shared';
  }
  await Share.share({ message: fallbackText });
  return 'text';
}

export async function shareText(message: string, url?: string) {
  if (Platform.OS === 'web') {
    if (navigator.share) return navigator.share({ text: message, url });
    await navigator.clipboard.writeText(url ? `${message} ${url}` : message);
    return;
  }
  await Share.share({ message: url ? `${message}\n${url}` : message, url });
}
