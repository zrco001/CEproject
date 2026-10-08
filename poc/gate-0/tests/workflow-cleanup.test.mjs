// poc/gate-0/tests/workflow-cleanup.test.mjs
// Offline regression tests for the disposable-PostgreSQL teardown step.
// docker and sleep are bash function stubs; no real Docker is ever invoked.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const MARKER = '- name: Tear down disposable PostgreSQL';
const RUN_LINE = '        run: |';
const INDENT = ' '.repeat(10);
const SUCCESS = 'Disposable container and its tmpfs data are gone.';
const BASH =
  process.platform === 'win32'
    ? path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
    : '/bin/bash';

// Literal pre-fix block, used only as a negative control.
const ORIGINAL_BLOCK = [
  'docker stop ceproject-gate0-pg || true',
  "if docker ps -a --format '{{.Names}}' | grep -qx ceproject-gate0-pg; then",
  '  echo "cleanup-error"',
  '  exit 1',
  'fi',
  'echo "success-marker"',
  '',
].join('\n');

// Stubs: only exact `stop ceproject-gate0-pg`, exact `ps -a --format {{.Names}}`,
// and `sleep 1` are accepted. The ps call count persists in COUNT_FILE because
// ps runs inside a command-substitution subshell.
const STUBS = String.raw`
docker() {
  if [ "$#" -eq 2 ] && [ "$1" = stop ] && [ "$2" = ceproject-gate0-pg ]; then
    return "$STOP_STATUS"
  fi
  if [ "$#" -eq 4 ] && [ "$1" = ps ] && [ "$2" = -a ] && [ "$3" = --format ] && [ "$4" = '{{.Names}}' ]; then
    local n
    read -r n < "$COUNT_FILE"
    n=$((n + 1))
    printf '%s\n' "$n" > "$COUNT_FILE"
    case "$PS_PROFILE" in
      fail-42) echo "stub: cannot connect to the Docker daemon" >&2; return 42 ;;
      absent) printf '%s\n' unrelated-container ;;
      present) printf '%s\n' unrelated-container ceproject-gate0-pg ;;
      present-first-2)
        if [ "$n" -le 2 ]; then printf '%s\n' unrelated-container ceproject-gate0-pg
        else printf '%s\n' unrelated-container; fi ;;
      fail-final)
        if [ "$n" -eq 31 ]; then return 42; fi
        printf '%s\n' ceproject-gate0-pg ;;
      absent-final)
        if [ "$n" -lt 31 ]; then printf '%s\n' ceproject-gate0-pg; fi ;;
      *) echo "STUB_REJECT unknown profile $PS_PROFILE" >&2; return 97 ;;
    esac
    return 0
  fi
  echo "STUB_REJECT docker $*" >&2
  return 97
}
sleep() {
  if [ "$#" -eq 1 ] && [ "$1" = 1 ]; then return 0; fi
  echo "STUB_REJECT sleep $*" >&2
  return 97
}
`;

function findWorkflow() {
  return path.join(REPO_ROOT, '.github', 'workflows', 'gate0-poc.yml');
}

function extractTeardownRun(yamlText) {
  const lines = yamlText.replace(/\r\n/g, '\n').split('\n');
  const markerIdx = lines.map((l) => l.trim()).lastIndexOf(MARKER);
  assert.notEqual(markerIdx, -1, 'teardown step marker not found');

  let runIdx = -1;
  for (let i = markerIdx + 1; i < lines.length; i++) {
    if (lines[i] === RUN_LINE) {
      runIdx = i;
      break;
    }
    assert.doesNotMatch(lines[i], /^\s*- name:/, 'reached next step before finding run block');
  }
  assert.notEqual(runIdx, -1, 'run: | not found after teardown marker');

  const body = [];
  for (let i = runIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    if (!line.startsWith(INDENT)) break;
    body.push(line.slice(INDENT.length));
  }
  while (body.length && body.at(-1) === '') body.pop();
  assert.ok(body.length > 0, 'teardown run block is empty');
  return `${body.join('\n')}\n`;
}

let cachedYaml;
function workflowYaml() {
  cachedYaml ??= fs.readFileSync(findWorkflow(), 'utf8');
  return cachedYaml;
}

