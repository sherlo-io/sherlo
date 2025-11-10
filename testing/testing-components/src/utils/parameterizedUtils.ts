/**
 * Utility functions with complex parameter patterns for testing mocks
 */

/**
 * Function with optional parameters and defaults
 */
export function processOrder(
  orderId: string,
  quantity: number = 1,
  priority: 'low' | 'medium' | 'high' = 'medium'
): string {
  return `Order ${orderId}: ${quantity} items (${priority} priority)`;
}

/**
 * Function with rest parameters
 */
export function sum(...numbers: number[]): number {
  return numbers.reduce((total, num) => total + num, 0);
}

/**
 * Function with object parameter
 */
export function createUser(userData: { name: string; age: number; email?: string }): string {
  const email = userData.email || 'no-email';
  return `${userData.name} (${userData.age}) - ${email}`;
}

/**
 * Function with array parameter
 */
export function processItems(items: string[]): string {
  return `Processed ${items.length} items: ${items.join(', ')}`;
}

/**
 * Function with function parameter (callback)
 */
export function executeWithCallback(
  value: number,
  callback: (result: number) => string
): string {
  const result = value * 2;
  return callback(result);
}

/**
 * Function with conditional behavior based on parameters
 */
export function calculateDiscount(
  price: number,
  isMember: boolean = false,
  couponCode?: string
): number {
  let discount = 0;
  if (isMember) discount += 0.1; // 10% member discount
  if (couponCode === 'SAVE20') discount += 0.2; // 20% coupon
  return price * (1 - discount);
}

