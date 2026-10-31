import { test, describe } from 'node:test';
import assert from 'node:assert';
import { rankSuspectCommits } from '../src/suspect/index.js';
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
});
