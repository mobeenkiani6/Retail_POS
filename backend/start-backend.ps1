# Start the Nycto Retail Mart POS backend using the project virtualenv.
# Do not use system/Anaconda Python — it may have incompatible flask-socketio versions.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$venvPython = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Virtualenv not found. Creating and installing dependencies..." -ForegroundColor Yellow
    python -m venv venv
    & $venvPython -m pip install --upgrade pip
    & $venvPython -m pip install -r requirements.txt
}

# Stop stale servers on port 5001 (often old Anaconda instances missing new routes)
$connections = netstat -ano | Select-String ":5001\s+.*LISTENING"
$pids = $connections | ForEach-Object {
    if ($_ -match '\s(\d+)\s*$') { [int]$Matches[1] }
} | Sort-Object -Unique

foreach ($procId in $pids) {
    if ($procId -eq 0) { continue }
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
        Write-Host "Stopping stale process on port 5001: PID $procId ($($proc.Path))" -ForegroundColor Yellow
        Stop-Process -Id $procId -Force
    } catch {
        # Process may have already exited
    }
}

if ($pids.Count -gt 0) { Start-Sleep -Seconds 2 }

Write-Host "Starting backend on http://localhost:5001 (venv Python)" -ForegroundColor Green
& $venvPython run.py
