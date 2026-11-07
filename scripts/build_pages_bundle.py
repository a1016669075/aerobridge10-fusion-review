"""Build the public Pages bundle without changing its source repository."""
import argparse
import hashlib
import json
import posixpath
import re
import shutil
import subprocess
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

SITE = 'https://a1016669075.github.io/aerobridge10-fusion-review/'
RAW = 'https://raw.githubusercontent.com/a1016669075/aerobridge10-fusion-review/'
IMAGE_EXT = {'.png', '.jpg', '.jpeg'}
TEXT_EXT = {'.html', '.js', '.css', '.json', '.txt', '.md'}
LITERAL = re.compile(r'''(["'])([^"'<>\r\n]*?\.(?:png|jpg|jpeg|pdf|zip|csv|txt|html|js|json|css)(?:[?#][^"'<>\r\n]*)?)\1''', re.I)
GALLERIES = [
    'small-roof-10m/presentation',
    'small-roof-continue/presentation',
    'small-roof-continue/gaussian-ten',
    'small-roof-10m/event_comparison/presentation',
    'small-roof-continue/event_comparison/presentation',
]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('src', 'href') and value:
                self.links.append((key, value))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--commit', required=True)
    args = ap.parse_args()
    repo, out = args.repo.resolve(), args.out.resolve()
    if not re.fullmatch(r'[0-9a-fA-F]{40}', args.commit):
        raise ValueError('--commit must be a full commit SHA')
    if out.exists() or out == repo or repo.is_relative_to(out):
        raise ValueError('--out must be a fresh directory outside the source tree ancestors')
    files = {p.relative_to(repo).as_posix(): p for p in repo.rglob('*')
             if p.is_file() and p.relative_to(repo).parts[0] not in {'.git', '.github', 'scripts'}
             and not p.is_relative_to(out)}
    sizes = {rel: p.stat().st_size for rel, p in files.items()}
    texts = {rel: p.read_text(encoding='utf-8-sig') for rel, p in files.items()
             if p.suffix.lower() in TEXT_EXT}

    def local(source, value):
        if value.startswith(SITE):
            value = value[len(SITE):]
            source = 'index.html'
        elif '://' in value or value.startswith(('data:', '#', 'mailto:', 'javascript:')):
            return None
        value = unquote(urlsplit(value).path)
        if '${' in value:
            return None
        path = posixpath.normpath(posixpath.join(posixpath.dirname(source), value))
        return path if path in files else None

    refs = defaultdict(set)
    non_href = set()
    for rel, text in texts.items():
        if Path(rel).suffix.lower() not in {'.html', '.js'}:
            continue
        if rel.endswith('.html'):
            parser = Links()
            parser.feed(text)
            for kind, value in parser.links:
                path = local(rel, value)
                if path:
                    refs[kind].add(path)
            text = re.sub(r'''\bhref\s*=\s*(["'])(.*?)\1''', '', text, flags=re.I | re.S)
        for match in LITERAL.finditer(text):
            path = local(rel, match[2])
            if path:
                non_href.add(path)
    downloads = {p for p in refs['href'] - refs['src'] - non_href
                 if Path(p).suffix.lower() in IMAGE_EXT | {'.pdf', '.zip', '.csv'}}
    downloads.update(p for p in files if p.startswith(
        ('figures/', 'bright-refinement/figures/', 'seasonal-120/figures/',
         'paper-150/figures/', 'paper-150/downloads/')))
    # These 17 original PNG plots have the same 3200 x 1920 dimensions as their
    # JPEG previews, while using 7 MB instead of 27.5 MB.
    preview_swaps = {p: p[:-4] + '.png' for p in files
                     if p.startswith('small-roof-continue/gaussian-ten/figures/') and p.endswith('.jpg')}
    for png in preview_swaps.values():
        if png not in files:
            raise FileNotFoundError(png)
        downloads.discard(png)
    omitted = downloads | set(preview_swaps)
    kept = set(files) - omitted

    def git(*arguments):
        return subprocess.check_output(['git', '-C', str(repo), *arguments]).decode('utf-8')

    hashes = {}
    for line in git('ls-files', '-s').splitlines():
        meta, path = line.split('\t', 1)
        hashes[path] = meta.split()[1]
    changed = set(git('diff', '--name-only', '-z').split('\0'))
    destinations = {}
    for rel in sorted(kept):
        if Path(rel).suffix.lower() not in IMAGE_EXT:
            destinations[rel] = rel
            continue
        blob = hashes.get(rel)
        if blob is None or rel in changed:
            data = files[rel].read_bytes()
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        destinations[rel] = 'assets/' + blob + Path(rel).suffix.lower()
    for jpg, png in preview_swaps.items():
        destinations[jpg] = destinations[png]

    def raw(rel):
        return RAW + args.commit + '/' + quote(rel, safe='/')

    def reference(source, rel):
        if rel in downloads:
            return raw(rel)
        return posixpath.relpath(destinations[rel], posixpath.dirname(source) or '.')

    def rewrite(source, text):
        def replace(match):
            path = local(source, match[2])
            if not path:
                return match[0]
            parts = urlsplit(match[2])
            suffix = ('?' + parts.query if parts.query else '') + ('#' + parts.fragment if parts.fragment else '')
            return match[1] + reference(source, path) + suffix + match[1]
        return LITERAL.sub(replace, text)

    rendered = {rel: rewrite(rel, text) for rel, text in texts.items() if rel in kept}
    dynamic = {}
    for gallery in GALLERIES:
        rel = gallery + '/INDEX.html'
        mapping = {p[len(gallery) + 1:]: reference(rel, p) for p in kept
                   if p.startswith(gallery + '/tiles/')}
        text = rendered[rel]
        declaration = 'const tileAssets=' + json.dumps(mapping, separators=(',', ':')) + ';\n'
        if 'event_comparison' in gallery:
            before = "im.src='tiles/'+d.case+'/'+k+'.png';"
            after = "im.src=tileAssets['tiles/'+d.case+'/'+k+'.png'];"
        else:
            before = 'function getImage(url){'
            after = 'function getImage(url){url=tileAssets[url];'
        if text.count(before) != 1:
            raise ValueError('Unexpected dynamic image function: ' + rel)
        text = text.replace(before, after)
        if text.count("'use strict';") != 1:
            raise ValueError('Missing script insertion point: ' + rel)
        rendered[rel] = text.replace("'use strict';", "'use strict';\n" + declaration, 1)
        dynamic[rel] = mapping

    # The latest root page loads app.js, but image URLs resolve against index.html.
    latest = 'latest-ten/DATA.js'
    data_text = texts[latest]
    data = json.loads(data_text[data_text.index('{'):].strip().rstrip(';'))
    tile_paths = {}
    for case in data['cases']:
        tiles = {}
        for name in ['RGB'] + [mode + '_' + method for mode in case['limits'] for method in case['methods']]:
            path = data['asset_base'] + 'tiles/' + case['id'] + '/' + name + '.png'
            if path not in destinations:
                raise FileNotFoundError(path)
            tiles[name] = reference('index.html', path)
        tile_paths[case['id']] = tiles
        for key in ('full_figure', 'crop_figure'):
            if case.get(key):
                case[key] = raw(data['asset_base'] + case[key])
    data['tile_paths'] = tile_paths
    rendered[latest] = 'window.REVIEW=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    app = rendered['latest-ten/app.js']
    app, count = re.subn(r'const path=\(c,m\)=>[^\n]+;',
                        "const path=(c,m)=>D.tile_paths[c.id][m==='RGB'?'RGB':state.mode+'_'+m];", app)
    if count != 1:
        raise ValueError('Unexpected root image path function')
    app = app.replace('D.asset_base+c.full_figure', 'c.full_figure').replace('D.asset_base+c.crop_figure', 'c.crop_figure')
    rendered['latest-ten/app.js'] = app
    dynamic['index.html'] = {case + '/' + key: path for case, tiles in tile_paths.items() for key, path in tiles.items()}

    # paper-150 uses complete literal URLs, already rewritten above.
    paper_data = rendered.get('paper-150/DATA.js')
    if paper_data:
        paper = json.loads(paper_data[paper_data.index('{'):].strip().rstrip(';'))
        mapping = {}
        for case in paper['cases']:
            mapping[case['id'] + '/RGB'] = case['images']['RGB']
            for mode in ('DAY', 'SITE'):
                for method, path in case['images'][mode].items():
                    mapping[case['id'] + '/' + mode + '_' + method] = path
        dynamic['paper-150/index.html'] = mapping

    out.mkdir(parents=True)
    copied = set()
    for rel in sorted(kept):
        target = destinations[rel]
        if target in copied:
            continue
        copied.add(target)
        dest = out / target
        dest.parent.mkdir(parents=True, exist_ok=True)
        if rel in rendered:
            dest.write_text(rendered[rel], encoding='utf-8', newline='\n')
        else:
            shutil.copyfile(files[rel], dest)

    errors, link_warnings = [], []
    static_count = 0
    for rel, text in rendered.items():
        if not rel.endswith('.html'):
            continue
        parser = Links()
        parser.feed(text)
        for kind, value in parser.links:
            if '://' in value or value.startswith(('#', 'data:', 'mailto:', 'javascript:')) or '${' in value:
                continue
            path = unquote(urlsplit(value).path)
            if not path:
                continue
            target = (out / posixpath.dirname(rel) / path).resolve()
            if kind == 'src':
                static_count += 1
            if not target.exists():
                (errors if kind == 'src' else link_warnings).append(rel + ': ' + value)
    for rel, mapping in dynamic.items():
        for key, value in mapping.items():
            if not (out / posixpath.dirname(rel) / value).is_file():
                errors.append(rel + ': ' + key + ' -> ' + value)
    # Check the case/method combinations, not only existing files in the mapping.
    for gallery in GALLERIES:
        text = texts[gallery + '/DATA.js']
        d = json.loads(text[text.index('{'):].strip().rstrip(';'))
        rel = gallery + '/INDEX.html'
        if 'event_comparison' in gallery:
            expected = {'tiles/' + date['case'] + '/' + method + '.png'
                        for pair in d['pairs'] for date in pair['dates'] for method in ['RGB'] + d['methods']}
        else:
            expected = {'tiles/' + c['id'] + '/' + name + '.png' for c in d['cases']
                        for name in ['RGB'] + [mode + '_' + m for mode in c['limits'] for m in c['methods']]}
        errors.extend(rel + ': missing map entry ' + key for key in sorted(expected - dynamic[rel].keys()))
    byte_count = sum(p.stat().st_size for p in out.rglob('*') if p.is_file())
    validation = {'bytes': byte_count, 'files': len(copied), 'static_src_checked': static_count,
                  'dynamic_paths_checked': sum(map(len, dynamic.values())),
                  'errors': errors, 'link_warnings': link_warnings}
    plan = {'source_commit': args.commit, 'source_bytes': sum(sizes.values()),
            'downloads_to_raw': {p: raw(p) for p in sorted(downloads)},
            'preview_jpg_to_png': preview_swaps, 'excluded_paths': sorted(omitted),
            'asset_paths': {p: dst for p, dst in destinations.items() if p != dst},
            'validation': validation}
    out.with_name(out.name + '.plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf-8')
    out.with_name(out.name + '.validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(validation, ensure_ascii=False, indent=2))
    if errors or byte_count > 700_000_000:
        raise SystemExit('Bundle validation failed or exceeded 700 MB')


if __name__ == '__main__':
    main()
