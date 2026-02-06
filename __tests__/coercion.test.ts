import { describe, expect, it } from 'vitest';

import {
  booleanSchema,
  coerceBoolean,
  coerceNumber,
  numberSchema,
  optionalBooleanSchema,
  optionalNumberSchema,
  optionalScoreSchema,
} from '../coercion.js';

describe('coerceBoolean', () => {
  it('should return true for boolean true', () => {
    expect(coerceBoolean(true)).toBe(true);
  });

  it('should return false for boolean false', () => {
    expect(coerceBoolean(false)).toBe(false);
  });

  it('should return true for string "true"', () => {
    expect(coerceBoolean('true')).toBe(true);
  });

  it('should return false for string "false"', () => {
    expect(coerceBoolean('false')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(coerceBoolean('TRUE')).toBe(true);
    expect(coerceBoolean('FALSE')).toBe(false);
    expect(coerceBoolean('True')).toBe(true);
    expect(coerceBoolean('False')).toBe(false);
  });

  it('should throw for invalid string values', () => {
    expect(() => coerceBoolean('yes')).toThrow('Cannot coerce "yes" to boolean');
    expect(() => coerceBoolean('no')).toThrow('Cannot coerce "no" to boolean');
    expect(() => coerceBoolean('1')).toThrow('Cannot coerce "1" to boolean');
    expect(() => coerceBoolean('0')).toThrow('Cannot coerce "0" to boolean');
    expect(() => coerceBoolean('')).toThrow('Cannot coerce "" to boolean');
  });

  it('should throw for non-boolean/string types', () => {
    expect(() => coerceBoolean(1)).toThrow('Cannot coerce "1" to boolean');
    expect(() => coerceBoolean(0)).toThrow('Cannot coerce "0" to boolean');
    expect(() => coerceBoolean(null)).toThrow('Cannot coerce "null" to boolean');
    expect(() => coerceBoolean()).toThrow('Cannot coerce "undefined" to boolean');
    expect(() => coerceBoolean({})).toThrow();
    expect(() => coerceBoolean([])).toThrow();
  });
});

describe('coerceNumber', () => {
  it('should return number for number input', () => {
    expect(coerceNumber(42)).toBe(42);
    expect(coerceNumber(0)).toBe(0);
    expect(coerceNumber(-5)).toBe(-5);
    expect(coerceNumber(3.14)).toBe(3.14);
  });

  it('should parse string numbers', () => {
    expect(coerceNumber('42')).toBe(42);
    expect(coerceNumber('0')).toBe(0);
    expect(coerceNumber('-5')).toBe(-5);
    expect(coerceNumber('3.14')).toBe(3.14);
  });

  it('should handle strings with whitespace', () => {
    expect(coerceNumber(' 42 ')).toBe(42);
    expect(coerceNumber('  100  ')).toBe(100);
  });

  it('should throw for non-numeric strings', () => {
    expect(() => coerceNumber('abc')).toThrow('Cannot coerce "abc" to number');
    expect(() => coerceNumber('true')).toThrow('Cannot coerce "true" to number');
    expect(() => coerceNumber('')).toThrow('Cannot coerce "" to number');
    expect(() => coerceNumber('   ')).toThrow('Cannot coerce "   " to number');
  });

  it('should throw for non-number/string types', () => {
    expect(() => coerceNumber(null)).toThrow('Cannot coerce "null" to number');
    expect(() => coerceNumber()).toThrow('Cannot coerce "undefined" to number');
    expect(() => coerceNumber(true)).toThrow('Cannot coerce "true" to number');
    expect(() => coerceNumber(false)).toThrow('Cannot coerce "false" to number');
    expect(() => coerceNumber({})).toThrow();
    expect(() => coerceNumber([])).toThrow();
  });
});

describe('booleanSchema', () => {
  it('should parse boolean values', () => {
    expect(booleanSchema.parse(true)).toBe(true);
    expect(booleanSchema.parse(false)).toBe(false);
  });

  it('should parse string boolean values', () => {
    expect(booleanSchema.parse('true')).toBe(true);
    expect(booleanSchema.parse('false')).toBe(false);
  });

  it('should throw for invalid values', () => {
    expect(() => booleanSchema.parse('invalid')).toThrow();
    expect(() => booleanSchema.parse(1)).toThrow();
  });
});

describe('numberSchema', () => {
  it('should parse valid positive integers', () => {
    expect(numberSchema.parse(1)).toBe(1);
    expect(numberSchema.parse(100)).toBe(100);
    expect(numberSchema.parse('5')).toBe(5);
  });

  it('should reject zero and negative numbers', () => {
    expect(() => numberSchema.parse(0)).toThrow();
    expect(() => numberSchema.parse(-1)).toThrow();
    expect(() => numberSchema.parse('-5')).toThrow();
  });

  it('should reject non-integers', () => {
    expect(() => numberSchema.parse(1.5)).toThrow();
    expect(() => numberSchema.parse('3.14')).toThrow();
  });
});

describe('optionalBooleanSchema', () => {
  it('should return undefined for undefined/null', () => {
    expect(optionalBooleanSchema.parse()).toBeUndefined();
    expect(optionalBooleanSchema.parse(null)).toBeUndefined();
  });

  it('should parse valid boolean values', () => {
    expect(optionalBooleanSchema.parse(true)).toBe(true);
    expect(optionalBooleanSchema.parse(false)).toBe(false);
    expect(optionalBooleanSchema.parse('true')).toBe(true);
    expect(optionalBooleanSchema.parse('false')).toBe(false);
  });
});

describe('optionalNumberSchema', () => {
  it('should return undefined for undefined/null', () => {
    expect(optionalNumberSchema.parse()).toBeUndefined();
    expect(optionalNumberSchema.parse(null)).toBeUndefined();
  });

  it('should parse valid positive integers', () => {
    expect(optionalNumberSchema.parse(1)).toBe(1);
    expect(optionalNumberSchema.parse('5')).toBe(5);
  });

  it('should reject invalid values', () => {
    expect(() => optionalNumberSchema.parse(0)).toThrow();
    expect(() => optionalNumberSchema.parse(-1)).toThrow();
  });
});

describe('optionalScoreSchema', () => {
  it('should return undefined for undefined/null', () => {
    expect(optionalScoreSchema.parse()).toBeUndefined();
    expect(optionalScoreSchema.parse(null)).toBeUndefined();
  });

  it('should parse valid scores (0-10)', () => {
    expect(optionalScoreSchema.parse(0)).toBe(0);
    expect(optionalScoreSchema.parse(5)).toBe(5);
    expect(optionalScoreSchema.parse(10)).toBe(10);
    expect(optionalScoreSchema.parse(7.5)).toBe(7.5);
  });

  it('should parse string scores', () => {
    expect(optionalScoreSchema.parse('0')).toBe(0);
    expect(optionalScoreSchema.parse('8.5')).toBe(8.5);
    expect(optionalScoreSchema.parse('10')).toBe(10);
  });

  it('should reject scores outside 0-10 range', () => {
    expect(() => optionalScoreSchema.parse(-1)).toThrow();
    expect(() => optionalScoreSchema.parse(11)).toThrow();
    expect(() => optionalScoreSchema.parse('15')).toThrow();
  });

  it('should reject non-numeric values', () => {
    expect(() => optionalScoreSchema.parse('abc')).toThrow();
  });
});
