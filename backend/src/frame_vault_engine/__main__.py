import sys

from frame_vault_engine.worker import serve

if __name__ == "__main__":
    serve(sys.stdin, sys.stdout)
