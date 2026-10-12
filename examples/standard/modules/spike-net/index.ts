import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

type Bag = Record<string, any>;

type SpikeNetModule = {
  log(message: string): void;
  contextStarted(): Bag;
  nativeState(): Bag;
  setStatic(key: string, value: string): void;
  setInstance(value: string): void;
  tick(key: string): void;
  memory(): Bag;
  connect(url: string): Promise<{ reused: boolean }>;
  send(text: string): Promise<void>;
  reload(reason: string): void;
  addListener(event: 'onMessage', listener: (event: { text: string }) => void): EventSubscription;
};

export default requireNativeModule<SpikeNetModule>('SpikeNet');
