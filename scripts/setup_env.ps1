$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$engineDir = Join-Path $root "engine"
$appDir = Join-Path $root "app"
$venv = Join-Path $engineDir ".venv"

$mamba = "C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\Mamba.Micromamba_Microsoft.Winget.Source_8wekyb3d8bbwe\micromamba.exe"
if (-not (Test-Path $mamba)) {
    $mamba = "micromamba"
}

if (-not (Test-Path (Join-Path $venv "python.exe"))) {
    Write-Host ">>> Creating Python 3.12 + PyBullet environment via Micromamba..." -ForegroundColor Cyan
    & $mamba create -y -p $venv -c conda-forge python=3.12 pybullet pip setuptools
}

$site = Join-Path $venv "Lib\site-packages\sitecustomize.py"
@"
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

lib_bin = os.path.join(sys.prefix, "Library", "bin")
if os.path.isdir(lib_bin):
    os.environ["PATH"] = lib_bin + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(lib_bin)
        except Exception:
            pass
"@ | Set-Content -Encoding UTF8 $site

$py = Join-Path $venv "python.exe"
Set-Location $engineDir
uv pip install --python $py "numpy>=1.26" "scipy>=1.12" "pillow>=10.0" "transforms3d>=0.4.1" "gymnasium>=0.29" "pydantic>=2.6" "pyyaml>=6.0" "fastapi>=0.110" "uvicorn[standard]>=0.29" "websockets>=12.0" "polars>=1.0" "pytest>=8.0" "httpx>=0.27"
uv pip install --python $py --no-deps -e (Join-Path $engineDir "third_party\gym-pybullet-drones")
uv pip install --python $py --no-deps -e $engineDir

Set-Location $appDir
npm.cmd install
Write-Host ">>> Setup completed successfully!" -ForegroundColor Green
