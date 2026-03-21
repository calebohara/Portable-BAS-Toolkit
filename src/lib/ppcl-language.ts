/**
 * Custom CodeMirror language mode for Siemens PPCL (Powers Process Control Language).
 * Token categories derived from PPCLSKILL.md reserved word list.
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { LanguageSupport } from '@codemirror/language';
import { autocompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete';

// ─── Token word sets ──────────────────────────────────────────

const COMMANDS = new Set([
  'ACT', 'ADAPTM', 'ADAPTS', 'AUTO', 'DBSWIT', 'DC', 'DCR', 'DEACT',
  'DEFINE', 'DISABL', 'DISALM', 'DISCOV', 'DPHONE', 'EMAUTO', 'EMFAST',
  'EMOFF', 'EMON', 'EMSET', 'EMSLOW', 'ENABLE', 'ENALM', 'ENCOV',
  'EPHONE', 'FAST', 'GETVAL', 'GOSUB', 'GOTO', 'HLIMIT', 'HOLIDA',
  'INITTO', 'LLIMIT', 'LOCAL', 'LOOP', 'LSQ2', 'LSQDAT', 'NIGHT',
  'NORMAL', 'OIP', 'ONPWRT', 'PARAMETER', 'PDL', 'PDLDAT', 'PDLDPG',
  'PDLMTR', 'PDLSET', 'RELEAS', 'RETURN', 'SAMPLE', 'SET', 'SETVAL',
  'SLOW', 'SSTO', 'SSTOCO', 'STATE', 'TABLE', 'TIMAVG', 'TOD',
  'TODMOD', 'TODSET', 'WAIT',
]);

const CONTROL_KEYWORDS = new Set(['IF', 'THEN', 'ELSE']);

// Commands that double as status indicators — context-dependent
const DUAL_WORDS = new Set(['ALARM', 'ON', 'OFF', 'DAY', 'MIN', 'MAX']);

const FUNCTIONS = new Set([
  'ALMPRI', 'ATN', 'COM', 'COS', 'EXP', 'LOG', 'SIN', 'SQRT', 'TAN', 'TOTAL',
]);

const STATUS_INDICATORS = new Set([
  'ALARM', 'ALMACK', 'AUTO', 'DAYMOD', 'DEAD', 'FAILED', 'FAST',
  'HAND', 'LOW', 'NGTMOD', 'OFF', 'OK', 'ON', 'PRFON', 'SLOW',
]);

const RESIDENT_POINTS = new Set([
  'ALMCNT', 'ALMCT2', 'CRTIME', 'DAY', 'DAYOFM', 'LINK', 'MONTH',
  'SECNDS', 'TIME',
]);

// NODE1..NODE99, SECND1..SECND7
function isNodeOrSecnd(w: string): boolean {
  if (w.startsWith('NODE') && /^NODE\d{1,2}$/.test(w)) return true;
  if (w.startsWith('SECND') && /^SECND[1-7]$/.test(w)) return true;
  return false;
}

const DOT_OPERATORS = new Set([
  '.EQ.', '.NE.', '.GT.', '.GE.', '.LT.', '.LE.',
  '.AND.', '.NAND.', '.OR.', '.XOR.', '.ROOT.',
]);

// ─── Parser state ──────────────────────────────────────────────

interface PpclState {
  afterLineNumber: boolean;
  isComment: boolean;
}

// ─── StreamParser ──────────────────────────────────────────────

const ppclParser: StreamParser<PpclState> = {
  name: 'ppcl',

  startState(): PpclState {
    return { afterLineNumber: false, isComment: false };
  },

  token(stream, state): string | null {
    // Start of line — reset state
    if (stream.sol()) {
      state.afterLineNumber = false;
      state.isComment = false;
    }

    // If we're in a comment line, consume everything
    if (state.isComment) {
      stream.skipToEnd();
      return 'comment';
    }

    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Start of line: check for line number
    if (stream.sol() || !state.afterLineNumber) {
      // Try to match line number at start
      if (stream.match(/^\d+/, true)) {
        state.afterLineNumber = true;

        // Peek ahead — if next non-space char is 'C' followed by space or '(', this is a comment line
        const rest = stream.string.slice(stream.pos).trimStart();
        if (rest.length > 0 && rest[0] === 'C' && (rest.length === 1 || rest[1] === ' ' || rest[1] === '(')) {
          state.isComment = true;
        }

        return 'number';
      }
      state.afterLineNumber = true;
    }

    // Comment line: C followed by space or paren (after line number was already consumed)
    if (stream.peek() === 'C') {
      const rest = stream.string.slice(stream.pos);
      if (/^C(\s|\()/.test(rest) || rest === 'C') {
        stream.skipToEnd();
        state.isComment = true;
        return 'comment';
      }
    }

    // Double-quoted strings
    if (stream.peek() === '"') {
      stream.next(); // consume opening quote
      while (!stream.eol()) {
        if (stream.next() === '"') break;
      }
      return 'string';
    }

    // Dot-operators: .EQ., .AND., etc.
    if (stream.peek() === '.') {
      for (const op of DOT_OPERATORS) {
        if (stream.match(op, true)) return 'operator';
      }
      // Not a recognized dot-operator, consume the dot
      stream.next();
      return null;
    }

    // Priority indicators: @EMER, @SMOKE, @PDL, @OPER, @NONE
    if (stream.peek() === '@') {
      if (stream.match(/@(EMER|SMOKE|PDL|OPER|NONE)\b/, true)) return 'meta';
      // @ prefix for point names starting with digit
      stream.next();
      return null;
    }

    // Dollar-prefixed variables: $ARG1-15, $LOC1-15, $BATT, $PDL
    if (stream.peek() === '$') {
      if (stream.match(/\$ARG\d{1,2}\b/, true)) return 'variableName.special';
      if (stream.match(/\$LOC\d{1,2}\b/, true)) return 'variableName.special';
      if (stream.match(/\$BATT\b/, true)) return 'variableName.special';
      if (stream.match(/\$PDL\b/, true)) return 'variableName.special';
      if (stream.match(/\$\w+/, true)) return 'variableName.special';
      stream.next();
      return null;
    }

    // Numbers (decimal and integer)
    if (stream.match(/^\d+:\d+/, true)) return 'number'; // time format like 17:00
    if (stream.match(/^\d+\.\d*/, true)) return 'number';
    if (stream.match(/^\d+/, true)) return 'number';

    // Words (identifiers, commands, status indicators)
    if (stream.match(/^[A-Za-z_]\w*/, true)) {
      const word = stream.current().toUpperCase();

      // Control keywords
      if (CONTROL_KEYWORDS.has(word)) return 'keyword';

      // Built-in functions
      if (FUNCTIONS.has(word)) return 'builtin';

      // Commands
      if (COMMANDS.has(word)) return 'keyword';

      // Dual-use words (ALARM, ON, OFF, DAY, MIN, MAX) — treat as keyword
      if (DUAL_WORDS.has(word)) return 'keyword';

      // Resident points
      if (RESIDENT_POINTS.has(word)) return 'atom';
      if (isNodeOrSecnd(word)) return 'atom';

      // Status indicators (when not already matched as command)
      if (STATUS_INDICATORS.has(word)) return 'atom';

      // Everything else is a point name / identifier
      return 'variableName';
    }

    // Operators
    const ch = stream.next();
    if (ch === '=' || ch === '+' || ch === '-' || ch === '*' || ch === '/') return 'operator';
    if (ch === '(' || ch === ')' || ch === ',') return 'punctuation';
    if (ch === '&') return 'punctuation'; // continuation character

    return null;
  },
};

