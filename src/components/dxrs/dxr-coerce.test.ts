import { describe, it, expect } from 'vitest';
import { coerceStringField, coerceNumberField, coerceTriState } from './dxr-coerce';

describe('coerceStringField', () => {
  it('trims values', () => {
    expect(coerceStringField('  AHU-1  ')).toBe('AHU-1');
  });
  it('maps blank/whitespace to null', () => {
    expect(coerceStringField('')).toBeNull();
    expect(coerceStringField('   ')).toBeNull();
  });
  it('maps null/undefined to null', () => {
    expect(coerceStringField(null)).toBeNull();
    expect(coerceStringField(undefined)).toBeNull();
  });
});

describe('coerceNumberField', () => {
  it('parses valid numbers', () => {
    expect(coerceNumberField('300001')).toBe(300001);
    expect(coerceNumberField('  42 ')).toBe(42);
    expect(coerceNumberField('0')).toBe(0);
    expect(coerceNumberField('-5')).toBe(-5);
  });
  it('returns null for blank', () => {
    expect(coerceNumberField('')).toBeNull();
    expect(coerceNumberField('   ')).toBeNull();
  });
  it('returns null (never NaN) for non-numeric', () => {
    expect(coerceNumberField('abc')).toBeNull();
    expect(coerceNumberField('12x')).toBeNull();
    expect(coerceNumberField(null)).toBeNull();
    expect(coerceNumberField(undefined)).toBeNull();
  });
});

describe('coerceTriState', () => {
  it('maps to boolean or null', () => {
    expect(coerceTriState('true')).toBe(true);
    expect(coerceTriState('false')).toBe(false);
    expect(coerceTriState('null')).toBeNull();
  });
});
