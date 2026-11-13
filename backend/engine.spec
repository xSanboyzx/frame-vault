# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

root = Path(SPECPATH)
analysis = Analysis(
    [str(root / 'entrypoint.py')],
    pathex=[str(root / 'src')],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'IPython', 'pytest'],
    noarchive=False,
)
archive = PYZ(analysis.pure)
executable = EXE(
    archive, analysis.scripts, [], exclude_binaries=True,
    name='frame-vault-engine', console=True, debug=False, strip=False, upx=False,
)
distribution = COLLECT(
    executable, analysis.binaries, analysis.datas,
    strip=False, upx=False, name='frame-vault-engine',
)
