/**
 * Creates an enhanced error by combining a custom message with the original error message.
 * The custom message is used as the main error message, while the original error's message
 * is stored in the stderr property.
 */
function getErrorWithCustomMessage(error: Error, message: string) {
  const enhancedError = new Error(message);

  Object.assign(enhancedError, { ...error, stderr: error.message.trim() });

  return enhancedError;
}

export default getErrorWithCustomMessage;
