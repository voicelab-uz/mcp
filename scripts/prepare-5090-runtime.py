#!/usr/bin/env python3
"""Stage matching source and immutable live JS without changing the running MCP."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tarfile

p = argparse.ArgumentParser()
p.add_argument('--live-root', type=Path, default=Path('/opt/mcp'))
p.add_argument('--source-archive', type=Path, required=True)
p.add_argument('--stage', type=Path, required=True)
a = p.parse_args()
manifest = json.loads((Path(__file__).parent / '5090-runtime.manifest.json').read_text())
if a.stage.exists():
    raise SystemExit('Stage already exists; choose a fresh directory.')
for rel, expected in manifest['baseline_sha256'].items():
    if hashlib.sha256((a.live_root / rel).read_bytes()).hexdigest() != expected:
        raise SystemExit('Executing runtime drift: ' + rel)
if hashlib.sha256(a.source_archive.read_bytes()).hexdigest() != manifest['source_archive_sha256']:
    raise SystemExit('Source archive checksum mismatch')
a.stage.mkdir(mode=0o700, parents=True)
with tarfile.open(a.source_archive) as archive:
    members = archive.getmembers()
    for member in members:
        path = Path(member.name)
        if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk():
            raise SystemExit('Unsafe source archive entry')
        if path.name.startswith('.env'):
            raise SystemExit('Source archive must not contain environment files')
    archive.extractall(a.stage, members=members)
shutil.copytree(a.live_root / 'dist', a.stage / 'dist')
print('Staged verified executing runtime plus matching source at ' + str(a.stage))
print('Build with supported Node, then verify only approved JS modules changed before promotion.')
