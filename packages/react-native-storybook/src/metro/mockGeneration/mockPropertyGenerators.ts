/**
 * Mock property generators - orchestrates generation of different property types
 */

import { isSerializedClass, isSerializedFunction } from '../mockSerialization';
import { generateClassProperty } from './generateClassProperty';
import { generateFunctionProperty } from './generateFunctionProperty';
import { generateSpecialValueProperty, getSpecialValueReconstructionCode } from './generateSpecialValueProperty';
import { generateValueProperty } from './generateValueProperty';

/**
 * Options for generating a mock property
 */
export interface GenerateMockPropertyOptions {
  packageName: string;
  exportName: string;
  firstStoryMock: Record<string, any>;
  firstExportValue: any;
  firstMock: any;
}

/**
 * Generates mock property code based on the export type
 *
 * @param options - Options for generating the mock property
 * @returns Generated JavaScript code for the mock property
 */
export function generateMockProperty(options: GenerateMockPropertyOptions): string {
  const { packageName, exportName, firstStoryMock, firstExportValue, firstMock } = options;

  // Check the original object (before serialization) to detect class, function, and special value markers
  const isClassFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isClass;
  const isFunctionFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isFunction;
  const isNaNFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isNaN;
  const isInfinityFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isInfinity;
  const isNegativeInfinityFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isNegativeInfinity;
  const isDateFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isDate;
  const isRegExpFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isRegExp;

  // For named exports, check if it's a function, class, or value (after serialization)
  const isClass = isClassFromObject || (firstMock && isSerializedClass(firstMock));
  const isFunction = !isClass && (isFunctionFromObject || (firstMock && isSerializedFunction(firstMock)));

  if (isClass) {
    return generateClassProperty(packageName, exportName);
  } else if (isFunction) {
    return generateFunctionProperty(packageName, exportName);
  } else if (isNaNFromObject || isInfinityFromObject || isNegativeInfinityFromObject || isDateFromObject || isRegExpFromObject) {
    const reconstructionCode = getSpecialValueReconstructionCode(firstExportValue);
    return generateSpecialValueProperty(exportName, reconstructionCode);
  } else {
    return generateValueProperty(packageName, exportName);
  }
}

