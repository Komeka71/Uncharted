import { XMLParser } from 'fast-xml-parser';

export interface NormalizedTestResult {
  testId: string;
  name: string;
  file: string;
  outcome: 'pass' | 'fail' | 'skipped';
  durationMs: number;
  errorMessage?: string;
  stackTrace?: string;
}

export function parseJUnitXml(xmlContent: string): NormalizedTestResult[] {
  if (!xmlContent || typeof xmlContent !== 'string' || xmlContent.trim().length === 0) {
    throw new Error('Malformed JUnit XML: Input is empty or not a valid string');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseAttributeValue: false
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlContent);
  } catch (err: any) {
    throw new Error(`Malformed JUnit XML syntax: ${err.message || 'Unable to parse XML'}`);
  }

  if (!parsed || (typeof parsed !== 'object')) {
    throw new Error('Malformed JUnit XML: Document root is invalid');
  }

  const results: NormalizedTestResult[] = [];

  // Locate testsuite or testsuites
  let suites: any[] = [];
  if (parsed.testsuites) {
    const rawSuites = parsed.testsuites.testsuite;
    suites = Array.isArray(rawSuites) ? rawSuites : rawSuites ? [rawSuites] : [];
  } else if (parsed.testsuite) {
    suites = Array.isArray(parsed.testsuite) ? parsed.testsuite : [parsed.testsuite];
  } else {
    throw new Error('Malformed JUnit XML: Missing <testsuite> or <testsuites> root element');
  }

  for (const suite of suites) {
    const suiteName = suite['@_name'] || 'testsuite';
    const suiteFile = suite['@_file'] || suite['@_filepath'] || suiteName;

    const testcases = suite.testcase
      ? Array.isArray(suite.testcase)
        ? suite.testcase
        : [suite.testcase]
      : [];

    for (const tc of testcases) {
      const name = tc['@_name'] || 'unnamed-test';
      const classname = tc['@_classname'] || suiteName;
      const timeSec = parseFloat(tc['@_time'] || '0');
      const durationMs = Math.round((isNaN(timeSec) ? 0 : timeSec) * 1000);
      const testId = `${classname} › ${name}`;

      let outcome: 'pass' | 'fail' | 'skipped' = 'pass';
      let errorMessage: string | undefined;
      let stackTrace: string | undefined;

      if (tc.failure || tc.error) {
        outcome = 'fail';
        const failureNode = tc.failure || tc.error;
        if (typeof failureNode === 'string') {
          errorMessage = failureNode;
        } else if (typeof failureNode === 'object') {
          errorMessage = failureNode['@_message'] || failureNode['#text'] || 'Assertion failed';
          stackTrace = failureNode['#text'];
        }
      } else if (tc.skipped) {
        outcome = 'skipped';
      }

      results.push({
        testId,
        name,
        file: suiteFile,
        outcome,
        durationMs,
        errorMessage,
        stackTrace
      });
    }
  }

  return results;
}

export function parseJestJson(jsonContent: string): NormalizedTestResult[] {
  if (!jsonContent || typeof jsonContent !== 'string' || jsonContent.trim().length === 0) {
    throw new Error('Malformed Jest JSON: Input is empty');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err: any) {
    throw new Error(`Malformed Jest JSON syntax: ${err.message || 'Invalid JSON format'}`);
  }

  if (!parsed || !Array.isArray(parsed.testResults)) {
    throw new Error('Malformed Jest JSON: Missing `testResults` array');
  }

  const results: NormalizedTestResult[] = [];

  for (const fileResult of parsed.testResults) {
    const filePath = fileResult.testFilePath || 'unknown-test.js';

    if (Array.isArray(fileResult.assertionResults)) {
      for (const assertion of fileResult.assertionResults) {
        const title = assertion.title || 'unnamed-test';
        const ancestorTitles = Array.isArray(assertion.ancestorTitles) ? assertion.ancestorTitles.join(' › ') : '';
        const testId = ancestorTitles ? `${ancestorTitles} › ${title}` : title;

        let outcome: 'pass' | 'fail' | 'skipped' = 'pass';
        if (assertion.status === 'failed') {
          outcome = 'fail';
        } else if (assertion.status === 'pending' || assertion.status === 'todo' || assertion.status === 'disabled') {
          outcome = 'skipped';
        }

        const durationMs = assertion.duration || 0;
        const failureMessages = Array.isArray(assertion.failureMessages) ? assertion.failureMessages.join('\n') : undefined;

        results.push({
          testId,
          name: title,
          file: filePath,
          outcome,
          durationMs,
          errorMessage: failureMessages
        });
      }
    }
  }

  return results;
}
