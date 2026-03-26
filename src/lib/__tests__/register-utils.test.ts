import { describe, it, expect } from 'vitest';
import {
  parseNumberInput,
  toHex,
  toBinary,
  toOctal,
  toSigned16,
  toUnsigned16,
  toSigned32,
  toUnsigned32,
  getValueRangeWarnings,
  interpretRegister,
  interpretRegisterPair,
  swapBytes16,
  swapWords,
  generateAllByteOrders,
  wordsToFloat32,
  float32ToWords,
  floatToIEEE754Breakdown,
  isReasonableFloat,
  getBits,
  toggleBit,
  setBit,
  clearBit,
  testBit,
  applyMask,
  shiftLeft,
  shiftRight,
  extractBitfield,
  scaleLinear,
  inverseScaleLinear,
  modbusAddressInfo,
  SCALING_PRESETS,
} from '../register-utils';

// ─── 1. parseNumberInput ─────────────────────────────────────

describe('parseNumberInput', () => {
  it('parses decimal integers', () => {
    expect(parseNumberInput('42')).toEqual({ value: 42, valid: true });
    expect(parseNumberInput('0')).toEqual({ value: 0, valid: true });
    expect(parseNumberInput('-100')).toEqual({ value: -100, valid: true });
  });

  it('parses hex with 0x prefix', () => {
    expect(parseNumberInput('0xFF')).toEqual({ value: 255, valid: true });
    expect(parseNumberInput('0x0000')).toEqual({ value: 0, valid: true });
    expect(parseNumberInput('0xDEAD')).toEqual({ value: 0xDEAD, valid: true });
  });

  it('parses binary with 0b prefix', () => {
    expect(parseNumberInput('0b1010')).toEqual({ value: 10, valid: true });
    expect(parseNumberInput('0b0000')).toEqual({ value: 0, valid: true });
    expect(parseNumberInput('0b11111111')).toEqual({ value: 255, valid: true });
  });

  it('parses octal with 0o prefix', () => {
    expect(parseNumberInput('0o77')).toEqual({ value: 63, valid: true });
    expect(parseNumberInput('0o0')).toEqual({ value: 0, valid: true });
  });

  it('parses bare hex (contains a-f)', () => {
    expect(parseNumberInput('FF')).toEqual({ value: 255, valid: true });
    expect(parseNumberInput('DEAD')).toEqual({ value: 0xDEAD, valid: true });
    expect(parseNumberInput('abc')).toEqual({ value: 0xabc, valid: true });
  });

  it('supports underscore separators', () => {
    expect(parseNumberInput('1_000')).toEqual({ value: 1000, valid: true });
    expect(parseNumberInput('0xFF_FF')).toEqual({ value: 65535, valid: true });
    expect(parseNumberInput('0b1111_0000')).toEqual({ value: 240, valid: true });
  });

  it('parses floating-point decimals', () => {
    expect(parseNumberInput('3.14')).toEqual({ value: 3.14, valid: true });
    expect(parseNumberInput('-2.5')).toEqual({ value: -2.5, valid: true });
  });

  it('rejects empty input', () => {
    const result = parseNumberInput('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Empty input');
  });

  it('rejects unrecognized formats', () => {
    const result = parseNumberInput('hello');
    expect(result.valid).toBe(false);
  });

  it('trims whitespace', () => {
    expect(parseNumberInput('  42  ')).toEqual({ value: 42, valid: true });
  });
});

// ─── 2. Number format converters ─────────────────────────────

describe('toHex', () => {
  it('converts 16-bit values', () => {
    expect(toHex(255)).toBe('0x00FF');
    expect(toHex(0)).toBe('0x0000');
    expect(toHex(65535)).toBe('0xFFFF');
  });

  it('converts 32-bit values', () => {
    expect(toHex(0xDEADBEEF, 32)).toBe('0xDEADBEEF');
    expect(toHex(0, 32)).toBe('0x00000000');
  });

  it('masks to bit width', () => {
    expect(toHex(0x10000)).toBe('0x0000'); // exceeds 16-bit
  });
});

describe('toBinary', () => {
  it('converts to nibble-grouped binary', () => {
    expect(toBinary(0b11110000)).toBe('0000 0000 1111 0000');
    expect(toBinary(0xFFFF)).toBe('1111 1111 1111 1111');
  });
});

describe('toOctal', () => {
  it('converts to octal', () => {
    expect(toOctal(255)).toBe('0o377');
    expect(toOctal(0)).toBe('0o0');
  });
});

