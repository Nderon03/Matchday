"""Trims the Ionicons font to the icons the app uses (about 200 of 1,300). Run after adding an icon:
    python3 scripts/subset-icons.py   (needs: pip install fonttools; node)
A unit test fails if an icon is used that isn't in the trimmed font, so it can't be forgotten."""
import json, os, subprocess
from fontTools import subset

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
names = json.loads(subprocess.check_output(['node', os.path.join(root, 'scripts', 'icon-names.mjs')]))
glyphs = json.load(open(os.path.join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json')))
src = os.path.join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf')
out = os.path.join(root, 'assets', 'fonts', 'Ionicons.ttf')
opts = subset.Options(); opts.notdef_outline = True; opts.hinting = False; opts.name_IDs = ['*']
font = subset.load_font(src, opts)
s = subset.Subsetter(opts); s.populate(unicodes=[glyphs[n] for n in names]); s.subset(font)
subset.save_font(font, out, opts)
json.dump(names, open(os.path.join(root, 'assets', 'fonts', 'Ionicons.names.json'), 'w'))
print(f'{len(names)} icons: {os.path.getsize(src)//1024} KB -> {os.path.getsize(out)//1024} KB')