// ─── Autocomplete completions ──────────────────────────────────

const PPCL_COMPLETIONS: Completion[] = [
  // ── Program Control ──
  { label: 'ACT', type: 'keyword', detail: 'Activate lines', info: 'ACT(line1, line2, ..., line16)\nActivates 1–16 specified PPCL lines.' },
  { label: 'DEACT', type: 'keyword', detail: 'Deactivate lines', info: 'DEACT(line1, line2, ..., line16)\nDeactivates specified PPCL lines.' },
  { label: 'ENABLE', type: 'keyword', detail: 'Enable lines', info: 'ENABLE(line1, line2, ..., line16)\nEnables specified PPCL lines.' },
  { label: 'DISABL', type: 'keyword', detail: 'Disable lines', info: 'DISABL(line1, line2, ..., line16)\nDisables specified PPCL lines.' },
  { label: 'GOSUB', type: 'keyword', detail: 'Call subroutine', info: 'GOSUB(line, arg1, arg2, ...)\nCalls subroutine at line#. Args accessible as $ARG1–$ARG15.\nCannot be used inside IF/THEN/ELSE.' },
  { label: 'RETURN', type: 'keyword', detail: 'Return from subroutine', info: 'RETURN\nReturns control from a GOSUB subroutine.' },
  { label: 'GOTO', type: 'keyword', detail: 'Jump to line', info: 'GOTO(line)\nJumps to specified line number.\nMust jump forward (higher line#) except the last GOTO in the program.' },
  { label: 'ONPWRT', type: 'keyword', detail: 'Power-up entry point', info: 'ONPWRT(line#)\nSets the first line executed after power failure.\nShould be the first command in the program.' },
  { label: 'SAMPLE', type: 'keyword', detail: 'Timed execution', info: 'SAMPLE(time, cmd)\nExecutes cmd once per time interval (seconds).\nMust be evaluated every pass. Cannot nest TOD/LOOP/SSTO inside.' },
  { label: 'IF', type: 'keyword', detail: 'Conditional', info: 'IF (condition) THEN cmd [ELSE cmd]\nSingle-statement conditional. One statement per branch only.' },
  { label: 'THEN', type: 'keyword', detail: 'IF branch', info: 'Part of IF/THEN/ELSE conditional.' },
  { label: 'ELSE', type: 'keyword', detail: 'IF alternate', info: 'Part of IF/THEN/ELSE conditional.' },
  { label: 'WAIT', type: 'keyword', detail: 'Time delay', info: 'WAIT(time, pt1, pt2 [, mode])\nWaits 1–32767 seconds after trigger point changes state.\nMust be evaluated every pass.' },

  // ── Point Control ──
  { label: 'ON', type: 'keyword', detail: 'Turn points ON', info: 'ON(pt1, ..., pt16)\nON(@priority, pt1, ..., pt15)\nCommands up to 16 points to ON status.' },
  { label: 'OFF', type: 'keyword', detail: 'Turn points OFF', info: 'OFF(pt1, ..., pt16)\nOFF(@priority, pt1, ..., pt15)\nCommands up to 16 points to OFF status.' },
  { label: 'SET', type: 'keyword', detail: 'Set analog value', info: 'SET(value, pt1, ..., pt15)\nSET(@priority, value, pt1, ..., pt14)\nCommands points to analog value. Value must be decimal (not integer).' },
  { label: 'FAST', type: 'keyword', detail: 'Set FAST speed', info: 'FAST(pt1, ..., pt16)\nCommands FAST/SLOW/STOP points to FAST state.' },
  { label: 'SLOW', type: 'keyword', detail: 'Set SLOW speed', info: 'SLOW(pt1, ..., pt16)\nCommands FAST/SLOW/STOP points to SLOW state.' },
  { label: 'AUTO', type: 'keyword', detail: 'Set AUTO mode', info: 'AUTO(pt1, ..., pt16)\nCommands ON/OFF/AUTO points to AUTO state.' },
  { label: 'STATE', type: 'keyword', detail: 'Command by state text', info: 'STATE(@pri, statetext, pt1, ..., pt14)\nAPOGEE only. Commands points using state text values.' },
  { label: 'INITTO', type: 'keyword', detail: 'Init totalization', info: 'INITTO(value, pt1, ..., pt15)\nInitializes totalized values. Value must be decimal.' },

  // ── Operational Control ──
  { label: 'ALARM', type: 'keyword', detail: 'Force alarm state', info: 'ALARM(pt1, ..., pt16)\nForces points into ALARM state. Points must be alarmable.' },
  { label: 'NORMAL', type: 'keyword', detail: 'Remove alarm', info: 'NORMAL(pt1, ..., pt16)\nRemoves points from alarm-by-command state.' },
  { label: 'ENALM', type: 'keyword', detail: 'Enable alarm printing', info: 'ENALM(pt1, ..., pt16)\nRe-enables alarm printing for up to 16 points.' },
  { label: 'DISALM', type: 'keyword', detail: 'Disable alarm printing', info: 'DISALM(pt1, ..., pt16)\nDisables alarm printing. Point status changes to *PDSB*.' },
  { label: 'HLIMIT', type: 'keyword', detail: 'Set high alarm limit', info: 'HLIMIT(value, pt1, ..., pt15)\nSets high alarm limit for analog points. Value must be decimal.' },
  { label: 'LLIMIT', type: 'keyword', detail: 'Set low alarm limit', info: 'LLIMIT(value, pt1, ..., pt15)\nSets low alarm limit for analog points. Value must be decimal.' },

  // ── Emergency Control ──
  { label: 'EMON', type: 'keyword', detail: 'Emergency ON', info: 'EMON(pt1, ..., pt16)\nCommands points ON with emergency priority.' },
  { label: 'EMOFF', type: 'keyword', detail: 'Emergency OFF', info: 'EMOFF(pt1, ..., pt16)\nCommands points OFF with emergency priority.' },
  { label: 'EMFAST', type: 'keyword', detail: 'Emergency FAST', info: 'EMFAST(pt1, ..., pt16)\nCommands points to FAST with emergency priority.' },
  { label: 'EMSLOW', type: 'keyword', detail: 'Emergency SLOW', info: 'EMSLOW(pt1, ..., pt16)\nCommands points to SLOW with emergency priority.' },
  { label: 'EMAUTO', type: 'keyword', detail: 'Emergency AUTO', info: 'EMAUTO(pt1, ..., pt16)\nCommands points to AUTO with emergency priority.' },
  { label: 'EMSET', type: 'keyword', detail: 'Emergency SET', info: 'EMSET(value, pt1, ..., pt15)\nSets analog points with emergency priority.' },
  { label: 'RELEAS', type: 'keyword', detail: 'Release priority', info: 'RELEAS(pt1, ..., pt16)\nRELEAS(@prior, pt1, ..., pt15)\nReleases points to @NONE priority.' },

  // ── Energy Management ──
  { label: 'LOOP', type: 'keyword', detail: 'PID control', info: 'LOOP(type, pv, cv, sp, pg, ig, dg, st, bias, lo, hi, 0)\ntype: 0=direct, 128=reverse acting.\nMust be evaluated every pass.' },
  { label: 'ADAPTM', type: 'keyword', detail: 'Adaptive control (multi)', info: 'ADAPTM(...)\nAdaptive multi-setpoint PID control. Self-tuning.\nAPOGEE Rev 2.4+ / all BACnet firmware.' },
  { label: 'ADAPTS', type: 'keyword', detail: 'Adaptive control (single)', info: 'ADAPTS(...)\nAdaptive single-setpoint PID control. Self-tuning.\nAPOGEE Rev 2.4+ / all BACnet firmware.' },
  { label: 'DC', type: 'keyword', detail: 'Duty cycling', info: 'DC(pt1, pat1, ..., pt8, pat8)\nDuty cycles up to 8 points using 4-digit pattern codes.\nPriority is @NONE.' },
  { label: 'DCR', type: 'keyword', detail: 'Duty cycle w/ reset', info: 'DCR(pt1, temp1, high1, low1, ..., pt4, temp4, high4, low4)\nDuty cycles based on temperature dead band. Up to 4 sets.' },
  { label: 'TOD', type: 'keyword', detail: 'Time-of-day ON/OFF', info: 'TOD(mode, recomd, time1, time2, pt1, ..., pt12)\nCommands digital points ON/OFF by time and day mode.\nMust be evaluated every pass.' },
  { label: 'TODMOD', type: 'keyword', detail: 'Define day types', info: 'TODMOD(mo, tu, we, th, fr, sa, su)\nDefines day type per weekday: 1=Normal, 2=Extended, 4=Shortened, 8=Weekend.\nMust precede TOD/TODSET.' },
  { label: 'TODSET', type: 'keyword', detail: 'Time-of-day SET', info: 'TODSET(mode, recomd, time1, val1, time2, val2, pt1, ..., pt10)\nSets analog point values by time and day mode.' },
  { label: 'HOLIDA', type: 'keyword', detail: 'Define holidays', info: 'HOLIDA(month1, day1, ..., month8, day8)\nDefines up to 8 holidays. Sets TODMOD mode to 16.\nMust precede TOD/TODSET.' },
  { label: 'DAY', type: 'keyword', detail: 'Day mode command', info: 'DAY(pt1, ..., pt16)\nCommands points to day mode.' },
  { label: 'NIGHT', type: 'keyword', detail: 'Night mode command', info: 'NIGHT(pt1, ..., pt16)\nCommands points to night mode.' },
  { label: 'SSTO', type: 'keyword', detail: 'Optimal start/stop', info: 'SSTO(zone, mode, cst, csp, est, lst, ost, esp, lsp, osp, ast, asp)\nCalculates optimal start/stop times. Use with TOD/TODSET.' },
  { label: 'SSTOCO', type: 'keyword', detail: 'SSTO coefficients', info: 'SSTOCO(zone, season, intemp, outemp, ctemp, c1-c4, htemp, h1-h4)\nDefines thermal coefficients for SSTO calculations.' },
  { label: 'PDL', type: 'keyword', detail: 'Peak demand limiting', info: 'PDL(area, totkw, target, g1s, g1e, sh1, ..., g4s, g4e, sh4)\nControls electrical demand shedding in priority groups.' },
  { label: 'PDLDAT', type: 'keyword', detail: 'PDL load data', info: 'PDLDAT(ptname, minon, minoff, maxoff, kwval)\nDefines a single load for PDL shedding.' },
  { label: 'PDLMTR', type: 'keyword', detail: 'PDL meter config', info: 'PDLMTR(area, hist, calc, window, plot, warning, mt1, def1, ...)\nDefines metering parameters for a PDL area.' },
  { label: 'PDLSET', type: 'keyword', detail: 'PDL set points', info: 'PDLSET(area, exceed, set1, time1, ..., set7, time7)\nDefines demand set points and time intervals.' },
  { label: 'PDLDPG', type: 'keyword', detail: 'Distributed PDL', info: 'PDLDPG(area, kwtot1, target1, ..., kwtot7, target7)\nDefines distributed PDL parameters.' },

  // ── Special Function ──
  { label: 'TABLE', type: 'keyword', detail: 'Lookup table', info: 'TABLE(input, output, x1, y1, ..., x7, y7)\nStraight-line interpolation. Up to 7 coordinate pairs.\nX values must be in ascending order.' },
  { label: 'TIMAVG', type: 'keyword', detail: 'Time average', info: 'TIMAVG(result, st, samples, input)\nAverages input over time. samples: 1–10.\nNot available on APOGEE firmware.' },
  { label: 'DBSWIT', type: 'keyword', detail: 'Dead-band switch', info: 'DBSWIT(type, input, low, high, pt1, ..., pt12)\ntype 0: ON above high, OFF below low.\ntype 1: ON below low, OFF above high.' },
  { label: 'MIN', type: 'keyword', detail: 'Minimum value', info: 'MIN(pt1, ..., pt16)\nReturns the minimum value among up to 16 points.' },
  { label: 'MAX', type: 'keyword', detail: 'Maximum value', info: 'MAX(pt1, ..., pt16)\nReturns the maximum value among up to 16 points.' },
  { label: 'OIP', type: 'keyword', detail: 'Operator interface', info: 'OIP(...)\nEmulates field-panel keyboard keystrokes.\nCannot control Insight graphics pages.' },
  { label: 'DEFINE', type: 'keyword', detail: 'Name abbreviation', info: 'DEFINE(abbrev, string)\nPhysical firmware only. Creates shorthand for long point names.\nUse %abbrev% in program lines.' },
  { label: 'LOCAL', type: 'keyword', detail: 'Local variables', info: 'LOCAL(pt1, pt2, ..., pt16)\nCreates virtual points referenced as $pt1–$pt16.\nOther programs access via ProgramName:LocalPointName.' },
  { label: 'PARAMETER', type: 'keyword', detail: 'Compile-time constant', info: 'PARAMETER A = B\nPhysical firmware only. Defines compile-time constant.\nNo line number required.' },
  { label: 'LSQ2', type: 'keyword', detail: 'Least squares curve', info: 'LSQ2(...)\nDefines XYZ Least Squares Curve Fit. Must be followed by LSQDAT.\nBACnet/PXC-era addition for CPOP.' },
  { label: 'LSQDAT', type: 'keyword', detail: 'LSQ2 input data', info: 'LSQDAT(...)\nDefines input data values for LSQ2 function.' },

  // ── BACnet Commands ──
  { label: 'GETVAL', type: 'keyword', detail: 'Read BACnet property', info: 'GETVAL(objRef, propSpec, destPoint)\nReads BACnet object properties. Numeric types only.\nobjRef: BAC_7_AO_11 or named reference.' },
  { label: 'SETVAL', type: 'keyword', detail: 'Write BACnet property', info: 'SETVAL(srcValSpec, targPropSpec, targObjRef1, ..., targObjRef14)\nWrites property to 1–14 BACnet target objects.' },

  // ── Phone ──
  { label: 'EPHONE', type: 'keyword', detail: 'Enable phone dialing', info: 'EPHONE(pt1, ..., pt16)\nEnables phone dialing for up to 16 points.' },
  { label: 'DPHONE', type: 'keyword', detail: 'Disable phone dialing', info: 'DPHONE(pt1, ..., pt16)\nDisables phone dialing for up to 16 points.' },

  // ── COV ──
  { label: 'ENCOV', type: 'keyword', detail: 'Enable COV reporting', info: 'ENCOV(pt1, ..., pt16)\nEnables Change-Of-Value reporting. Points must be in same device.' },
  { label: 'DISCOV', type: 'keyword', detail: 'Disable COV reporting', info: 'DISCOV(pt1, ..., pt16)\nDisables Change-Of-Value reporting.' },

  // ── Built-in Functions ──
  { label: 'ALMPRI', type: 'function', detail: 'Alarm priority (1–6)', info: 'ALMPRI(pt1)\nReturns alarm priority level 1–6. Cannot cross network.' },
  { label: 'TOTAL', type: 'function', detail: 'Totalized value', info: 'TOTAL(pt1)\nReturns accumulated runtime/totalized value. Cannot cross network.' },
  { label: 'ATN', type: 'function', detail: 'Arctangent (degrees)', info: 'pt1 = ATN(value1)\nReturns arctangent in degrees.' },
  { label: 'COM', type: 'function', detail: 'Complement', info: 'pt1 = COM(value1)\nReturns complement of value.' },
  { label: 'COS', type: 'function', detail: 'Cosine (degrees)', info: 'pt1 = COS(value1)\nReturns cosine. Input in degrees.' },
  { label: 'EXP', type: 'function', detail: 'Natural antilog', info: 'pt1 = EXP(value1)\nReturns e^value.' },
  { label: 'LOG', type: 'function', detail: 'Natural log', info: 'pt1 = LOG(value1)\nReturns natural logarithm.' },
  { label: 'SIN', type: 'function', detail: 'Sine (degrees)', info: 'pt1 = SIN(value1)\nReturns sine. Input in degrees.' },
  { label: 'SQRT', type: 'function', detail: 'Square root', info: 'pt1 = SQRT(value1)\nReturns square root.' },
  { label: 'TAN', type: 'function', detail: 'Tangent (degrees)', info: 'pt1 = TAN(value1)\nReturns tangent. Input in degrees.' },

  // ── Dot Operators ──
  { label: '.EQ.', type: 'operator', detail: 'Equal', info: 'Relational: equal to' },
  { label: '.NE.', type: 'operator', detail: 'Not equal', info: 'Relational: not equal to' },
  { label: '.GT.', type: 'operator', detail: 'Greater than', info: 'Relational: greater than' },
  { label: '.GE.', type: 'operator', detail: 'Greater or equal', info: 'Relational: greater than or equal' },
  { label: '.LT.', type: 'operator', detail: 'Less than', info: 'Relational: less than' },
  { label: '.LE.', type: 'operator', detail: 'Less or equal', info: 'Relational: less than or equal' },
  { label: '.AND.', type: 'operator', detail: 'Logical AND', info: 'Logical AND operator' },
  { label: '.NAND.', type: 'operator', detail: 'Logical NAND', info: 'Logical NAND operator' },
  { label: '.OR.', type: 'operator', detail: 'Logical OR', info: 'Logical OR operator' },
  { label: '.XOR.', type: 'operator', detail: 'Exclusive OR', info: 'Logical XOR operator' },
  { label: '.ROOT.', type: 'operator', detail: 'Root function', info: 'value1.ROOT.value2\nBinary root operator.' },

  // ── Priority Indicators ──
  { label: '@EMER', type: 'constant', detail: 'Emergency priority', info: 'Highest PPCL priority level.' },
  { label: '@SMOKE', type: 'constant', detail: 'Smoke priority', info: 'Smoke control emergency priority.' },
  { label: '@PDL', type: 'constant', detail: 'PDL priority', info: 'Peak demand limiting priority.' },
  { label: '@OPER', type: 'constant', detail: 'Operator priority', info: 'Manual operator override priority.' },
  { label: '@NONE', type: 'constant', detail: 'PPCL priority', info: 'Default PPCL priority (lowest). Used to test if a point is at PPCL priority.' },

  // ── Resident Points ──
  { label: 'ALMCNT', type: 'variable', detail: 'Alarm count', info: 'Increments/decrements for each alarm.' },
  { label: 'ALMCT2', type: 'variable', detail: 'Alarm count 2', info: 'Secondary counter for enhanced alarm points.' },
  { label: 'CRTIME', type: 'variable', detail: 'Decimal time', info: 'Current time as decimal 0.00–23.999721. Updated every second.' },
  { label: 'TIME', type: 'variable', detail: 'Military time', info: '24-hour time resident point.' },
  { label: 'DAY', type: 'variable', detail: 'Day of week', info: 'Day of week resident point.' },
  { label: 'DAYOFM', type: 'variable', detail: 'Day of month', info: 'Day of month resident point.' },
  { label: 'MONTH', type: 'variable', detail: 'Month', info: 'Month resident point (1–12).' },
  { label: 'LINK', type: 'variable', detail: 'Comm link status', info: '0 = not communicating, 1 = communicating.' },
  { label: 'SECNDS', type: 'variable', detail: 'Seconds counter', info: 'Seconds counter resident point.' },
  { label: '$BATT', type: 'variable', detail: 'Battery status', info: 'Battery condition: OK, LOW, DEAD.' },
  { label: '$PDL', type: 'variable', detail: 'PDL monitor', info: 'Peak demand limiting monitor point.' },

  // ── Status Indicators ──
  { label: 'ALMACK', type: 'constant', detail: 'Alarm acknowledged', info: 'Point alarm has been acknowledged.' },
  { label: 'DAYMOD', type: 'constant', detail: 'Day mode', info: 'Point is in day mode.' },
  { label: 'DEAD', type: 'constant', detail: 'Battery dead', info: 'Battery discharged status.' },
  { label: 'FAILED', type: 'constant', detail: 'Communication failure', info: 'Point/device communication failure.' },
  { label: 'HAND', type: 'constant', detail: 'Manual override', info: 'Manual override is active.' },
  { label: 'LOW', type: 'constant', detail: 'Battery low', info: 'Battery low status.' },
  { label: 'NGTMOD', type: 'constant', detail: 'Night mode', info: 'Point is in night mode.' },
  { label: 'OK', type: 'constant', detail: 'Normal/charged', info: 'Battery charged or normal status.' },
  { label: 'PRFON', type: 'constant', detail: 'Proof of operation', info: 'Proof of operation is on.' },
];

function ppclCompletions(context: CompletionContext) {
  // Match word characters, $ prefix, @ prefix, or dot-operator prefix
  const word = context.matchBefore(/[\w$@.]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const text = word.text.toUpperCase();

  // Filter completions by prefix
  const filtered = PPCL_COMPLETIONS.filter(c =>
    c.label.toUpperCase().startsWith(text)
  );

  if (filtered.length === 0) return null;

  return {
    from: word.from,
    options: filtered,
    validFor: /^[\w$@.]*$/,
  };
}

const ppclStreamLanguage = StreamLanguage.define(ppclParser);

export function ppclLanguage(): LanguageSupport {
  return new LanguageSupport(ppclStreamLanguage, [
    autocompletion({ override: [ppclCompletions] }),
  ]);
}