describe('signed/unsigned conversions', () => {
  it('toSigned16 handles positive values', () => {
    expect(toSigned16(100)).toBe(100);
    expect(toSigned16(32767)).toBe(32767);
  });

  it('toSigned16 handles negative two\'s complement', () => {
    expect(toSigned16(0xFFFF)).toBe(-1);
    expect(toSigned16(0x8000)).toBe(-32768);
  });

  it('toUnsigned16 masks to 16 bits', () => {
    expect(toUnsigned16(65535)).toBe(65535);
    expect(toUnsigned16(65536)).toBe(0);
    expect(toUnsigned16(-1)).toBe(65535);
  });

  it('toSigned32 handles values', () => {
    expect(toSigned32(0x7FFFFFFF)).toBe(2147483647);
    expect(toSigned32(0xFFFFFFFF)).toBe(-1);
  });

  it('toUnsigned32 handles values', () => {
    expect(toUnsigned32(-1)).toBe(4294967295);
    expect(toUnsigned32(0)).toBe(0);
  });
});

describe('getValueRangeWarnings', () => {
  it('returns empty for normal 16-bit values', () => {
    expect(getValueRangeWarnings(100)).toEqual([]);
    expect(getValueRangeWarnings(65535)).toEqual([]);
  });

  it('warns for non-finite values', () => {
    expect(getValueRangeWarnings(Infinity)).toContain('Value is not finite');
  });

  it('warns for non-integer values', () => {
    const warnings = getValueRangeWarnings(3.14);
    expect(warnings).toContain('Value is not an integer -- register values are whole numbers');
  });

  it('warns for negative values', () => {
    const warnings = getValueRangeWarnings(-1);
    expect(warnings).toContain("Negative value -- will be interpreted as two's complement");
  });

  it('warns for out-of-range values', () => {
    const warnings = getValueRangeWarnings(70000);
    expect(warnings.some(w => w.includes('uint16'))).toBe(true);
  });
});

// ─── 3. Register interpreter ─────────────────────────────────

describe('interpretRegister', () => {
  it('interprets a basic register value', () => {
    const result = interpretRegister(0x0100);
    expect(result.uint16).toBe(256);
    expect(result.int16).toBe(256);
    expect(result.hex).toBe('0x0100');
  });

  it('interprets a signed negative value', () => {
    const result = interpretRegister(0xFFFF);
    expect(result.uint16).toBe(65535);
    expect(result.int16).toBe(-1);
  });
});

describe('swapBytes16', () => {
  it('swaps high and low bytes', () => {
    expect(swapBytes16(0xABCD)).toBe(0xCDAB);
    expect(swapBytes16(0x0100)).toBe(0x0001);
  });
});

describe('swapWords', () => {
  it('swaps two 16-bit words', () => {
    expect(swapWords(0x1234, 0x5678)).toEqual([0x5678, 0x1234]);
  });
});

// ─── 4. Byte order interpretations ───────────────────────────

describe('generateAllByteOrders', () => {
  it('returns 4 byte order variants', () => {
    const results = generateAllByteOrders(0x4248, 0x0000);
    expect(results).toHaveLength(4);
    expect(results.map(r => r.order)).toContain('AB CD (Big-endian)');
    expect(results.map(r => r.order)).toContain('CD AB (Little-endian words)');
    expect(results.map(r => r.order)).toContain('BA DC (Byte-swapped)');
    expect(results.map(r => r.order)).toContain('DC BA (Little-endian)');
  });

  it('each result has hex, uint32, int32, float32', () => {
    const results = generateAllByteOrders(0x4248, 0x0000);
    for (const r of results) {
      expect(r).toHaveProperty('hex');
      expect(r).toHaveProperty('uint32');
      expect(r).toHaveProperty('int32');
      expect(r).toHaveProperty('float32');
    }
  });
});

describe('interpretRegisterPair', () => {
  it('wraps generateAllByteOrders', () => {
    const result = interpretRegisterPair(0x4248, 0x0000);
    expect(result.byteOrders).toHaveLength(4);
  });
});

// ─── 5. Float / IEEE 754 ─────────────────────────────────────

describe('wordsToFloat32', () => {
  it('decodes known float from register pair (big-endian)', () => {
    // 50.0 = 0x42480000
    const f = wordsToFloat32(0x4248, 0x0000);
    expect(f).toBeCloseTo(50.0, 1);
  });

  it('decodes with word swap', () => {
    const f = wordsToFloat32(0x0000, 0x4248, true);
    expect(f).toBeCloseTo(50.0, 1);
  });

  it('returns NaN for NaN encoding', () => {
    const f = wordsToFloat32(0x7FC0, 0x0000);
    expect(f).toBeNaN();
  });
});

