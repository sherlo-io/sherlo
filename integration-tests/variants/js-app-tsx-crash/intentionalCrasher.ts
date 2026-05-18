const IntentionalCrasher = {
  crash(): void {
    throw new Error('Intentional JS app-tsx crash via IntentionalCrasher');
  },
};

export default IntentionalCrasher;
