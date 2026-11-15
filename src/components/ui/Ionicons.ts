import createIconSet from '@expo/vector-icons/createIconSet';

/**
 * Ionicons with a trimmed font: only the ~200 icons the app uses (scripts/subset-icons.py), instead of
 * all 1,300. Same component and names as @expo/vector-icons/Ionicons.
 */
const glyphMap: typeof import('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json') =
  require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');

const Ionicons = createIconSet(glyphMap, 'ionicons-app', require('../../../assets/fonts/Ionicons.ttf'));
export default Ionicons;
