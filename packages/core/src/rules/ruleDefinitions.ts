import { FailureCategory, RuleMatch, EvidenceLine } from '../types/index.js';

export interface RuleDefinition {
  id: string;
  category: FailureCategory;
  transient: boolean;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  explanation: string;
  fixHints: string[];
  suggestedPatch?: string;
  matcher: (lines: { lineNo: number; text: string }[]) => {
    matched: boolean;
    confidence: number;
    evidence: EvidenceLine[];
    extracted: Record<string, string | number>;
  } | null;
}

export const RULE_DEFINITIONS: RuleDefinition[] = [
  // 1. Dependency: npm-lock-out-of-sync
  {
    id: 'npm-lock-out-of-sync',
    category: 'dependency',
    transient: false,
    severity: 'high',
    title: 'npm package-lock.json out of sync with package.json',
    explanation: '`npm ci` can only install packages when package.json and package-lock.json are in sync. A dependency was likely updated in package.json without updating package-lock.json.',
    fixHints: [
      'Run `npm install` locally to update package-lock.json.',
      'Commit and push the updated package-lock.json to your branch.',
      'Ensure PR checks enforce package-lock.json synchronization.'
    ],
    suggestedPatch: `diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -8,3 +8,3 @@
-    "version": "1.0.0"
+    "version": "1.0.1"`,
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/npm ci can only install packages when your package\.json and package-lock\.json are in sync/i.test(lines[i].text) ||
            /npm ERR!.*Missing:.*from lock file/i.test(lines[i].text)) {
          const evidence: EvidenceLine[] = [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }];
          if (i > 0) evidence.unshift({ lineNo: lines[i - 1].lineNo, text: lines[i - 1].text, role: 'context' });
          if (i + 1 < lines.length) evidence.push({ lineNo: lines[i + 1].lineNo, text: lines[i + 1].text, role: 'context' });
          return { matched: true, confidence: 0.98, evidence, extracted: {} };
        }
      }
      return null;
    }
  },

  // 2. Dependency: npm-module-not-found
  {
    id: 'npm-module-not-found',
    category: 'dependency',
    transient: false,
    severity: 'high',
    title: 'Node.js Module Not Found (MODULE_NOT_FOUND)',
    explanation: 'A required JavaScript or TypeScript module could not be found. Either the package is missing from package.json, or it was not installed during the CI build step.',
    fixHints: [
      'Check if the missing package is declared in `dependencies` or `devDependencies` in package.json.',
      'Run `npm install <missing-module>` and commit package.json and lockfile.',
      'Verify that `npm install` or `npm ci` ran before the build/test step in CI.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].text.match(/(?:Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND)['":\s]+([@a-zA-Z0-9_\-\.\/]+)/i);
        if (match) {
          const moduleName = match[1].replace(/['"]/g, '');
          const evidence: EvidenceLine[] = [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }];
          return {
            matched: true,
            confidence: 0.95,
            evidence,
            extracted: { module: moduleName }
          };
        }
      }
      return null;
    }
  },

  // 3. Dependency: npm-eresolve
  {
    id: 'npm-eresolve',
    category: 'dependency',
    transient: false,
    severity: 'high',
    title: 'npm ERESOLVE Dependency Tree Conflict',
    explanation: 'npm could not resolve conflicting peer dependency requirements between packages.',
    fixHints: [
      'Inspect the conflicting peer dependency versions in the log.',
      'Update the conflicting packages to versions that share compatible peer dependencies.',
      'If temporary, pass `--legacy-peer-deps` in npm install, but resolve properly.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/npm ERR! code ERESOLVE/i.test(lines[i].text) || /ERESOLVE unable to resolve dependency tree/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.98,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 4. Dependency: npm-404-registry
  {
    id: 'npm-404-registry',
    category: 'dependency',
    transient: false,
    severity: 'high',
    title: 'npm Package Not Found in Registry (404)',
    explanation: 'npm registry returned 404 for a requested package. The package name may be mistyped, deleted, or hosted on a private registry requiring authentication.',
    fixHints: [
      'Verify the package name spelling in package.json.',
      'If using a private npm registry or GitHub Packages, verify `NPM_TOKEN` or `.npmrc` is configured.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].text.match(/404 Not Found - GET https?:\/\/registry\.[a-z0-9\.\-_/]+\/([@a-zA-Z0-9_\-\.\/]+)/i);
        if (match || /npm ERR! 404 Not Found/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.95,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: { package: match ? match[1] : 'unknown' }
          };
        }
      }
      return null;
    }
  },

  // 5. Dependency: pip-module-not-found
  {
    id: 'pip-module-not-found',
    category: 'dependency',
    transient: false,
    severity: 'high',
    title: 'Python Module Not Found (ModuleNotFoundError / ImportError)',
    explanation: 'A required Python module was not found. It may be missing from requirements.txt or pyproject.toml, or virtualenv was not activated.',
    fixHints: [
      'Add the missing package to `requirements.txt` or `pyproject.toml`.',
      'Run `pip install -r requirements.txt` before executing Python scripts in CI.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].text.match(/(?:ModuleNotFoundError: No module named|ImportError: cannot import name|ImportError: No module named)\s+['"]?([a-zA-Z0-9_\.]+)['"]?/i);
        if (match) {
          return {
            matched: true,
            confidence: 0.95,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: { module: match[1] }
          };
        }
      }
      return null;
    }
  },

  // 6. Dependency: pip-resolution
  {
    id: 'pip-resolution',
    category: 'dependency',
    transient: false,
    severity: 'high',
    title: 'Python Dependency Resolution Impossible',
    explanation: 'pip failed to resolve compatible versions across dependencies in requirements.txt.',
    fixHints: [
      'Loosen pinned package version requirements in requirements.txt.',
      'Check Python version compatibility (e.g., Python 3.11 vs 3.12 syntax/binary wheels).'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/ResolutionImpossible/i.test(lines[i].text) || /No matching distribution found for/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.94,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 7. Dependency: maven-dep-resolve
  {
    id: 'maven-dep-resolve',
    category: 'dependency',
    transient: true,
    severity: 'high',
    title: 'Maven Dependency Resolution Failure',
    explanation: 'Maven could not download or resolve required dependencies or plugins from the configured repository.',
    fixHints: [
      'Check the groupId, artifactId, and version in pom.xml.',
      'Verify Maven Central / private nexus repository connectivity.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/Could not resolve dependencies/i.test(lines[i].text) || /Could not find artifact/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.92,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 8. Build/Compile: ts-compile-error
  {
    id: 'ts-compile-error',
    category: 'build_compile',
    transient: false,
    severity: 'critical',
    title: 'TypeScript Compilation Error',
    explanation: 'The TypeScript compiler detected static type errors or syntax issues.',
    fixHints: [
      'Run `npx tsc --noEmit` locally to reproduce the compilation error.',
      'Fix the cited type mismatch or missing property in the specified source file.',
      'Ensure imported types and interfaces match the target library version.'
    ],
    suggestedPatch: `// Check the cited file and ensure properties match their declared types`,
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        // e.g. src/auth/login.ts:42:15 - error TS2339: ... OR src/auth.ts(45,21): error TS2339: ...
        const match = lines[i].text.match(/([a-zA-Z0-9_\-\.\/]+)(?:\((\d+),\d+\)|:(\d+)(?::\d+)?)\s*(?:[-:]\s*)?error\s*(TS\d+):\s*(.*)/i);
        if (match) {
          const file = match[1];
          const lineNum = match[2] || match[3] || '1';
          const code = match[4];
          const message = match[5];
          const evidence: EvidenceLine[] = [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }];
          if (i + 1 < lines.length && lines[i + 1].text.trim().length > 0) {
            evidence.push({ lineNo: lines[i + 1].lineNo, text: lines[i + 1].text, role: 'context' });
          }
          return {
            matched: true,
            confidence: 0.99,
            evidence,
            extracted: { file, line: Number(lineNum), code, message }
          };
        }
      }
      return null;
    }
  },

  // 9. Build/Compile: java-compile-error
  {
    id: 'java-compile-error',
    category: 'build_compile',
    transient: false,
    severity: 'critical',
    title: 'Java Compilation Failure (javac)',
    explanation: 'The Java compiler failed due to syntax errors, missing symbols, or unhandled exceptions.',
    fixHints: [
      'Run `mvn compile` or `./gradlew build` locally to reproduce.',
      'Check for missing imports or method signature changes in Java classes.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/\[ERROR\] COMPILATION ERROR/i.test(lines[i].text) || /error: cannot find symbol/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.95,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 10. Build/Compile: go-build-error
  {
    id: 'go-build-error',
    category: 'build_compile',
    transient: false,
    severity: 'critical',
    title: 'Go Build Failure',
    explanation: 'The Go compiler encountered undeclared identifiers, unused imports, or missing packages.',
    fixHints: [
      'Run `go build ./...` locally.',
      'Check for unused imports or spelling mistakes in function names.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/undefined:\s+[a-zA-Z0-9_]+/i.test(lines[i].text) || /imported and not used:/i.test(lines[i].text) || /cannot find package/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.95,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 11. Lint/Format: eslint-failure
  {
    id: 'eslint-failure',
    category: 'lint_format',
    transient: false,
    severity: 'medium',
    title: 'ESLint Code Quality Failure',
    explanation: 'ESLint reported syntax or code formatting rule violations that failed the lint step.',
    fixHints: [
      'Run `npm run lint -- --fix` locally to automatically fix auto-fixable rules.',
      'Manually resolve remaining errors reported in the evidence lines.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].text.match(/✖\s+(\d+)\s+problems?\s+\((\d+)\s+errors?/i);
        if (match || /ESLint couldn't find the config/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.96,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: { errors: match ? match[2] : 'multiple' }
          };
        }
      }
      return null;
    }
  },

  // 12. Lint/Format: prettier-check
  {
    id: 'prettier-check',
    category: 'lint_format',
    transient: false,
    severity: 'medium',
    title: 'Prettier Code Formatting Discrepancy',
    explanation: 'Prettier format check failed because files do not conform to project style standards.',
    fixHints: [
      'Run `npx prettier --write .` locally to format all files.',
      'Commit and push the formatted code.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/Code style issues found in/i.test(lines[i].text) || /Forgot to run Prettier\?/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.96,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 13. Test Failures: test-timeout (transient hint, prioritized over general assertions)
  {
    id: 'test-timeout',
    category: 'test_failure',
    transient: true,
    severity: 'high',
    title: 'Test Execution Timeout (Flakiness Indicator)',
    explanation: 'A test exceeded its timeout duration (e.g. 5000ms). This frequently signals an unhandled promise, network lock, or CI runner flakiness.',
    fixHints: [
      'Ensure all asynchronous callbacks and database connections resolve or close.',
      'Increase test timeout if heavy integration operations are expected (`jest.setTimeout(15000)`).',
      'Check if test was marked as flaky across previous runs.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].text.match(/(?:Exceeded timeout of\s+(\d+)\s*ms|Timeout - Async callback was not invoked within the (\d+) ms timeout)/i);
        if (match) {
          return {
            matched: true,
            confidence: 0.99,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: { timeoutMs: Number(match[1] || match[2] || 5000) }
          };
        }
      }
      return null;
    }
  },

  // 14. Test Failures: jest-assertion
  {
    id: 'jest-assertion',
    category: 'test_failure',
    transient: false,
    severity: 'high',
    title: 'Jest / Vitest Test Assertion Failure',
    explanation: 'One or more unit or integration tests failed due to mismatched expectations.',
    fixHints: [
      'Run `npm test` locally focusing on the failing test suite.',
      'Inspect the expected vs received output in the test assertion.',
      'Update implementation if behavior is buggy, or update snapshots if intentional.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/●\s+.*\s+›\s+.*/i.test(lines[i].text) || /expect\(received\)\./i.test(lines[i].text) || /Tests:\s+\d+\s+failed/i.test(lines[i].text)) {
          const evidence: EvidenceLine[] = [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }];
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            if (/Expected:/i.test(lines[j].text) || /Received:/i.test(lines[j].text)) {
              evidence.push({ lineNo: lines[j].lineNo, text: lines[j].text, role: 'context' });
            }
          }
          return {
            matched: true,
            confidence: 0.98,
            evidence,
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 15. Test Failures: pytest-failure
  {
    id: 'pytest-failure',
    category: 'test_failure',
    transient: false,
    severity: 'high',
    title: 'pytest Test Assertion Failure',
    explanation: 'Python pytest test suite failed with one or more test assertion errors.',
    fixHints: [
      'Run `pytest` locally to inspect the failure traceback.',
      'Check assertion conditions and mock returns.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/FAILED\s+tests\/.*::/i.test(lines[i].text) || /=+\s+\d+\s+failed.*in\s+[\d\.]+s\s+=+/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.96,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 16. Config/Env: env-var-missing
  {
    id: 'env-var-missing',
    category: 'config_env',
    transient: false,
    severity: 'critical',
    title: 'Missing Required Environment Variable or Secret',
    explanation: 'The application failed because a required environment variable was undefined or empty.',
    fixHints: [
      'Verify that the required secret/variable is defined in GitHub Repository Settings -> Secrets and variables -> Actions.',
      'Pass the secret into the job step in `.github/workflows/*.yml` via `env: MY_VAR: ${{ secrets.MY_VAR }}`.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].text.match(/(?:Missing required environment variable|KeyError:\s*['"]([A-Z0-9_]+)['"]|Environment variable\s+['"]?([A-Z0-9_]+)['"]?\s+is not set|process\.env\.([A-Z0-9_]+)\s+is undefined)/i);
        if (match) {
          const varName = match[1] || match[2] || match[3] || 'UNKNOWN_VAR';
          return {
            matched: true,
            confidence: 0.95,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: { envVar: varName }
          };
        }
      }
      return null;
    }
  },

  // 17. Config/Env: workflow-yaml-invalid
  {
    id: 'workflow-yaml-invalid',
    category: 'config_env',
    transient: false,
    severity: 'critical',
    title: 'Invalid GitHub Actions Workflow YAML',
    explanation: 'GitHub Actions could not parse the workflow file due to YAML syntax errors or invalid action schema properties.',
    fixHints: [
      'Validate YAML indentation and syntax with a YAML linter.',
      'Check GitHub Actions workflow documentation for valid property names under `jobs.<job_id>`.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/Invalid workflow file/i.test(lines[i].text) || /Unexpected value/i.test(lines[i].text) || /yaml: line \d+:/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.98,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 18. Permissions/Secrets: gh-permission-denied
  {
    id: 'gh-permission-denied',
    category: 'permissions_secrets',
    transient: false,
    severity: 'critical',
    title: 'GitHub Token Permissions Denied',
    explanation: 'The `GITHUB_TOKEN` or personal access token lacks write/push permissions for the requested GitHub API or Git operation.',
    fixHints: [
      'Add `permissions:` block to the workflow or job (e.g. `permissions: contents: write, pull-requests: write`).',
      'Ensure Repository -> Actions -> General -> Workflow permissions is set to "Read and write permissions".'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/Resource not accessible by integration/i.test(lines[i].text) ||
            /Permission denied \(publickey\)/i.test(lines[i].text) ||
            /remote: Permission to .* denied to/i.test(lines[i].text) ||
            /fatal: could not read Username for 'https:\/\/github\.com'/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.97,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 19. Docker/Container: docker-pull-rate-limit
  {
    id: 'docker-pull-rate-limit',
    category: 'docker_container',
    transient: true,
    severity: 'high',
    title: 'Docker Hub Rate Limit Exceeded (toomanyrequests)',
    explanation: 'Docker Hub pull rate limit reached for anonymous requests from GitHub Actions shared runner IP pool.',
    fixHints: [
      'Log into Docker Hub using `docker/login-action` with personal credentials.',
      'Use GitHub Container Registry (`ghcr.io`) or mirror images in AWS ECR / Google Artifact Registry.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/toomanyrequests: You have reached your pull rate limit/i.test(lines[i].text) || /error pulling image configuration: toomanyrequests/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.99,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 20. Docker/Container: docker-build-fail
  {
    id: 'docker-build-fail',
    category: 'docker_container',
    transient: false,
    severity: 'critical',
    title: 'Docker Build Step Failed',
    explanation: 'A command executed inside a `Dockerfile` RUN instruction returned a non-zero exit code.',
    fixHints: [
      'Inspect the failing RUN instruction and error message inside the container.',
      'Build locally using `docker build .` to reproduce.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/The command '(\/bin\/sh -c .*)' returned a non-zero code/i.test(lines[i].text) ||
            /ERROR: failed to solve: process ".*" did not complete successfully/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.97,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 21. Infra/Runner: disk-full
  {
    id: 'disk-full',
    category: 'infra_runner',
    transient: true,
    severity: 'critical',
    title: 'Runner Disk Space Exhausted (ENOSPC)',
    explanation: 'The CI runner ran out of free disk space while writing build artifacts or Docker caches.',
    fixHints: [
      'Add a disk cleanup step in CI (e.g. `docker system prune -af`, removing Android/Dotnet SDKs).',
      'Optimize Docker multi-stage builds and layer caching.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/ENOSPC: no space left on device/i.test(lines[i].text) || /No space left on device/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.99,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 22. Infra/Runner: oom
  {
    id: 'oom',
    category: 'infra_runner',
    transient: true,
    severity: 'critical',
    title: 'Out of Memory (OOM / JavaScript Heap Exceeded)',
    explanation: 'The process exceeded available RAM and was terminated by the Linux kernel (exit code 137) or V8 heap limit.',
    fixHints: [
      'Set `NODE_OPTIONS="--max-old-space-size=4096"` in workflow environment variables.',
      'Split large monorepo builds into smaller matrix jobs.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/JavaScript heap out of memory/i.test(lines[i].text) ||
            /FATAL ERROR: Ineffective mark-compacts near heap limit/i.test(lines[i].text) ||
            /Process completed with exit code 137/i.test(lines[i].text) ||
            /\bkilled\b/i.test(lines[i].text) && /npm run/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.96,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 23. Infra/Runner: port-in-use
  {
    id: 'port-in-use',
    category: 'infra_runner',
    transient: true,
    severity: 'medium',
    title: 'Network Port Already in Use (EADDRINUSE)',
    explanation: 'A server or mock attempted to bind to a local TCP port that was already in use by another background process.',
    fixHints: [
      'Ensure background services from previous test steps are killed gracefully.',
      'Use dynamic ephemeral ports (port 0) for test servers.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/EADDRINUSE/i.test(lines[i].text) || /address already in use/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.97,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 24. Network: network-reset
  {
    id: 'network-reset',
    category: 'network_transient',
    transient: true,
    severity: 'high',
    title: 'Transient Network Reset / Timeout',
    explanation: 'A transient socket connection error (ECONNRESET, ETIMEDOUT, or registry 503) aborted the operation. This is likely an infrastructure hiccup rather than a code defect.',
    fixHints: [
      'Re-run the failed job; transient network errors often resolve automatically.',
      'Configure automatic retries for HTTP requests and package installs.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/ECONNRESET/i.test(lines[i].text) ||
            /ETIMEDOUT/i.test(lines[i].text) ||
            /EAI_AGAIN/i.test(lines[i].text) ||
            /socket hang up/i.test(lines[i].text) ||
            /503 Service Unavailable/i.test(lines[i].text) ||
            /The remote server returned an error: \(503\)/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.94,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 25. Timeout: job-timeout
  {
    id: 'job-timeout',
    category: 'timeout',
    transient: true,
    severity: 'high',
    title: 'GitHub Actions Job Execution Timeout',
    explanation: 'The job exceeded the maximum execution time limit configured in the workflow (or default 360 minutes).',
    fixHints: [
      'Inspect previous steps to identify hangs (e.g. interactive prompts, lingering background daemons).',
      'Set an explicit `timeout-minutes: 15` on steps to fail faster.'
    ],
    matcher: (lines) => {
      for (let i = 0; i < lines.length; i++) {
        if (/The job running on runner .* has exceeded the maximum execution time/i.test(lines[i].text) ||
            /Job cancelled because of timeout/i.test(lines[i].text)) {
          return {
            matched: true,
            confidence: 0.98,
            evidence: [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }],
            extracted: {}
          };
        }
      }
      return null;
    }
  },

  // 26. Unknown / Fallback: generic-exit-code
  {
    id: 'generic-exit-code',
    category: 'unknown',
    transient: false,
    severity: 'medium',
    title: 'Non-Zero Process Exit Code',
    explanation: 'A CI step completed with an unclassified non-zero exit code.',
    fixHints: [
      'Examine the lines immediately preceding the exit code for application error traces.',
      'Run the failing CI command locally in debug mode.'
    ],
    matcher: (lines) => {
      for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].text.match(/Process completed with exit code ([1-9]\d*)/i);
        if (match) {
          const evidence: EvidenceLine[] = [{ lineNo: lines[i].lineNo, text: lines[i].text, role: 'primary' }];
          // Contextual lines above
          for (let j = Math.max(0, i - 3); j < i; j++) {
            if (lines[j].text.trim().length > 0) {
              evidence.unshift({ lineNo: lines[j].lineNo, text: lines[j].text, role: 'context' });
            }
          }
          return {
            matched: true,
            confidence: 0.5,
            evidence,
            extracted: { exitCode: Number(match[1]) }
          };
        }
      }
      return null;
    }
  }
];
