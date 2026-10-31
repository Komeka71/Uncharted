import { ParsedLog } from '../types/index.js';
import { redactSecrets } from '../redactor/index.js';

// ANSI escape code regex
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

// GitHub Actions ISO timestamp prefix regex
const GHA_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+/;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

export function parseAndCleanLog(rawLog: string): ParsedLog {
  if (!rawLog || typeof rawLog !== 'string') {
    return {
      raw: '',
      cleanedLines: [],
      steps: [],
      failingStepName: undefined,
      redactions: {
        count: 0,
        types: {}
      },
      windowedLines: []
    };
  }

  // Step 1: Strip ANSI and split lines (normalizing both \r\n and \r)
  const cleanAnsi = stripAnsi(rawLog);

  // Step 2: Redact secrets first while keeping exact 1:1 line mapping
  // This guarantees that both cleanedLines AND the raw field cannot expose credentials
  const redactionRes = redactSecrets(cleanAnsi);
  const redactedLines = redactionRes.lines;

  // Step 3: Process lines, strip leading ISO timestamp for cleaner rule matching, keep original 1-indexed line numbers
  const cleanedLines: { lineNo: number; text: string }[] = [];
  const steps: { name: string; hasError: boolean; lines: { lineNo: number; text: string }[] }[] = [];
  
  let currentStepName = 'Initialization';
  let currentStepHasError = false;
  let currentStepLines: { lineNo: number; text: string }[] = [];
  let failingStepName: string | undefined = undefined;

  for (let i = 0; i < redactedLines.length; i++) {
    const originalLineNo = i + 1;
    let line = redactedLines[i];

    // Strip leading ISO timestamp if present
    const strippedLine = line.replace(GHA_TIMESTAMP_REGEX, '');

    // Check GHA group markers
    const groupMatch = strippedLine.match(/^##\[group\](.*)$/);
    if (groupMatch) {
      if (currentStepLines.length > 0) {
        steps.push({
          name: currentStepName,
          hasError: currentStepHasError,
          lines: currentStepLines
        });
      }
      currentStepName = groupMatch[1].trim() || `Step ${steps.length + 1}`;
      currentStepHasError = false;
      currentStepLines = [];
      cleanedLines.push({ lineNo: originalLineNo, text: strippedLine });
      continue;
    } else if (/^##\[endgroup\]/.test(strippedLine)) {
      if (currentStepLines.length > 0) {
        steps.push({
          name: currentStepName,
          hasError: currentStepHasError,
          lines: currentStepLines
        });
      }
      currentStepName = 'Post-Step';
      currentStepHasError = false;
      currentStepLines = [];
      cleanedLines.push({ lineNo: originalLineNo, text: strippedLine });
      continue;
    }

    if (/##\[error\]/i.test(strippedLine) || /Process completed with exit code [1-9]/i.test(strippedLine)) {
      currentStepHasError = true;
      if (!failingStepName) {
        failingStepName = currentStepName;
      }
    }

    const cleanedEntry = { lineNo: originalLineNo, text: strippedLine };
    cleanedLines.push(cleanedEntry);
    currentStepLines.push(cleanedEntry);
  }

  if (currentStepLines.length > 0) {
    steps.push({
      name: currentStepName,
      hasError: currentStepHasError,
      lines: currentStepLines
    });
  }

  // Windowing for big logs: keep first 50 lines, 120 lines around first error, last 150 lines
  const windowedLines = calculateLogWindow(cleanedLines);

  // SECURITY BOUNDARY GUARANTEE:
  // raw must never contain unredacted secrets. We store the sanitized, redacted text.
  return {
    raw: redactionRes.cleanedText,
    cleanedLines,
    steps,
    failingStepName,
    redactions: {
      count: redactionRes.redactionCount,
      types: redactionRes.redactedTypes
    },
    windowedLines
  };
}

export function calculateLogWindow(
  lines: { lineNo: number; text: string }[],
  headCount = 50,
  epicenterCount = 120,
  tailCount = 150
): { lineNo: number; text: string }[] {
  if (lines.length <= headCount + epicenterCount + tailCount) {
    return lines;
  }

  // Find first primary error line
  let errorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    if (
      /##\[error\]/i.test(text) ||
      /error TS\d+:/i.test(text) ||
      /npm ERR!/i.test(text) ||
      /FAIL\s+/i.test(text) ||
      /FAILED tests\//i.test(text) ||
      /Process completed with exit code [1-9]/i.test(text)
    ) {
      errorIndex = i;
      break;
    }
  }

  const selectedLineNumbers = new Set<number>();

  // Head lines (first 50)
  for (let i = 0; i < Math.min(headCount, lines.length); i++) {
    selectedLineNumbers.add(lines[i].lineNo);
  }

  // Epicenter lines (around first error)
  if (errorIndex !== -1) {
    const start = Math.max(0, errorIndex - Math.floor(epicenterCount / 2));
    const end = Math.min(lines.length, start + epicenterCount);
    for (let i = start; i < end; i++) {
      selectedLineNumbers.add(lines[i].lineNo);
    }
  }

  // Tail lines (last 150)
  const tailStart = Math.max(0, lines.length - tailCount);
  for (let i = tailStart; i < lines.length; i++) {
    selectedLineNumbers.add(lines[i].lineNo);
  }

  return lines.filter((l) => selectedLineNumbers.has(l.lineNo));
}
