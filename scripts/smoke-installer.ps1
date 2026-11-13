param([switch]$KeepInstalled)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$smokeRoot = Join-Path $repoRoot '.smoke'
$installDirectory = Join-Path $smokeRoot 'Frame Vault Test'
$executable = Join-Path $installDirectory 'frame-vault.exe'
$installer = Get-ChildItem (Join-Path $repoRoot 'src-tauri\target\release\bundle\nsis\*-setup.exe') |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$installer) { throw 'Build the installer first with npm run build.' }
if (Test-Path $installDirectory) { throw "Smoke directory already exists: $installDirectory" }

function Wait-Until([scriptblock]$Condition, [string]$Description) {
    $deadline = (Get-Date).AddSeconds(30)
    do {
        if (& $Condition) { return }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw "Timed out: $Description"
}

function Get-TestWorkers {
    @(Get-Process -Name 'frame-vault-engine' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq (Join-Path $installDirectory 'frame-vault-engine.exe') })
}

$logDirectory = Join-Path $env:LOCALAPPDATA 'io.github.xsanboyzx.framevault\logs'
function Get-ReadyCount {
    $lines = @(Get-ChildItem $logDirectory -Filter '*.log' -ErrorAction SilentlyContinue |
        Get-Content | Select-String -SimpleMatch 'Analytics engine ready')
    $lines.Count
}

New-Item -ItemType Directory -Path $smokeRoot -Force | Out-Null
$installation = Start-Process -FilePath $installer.FullName -ArgumentList "/S /D=$installDirectory" -WindowStyle Hidden -PassThru -Wait
if ($installation.ExitCode -ne 0 -or !(Test-Path $executable)) { throw 'Silent installation failed.' }

$originalPath = $env:PATH
try {
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    foreach ($mode in @('normal', 'forced')) {
        $previousReadyCount = Get-ReadyCount
        $appProcess = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
        try {
            Wait-Until { (Get-TestWorkers).Count -eq 1 } 'worker startup'
            Wait-Until { (Get-ReadyCount) -gt $previousReadyCount } 'engine health confirmation'
            if ($mode -eq 'normal') {
                $appProcess.Refresh()
                if (!$appProcess.CloseMainWindow()) { throw 'Could not request normal window closure.' }
                if (!$appProcess.WaitForExit(10000)) { throw 'Application did not exit normally.' }
            } else {
                Stop-Process -Id $appProcess.Id -Force
            }
            Wait-Until { (Get-TestWorkers).Count -eq 0 } 'worker cleanup'
            Write-Output "Installed app passed $mode shutdown without developer runtimes on PATH."
        } finally {
            if (!$appProcess.HasExited) { Stop-Process -Id $appProcess.Id -Force }
        }
    }
} finally {
    $env:PATH = $originalPath
    if (!$KeepInstalled) {
        $uninstaller = Join-Path $installDirectory 'uninstall.exe'
        if (Test-Path $uninstaller) {
            $uninstallation = Start-Process -FilePath $uninstaller -ArgumentList "/S _?=$installDirectory" -WindowStyle Hidden -PassThru -Wait
            if ($uninstallation.ExitCode -ne 0) { throw 'Uninstallation failed.' }
        }
        if (Test-Path $executable) { throw 'Uninstaller left the application executable behind.' }
        # Only the test-owned installation directory may be removed.
        if (Test-Path $installDirectory) {
            $resolvedInstall = (Resolve-Path -LiteralPath $installDirectory).Path
            $resolvedRoot = (Resolve-Path -LiteralPath $smokeRoot).Path
            if ((Split-Path -Parent $resolvedInstall) -ne $resolvedRoot) { throw 'Unsafe cleanup path.' }
            Remove-Item -LiteralPath $resolvedInstall -Recurse -Force
        }
        Write-Output 'Per-user installation and uninstallation passed.'
    }
}
