"""Find style blocks where background and color can resolve to the same value.

The first version of this compared only the FIRST hex after each property, so
a ternary whose COLLISION was in the else branch passed clean. It has to take
every literal a property can evaluate to.
"""
import re, sys, pathlib

def prop_values(block: str, prop: str) -> set[str]:
    """Every hex literal `prop` could evaluate to, across all ternary branches."""
    out = set()
    for m in re.finditer(rf"(?<![\w-])({prop})\s*:", block):
        # Take the text up to the next top-level comma or the end of the block.
        rest, depth = '', 0
        for ch in block[m.end():]:
            if ch in '([{': depth += 1
            elif ch in ')]}': depth -= 1
            if depth < 0: break
            if ch == ',' and depth == 0: break
            rest += ch
        out |= set(h.upper() for h in re.findall(r"'(#[0-9A-Fa-f]{3,8})'", rest))
    return out

def blocks(src: str):
    i = 0
    while True:
        k = src.find('style={{', i)
        if k < 0: return
        depth, j = 0, k + 6
        while j < len(src):
            if src[j] == '{': depth += 1
            elif src[j] == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        yield src[:k].count('\n') + 1, src[k:j + 1]
        i = j

bad = 0
for path in sys.argv[1:]:
    src = pathlib.Path(path).read_text()
    for ln, b in blocks(src):
        clash = prop_values(b, 'background') & prop_values(b, 'color')
        clash |= prop_values(b, 'backgroundColor') & prop_values(b, 'color')
        if clash:
            print(f"  {path}:{ln}  background and color can both be {sorted(clash)}")
            bad += 1
print(f"\n{bad} collision(s)")
sys.exit(1 if bad else 0)
