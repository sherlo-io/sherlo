/**
 * Utility module with async function exports
 * Used for testing async function mocking functionality
 */
export const fetchUserData = async (userId: string): Promise<{ id: string; name: string }> => {
  // Simulate API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ id: userId, name: 'Original User' });
    }, 100);
  });
};

export const fetchSettings = async (): Promise<{ theme: string; language: string }> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ theme: 'light', language: 'en' });
    }, 100);
  });
};
