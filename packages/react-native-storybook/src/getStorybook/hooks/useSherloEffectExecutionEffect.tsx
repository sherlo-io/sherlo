import { useRef } from 'react';
import { LogFn } from '../../helpers/RunnerBridge2';

const REGISTRATION_TIMEOUT = 500;

function useSherloEffectExecutionEffect(log: LogFn): {
  clear: () => void;
  execute(): Promise<boolean>;
  register: (effect: () => void) => void;
} {
  const sherloEffectRef = useRef<() => void>();

  function clear(): void {
    sherloEffectRef.current = undefined;
  }

  function register(effect: () => void): void {
    if (sherloEffectRef.current === undefined) {
      sherloEffectRef.current = effect;
    }
  }

  function execute(): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let time = 0;

      const interval = setInterval((): void => {
        time = Date.now() - startTime;
        if (time > REGISTRATION_TIMEOUT) {
          clearInterval(interval);
          log('sherlo effect was not registered', {
            timeoutMs: REGISTRATION_TIMEOUT,
          });
          resolve(false);
        }

        if (sherloEffectRef.current) {
          log('sherlo effect was registered', {
            time,
          });

          setTimeout(() => {
            sherloEffectRef?.current?.();
            sherloEffectRef.current = undefined;
          }, 500);

          clearInterval(interval);
          resolve(true);
        }
      }, 100);
    });
  }

  return {
    clear,
    register,
    execute,
  };
}

export default useSherloEffectExecutionEffect;
