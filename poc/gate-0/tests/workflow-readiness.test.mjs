// Execute only the workflow's readiness loop with docker/sleep stubs; no DB is started.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const workflow = readFileSync(
  new URL('../../../.github/workflows/gate0-poc.yml', import.meta.url),
  'utf8',
);
function readinessBlock(content) {
  const begin = content.indexOf('          for _ in $(seq 1 60); do');
  const end = content.indexOf('          for db in gate0_shadow', begin);
  assert.ok(begin >= 0 && end > begin, 'readiness block must be present');
  return content
    .slice(begin, end)
    .split(/\r?\n/)
    .map((line) => line.slice(10))
    .join('\n');
}
const readiness = readinessBlock(workflow);
const bash =
  process.platform === 'win32'
    ? path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe')
    : '/bin/bash';
assert.ok(existsSync(bash), 'bash is required to verify the workflow readiness behavior');

const stubs = `set -e
GATE0_DB_USER=gate0
socketCalls=0
tcpCalls=0
trap 'printf "PROBE_RESULT socket=%s tcp=%s\\n" "$socketCalls" "$tcpCalls"' EXIT
sleep() { :; }
docker() {
  if [[ "$1" != exec || "$2" != ceproject-gate0-pg || "$3" != pg_isready ]]; then
    echo 'Refusing any non-readiness operation'; return 98
  fi
  if [[ " $* " == *" -h 127.0.0.1 -p 5432 "* ]]; then
    tcpCalls=$((tcpCalls + 1))
    if [[ "$READINESS_PROFILE" == never_ready || "$tcpCalls" -lt 3 ]]; then return 2; fi
    return 0
  fi
  socketCalls=$((socketCalls + 1))
  if [[ "$socketCalls" == 1 ]]; then return 0; fi
  return 2
}
`;

function probe(block, profile = 'temporary_then_main') {
  const result = spawnSync(bash, ['-s'], {
    input: `${stubs}${block}\necho READY_TO_START_POC\n`,
    env: { ...process.env, READINESS_PROFILE: profile },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'probe must finish without being terminated');
  return result;
}

describe('Gate 0 workflow readiness (offline shell simulation)', () => {
  it('handles CRLF workflows from Windows checkouts', () => {
    const result = probe(readinessBlock(workflow.replace(/\r?\n/g, '\r\n')));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /READY_TO_START_POC/);
    assert.match(result.stdout, /PROBE_RESULT socket=0 tcp=4/);
  });
  it('waits for permanent TCP readiness instead of accepting the temporary socket server', () => {
    const result = probe(readiness);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /READY_TO_START_POC/);
    assert.match(result.stdout, /PROBE_RESULT socket=0 tcp=4/);
  });

  it('reproduces the original temporary-socket race when both TCP selections are removed', () => {
    const original = readiness.replaceAll(' -h 127.0.0.1 -p 5432', '');
    assert.notEqual(original, readiness, 'negative control must actually change the probes');
    const result = probe(original);
    assert.equal(result.status, 2, result.stderr);
    assert.doesNotMatch(result.stdout, /READY_TO_START_POC/);
    assert.match(result.stdout, /PROBE_RESULT socket=2 tcp=0/);
  });

  it('stops after the bounded wait if the permanent TCP server never becomes ready', () => {
    const result = probe(readiness, 'never_ready');
    assert.equal(result.status, 2, result.stderr);
    assert.doesNotMatch(result.stdout, /READY_TO_START_POC/);
    assert.match(result.stdout, /PROBE_RESULT socket=0 tcp=61/);
  });
});
