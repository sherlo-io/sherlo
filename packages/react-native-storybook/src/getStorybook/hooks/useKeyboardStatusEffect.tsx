import { useEffect, useRef } from 'react';
import { Keyboard } from 'react-native';
import { LogFn } from '../../helpers/runnerBridge';

type KeyboardStatus = 'willShow' | 'willHide' | 'shown' | 'hidden';

const KEYBOARD_STATUS_TIMEOUT = 20 * 1000;
const SUCCESS_TIMEOUT = 2 * 1000;

function useKeyboardStatusEffect(log: LogFn): {
  waitForKeyboardStatus(status: KeyboardStatus): Promise<boolean>;
} {
  const keyboardStateRef = useRef<KeyboardStatus>();

  useEffect(() => {
    const removeOnKeyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      log('keyboardDidHide');
      keyboardStateRef.current = 'hidden';
    }).remove;

    const removeOnKeyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      log('keyboardDidShow');
      keyboardStateRef.current = 'shown';
    }).remove;

    const removeOnKeyboardWillHideListener = Keyboard.addListener('keyboardWillHide', () => {
      log('keyboardWillHide');
      keyboardStateRef.current = 'willHide';
    }).remove;

    const removeOnKeyboardWillShowListener = Keyboard.addListener('keyboardWillShow', () => {
      log('keyboardWillShow');
      keyboardStateRef.current = 'willShow';
    }).remove;

    return () => {
      removeOnKeyboardDidHideListener();
      removeOnKeyboardDidShowListener();
      removeOnKeyboardWillHideListener();
      removeOnKeyboardWillShowListener();
    };
  }, [log]);

  function waitForKeyboardStatus(status: KeyboardStatus): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let time = 0;

      if (status === 'hidden') {
        Keyboard.dismiss();
      }

      const interval = setInterval((): void => {
        time = Date.now() - startTime;
        if (time > KEYBOARD_STATUS_TIMEOUT) {
          clearInterval(interval);
          log('waiting for keyboard status failed', {
            status,
            KEYBOARD_STATUS_TIMEOUT,
            actualStatus: keyboardStateRef.current,
          });
          resolve(false);
          return;
        }

        if (keyboardStateRef.current === status) {
          clearInterval(interval);
          log('waiting for keyboard status succeeded', {
            status,
            time,
          });

          // when action to show keyboard succeeds we add additional timeout to make sure it doesn't flicker the UI when hiding it too fast in next command
          if (keyboardStateRef.current === 'shown') {
            setTimeout(() => {
              resolve(true);
            }, SUCCESS_TIMEOUT);
          } else {
            resolve(true);
          }
          return;
        }

        if (status === 'hidden') {
          Keyboard.dismiss();
        }
      }, 500);
    });
  }

  return {
    waitForKeyboardStatus,
  };
}

export default useKeyboardStatusEffect;
