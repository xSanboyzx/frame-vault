"""PyInstaller entry point (absolute imports work outside a source checkout)."""

import sys

from frame_vault_engine.worker import serve

serve(sys.stdin, sys.stdout)
