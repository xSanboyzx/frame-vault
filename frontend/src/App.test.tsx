import { fireEvent, render, screen } from '@testing-library/react';
import { vi, test, expect } from 'vitest';
import { App } from './App';
import { getEngineHealth } from './engine';

vi.mock('./engine', () => ({ getEngineHealth: vi.fn() }));
const health = {
  engineVersion: '0.0.1',
  protocolVersion: 1,
  pythonVersion: '3.13.1',
  dependencies: { numpy: '2.3.0', pandas: '2.3.0', sqlite: '3.46.1' },
};

test('shows starting state until the real health response arrives', async () => {
  vi.mocked(getEngineHealth).mockResolvedValue(health);
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Starting');
  expect(await screen.findByText('Ready')).toBeInTheDocument();
  expect(screen.getByText('3.13.1')).toBeInTheDocument();
});

test('shows a useful failure and reconnects when retry is pressed', async () => {
  vi.mocked(getEngineHealth)
    .mockRejectedValueOnce(new Error('Engine exited unexpectedly.'))
    .mockResolvedValueOnce(health);
  render(<App />);
  expect(
    await screen.findByText('Engine exited unexpectedly.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
  expect(await screen.findByText('Ready')).toBeInTheDocument();
});