function runCleanup(block, { profile, stopStatus = 0 }) {
  assert.ok(fs.existsSync(BASH), `bash not found at ${BASH}`);
  const tempRoot = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'gate0-cleanup-'));
  try {
    const countFile = path.join(dir, 'ps-count');
    fs.writeFileSync(countFile, '0\n');
    const result = spawnSync(BASH, ['-e', '-s'], {
      input: `${STUBS}\n${block}`,
      env: {
        ...process.env,
        COUNT_FILE: countFile.replaceAll('\\', '/'),
        PS_PROFILE: profile,
        STOP_STATUS: String(stopStatus),
      },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.error, undefined, `spawn error: ${result.error}`);
    assert.equal(result.signal, null, `bash killed by signal ${result.signal}`);
    assert.doesNotMatch(result.stderr, /STUB_REJECT/, `stub rejected a call:\n${result.stderr}`);
    const queries = Number(fs.readFileSync(countFile, 'utf8').trim());
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, queries };
  } finally {
    assert.equal(
      path.dirname(fs.realpathSync(dir)),
      tempRoot,
      'cleanup stays inside the temporary root',
    );
    assert.ok(
      path.basename(dir).startsWith('gate0-cleanup-'),
      'cleanup targets only this test directory',
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function assertOutcome(r, { status, queries }) {
  assert.equal(r.status, status, `status; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  assert.equal(r.queries, queries, 'docker ps query count');
  if (status === 0) assert.ok(r.stdout.includes(SUCCESS), 'success marker missing');
  else assert.ok(!r.stdout.includes(SUCCESS), 'success marker present on failure');
}

const cases = [
  { name: 'container already absent', profile: 'absent', status: 0, queries: 1 },
  {
    name: 'container disappears after two polls',
    profile: 'present-first-2',
    status: 0,
    queries: 3,
  },
  { name: 'container never disappears', profile: 'present', status: 1, queries: 31 },
  { name: 'docker ps daemon failure propagates', profile: 'fail-42', status: 42, queries: 1 },
  {
    name: 'stop fails and container never disappears',
    profile: 'present',
    stopStatus: 1,
    status: 1,
    queries: 31,
  },
  {
    name: 'stop fails but container already absent',
    profile: 'absent',
    stopStatus: 1,
    status: 0,
    queries: 1,
  },
  { name: 'final Docker query failure propagates', profile: 'fail-final', status: 42, queries: 31 },
  { name: 'removal at the final query succeeds', profile: 'absent-final', status: 0, queries: 31 },
];

for (const c of cases) {
  test(`approved cleanup: ${c.name}`, () => {
    const r = runCleanup(extractTeardownRun(workflowYaml()), c);
    assertOutcome(r, c);
    if (c.profile === 'present')
      assert.ok(r.stdout.includes('::error::'), 'deadline error annotation missing');
    if (c.profile === 'fail-42') assert.match(r.stderr, /cannot connect to the Docker daemon/);
  });
}

test('approved cleanup: CRLF workflow is normalized (delayed removal)', () => {
  const crlfYaml = workflowYaml().replace(/\r?\n/g, '\r\n');
  const block = extractTeardownRun(crlfYaml);
  assert.ok(!block.includes('\r'), 'CR survived normalization');
  assert.equal(block, extractTeardownRun(workflowYaml()));
  assertOutcome(runCleanup(block, { profile: 'present-first-2' }), { status: 0, queries: 3 });
});

test('negative control: original block fails on delayed removal', () => {
  const r = runCleanup(ORIGINAL_BLOCK, { profile: 'present-first-2' });
  assert.equal(r.status, 1);
  assert.equal(r.queries, 1);
  assert.ok(r.stdout.includes('cleanup-error'));
  assert.ok(!r.stdout.includes('success-marker'));
});

test('negative control: original block fails open on docker daemon error', () => {
  const r = runCleanup(ORIGINAL_BLOCK, { profile: 'fail-42' });
  assert.equal(r.status, 0, 'original block is expected to (incorrectly) pass');
  assert.equal(r.queries, 1);
  assert.ok(r.stdout.includes('success-marker'));
});
