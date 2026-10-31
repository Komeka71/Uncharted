import { FailureCategory, SuspectCommit, EvidenceLine } from '../types/index.js';

export interface CommitInput {
  sha: string;
  author: string;
  message: string;
  files: string[];
  timestamp?: string;
}

export function rankSuspectCommits(
  commits: CommitInput[],
  category: FailureCategory,
  evidence: EvidenceLine[]
): SuspectCommit[] {
  if (!commits || commits.length === 0) {
    return [];
  }

  // Extract all file paths mentioned in evidence lines
  const evidenceFiles: string[] = [];
  for (const line of evidence) {
    const matches = line.text.match(/([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/g);
    if (matches) {
      evidenceFiles.push(...matches);
    }
  }

  const scoredCommits: SuspectCommit[] = [];

  for (let idx = 0; idx < commits.length; idx++) {
    const commit = commits[idx];
    let score = 0;
    const reasons: string[] = [];

    // Recency tie-break bonus (most recent commits get slight edge)
    const recencyBonus = (commits.length - idx) * 0.05;
    score += recencyBonus;

    for (const changedFile of commit.files) {
      // Rule 1: Exact or basename match with file in evidence/stack trace (+3)
      const matchingEvidenceFile = evidenceFiles.find((ef) => {
        const efBase = ef.split('/').pop() || ef;
        const cfBase = changedFile.split('/').pop() || changedFile;
        return changedFile.includes(ef) || ef.includes(changedFile) || efBase === cfBase;
      });

      if (matchingEvidenceFile) {
        score += 3;
        reasons.push(`Directly modified file mentioned in failure trace: \`${changedFile}\``);
      }

      // Rule 2: Dependency file changed (+2 for dependency category)
      if (
        category === 'dependency' &&
        /(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|Pipfile|pom\.xml|go\.mod|go\.sum)/i.test(changedFile)
      ) {
        score += 2;
        reasons.push(`Modified dependency manifest or lockfile: \`${changedFile}\``);
      }

      // Rule 3: Config/CI/Docker file changed (+2 for config_env / docker / permissions)
      if (
        (category === 'config_env' || category === 'docker_container' || category === 'permissions_secrets') &&
        /(\.github\/workflows\/|Dockerfile|docker-compose|\.env|\.yaml|\.yml)/i.test(changedFile)
      ) {
        score += 2;
        reasons.push(`Modified CI/CD workflow, container, or configuration file: \`${changedFile}\``);
      }

      // Rule 4: Source files in same directory as evidence file (+1)
      if (category === 'build_compile' || category === 'test_failure') {
        const changedDir = changedFile.substring(0, changedFile.lastIndexOf('/'));
        const isSameDir = evidenceFiles.some((ef) => ef.startsWith(changedDir) && changedDir.length > 2);
        if (isSameDir && !matchingEvidenceFile) {
          score += 1;
          reasons.push(`Modified related files in the failure module directory: \`${changedDir}\``);
        }
      }
    }

    if (score > 0) {
      scoredCommits.push({
        sha: commit.sha,
        author: commit.author,
        message: commit.message,
        files: commit.files,
        score: Math.round(score * 10) / 10,
        reasons: reasons.length > 0 ? Array.from(new Set(reasons)) : ['Recent commit in failing branch range']
      });
    }
  }

  // Sort descending by score, take top 3
  return scoredCommits
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
