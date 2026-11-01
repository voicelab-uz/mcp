#!/usr/bin/env python3
"""Prepare a credential-free candidate from the verified live baseline; never promote."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--live-root', type=Path, default=Path('/opt/mcp'))
parser.add_argument('--stage', type=Path, required=True)
args = parser.parse_args()
assets = Path(__file__).resolve().parent
manifest = json.loads((assets / '5090-analytics.manifest.json').read_text())
if args.stage.exists():
    raise SystemExit('Stage already exists; use a fresh directory.')
for name, expected in manifest['baseline_sha256'].items():
    if hashlib.sha256((args.live_root / name).read_bytes()).hexdigest() != expected:
        raise SystemExit('Baseline drift: ' + name)
args.stage.mkdir(parents=True, mode=0o700)
# Copy application source and public build metadata only. Never copy .env or runtime credentials.
shutil.copytree(args.live_root / 'src', args.stage / 'src', ignore=shutil.ignore_patterns('.env*', '*.pem', '*.key'))
for name in ['package.json', 'package-lock.json', 'tsconfig.json']:
    shutil.copy2(args.live_root / name, args.stage / name)
subprocess.run(['git', 'apply', '--unidiff-zero', '--check', str(assets / '5090-analytics.patch')], cwd=args.stage, check=True)
subprocess.run(['git', 'apply', '--unidiff-zero', str(assets / '5090-analytics.patch')], cwd=args.stage, check=True)
print('Prepared source only at ' + str(args.stage))
print('No live files, credentials, systemd units, runtimes or services were changed.')
