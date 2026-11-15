"""Makes the app's font files small: only the weights we use, and only Latin (with every accented
letter for European names), punctuation, currency and the symbols the app shows. Names in other
scripts still display, in the phone's own font. Run after changing fonts:
    python3 scripts/subset-fonts.py   (needs: pip install fonttools)"""
import os
from fontTools import subset

FONTS = {
    'Inter_400Regular': '@expo-google-fonts/inter/400Regular',
    'Inter_500Medium': '@expo-google-fonts/inter/500Medium',
    'Inter_600SemiBold': '@expo-google-fonts/inter/600SemiBold',
    'Inter_700Bold': '@expo-google-fonts/inter/700Bold',
    'Inter_800ExtraBold': '@expo-google-fonts/inter/800ExtraBold',
    'BarlowCondensed_700Bold': '@expo-google-fonts/barlow-condensed/700Bold',
    'BarlowCondensed_800ExtraBold': '@expo-google-fonts/barlow-condensed/800ExtraBold',
}
UNICODES = (
    'U+0000-024F,'   # Basic Latin, Latin-1, Latin Extended-A/B (Polish, Czech, Turkish, Croatian, Albanian...)
    'U+0259,U+02B0-02FF,U+0300-036F,'  # schwa, modifier letters, combining accents
    'U+1E00-1EFF,'   # Latin Extended Additional (Vietnamese, Welsh...)
    'U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2200-22FF,U+2460-24FF,U+25A0-25FF,U+2600-26FF,U+2700-27BF'
)

root = os.path.join(os.path.dirname(__file__), '..')
for name, pkg in FONTS.items():
    src = os.path.join(root, 'node_modules', pkg, f'{name}.ttf')
    out = os.path.join(root, 'assets', 'fonts', f'{name}.ttf')
    opts = subset.Options()
    opts.layout_features = ['*']   # keep kerning, tabular numbers, ligatures
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False           # phones render without hinting
    font = subset.load_font(src, opts)
    s = subset.Subsetter(opts)
    s.populate(unicodes=subset.parse_unicodes(UNICODES))
    s.subset(font)
    subset.save_font(font, out, opts)
    print(f'{name}: {os.path.getsize(src)//1024} KB -> {os.path.getsize(out)//1024} KB')
