function handleAsyncError(error: Error) {
  /**
   * setTimeout with 0 delay is used because it forces the error to be thrown on
   * the main thread, ensuring React Native properly handles and displays the error
   */
  setTimeout(() => {
    throw error;
  }, 0);
}

export default handleAsyncError;
