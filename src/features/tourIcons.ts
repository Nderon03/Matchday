import type { Ionicons } from '@expo/vector-icons';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Tips are written with an emoji per step (quick to read in the code); on screen each one is
 * drawn as our own icon in a MATCHDAY badge, so tips look like part of the app, not a chat.
 */
export const TOUR_ICONS: Record<string, IconName> = {
  '@': 'at', '⏰': 'alarm', '▶️': 'play', '⚔️': 'flash', '⚖️': 'scale', '⚙️': 'settings', '⚽': 'football', '✅': 'checkmark-circle',
  '✉️': 'mail', '✋': 'hand-left', '✏️': 'pencil', '✨': 'sparkles', '❓': 'help-circle', '➕': 'add-circle', '⭐': 'star', '🃏': 'id-card',
  '🌈': 'color-palette', '🌗': 'contrast', '🎁': 'gift', '🎉': 'sparkles', '🎖️': 'ribbon', '🎚️': 'options', '🎨': 'color-palette',
  '🏅': 'medal', '🏆': 'trophy', '🏠': 'home', '🏳️': 'flag', '🏷️': 'pricetag', '👆': 'hand-left', '👋': 'hand-right', '👕': 'shirt',
  '👤': 'person', '👥': 'people', '💡': 'bulb', '💬': 'chatbubbles', '💳': 'card', '💷': 'cash', '💾': 'save', '📅': 'calendar',
  '📆': 'calendar-number', '📈': 'trending-up', '📊': 'stats-chart', '📍': 'location', '📏': 'resize', '📖': 'book', '📝': 'create',
  '📣': 'megaphone', '📤': 'share-social', '📨': 'mail', '📬': 'mail-open', '📲': 'phone-portrait', '📷': 'camera', '🔀': 'shuffle',
  '🔁': 'repeat', '🔄': 'refresh', '🔎': 'search', '🔐': 'lock-closed', '🔒': 'lock-closed', '🔔': 'notifications', '🔥': 'flame',
  '🗂️': 'folder-open', '🗑️': 'trash', '🗓️': 'calendar', '🙋': 'hand-left', '🚫': 'ban', '🛠️': 'construct', '🛡️': 'shield-checkmark',
  '🤝': 'people-circle', '🥅': 'flag', '🧢': 'shirt', '🧤': 'hand-right', '🧭': 'compass', '🧾': 'receipt', '🪪': 'id-card',
};

export const tourIcon = (emoji: string): IconName => TOUR_ICONS[emoji] ?? 'sparkles';