describe('float32ToWords', () => {
  it('encodes a float into two 16-bit words', () => {
    const [high, low] = float32ToWords(50.0);
    expect(high).toBe(0x4248);
    expect(low).toBe(0x0000);
  });

  it('round-trips with wordsToFloat32', () => {
    const original = 123.456;
    const [h, l] = float32ToWords(original);
    const decoded = wordsToFloat32(h, l);
    expect(decoded).toBeCloseTo(original, 2);
  });
});

describe('floatToIEEE754Breakdown', () => {
  it('breaks down a positive float', () => {
    const b = floatToIEEE754Breakdown(1.0);
    expect(b.sign).toBe(0);
    expect(b.exponent).toBe(0); // 127-127=0
    expect(b.exponentBiased).toBe(127);
    expect(b.isSpecial).toBe(false);
  });

  it('breaks down a negative float', () => {
    const b = floatToIEEE754Breakdown(-1.0);
    expect(b.sign).toBe(1);
  });

  it('identifies positive zero', () => {
    const b = floatToIEEE754Breakdown(0);
    expect(b.isSpecial).toBe(true);
    expect(b.specialLabel).toBe('+0');
  });

  it('identifies negative zero', () => {
    const b = floatToIEEE754Breakdown(-0);
    expect(b.isSpecial).toBe(true);
    expect(b.specialLabel).toBe('-0');
  });

  it('identifies Infinity', () => {
    const b = floatToIEEE754Breakdown(Infinity);
    expect(b.isSpecial).toBe(true);
    expect(b.specialLabel).toBe('+Infinity');
  });

  it('identifies -Infinity', () => {
    const b = floatToIEEE754Breakdown(-Infinity);
    expect(b.isSpecial).toBe(true);
    expect(b.specialLabel).toBe('-Infinity');
  });

  it('identifies NaN', () => {
    const b = floatToIEEE754Breakdown(NaN);
    expect(b.isSpecial).toBe(true);
    expect(b.specialLabel).toBe('NaN');
  });
});

describe('isReasonableFloat', () => {
  it('accepts normal engineering values', () => {
    expect(isReasonableFloat(72.5)).toBe(true);
    expect(isReasonableFloat(-40)).toBe(true);
    expect(isReasonableFloat(0)).toBe(true);
  });

  it('rejects NaN and Infinity', () => {
    expect(isReasonableFloat(NaN)).toBe(false);
    expect(isReasonableFloat(Infinity)).toBe(false);
    expect(isReasonableFloat(-Infinity)).toBe(false);
  });

  it('rejects absurdly large magnitudes', () => {
    expect(isReasonableFloat(1e16)).toBe(false);
  });
});

// ─── 6. Bit operations ──────────────────────────────────────

describe('getBits', () => {
  it('returns array of bit states', () => {
    const bits = getBits(0b1010, 16);
    expect(bits[0]).toBe(false); // bit 0
    expect(bits[1]).toBe(true);  // bit 1
    expect(bits[2]).toBe(false); // bit 2
    expect(bits[3]).toBe(true);  // bit 3
    expect(bits).toHaveLength(16);
  });
});

describe('toggleBit', () => {
  it('flips a bit', () => {
    expect(toggleBit(0b0000, 2)).toBe(0b0100);
    expect(toggleBit(0b0100, 2)).toBe(0b0000);
  });
});

describe('setBit / clearBit / testBit', () => {
  it('sets a bit to 1', () => {
    expect(setBit(0, 3)).toBe(8);
  });

  it('clears a bit to 0', () => {
    expect(clearBit(0xFF, 0)).toBe(0xFE);
  });

  it('tests individual bits', () => {
    expect(testBit(0b1000, 3)).toBe(true);
    expect(testBit(0b1000, 2)).toBe(false);
  });
});

describe('applyMask', () => {
  it('applies AND mask', () => {
    expect(applyMask(0xFF, 0x0F, 'AND')).toBe(0x0F);
  });

  it('applies OR mask', () => {
    expect(applyMask(0xF0, 0x0F, 'OR')).toBe(0xFF);
  });

  it('applies XOR mask', () => {
    expect(applyMask(0xFF, 0xFF, 'XOR')).toBe(0);
  });

  it('applies NOT', () => {
    expect(applyMask(0, 0, 'NOT')).toBe(0xFFFFFFFF);
  });
});

describe('shiftLeft / shiftRight', () => {
  it('shifts left within 16-bit', () => {
    expect(shiftLeft(1, 8, 16)).toBe(256);
    expect(shiftLeft(0xFF, 8, 16)).toBe(0xFF00);
  });

  it('shifts right', () => {
    expect(shiftRight(0xFF00, 8, 16)).toBe(0xFF);
  });
});

