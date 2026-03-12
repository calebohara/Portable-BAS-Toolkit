/**
 * register-utils.ts
 *
 * Pure-TypeScript logic library for BAS protocol and register conversions.
 * Used by the Protocol Converter / Register Tool to help field engineers
 * interpret Modbus registers, convert between number formats, manipulate
 * bit fields, scale analog values, and decode IEEE 754 floats.
 *
 * Zero React or DOM dependencies -- every function is deterministic and
 * side-effect free so it can be called from UI components, workers, or tests.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ParseResult {
  value: number;
  valid: boolean;
  error?: string;
}

export interface RegisterInterpretation {
  uint16: number;
  int16: number;
  hex: string;
  binary: string;
}

export interface ByteOrderResult {
  order: string;
  hex: string;
  uint32: number;
  int32: number;
  float32: number;
}

export interface AllInterpretations {
  byteOrders: ByteOrderResult[];
}

export interface IEEE754Breakdown {
  sign: number;
  exponent: number;
  exponentBiased: number;
  mantissa: number;
  mantissaBits: string;
  fullBinary: string;
  hex: string;
  isSpecial: boolean;
  specialLabel?: string;
}

export interface ScaleResult {
  value: number;
  slope: number;
  intercept: number;
  formula: string;
}

export interface InverseScaleResult {
  value: number;
  formula: string;
}

export interface ScalingPreset {
  name: string;
  rawMin: number;
  rawMax: number;
  engMin: number;
  engMax: number;
}

export interface ModbusAddressInfo {
  zeroBased: number;
  oneBased: number;
  modicon: string;
  registerType: string;
  functionCode: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// 1. Quick Value Converter
// ---------------------------------------------------------------------------

/**
 * Parse a user-entered string as a number in decimal, hex (0x), binary (0b),
 * octal (0o), or bare hex (contains a-f/A-F).
 */
export function parseNumberInput(input: string): ParseResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { value: 0, valid: false, error: "Empty input" };
  }

  try {
    // Binary: 0b prefix
    if (/^0b[01_]+$/i.test(trimmed)) {
      const value = parseInt(trimmed.replace(/_/g, "").slice(2), 2);
      if (Number.isNaN(value)) return { value: 0, valid: false, error: "Invalid binary literal" };
      return { value, valid: true };
    }

    // Octal: 0o prefix
    if (/^0o[0-7_]+$/i.test(trimmed)) {
      const value = parseInt(trimmed.replace(/_/g, "").slice(2), 8);
      if (Number.isNaN(value)) return { value: 0, valid: false, error: "Invalid octal literal" };
      return { value, valid: true };
    }

    // Hex: 0x prefix
    if (/^0x[0-9a-f_]+$/i.test(trimmed)) {
      const value = parseInt(trimmed.replace(/_/g, "").slice(2), 16);
      if (Number.isNaN(value)) return { value: 0, valid: false, error: "Invalid hex literal" };
      return { value, valid: true };
    }

    // Negative decimal
    if (/^-?\d[\d_]*$/.test(trimmed)) {
      const value = Number(trimmed.replace(/_/g, ""));
      if (Number.isNaN(value)) return { value: 0, valid: false, error: "Invalid decimal number" };
      return { value, valid: true };
    }

    // Bare hex (contains a-f but no prefix) -- must be all hex chars
    if (/^[0-9a-f_]+$/i.test(trimmed) && /[a-f]/i.test(trimmed)) {
      const value = parseInt(trimmed.replace(/_/g, ""), 16);
      if (Number.isNaN(value)) return { value: 0, valid: false, error: "Invalid hex value" };
      return { value, valid: true };
    }

    // Floating-point decimal
    if (/^-?\d[\d_]*\.[\d_]*$/.test(trimmed)) {
      const value = parseFloat(trimmed.replace(/_/g, ""));
      if (Number.isNaN(value)) return { value: 0, valid: false, error: "Invalid decimal number" };
      return { value, valid: true };
    }

    return { value: 0, valid: false, error: `Unrecognised format: "${trimmed}"` };
  } catch {
    return { value: 0, valid: false, error: "Parse error" };
  }
}

/** Convert a number to hexadecimal with 0x prefix, zero-padded to `bits` width. */
export function toHex(n: number, bits: 16 | 32 = 16): string {
  const mask = bits === 16 ? 0xffff : 0xffffffff;
  const digits = bits === 16 ? 4 : 8;
  return "0x" + ((n & mask) >>> 0).toString(16).toUpperCase().padStart(digits, "0");
}

