import { Toast, useToastController, useToastState } from '@tamagui/toast';
import React, { useEffect } from 'react';

const ToastDemo = () => {
  const toast = useToastController();

  useEffect(() => {
    toast.show('Successfully saved!', {
      message: "Don't worry, we've got your data.",
      demo: true,
      duration: 30_000,
    });
  }, [toast]);

  return <CurrentToast />;
};

const CurrentToast = () => {
  const currentToast = useToastState();

  if (!currentToast || currentToast.isHandledNatively) return null;

  return (
    <Toast
      key={currentToast.id}
      duration={currentToast.duration}
      enterStyle={{ opacity: 0, transform: [{ translateY: 100 }] }}
      exitStyle={{ opacity: 0, transform: [{ translateY: 100 }] }}
      transform={[{ translateY: 0 }]}
      opacity={1}
      scale={1}
      viewportName={currentToast.viewportName}
    >
      <Toast.Title>{currentToast.title}</Toast.Title>
      {!!currentToast.message && <Toast.Description>{currentToast.message}</Toast.Description>}
    </Toast>
  );
};

export default ToastDemo;
