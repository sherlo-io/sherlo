/**
 * Local utility module with named exports
 * Used for testing local import mocking functionality
 */
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return `${currency} ${amount.toFixed(2)}`;
};

export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US');
};

export const calculateTotal = (items: number[]): number => {
  return items.reduce((sum, item) => sum + item, 0);
};

export const APP_NAME = 'Original App';
export const VERSION = '1.0.0';