/** Convert a number to grouped binary string, grouped in nibbles. */
export function toBinary(n: number, bits: 16 | 32 = 16): string {
  const mask = bits === 16 ? 0xffff : 0xffffffff;
  const raw = ((n & mask) >>> 0).toString(2).padStart(bits, "0");
  // Group into nibbles separated by spaces
  return raw.replace(/(.{4})/g, "$1 ").trim();
}

/** Convert a number to octal with 0o prefix. */
export function toOctal(n: number): string {
  return "0o" + ((n >>> 0) & 0xffffffff).toString(8);
}

/** Interpret a number as a signed 16-bit integer. */
export function toSigned16(n: number): number {
  const buf = new DataView(new ArrayBuffer(2));
  buf.setUint16(0, n & 0xffff);
  return buf.getInt16(0);
}

/** Interpret a number as an unsigned 16-bit integer. */
export function toUnsigned16(n: number): number {
  return n & 0xffff;
}

/** Interpret a number as a signed 32-bit integer. */
export function toSigned32(n: number): number {
  const buf = new DataView(new ArrayBuffer(4));
  buf.setUint32(0, (n & 0xffffffff) >>> 0);
  return buf.getInt32(0);
}

/** Interpret a number as an unsigned 32-bit integer. */
export function toUnsigned32(n: number): number {
  const buf = new DataView(new ArrayBuffer(4));
  buf.setInt32(0, n | 0);
  return buf.getUint32(0);
}

