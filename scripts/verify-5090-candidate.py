#!/usr/bin/env python3
"""Verify a built MCP candidate against the reviewed runtime manifest."""
import argparse
import hashlib
import json
from pathlib import Path


parser = argparse.ArgumentParser()
parser.add_argument('--candidate', type=Path, required=True)
args = parser.parse_args()

manifest = json.loads((Path(__file__).parent / '5090-runtime.manifest.json').read_text())
baseline = manifest['baseline_sha256']
candidate = manifest['candidate_sha256']

for rel, expected in candidate.items():
    path = args.candidate / rel
    if not path.is_file():
        raise SystemExit('Candidate module missing: ' + rel)
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit(f'Candidate hash mismatch: {rel} expected={expected} actual={actual}')

changed = sorted(rel for rel in baseline if candidate.get(rel) != baseline[rel])
added = sorted(set(candidate) - set(baseline))
if changed != sorted(manifest['allowed_changed_modules']):
    raise SystemExit(f'Changed-module allowlist mismatch: expected={manifest["allowed_changed_modules"]} actual={changed}')
if added != sorted(manifest['allowed_new_modules']):
    raise SystemExit(f'New-module allowlist mismatch: expected={manifest["allowed_new_modules"]} actual={added}')

print('Verified candidate runtime hashes and reviewed module delta.')
print('Changed: ' + ', '.join(changed))
print('Added: ' + ', '.join(added))
