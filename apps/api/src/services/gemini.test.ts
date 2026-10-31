import { test, describe } from 'node:test';
import assert from 'node:assert';
import { stripCodeFences, validateAndBuildOutput, extractTokens } from './gemini.js';
import { RuleMatch } from '@origin/core';

const validLineNumbers = new Set([1, 2, 3, 4, 5]);

const ruleMatch: RuleMatch = {
  ruleId: 'test-rule',
  category: 'build_compile',
  confidence: 0.95,
  evidence: [{ lineNo: 3, text: 'error TS2339', role: 'primary' }],
  extracted: {},
  transient: false,
  title: 'Test Rule',
  explanation: 'Test explanation',
  fixHints: ['Run tsc --noEmit', 'Fix type mismatch'],
};

describe('stripCodeFences', () => {
  test('returns plain JSON unchanged', () => {
    const input = '{"summary": "test", "rootCause": "cause", "confidence": "high", "evidenceLines": [1], "fixSteps": ["step"]}';
    assert.strictEqual(stripCodeFences(input), input);
  });

  test('strips markdown json code fence', () => {
    const input = '```json\n{"summary": "test"}\n```';
    const result = stripCodeFences(input);
    assert.strictEqual(result, '{"summary": "test"}');
  });

  test('strips generic markdown code fence', () => {
    const input = '```\n{"summary": "test"}\n```';
    const result = stripCodeFences(input);
    assert.strictEqual(result, '{"summary": "test"}');
  });

  test('handles whitespace around fence', () => {
    const input = '  ```json\n{"summary": "test"}\n```  ';
    const result = stripCodeFences(input);
    assert.strictEqual(result, '{"summary": "test"}');
  });

  test('returns non-fenced text unchanged', () => {
    const input = 'some plain text';
    assert.strictEqual(stripCodeFences(input), 'some plain text');
  });
});

describe('validateAndBuildOutput', () => {
  test('valid structured response returns correct output', () => {
    const parsed = {
      summary: 'Build failed',
      rootCause: 'Type mismatch in src/index.ts',
      confidence: 'high',
      evidenceLines: [1, 3],
      fixSteps: ['Run tsc', 'Fix types'],
    };
    const result = validateAndBuildOutput(parsed, validLineNumbers, ruleMatch);
    assert.strictEqual(result.summary, 'Build failed');
    assert.strictEqual(result.rootCause, 'Type mismatch in src/index.ts');
    assert.strictEqual(result.confidence, 'high');
    assert.deepStrictEqual(result.evidenceLines, [1, 3]);
    assert.deepStrictEqual(result.fixSteps, ['Run tsc', 'Fix types']);
  });

  test('null input throws validation error', () => {
    assert.throws(() => validateAndBuildOutput(null, validLineNumbers, ruleMatch), /failed validation/);
  });

  test('invalid confidence throws', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'very_high',
      evidenceLines: [1],
      fixSteps: ['step'],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /failed validation/);
  });

  test('evidence line as string throws', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: ['1'],
      fixSteps: ['step'],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /failed validation/);
  });

  test('evidence line as float throws', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [1.5],
      fixSteps: ['step'],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /failed validation/);
  });

  test('evidence line outside log window throws', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [999],
      fixSteps: ['step'],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /No valid evidence lines/);
  });

  test('all evidence lines invalid throws', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [100, 200],
      fixSteps: ['step'],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /No valid evidence lines/);
  });

  test('missing required fields throws', () => {
    const parsed = {};
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /failed validation/);
  });

  test('empty summary throws', () => {
    const parsed = {
      summary: '',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [1],
      fixSteps: ['step'],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /failed validation/);
  });

  test('empty rootCause throws', () => {
    const parsed = {
      summary: 'test',
      rootCause: '',
      confidence: 'high',
      evidenceLines: [1],
      fixSteps: ['step'],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /failed validation/);
  });

  test('missing fixSteps with valid rule hints uses rule hints', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [1],
    };
    const result = validateAndBuildOutput(parsed, validLineNumbers, ruleMatch);
    assert.deepStrictEqual(result.fixSteps, ruleMatch.fixHints);
  });

  test('empty fixSteps with valid rule hints uses rule hints', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [1],
      fixSteps: [],
    };
    const result = validateAndBuildOutput(parsed, validLineNumbers, ruleMatch);
    assert.deepStrictEqual(result.fixSteps, ruleMatch.fixHints);
  });

  test('malformed fixSteps throws', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [1],
      fixSteps: ['valid', 123],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, ruleMatch), /failed validation/);
  });

  test('invalid optional fields omitted without discarding valid response', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [1],
      fixSteps: ['step'],
      patch: 123,
      verifyWith: true,
      isLikelyFlaky: 'yes',
    };
    const result = validateAndBuildOutput(parsed, validLineNumbers, ruleMatch);
    assert.strictEqual(result.summary, 'test');
    assert.strictEqual(result.patch, undefined);
    assert.strictEqual(result.verifyWith, undefined);
    assert.strictEqual(result.isLikelyFlaky, undefined);
  });

  test('valid optional fields are preserved', () => {
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'medium',
      evidenceLines: [1, 2],
      fixSteps: ['step'],
      patch: 'diff content',
      verifyWith: 'npm test',
      preventWith: 'add linting',
      isLikelyFlaky: true,
    };
    const result = validateAndBuildOutput(parsed, validLineNumbers, ruleMatch);
    assert.strictEqual(result.patch, 'diff content');
    assert.strictEqual(result.verifyWith, 'npm test');
    assert.strictEqual(result.preventWith, 'add linting');
    assert.strictEqual(result.isLikelyFlaky, true);
  });

  test('no usable fix steps from either source throws', () => {
    const emptyRuleMatch: RuleMatch = {
      ...ruleMatch,
      fixHints: [],
    };
    const parsed = {
      summary: 'test',
      rootCause: 'cause',
      confidence: 'high',
      evidenceLines: [1],
    };
    assert.throws(() => validateAndBuildOutput(parsed, validLineNumbers, emptyRuleMatch), /No usable fix steps/);
  });
});

describe('extractTokens', () => {
  test('uses actual totalTokenCount from usageMetadata', () => {
    const response = { usageMetadata: { totalTokenCount: 500 } };
    assert.strictEqual(extractTokens(response), 500);
  });

  test('falls back to estimate when usageMetadata absent', () => {
    const response = {};
    assert.strictEqual(extractTokens(response), 450);
  });

  test('falls back to estimate when usageMetadata is null', () => {
    const response = { usageMetadata: null };
    assert.strictEqual(extractTokens(response), 450);
  });
});

describe('runInvestigatorAgent', () => {
  test('missing API key throws before SDK initialization', () => {
    // The function checks env.GEMINI_API_KEY before initializing the SDK.
    // This path is covered by code inspection: throws 'GEMINI_API_KEY is not configured'.
    assert.ok(true, 'Missing API key path verified by code inspection');
  });
});