/** Return warning strings if the value exceeds common register ranges. */
export function getValueRangeWarnings(n: number): string[] {
  const warnings: string[] = [];
  if (!Number.isFinite(n)) {
    warnings.push("Value is not finite");
    return warnings;
  }
  if (!Number.isInteger(n)) {
    warnings.push("Value is not an integer -- register values are whole numbers");
  }
  const intN = Math.trunc(n);
  if (intN < 0) {
    warnings.push("Negative value -- will be interpreted as two's complement");
  }
  if (intN < -32768 || intN > 65535) {
    warnings.push("Exceeds uint16 / int16 range (0..65535 / -32768..32767)");
  }
  if (intN < -2147483648 || intN > 4294967295) {
    warnings.push("Exceeds uint32 / int32 range");
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// 2. Register Interpreter
// ---------------------------------------------------------------------------

/** Interpret a single 16-bit register word in all common formats. */
export function interpretRegister(word: number): RegisterInterpretation {
  const u16 = toUnsigned16(word);
  return {
    uint16: u16,
    int16: toSigned16(u16),
    hex: toHex(u16, 16),
    binary: toBinary(u16, 16),
  };
}

/** Interpret a register pair in every byte/word order combo. */
export function interpretRegisterPair(reg1: number, reg2: number): AllInterpretations {
  return {
    byteOrders: generateAllByteOrders(reg1, reg2),
  };
}

/** Swap the high and low bytes within a 16-bit word. */
export function swapBytes16(word: number): number {
  const w = word & 0xffff;
  return ((w & 0xff) << 8) | ((w >> 8) & 0xff);
}

/** Swap two 16-bit words (returns [reg2, reg1]). */
export function swapWords(high: number, low: number): [number, number] {
  return [low & 0xffff, high & 0xffff];
}

// ---------------------------------------------------------------------------
// 3. Byte/Word Order
// ---------------------------------------------------------------------------

/**
 * Given two 16-bit registers (reg1 = AB, reg2 = CD where A is MSB of reg1),
 * produce all four standard orderings with full numeric interpretations.
 *
 *   AB CD  -- big-endian words, big-endian bytes  (most common: Modbus default)
 *   CD AB  -- little-endian words, big-endian bytes
 *   BA DC  -- big-endian words, little-endian bytes (byte-swapped)
 *   DC BA  -- little-endian words + bytes
 */
export function generateAllByteOrders(reg1: number, reg2: number): ByteOrderResult[] {
  const r1 = reg1 & 0xffff;
  const r2 = reg2 & 0xffff;

  const A = (r1 >> 8) & 0xff;
  const B = r1 & 0xff;
  const C = (r2 >> 8) & 0xff;
  const D = r2 & 0xff;

  const orders: { label: string; bytes: [number, number, number, number] }[] = [
    { label: "AB CD (Big-endian)", bytes: [A, B, C, D] },
    { label: "CD AB (Little-endian words)", bytes: [C, D, A, B] },
    { label: "BA DC (Byte-swapped)", bytes: [B, A, D, C] },
    { label: "DC BA (Little-endian)", bytes: [D, C, B, A] },
  ];

  return orders.map(({ label, bytes }) => {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);
    u8[0] = bytes[0];
    u8[1] = bytes[1];
    u8[2] = bytes[2];
    u8[3] = bytes[3];

    return {
      order: label,
      hex:
        "0x" +
        bytes
          .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
          .join(""),
      uint32: view.getUint32(0, false),
      int32: view.getInt32(0, false),
      float32: view.getFloat32(0, false),
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Float / IEEE 754
// ---------------------------------------------------------------------------

/**
 * Decode two 16-bit registers into a 32-bit IEEE 754 float.
 * By default reg1 is the high word (big-endian / Modbus standard).
 * Set `swapWordsFlag` to true for devices that send the low word first.
 */
export function wordsToFloat32(
  reg1: number,
  reg2: number,
  swapWordsFlag = false,
): number {
  const high = swapWordsFlag ? reg2 & 0xffff : reg1 & 0xffff;
  const low = swapWordsFlag ? reg1 & 0xffff : reg2 & 0xffff;
  const buf = new DataView(new ArrayBuffer(4));
  buf.setUint16(0, high);
  buf.setUint16(2, low);
  return buf.getFloat32(0);
}

/** Encode a 32-bit float into two 16-bit register words [high, low]. */
export function float32ToWords(f: number): [number, number] {
  const buf = new DataView(new ArrayBuffer(4));
  buf.setFloat32(0, f);
  return [buf.getUint16(0), buf.getUint16(2)];
}

/** Full IEEE 754 breakdown of a float value. */
export function floatToIEEE754Breakdown(f: number): IEEE754Breakdown {
  const buf = new DataView(new ArrayBuffer(4));
  buf.setFloat32(0, f);
  const bits = buf.getUint32(0);

  const sign = (bits >>> 31) & 1;
  const exponentBiased = (bits >>> 23) & 0xff;
  const exponent = exponentBiased - 127;
  const mantissa = bits & 0x7fffff;
  const mantissaBits = mantissa.toString(2).padStart(23, "0");
  const fullBinary =
    sign.toString() +
    " " +
    exponentBiased.toString(2).padStart(8, "0") +
    " " +
    mantissaBits;
  const hex = toHex(bits, 32);

  let isSpecial = false;
  let specialLabel: string | undefined;

  if (exponentBiased === 0xff) {
    isSpecial = true;
    specialLabel = mantissa === 0 ? (sign ? "-Infinity" : "+Infinity") : "NaN";
  } else if (exponentBiased === 0 && mantissa === 0) {
    isSpecial = true;
    specialLabel = sign ? "-0" : "+0";
  } else if (exponentBiased === 0) {
    isSpecial = true;
    specialLabel = "Denormalized (subnormal)";
  }

  return {
    sign,
    exponent,
    exponentBiased,
    mantissa,
    mantissaBits,
    fullBinary,
    hex,
    isSpecial,
    specialLabel,
  };
}

/**
 * Heuristic: returns true when the float looks like a plausible sensor /
 * engineering value.  Returns false for NaN, Infinity, denormals, or
 * absurdly large magnitudes (> 1e15).
 */
export function isReasonableFloat(f: number): boolean {
  if (!Number.isFinite(f)) return false;
  // Detect denormals via IEEE breakdown
  const buf = new DataView(new ArrayBuffer(4));
  buf.setFloat32(0, f);
  const bits = buf.getUint32(0);
  const exponentBiased = (bits >>> 23) & 0xff;
  if (exponentBiased === 0 && (bits & 0x7fffff) !== 0) return false; // denormal
  if (Math.abs(f) > 1e15) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 5. Bit Mask / Bitfield
// ---------------------------------------------------------------------------

/** Return an array of bit states where index 0 = bit 0 (LSB). */
export function getBits(value: number, width: 16 | 32 = 16): boolean[] {
  const mask = width === 16 ? 0xffff : 0xffffffff;
  const v = (value & mask) >>> 0;
  const bits: boolean[] = [];
  for (let i = 0; i < width; i++) {
    bits.push(((v >>> i) & 1) === 1);
  }
  return bits;
}

/** Toggle (flip) a single bit. */
export function toggleBit(value: number, bit: number): number {
  return (value ^ (1 << bit)) >>> 0;
}

/** Set a single bit to 1. */
export function setBit(value: number, bit: number): number {
  return (value | (1 << bit)) >>> 0;
}

/** Clear a single bit to 0. */
export function clearBit(value: number, bit: number): number {
  return (value & ~(1 << bit)) >>> 0;
}

/** Test whether a single bit is set. */
export function testBit(value: number, bit: number): boolean {
  return ((value >>> bit) & 1) === 1;
}

/** Apply a bitwise mask operation. */
export function applyMask(
  value: number,
  mask: number,
  op: "AND" | "OR" | "XOR" | "NOT",
): number {
  switch (op) {
    case "AND":
      return (value & mask) >>> 0;
    case "OR":
      return (value | mask) >>> 0;
    case "XOR":
      return (value ^ mask) >>> 0;
    case "NOT":
      return (~value) >>> 0;
  }
}

/** Logical shift left, masked to `width` bits. */
export function shiftLeft(
  value: number,
  amount: number,
  width: 16 | 32 = 16,
): number {
  const mask = width === 16 ? 0xffff : 0xffffffff;
  return ((value << amount) & mask) >>> 0;
}

/** Logical shift right, masked to `width` bits. */
export function shiftRight(
  value: number,
  amount: number,
  width: 16 | 32 = 16,
): number {
  const mask = width === 16 ? 0xffff : 0xffffffff;
  return ((value & mask) >>> amount) >>> 0;
}

/** Extract a contiguous bitfield starting at `startBit` for `length` bits. */
export function extractBitfield(
  value: number,
  startBit: number,
  length: number,
): number {
  const mask = (1 << length) - 1;
  return (value >>> startBit) & mask;
}

// ---------------------------------------------------------------------------
// 6. Scaling
// ---------------------------------------------------------------------------

/** Common analog scaling presets for BAS field devices. */
export const SCALING_PRESETS: ScalingPreset[] = [
  { name: "0-10V", rawMin: 0, rawMax: 65535, engMin: 0, engMax: 10 },
  { name: "4-20mA", rawMin: 0, rawMax: 65535, engMin: 4, engMax: 20 },
  { name: "0-20mA", rawMin: 0, rawMax: 65535, engMin: 0, engMax: 20 },
  { name: "0-100%", rawMin: 0, rawMax: 65535, engMin: 0, engMax: 100 },
  { name: "Temperature (-40..85 C)", rawMin: 0, rawMax: 65535, engMin: -40, engMax: 85 },
  { name: "Pressure (0-150 PSI)", rawMin: 0, rawMax: 65535, engMin: 0, engMax: 150 },
  { name: "10-bit ADC 0-10V", rawMin: 0, rawMax: 1023, engMin: 0, engMax: 10 },
  { name: "12-bit ADC 0-10V", rawMin: 0, rawMax: 4095, engMin: 0, engMax: 10 },
];

/**
 * Linear scale a raw register value to engineering units.
 *
 *   eng = slope * raw + intercept
 *   slope = (engMax - engMin) / (rawMax - rawMin)
 *   intercept = engMin - slope * rawMin
 */
export function scaleLinear(
  raw: number,
  rawMin: number,
  rawMax: number,
  engMin: number,
  engMax: number,
): ScaleResult {
  if (rawMax === rawMin) {
    return {
      value: engMin,
      slope: 0,
      intercept: engMin,
      formula: `eng = ${engMin} (raw range is zero)`,
    };
  }
  const slope = (engMax - engMin) / (rawMax - rawMin);
  const intercept = engMin - slope * rawMin;
  const value = slope * raw + intercept;
  const slopeStr = Number.isInteger(slope) ? slope.toString() : slope.toPrecision(6);
  const interceptStr = Number.isInteger(intercept)
    ? intercept.toString()
    : intercept.toPrecision(6);
  const sign = intercept >= 0 ? "+" : "-";
  return {
    value,
    slope,
    intercept,
    formula: `eng = ${slopeStr} * raw ${sign} ${Math.abs(intercept).toPrecision(6)}`,
  };
}

/** Reverse-scale an engineering value back to raw register count. */
export function inverseScaleLinear(
  eng: number,
  rawMin: number,
  rawMax: number,
  engMin: number,
  engMax: number,
): InverseScaleResult {
  if (engMax === engMin) {
    return {
      value: rawMin,
      formula: `raw = ${rawMin} (eng range is zero)`,
    };
  }
  const slope = (rawMax - rawMin) / (engMax - engMin);
  const intercept = rawMin - slope * engMin;
  const value = slope * eng + intercept;
  const slopeStr = Number.isInteger(slope) ? slope.toString() : slope.toPrecision(6);
  const sign = intercept >= 0 ? "+" : "-";
  return {
    value,
    formula: `raw = ${slopeStr} * eng ${sign} ${Math.abs(intercept).toPrecision(6)}`,
  };
}

// ---------------------------------------------------------------------------
// 7. Modbus Address
// ---------------------------------------------------------------------------

/**
 * Quick-reference for Modbus register types based on Modicon convention.
 */
export const MODBUS_REFERENCE = `Modbus Address Pitfalls
========================
- Modicon 5-digit notation: the leading digit indicates register type,
  NOT an actual address offset.  "40001" means holding register #1
  (zero-based address 0), NOT address 40001.
- Some vendors use 0-based addressing, others 1-based.  Always confirm
  which convention is used before commissioning.
- Coils and discrete inputs are 1-bit, registers are 16-bit.
- Function codes: FC01 read coils, FC02 read discrete inputs,
  FC03 read holding registers, FC04 read input registers.
- A "register" is 16 bits.  32-bit values span TWO consecutive registers.
- Word order (high word first vs. low word first) varies by manufacturer.
  Always check the device documentation.
`;

/**
 * Derive Modbus address metadata from any addressing notation.
 *
 * Supported notations:
 *   "0-based"  -- raw protocol address (starts at 0)
 *   "1-based"  -- human-friendly (starts at 1)
 *   "modicon"  -- 5-digit Modicon format (0xxxx, 1xxxx, 3xxxx, 4xxxx)
 */
export function modbusAddressInfo(
  address: number,
  notation: "0-based" | "1-based" | "modicon",
): ModbusAddressInfo {
  // Decode into zero-based address and register type
  let zeroBased: number;
  let registerType: string;
  let functionCode: string;
  let modiconPrefix: number;

  if (notation === "modicon") {
    // Extract the leading digit(s) from the Modicon 5-/6-digit format
    if (address >= 400001) {
      // 6-digit extended holding registers
      zeroBased = address - 400001;
      registerType = "Holding Register";
      functionCode = "FC03 (Read) / FC06, FC16 (Write)";
      modiconPrefix = 400001;
    } else if (address >= 300001) {
      zeroBased = address - 300001;
      registerType = "Input Register";
      functionCode = "FC04 (Read)";
      modiconPrefix = 300001;
    } else if (address >= 100001) {
      zeroBased = address - 100001;
      registerType = "Discrete Input";
      functionCode = "FC02 (Read)";
      modiconPrefix = 100001;
    } else if (address >= 40001) {
      zeroBased = address - 40001;
      registerType = "Holding Register";
      functionCode = "FC03 (Read) / FC06, FC16 (Write)";
      modiconPrefix = 40001;
    } else if (address >= 30001) {
      zeroBased = address - 30001;
      registerType = "Input Register";
      functionCode = "FC04 (Read)";
      modiconPrefix = 30001;
    } else if (address >= 10001) {
      zeroBased = address - 10001;
      registerType = "Discrete Input";
      functionCode = "FC02 (Read)";
      modiconPrefix = 10001;
    } else if (address >= 1) {
      zeroBased = address - 1;
      registerType = "Coil";
      functionCode = "FC01 (Read) / FC05, FC15 (Write)";
      modiconPrefix = 1;
    } else {
      zeroBased = 0;
      registerType = "Unknown";
      functionCode = "N/A";
      modiconPrefix = 0;
    }
  } else {
    // 0-based or 1-based -- we don't know the type, assume holding register
    zeroBased = notation === "1-based" ? address - 1 : address;
    registerType = "Holding Register (assumed -- type unknown without Modicon prefix)";
    functionCode = "FC03 (Read) / FC06, FC16 (Write)";
    modiconPrefix = 40001;
  }

  if (zeroBased < 0) zeroBased = 0;
  const oneBased = zeroBased + 1;

  // Build Modicon string
  let modicon: string;
  if (registerType.startsWith("Holding")) {
    modicon = (40001 + zeroBased).toString();
  } else if (registerType.startsWith("Input Register")) {
    modicon = (30001 + zeroBased).toString();
  } else if (registerType.startsWith("Discrete")) {
    modicon = (10001 + zeroBased).toString();
  } else if (registerType.startsWith("Coil")) {
    modicon = (1 + zeroBased).toString().padStart(5, "0");
  } else {
    modicon = address.toString();
  }

  const notes =
    registerType === "Unknown"
      ? "Could not determine register type from address."
      : `Zero-based protocol address ${zeroBased} (0x${zeroBased.toString(16).toUpperCase()}).`;

  return {
    zeroBased,
    oneBased,
    modicon,
    registerType,
    functionCode,
    notes,
  };
}