describe('extractBitfield', () => {
  it('extracts a contiguous bitfield', () => {
    // Value: 0b11010110, extract bits 2-5 (4 bits starting at bit 2)
    expect(extractBitfield(0b11010110, 2, 4)).toBe(0b0101);
  });

  it('extracts from bit 0', () => {
    expect(extractBitfield(0xFF, 0, 4)).toBe(0xF);
  });
});

// ─── 7. Scaling ──────────────────────────────────────────────

describe('scaleLinear', () => {
  it('scales 0-65535 raw to 0-10V', () => {
    const result = scaleLinear(32767, 0, 65535, 0, 10);
    expect(result.value).toBeCloseTo(5.0, 1);
  });

  it('scales to midpoint correctly', () => {
    const result = scaleLinear(500, 0, 1000, 0, 100);
    expect(result.value).toBe(50);
  });

  it('handles zero raw range', () => {
    const result = scaleLinear(100, 100, 100, 0, 10);
    expect(result.value).toBe(0);
    expect(result.slope).toBe(0);
  });

  it('returns formula string', () => {
    const result = scaleLinear(0, 0, 65535, 4, 20);
    expect(result.formula).toContain('eng =');
  });

  it('handles negative engineering ranges', () => {
    const result = scaleLinear(0, 0, 65535, -40, 85);
    expect(result.value).toBeCloseTo(-40, 1);
  });
});

describe('inverseScaleLinear', () => {
  it('reverse-scales engineering to raw', () => {
    const result = inverseScaleLinear(5, 0, 65535, 0, 10);
    expect(result.value).toBeCloseTo(32767.5, 0);
  });

  it('handles zero engineering range', () => {
    const result = inverseScaleLinear(5, 0, 65535, 5, 5);
    expect(result.value).toBe(0);
  });

  it('round-trips with scaleLinear', () => {
    const forward = scaleLinear(25000, 0, 65535, 4, 20);
    const reverse = inverseScaleLinear(forward.value, 0, 65535, 4, 20);
    expect(reverse.value).toBeCloseTo(25000, 0);
  });
});

describe('SCALING_PRESETS', () => {
  it('has expected presets', () => {
    const names = SCALING_PRESETS.map(p => p.name);
    expect(names).toContain('4-20mA');
    expect(names).toContain('0-10V');
    expect(names).toContain('0-100%');
  });
});

// ─── 8. Modbus address ───────────────────────────────────────

describe('modbusAddressInfo', () => {
  it('interprets Modicon holding register 40001', () => {
    const info = modbusAddressInfo(40001, 'modicon');
    expect(info.zeroBased).toBe(0);
    expect(info.oneBased).toBe(1);
    expect(info.registerType).toBe('Holding Register');
    expect(info.functionCode).toContain('FC03');
  });

  it('interprets Modicon input register 30001', () => {
    const info = modbusAddressInfo(30001, 'modicon');
    expect(info.registerType).toBe('Input Register');
    expect(info.functionCode).toContain('FC04');
  });

  it('interprets Modicon discrete input 10001', () => {
    const info = modbusAddressInfo(10001, 'modicon');
    expect(info.registerType).toBe('Discrete Input');
    expect(info.functionCode).toContain('FC02');
  });

  it('interprets Modicon coil address 1', () => {
    const info = modbusAddressInfo(1, 'modicon');
    expect(info.registerType).toBe('Coil');
    expect(info.functionCode).toContain('FC01');
  });

  it('interprets 0-based addressing', () => {
    const info = modbusAddressInfo(0, '0-based');
    expect(info.zeroBased).toBe(0);
    expect(info.oneBased).toBe(1);
    expect(info.registerType).toContain('Holding Register');
  });

  it('interprets 1-based addressing', () => {
    const info = modbusAddressInfo(1, '1-based');
    expect(info.zeroBased).toBe(0);
    expect(info.oneBased).toBe(1);
  });

  it('interprets extended 6-digit Modicon (400001)', () => {
    const info = modbusAddressInfo(400001, 'modicon');
    expect(info.zeroBased).toBe(0);
    expect(info.registerType).toBe('Holding Register');
  });

  it('handles address 0 in modicon notation', () => {
    const info = modbusAddressInfo(0, 'modicon');
    expect(info.registerType).toBe('Unknown');
  });

  it('clamps negative zero-based to 0', () => {
    const info = modbusAddressInfo(0, '1-based');
    expect(info.zeroBased).toBe(0); // 0-1 = -1, clamped to 0
  });
});
