/**
 * Safe string coercion utilities for MCP parameters.
 *
 * Fixes Claude Code string serialization bug #3084 where MCP parameters
 * are serialized as strings regardless of their schema type.
 *
 * @see https://github.com/anthropics/claude-code/issues/3084
 */
import { z } from 'zod';

/**
 * Safely coerce a value to boolean.
 * Unlike z.coerce.boolean(), this correctly handles "false" → false.
 *
 * z.coerce.boolean() is dangerous because it treats any non-empty string as truthy:
 * - "false" → true (WRONG!)
 * - "0" → true (WRONG!)
 *
 * This function properly parses string representations.
 */
export const coerceBoolean = (val: unknown): boolean => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  throw new Error(`Cannot coerce "${String(val)}" to boolean`);
};

/**
 * Safely coerce a value to number.
 * Handles string-serialized numbers from MCP parameters.
 */
export const coerceNumber = (val: unknown): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    if (!Number.isNaN(num)) return num;
  }
  throw new Error(`Cannot coerce "${String(val)}" to number`);
};

/**
 * Zod schema for required boolean with safe coercion.
 */
export const booleanSchema = z.preprocess(coerceBoolean, z.boolean());

/**
 * Zod schema for required positive integer with safe coercion.
 */
export const numberSchema = z.preprocess(coerceNumber, z.number().int().min(1));

/**
 * Zod schema for optional boolean with safe coercion.
 * Note: .optional() MUST be OUTSIDE z.preprocess() for JSON Schema detection by MCP SDK.
 * Inner schema uses .optional() to allow undefined from preprocess pass-through.
 */
export const optionalBooleanSchema = z
  .preprocess(
    (val) => (val === undefined || val === null ? undefined : coerceBoolean(val)),
    z.boolean().optional()
  )
  .optional();

/**
 * Zod schema for optional positive integer with safe coercion.
 * Note: .optional() MUST be OUTSIDE z.preprocess() for JSON Schema detection by MCP SDK.
 * Inner schema uses .optional() to allow undefined from preprocess pass-through.
 */
export const optionalNumberSchema = z
  .preprocess(
    (val) => (val === undefined || val === null ? undefined : coerceNumber(val)),
    z.number().int().min(1).optional()
  )
  .optional();
