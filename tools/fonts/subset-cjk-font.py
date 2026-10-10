#!/usr/bin/env python3
"""Regenerate the self-hosted CJK webfont: apps/web/src/fonts/noto-sans-sc-subset.woff2.

Run this BY HAND, not from the Docker build. `apps/api/Dockerfile` builds on `node:24-alpine`,
which has no Python, and a 1.7 MiB artefact that changes when the character budget changes is not
worth a Python toolchain in the image. The generated woff2 and the charset it was generated from
are both committed; `apps/web/src/fonts/coverage.test.ts` reads the committed woff2's own cmap and
fails if a Chinese string in the source, or any of the marks a typed sentence is made of, has
fallen outside it -- so neither a copy change nor a narrower budget here can silently lose glyphs.

    pip install 'fonttools[woff]'     # 4.66.1 when this was last run; needs brotli
    python tools/fonts/subset-cjk-font.py C:/Windows/Fonts/NotoSansSC-VF.ttf

The budget is **all of GB2312 -- 6,763 everyday han plus its punctuation rows -- and any Chinese
left in the UI's own source**. Why so
large, when the chrome vocabulary alone is ~310 characters and 124.5 KiB: CSS font fallback is PER
GLYPH, and 31% of the han in real task titles falls outside the chrome vocabulary, so a chrome-only
subset renders a single task title in two faces at two weights, changing as the user types. Either
the subset covers what a user can type or it should not exist. See
docs/superpowers/specs/2026-10-06-ctws-workbench.md section 4.

NOT BIT-REPRODUCIBLE. Re-running this on the same source font and the same charset produces a file
of a slightly different size each time -- 1,807,648 / 1,807,656 / 1,807,656 / 1,807,916 B measured
across four runs at this budget, a spread of 0.015%, and `PYTHONHASHSEED=0` does not fix it, so the
ordering comes from inside fontTools rather than from this script. Coverage is identical every time
(7,049 codepoints), which is what the tests assert. Do not treat a changed hash as a changed font, and do
not regenerate just to "refresh" the artefact: the committed file is the one that was shipped.

One file, not `unicode-range` chunks: the container serves HTTP/1.1, where 13-14 chunk requests
cost round-trip waves, and a chunking measured for this app came out larger than the single file
because a page of Chinese draws ~150 distinct characters from across the whole character space.
"""

from __future__ import annotations

import hashlib
import os
import re
import sys
import time

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_WOFF2 = os.path.join(REPO, 'apps', 'web', 'src', 'fonts', 'noto-sans-sc-subset.woff2')
OUT_CHARSET = os.path.join(REPO, 'tools', 'fonts', 'cjk-charset.txt')
OUT_LICENSE = os.path.join(REPO, 'apps', 'web', 'src', 'fonts', 'NOTICE.txt')
SOURCE_DIRS = [
    os.path.join(REPO, 'apps', 'web', 'src'),
    os.path.join(REPO, 'apps', 'api', 'src'),
]
SOURCE_EXT = ('.ts', '.tsx', '.css', '.html')

# The weight range the app designs in: 400 body, 500 emphasis, 600 heading, 700 the top of the
# ramp. Clipping the axis at 400-700 instead of shipping the full 100-900 is most of the reason
# this file is 1.72 MiB and not more.
WGHT_RANGE = (400, 700)

# The family name the stylesheet declares. See the rename in main().
FAMILY = 'CTWS Noto Sans SC'

# Latin and the punctuation that sits inside Chinese copy. The face is scoped to CJK ranges in
# styles.css so these never win over IBM Plex -- they are here so the file is self-sufficient if
# the Latin face ever fails to load, and they cost ~2 KiB.
LATIN = {chr(c) for c in range(0x20, 0x7F)} | set('…—–“”‘’·×÷°')

CJK_RE = re.compile(
    '['
    '\u3000-\u303f'  # CJK punctuation
    '\u3400-\u4dbf'  # Extension A
    '\u4e00-\u9fff'  # Unified Ideographs
    '\uf900-\ufaff'  # Compatibility Ideographs
    '\uff00-\uffef'  # Fullwidth forms
    ']'
)


