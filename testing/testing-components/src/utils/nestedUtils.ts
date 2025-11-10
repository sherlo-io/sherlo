/**
 * Utility module that imports other modules
 * Used for testing nested package mocking functionality
 */
import { formatCurrency } from './localUtils';
import { fetchUserData } from './asyncUtils';
import { DataProcessor } from './classUtils';

export const processPayment = (amount: number, currency: string): string => {
  const formatted = formatCurrency(amount, currency);
  return `Payment: ${formatted}`;
};

export const getUserPaymentInfo = async (userId: string): Promise<string> => {
  const userData = await fetchUserData(userId);
  return `User ${userData.name} payment info`;
};

export const processDataWithMultiplier = (value: number, multiplier: number): number => {
  const processor = new DataProcessor(multiplier);
  return processor.process(value);
};

