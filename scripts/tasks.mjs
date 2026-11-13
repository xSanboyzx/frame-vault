import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const backend = join(root, 'backend');
const cargo = join(homedir(), '.cargo', 'bin', 'cargo.exe');
process.env.PATH = `${join(homedir(), '.cargo', 'bin')};${process.env.PATH}`;

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with status ${result.status}`);
}

function uv(args) {
  run('python', ['-m', 'uv', ...args], backend);
}
function npm(args) {
  run(process.env.ComSpec || 'cmd.exe', [
    '/d',
    '/s',
    '/c',
    `npm ${args.join(' ')}`,
  ]);
}

function format(check) {
  const files = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  );
  if (files.status !== 0)
    throw new Error('Unable to list source files for formatting.');
  const paths = [...new Set(files.stdout.split('\0'))].filter(
    (path) =>
      /\.(?:json|md|mjs|js|ts|tsx|css|html|ya?ml)$/.test(path) &&
      existsSync(join(root, path)),
  );
  run(process.execPath, [
    join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
    check ? '--check' : '--write',
    ...paths,
  ]);
}

function doctor() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Frame Vault currently targets Windows x64.');
  run('node', ['--version']);
  run('python', ['--version']);
  uv(['--version']);
  run(cargo, ['--version']);
  run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `
    $ErrorActionPreference = 'Stop'
    $vswhere = Join-Path \${env:ProgramFiles(x86)} 'Microsoft Visual Studio\\Installer\\vswhere.exe'
    if (!(Test-Path $vswhere)) { throw 'Install Visual Studio C++ Build Tools.' }
    $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (!$vs) { throw 'Install Desktop development with C++.' }
    $sdk = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots'
    if (!(Test-Path (Join-Path $sdk.KitsRoot10 'Include'))) { throw 'Install the Windows SDK.' }
    $roots = @('HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients', 'HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients', 'HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients')
    $webview = foreach ($key in $roots) { if (Test-Path $key) { Get-ChildItem $key | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.name -match 'WebView2' } } }
    if (!$webview) { throw 'Install Microsoft Edge WebView2 Runtime.' }
    Write-Output "C++ tools: $vs"
    Write-Output "Windows SDK: $($sdk.KitsRoot10)"
    $webview | Select-Object name,pv
  `,
  ]);
}

function bundle() {
  uv(['sync', '--locked']);
  uv([
    'run',
    '--locked',
    'pyinstaller',
    '--noconfirm',
    '--clean',
    'engine.spec',
  ]);
  const output = join(backend, 'dist', 'frame-vault-engine');
  mkdirSync(join(root, 'src-tauri', 'binaries'), { recursive: true });
  mkdirSync(join(root, 'src-tauri', 'resources'), { recursive: true });
  copyFileSync(
    join(output, 'frame-vault-engine.exe'),
    join(
      root,
      'src-tauri',
      'binaries',
      'frame-vault-engine-x86_64-pc-windows-msvc.exe',
    ),
  );
  cpSync(
    join(output, '_internal'),
    join(root, 'src-tauri', 'resources', '_internal'),
    { recursive: true },
  );
}

function smoke() {
  const executable = join(
    backend,
    'dist',
    'frame-vault-engine',
    'frame-vault-engine.exe',
  );
  if (!existsSync(executable))
    throw new Error('Run npm run engine:bundle first.');
  const input =
    ['health', 'shutdown']
      .map((command, index) =>
        JSON.stringify({ protocolVersion: 1, id: String(index), command }),
      )
      .join('\n') + '\n';
  const result = spawnSync(executable, [], {
    input,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      PATH: process.env.SystemRoot,
      PYTHONUTF8: '1',
    },
  });
  if (result.status !== 0 || result.error)
    throw result.error || new Error(result.stderr);
  const messages = result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  if (
    messages.length !== 2 ||
    messages[0].result?.protocolVersion !== 1 ||
    !messages[1].result?.stopped
  )
    throw new Error('Packaged engine smoke test failed.');
  console.log(
    'Bundled engine passed without Python or Node on PATH:',
    messages[0].result,
  );
}

try {
  switch (process.argv[2]) {
    case 'format':
      format(false);
      break;
    case 'format-check':
      format(true);
      break;
    case 'doctor':
      doctor();
      break;
    case 'dev':
      run(process.execPath, [
        join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
        'dev',
      ]);
      break;
    case 'build':
      run(process.execPath, [
        join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
        'build',
        '--config',
        'src-tauri/tauri.bundle.conf.json',
      ]);
      break;
    case 'setup':
      doctor();
      npm(['ci']);
      uv(['sync', '--locked']);
      console.log('Setup complete. Start the desktop with npm run dev.');
      break;
    case 'bundle':
      bundle();
      break;
    case 'smoke':
      smoke();
      break;
    case 'check':
      npm(['run', 'format:check']);
      for (const task of ['lint', 'typecheck', 'test', 'build'])
        npm(['run', task, '--workspace', '@frame-vault/frontend']);
      uv(['sync', '--locked']);
      uv(['run', '--locked', 'ruff', 'check', '.']);
      uv(['run', '--locked', 'ruff', 'format', '--check', '.']);
      uv(['run', '--locked', 'mypy', 'src']);
      uv(['run', '--locked', 'pytest']);
      for (const args of [
        ['fmt', '--check'],
        ['clippy', '--locked', '--all-targets', '--', '-D', 'warnings'],
        ['test', '--locked'],
      ])
        run(cargo, args, join(root, 'src-tauri'));
      break;
    default:
      throw new Error('Unknown task.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
