import { invoke, isTauri } from '@tauri-apps/api/core';

export interface EngineHealth {
  engineVersion: string;
  protocolVersion: number;
  pythonVersion: string;
  dependencies: { numpy: string; pandas: string; sqlite: string };
}

export async function getEngineHealth(): Promise<EngineHealth> {
  if (!isTauri()) {
    throw new Error(
      'Open Frame Vault from the desktop app to connect to the engine.',
    );
  }
  return invoke<EngineHealth>('engine_health');
}
