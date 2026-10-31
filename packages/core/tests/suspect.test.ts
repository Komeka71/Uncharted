import { test, describe } from 'node:test';
import assert from 'node:assert';
import { rankSuspectCommits, rankSuspectCommitsDetailed, extractEvidenceFilePaths } from '../src/suspect/index.js';
import { EvidenceLine } from '../src/types/index.js';

describe('Suspect Commit Ranking', () => {
  test('ranks commit modifying failing source file highest', () => {
    const evidence: EvidenceLine[] = [
      { lineNo: 42, text: "src/services/authService.ts(45,21): error TS2339: Property 'role' does not exist", role: 'primary' }
    ];

    const commits = [
      {
        sha: 'aaa1111',
        author: 'alice',
        message: 'fix docs typo',
        files: ['README.md']
      },
      {
        sha: 'bbb2222',
        author: 'bob',
        message: 'refactor auth roles',
        files: ['src/services/authService.ts', 'src/types.ts']
      },
      {
        sha: 'ccc3333',
        author: 'charlie',
        message: 'update styles',
        files: ['src/styles/main.css']
      }
    ];

    const ranked = rankSuspectCommits(commits, 'build_compile', evidence);

    assert.ok(ranked.length > 0);
    assert.strictEqual(ranked[0].sha, 'bbb2222', 'Commit modifying authService.ts must be top suspect');
    assert.ok(ranked[0].score >= 3);
    assert.ok(ranked[0].reasons[0].includes('Directly modified file'));
  });

  test('dependency failure boosts lockfile and manifest changes', () => {
    const evidence: EvidenceLine[] = [
      { lineNo: 10, text: 'npm ci can only install packages when your package.json and package-lock.json are in sync', role: 'primary' }
    ];

    const commits = [
      {
        sha: '1111111',
        author: 'dan',
        message: 'bump dependencies',
        files: ['package.json']
      },
      {
        sha: '2222222',
        author: 'eve',
        message: 'update test',
        files: ['tests/index.test.ts']
      }
    ];

    const ranked = rankSuspectCommits(commits, 'dependency', evidence);

    assert.strictEqual(ranked[0].sha, '1111111', 'Commit modifying package.json must be suspect in dependency failure');
  });

  test('returns insufficient_data status when all commit file arrays are empty', () => {
    const evidence: EvidenceLine[] = [
      { lineNo: 10, text: 'Error in src/index.ts', role: 'primary' }
    ];

    const commits = [
      { sha: 'c1', author: 'alice', message: 'commit 1', files: [] },
      { sha: 'c2', author: 'bob', message: 'commit 2', files: [] }
    ];

    const result = rankSuspectCommitsDetailed(commits, 'build_compile', evidence);
    assert.strictEqual(result.status, 'insufficient_data');
    assert.strictEqual(result.commits.length, 0);
    assert.ok(result.notes[0].includes('Commit file lists unavailable'));
  });

  test('returns not_requested status when commits array is empty', () => {
    const evidence: EvidenceLine[] = [
      { lineNo: 10, text: 'Error in src/index.ts', role: 'primary' }
    ];

    const result = rankSuspectCommitsDetailed([], 'build_compile', evidence);
    assert.strictEqual(result.status, 'not_requested');
    assert.strictEqual(result.commits.length, 0);
  });

  test('returns no_match status when changed files do not match failure evidence', () => {
    const evidence: EvidenceLine[] = [
      { lineNo: 10, text: 'Error: Cannot find module src/services/user.ts', role: 'primary' }
    ];

    const commits = [
      { sha: 'c1', author: 'alice', message: 'docs', files: ['docs/readme.md'] },
      { sha: 'c2', author: 'bob', message: 'assets', files: ['public/logo.png'] }
    ];

    const result = rankSuspectCommitsDetailed(commits, 'build_compile', evidence);
    assert.strictEqual(result.status, 'no_match');
    assert.strictEqual(result.commits.length, 0);
  });

  test('strict path extraction ignores URLs, version numbers, and node_modules', () => {
    const evidence: EvidenceLine[] = [
      { lineNo: 1, text: 'See documentation at https://example.com/api/v1/config.json', role: 'context' },
      { lineNo: 2, text: 'Installed version 1.21.0 successfully', role: 'context' },
      { lineNo: 3, text: 'Error at node_modules/express/lib/router.js', role: 'context' },
      { lineNo: 4, text: 'Syntax error in src/server/routes.ts at line 55', role: 'primary' }
    ];

    const paths = extractEvidenceFilePaths(evidence);
    assert.ok(paths.includes('src/server/routes.ts'));
    assert.ok(!paths.some((p) => p.includes('https://')));
    assert.ok(!paths.some((p) => p.includes('node_modules')));
    assert.ok(!paths.some((p) => p === '1.21.0'));
  });

  test('directory match requires at least 2 segments (prevents bare "src" false positives)', () => {
    const evidence: EvidenceLine[] = [
      { lineNo: 10, text: 'Error in src/services/auth.ts: invalid credentials', role: 'primary' }
    ];

    const commits = [
      {
        sha: 'c1',
        author: 'alice',
        message: 'change root src css',
        files: ['src/main.css'] // Only 1 directory segment "src"
      },
      {
        sha: 'c2',
        author: 'bob',
        message: 'change helper in same module',
        files: ['src/services/helper.ts'] // 2 directory segments "src/services"
      }
    ];

    const ranked = rankSuspectCommits(commits, 'build_compile', evidence);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].sha, 'c2');
    assert.ok(ranked[0].reasons[0].includes('src/services'));
  });

  test('oldest_first ordering gives higher recency bonus to newer commit in the push', () => {
    const evidence: EvidenceLine[] = [
      { lineNo: 10, text: 'Error in src/services/auth.ts', role: 'primary' }
    ];

    // GitHub compare returns [oldest, newest]
    const commits = [
      {
        sha: 'older_sha',
        author: 'alice',
        message: 'edit auth 1',
        files: ['src/services/auth.ts']
      },
      {
        sha: 'newer_sha',
        author: 'alice',
        message: 'edit auth 2',
        files: ['src/services/auth.ts']
      }
    ];

    const result = rankSuspectCommitsDetailed(commits, 'build_compile', evidence, { order: 'oldest_first' });
    assert.strictEqual(result.commits.length, 2);
    assert.strictEqual(result.commits[0].sha, 'newer_sha', 'Newer commit in push should rank above older commit');
    assert.ok(result.commits[0].score > result.commits[1].score);
  });
});

