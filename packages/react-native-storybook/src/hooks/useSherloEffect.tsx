import { useContext } from 'react';
import SherloEffectContext from '../contexts/SherloEffectContext';

const useSherloEffect = (effect: () => void): void => {
  const { handleSherloEffect, log } = useContext(SherloEffectContext);

  handleSherloEffect?.(() => {
    log('executing sherlo effect');
    effect();
  });
};

export default useSherloEffect;