def gb2312(cmap: set[int]) -> set[str]:
    """GB2312 level 1 + 2: the 6,763 han of everyday written Chinese, by decoding every code."""
    out = set()
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                out.add(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return {c for c in out if ord(c) in cmap}


def gb2312_punctuation(cmap: set[int]) -> set[str]:
    """GB2312 rows A1 and A3: the marks a typed Chinese sentence is made of, and the fullwidth forms.

    NOT covered by the han rows above. These used to arrive by accident, through the UI's own
    Chinese copy -- the UI is English now and `chrome_vocabulary()` returns nothing, so a
    regeneration without this set drops the ten marks the shipped file had (、。「」（），：；？) and
    leaves a typed Chinese sentence taking its commas from a fallback face, per glyph. The budget
    is what a PERSON can type, which never depended on the app's own words.
    """
    out = set()
    for hi in (0xA1, 0xA3):
        for lo in range(0xA1, 0xFF):
            try:
                out.add(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                pass
    return {c for c in out if ord(c) in cmap}


def chrome_vocabulary() -> set[str]:
    """Every CJK character written anywhere in the app's own source."""
    out: set[str] = set()
    for root in SOURCE_DIRS:
        for dirpath, _, names in os.walk(root):
            for name in names:
                # Test files are not UI copy, and a test's own CJK character-class literal
                # would otherwise drag range boundaries into the budget. Kept in step with
                # apps/web/src/fonts/coverage.test.ts, which checks this same set.
                if name.endswith(SOURCE_EXT) and not re.search(r'\.test\.tsx?$', name):
                    text = open(os.path.join(dirpath, name), encoding='utf-8').read()
                    out.update(CJK_RE.findall(text))
    return out


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else 'C:/Windows/Fonts/NotoSansSC-VF.ttf'
    t0 = time.time()

    probe = TTFont(src, lazy=True)
    cmap = set(probe.getBestCmap())
    family = probe['name'].getDebugName(16) or probe['name'].getDebugName(1)
    version = probe['name'].getDebugName(5)
    notice = '\n\n'.join(
        filter(None, (probe['name'].getDebugName(n) for n in (0, 7, 13, 14)))
    )
    probe.close()

    chrome = chrome_vocabulary()
    missing = sorted(c for c in chrome if ord(c) not in cmap)
    if missing:
        print(f'! source font does not cover {len(missing)} chrome chars: {"".join(missing)}')
        return 1

    chars = sorted(LATIN | chrome | gb2312(cmap) | gb2312_punctuation(cmap))
    print(f'source   : {src}')
    print(f'family   : {family} {version}   cmap {len(cmap):,}')
    print(f'chrome   : {len(chrome):,} CJK chars in apps/{{web,api}}/src')
    print(f'charset  : {len(chars):,} codepoints  (latin {len(LATIN)} + chrome + GB2312 han + GB2312 punctuation)')

    font = TTFont(src, lazy=False)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    # Vertical and baseline tables: this app never sets writing-mode: vertical-rl.
    opts.drop_tables += ['BASE', 'vhea', 'vmtx']
    sub = subset.Subsetter(options=opts)
    sub.populate(text=''.join(chars))
    sub.subset(font)
    # UPDATE THE NAMES, because clipping the axis changes which instance this file IS. The source
    # VF's wght default is 100, so its own name records describe Thin -- ID 6 `NotoSansSC-Thin`,
    # ID 17 `Thin`, and Thin inside ID 3. Clipping to 400-700 moves the default to 400, and with
    # `updateFontNames=False` the file shipped calling itself Thin while being Regular. True lets
    # fontTools rewrite those records from the STAT table, which is the spec's own naming rules
    # rather than this script's guess at them.
    font = instancer.instantiateVariableFont(font, {'wght': WGHT_RANGE}, updateFontNames=True)

    # Rename the family to `CTWS Noto Sans SC`. This is a SUBSET of Noto, not Noto: giving it its
    # own family name means the installed Noto Sans SC on a developer's machine can never be
    # mistaken for the shipped file, by the browser or by a test. `e2e/font.spec.ts` asks Chrome
    # which platform font it actually painted a Chinese heading with, and that answer is this name.
    # The licence is OFL-1.1 (see apps/web/src/fonts/NOTICE.txt, taken from the source font's own
    # name table). Its Reserved Font Name is 'Source' -- which neither the original name nor this
    # one uses -- and the OFL requires a modified copy to be renamed anyway, so this is both
    # permitted and the correct thing to do.
    for record in font['name'].names:
        if record.nameID in (1, 3, 4, 6, 16, 18):
            old = record.toUnicode()
            record.string = old.replace('Noto Sans SC', FAMILY).replace('NotoSansSC', 'CTWSNotoSansSC')

    font.flavor = 'woff2'
    os.makedirs(os.path.dirname(OUT_WOFF2), exist_ok=True)
    font.save(OUT_WOFF2)

    size = os.path.getsize(OUT_WOFF2)
    digest = hashlib.sha256(open(OUT_WOFF2, 'rb').read()).hexdigest()
    with open(OUT_CHARSET, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(''.join(chars))
    with open(OUT_LICENSE, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(notice + '\n')

    print(f'glyphs   : {font["maxp"].numGlyphs:,}   wght axis {WGHT_RANGE[0]}-{WGHT_RANGE[1]}')
    print(f'written  : {OUT_WOFF2}')
    print(f'size     : {size:,} B  ({size / 1024:.1f} KiB, {size / 1048576:.2f} MiB)')
    print(f'sha256   : {digest}')
    print(f'built in : {time.time() - t0:.0f}s')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
