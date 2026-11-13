import { useEffect, useState } from 'react';
import { getEngineHealth, type EngineHealth } from './engine';
import styles from './App.module.css';

type EngineState =
  | { status: 'starting' }
  | { status: 'ready'; health: EngineHealth }
  | { status: 'unavailable'; message: string };

export function App() {
  const [engine, setEngine] = useState<EngineState>({ status: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setEngine({ status: 'starting' });
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    let active = true;
    void getEngineHealth()
      .then((health) => {
        if (active) setEngine({ status: 'ready', health });
      })
      .catch((error: unknown) => {
        if (active) {
          setEngine({
            status: 'unavailable',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="#main" aria-label="Frame Vault home">
          <span className={styles.mark} aria-hidden="true">
            FV
          </span>
          <span>Frame Vault</span>
        </a>
        <span className={styles.version}>
          v{__APP_VERSION__} · Desktop preview
        </span>
      </header>
      <main id="main" className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>YOUR PERFORMANCE, IN PERSPECTIVE</p>
          <h1>Every frame tells a story.</h1>
          <p className={styles.description}>
            A home for your gaming benchmarks. Understand frame consistency,
            compare your settings, and find the evidence behind your
            performance.
          </p>
        </div>
        <section className={styles.panel} aria-labelledby="engine-heading">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>LOCAL ANALYTICS</p>
              <h2 id="engine-heading">Engine connection</h2>
            </div>
            <span
              className={styles.badge}
              data-status={engine.status}
              role="status"
            >
              <span className={styles.dot} />
              {engine.status === 'starting'
                ? 'Starting'
                : engine.status === 'ready'
                  ? 'Ready'
                  : 'Unavailable'}
            </span>
          </div>
          {engine.status === 'starting' && (
            <p className={styles.detail}>
              Connecting to your local analytics engine…
            </p>
          )}
          {engine.status === 'ready' && (
            <>
              <p className={styles.detail}>
                Your analytics engine is connected and ready on this PC.
              </p>
              <dl className={styles.dependencies}>
                <div>
                  <dt>Engine</dt>
                  <dd>{engine.health.engineVersion}</dd>
                </div>
                <div>
                  <dt>Python</dt>
                  <dd>{engine.health.pythonVersion}</dd>
                </div>
                <div>
                  <dt>NumPy</dt>
                  <dd>{engine.health.dependencies.numpy}</dd>
                </div>
                <div>
                  <dt>Pandas</dt>
                  <dd>{engine.health.dependencies.pandas}</dd>
                </div>
                <div>
                  <dt>SQLite</dt>
                  <dd>{engine.health.dependencies.sqlite}</dd>
                </div>
              </dl>
            </>
          )}
          {engine.status === 'unavailable' && (
            <div className={styles.error}>
              <p>{engine.message}</p>
              <button type="button" onClick={retry}>
                Retry connection <span aria-hidden="true">↗</span>
              </button>
            </div>
          )}
        </section>
        <p className={styles.next}>
          The foundation is ready. Benchmark analysis is the next chapter.
        </p>
      </main>
      <footer className={styles.footer}>
        <span>Built for the details between frames.</span>
        <span>Local by design</span>
      </footer>
    </div>
  );
}
