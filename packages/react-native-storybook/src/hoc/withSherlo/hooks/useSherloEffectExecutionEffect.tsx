import { useRef } from 'react';
import { LogFn } from '../../../runnerBridge';

const REGISTRATION_TIMEOUT = 500;

const useSherloEffectExecutionEffect = (
  log: LogFn
): {
  clear: () => void;
  execute(): Promise<boolean>;
  register: (effect: () => void) => void;
} => {
  const sherloEffectRef = useRef<() => void>();

  return {
    clear: () => {
      sherloEffectRef.current = undefined;
    },
    register: (effect) => {
      if (sherloEffectRef.current === undefined) {
        sherloEffectRef.current = effect;
      }
    },
    execute: (): Promise<boolean> =>
      new Promise((resolve) => {
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
      }),
  };
};

export default useSherloEffectExecutionEffect;
