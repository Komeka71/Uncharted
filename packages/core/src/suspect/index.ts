import { FailureCategory, SuspectCommit, EvidenceLine } from '../types/index.js';
import { SuspectCommitStatus } from '../history/types.js';

export interface CommitInput {
  sha: string;
  author: string;
  message: string;
  files: string[];
  timestamp?: string;
}

export interface RankSuspectOptions {
  order?: 'oldest_first' | 'newest_first';
}

export interface DetailedSuspectResult {
  status: SuspectCommitStatus;
  commits: SuspectCommit[];
  notes: string[];
}

// Known source, configuration, and manifest file extensions
const VALID_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'py', 'java', 'go', 'rs', 'rb', 'php',
  'c', 'cpp', 'h', 'hpp', 'cs', 'yml', 'yaml',
  'toml', 'xml', 'html', 'css', 'scss', 'dockerfile'
]);

/**
 * Strict evidence file path extractor.
 * Ignores URLs, version numbers (e.g. 1.21.0), and paths inside node_modules.
 */
export function extractEvidenceFilePaths(evidence: EvidenceLine[]): string[] {
  const extracted = new Set<string>();

  for (const line of evidence) {
    const text = line.text;
    // Split into tokens that look like path strings
    const tokens = text.split(/[\s,"'()<>[\]{}|;:]+/);

    for (const token of tokens) {
      // Ignore empty tokens, URLs, and node_modules
      if (!token || token.length < 3 || token.startsWith('http://') || token.startsWith('https://') || token.includes('node_modules')) {
        continue;
      }

      // Ignore pure version numbers like 1.21.0, 1.0.0
      if (/^\d+\.\d+(?:\.\d+)?$/.test(token)) {
        continue;
      }

      // Check file extension
      const dotIdx = token.lastIndexOf('.');
      if (dotIdx > 0 && dotIdx < token.length - 1) {
        const ext = token.substring(dotIdx + 1).toLowerCase();
        if (VALID_EXTENSIONS.has(ext)) {
          // Normalize backslashes
          const normalized = token.replace(/\\/g, '/');
          extracted.add(normalized);
        }
      }
    }
  }

  return Array.from(extracted);
}

export function rankSuspectCommitsDetailed(
  commits: CommitInput[],
  category: FailureCategory,
  evidence: EvidenceLine[],
  options?: RankSuspectOptions
): DetailedSuspectResult {
  if (!commits || commits.length === 0) {
    return {
      status: 'not_requested',
      commits: [],
      notes: ['No commit range provided for analysis.']
    };
  }

  // Check if any commit contains file information
  const totalFiles = commits.reduce((sum, c) => sum + (Array.isArray(c.files) ? c.files.length : 0), 0);
  if (totalFiles === 0) {
    return {
      status: 'insufficient_data',
      commits: [],
      notes: ['Commit file lists unavailable; cannot rank suspects based on file diffs.']
    };
  }

  const evidenceFiles = extractEvidenceFilePaths(evidence);
  const order = options?.order || 'oldest_first';
  const scoredCommits: SuspectCommit[] = [];

  for (let idx = 0; idx < commits.length; idx++) {
    const commit = commits[idx];
    const changedFiles = Array.isArray(commit.files) ? commit.files : [];
    let baseScore = 0;
    const reasons: string[] = [];

    for (const changedFile of changedFiles) {
      const normalizedChanged = changedFile.replace(/\\/g, '/');
      const changedBase = normalizedChanged.split('/').pop() || normalizedChanged;

      // Rule 1: Exact or basename match with evidence file (+3)
      const matchedEvidence = evidenceFiles.find((ef) => {
        const efBase = ef.split('/').pop() || ef;
        return normalizedChanged === ef ||
               normalizedChanged.endsWith(`/${ef}`) ||
               ef.endsWith(`/${normalizedChanged}`) ||
               (changedBase.length > 3 && changedBase === efBase);
      });

      if (matchedEvidence) {
        baseScore += 3;
        reasons.push(`Directly modified file mentioned in failure trace: \`${normalizedChanged}\``);
      }

      // Rule 2: Dependency manifest or lockfile (+2 for dependency category)
      if (
        category === 'dependency' &&
        /(?:^|\/)(?:package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|Pipfile|pom\.xml|go\.mod|go\.sum)$/i.test(normalizedChanged)
      ) {
        baseScore += 2;
        reasons.push(`Modified dependency manifest or lockfile: \`${normalizedChanged}\``);
      }

      // Rule 3: Config / CI / Docker (+2 for config_env, docker_container, permissions_secrets)
      if (
        (category === 'config_env' || category === 'docker_container' || category === 'permissions_secrets') &&
        /(?:\.github\/workflows\/|Dockerfile|docker-compose|\.env|\.ya?ml$)/i.test(normalizedChanged)
      ) {
        baseScore += 2;
        reasons.push(`Modified CI/CD workflow, container, or configuration file: \`${normalizedChanged}\``);
      }

      // Rule 4: Source files in same non-trivial directory (+1 for build_compile, test_failure)
      // Must have at least 2 directory segments (e.g. src/services, not bare "src")
      if ((category === 'build_compile' || category === 'test_failure') && !matchedEvidence) {
        const changedDir = normalizedChanged.includes('/')
          ? normalizedChanged.substring(0, normalizedChanged.lastIndexOf('/'))
          : '';
        const dirSegments = changedDir.split('/').filter(Boolean);

        if (dirSegments.length >= 2) {
          const isSameDir = evidenceFiles.some((ef) => {
            const efDir = ef.includes('/') ? ef.substring(0, ef.lastIndexOf('/')) : '';
            return efDir === changedDir || ef.startsWith(`${changedDir}/`);
          });

          if (isSameDir) {
            baseScore += 1;
            reasons.push(`Modified related files in module directory \`${changedDir}\`: \`${normalizedChanged}\``);
          }
        }
      }
    }

    // Recency is a tie-breaker ONLY among commits that earned evidence-based points
    if (baseScore > 0) {
      let recencyBonus = 0;
      if (order === 'oldest_first') {
        // Higher index = newer commit
        recencyBonus = (idx + 1) * 0.02;
      } else {
        // Lower index = newer commit
        recencyBonus = (commits.length - idx) * 0.02;
      }

      const totalScore = Math.round((baseScore + recencyBonus) * 100) / 100;
      scoredCommits.push({
        sha: commit.sha,
        author: commit.author,
        message: commit.message,
        files: commit.files,
        score: totalScore,
        reasons: Array.from(new Set(reasons))
      });
    }
  }

  if (scoredCommits.length === 0) {
    return {
      status: 'no_match',
      commits: [],
      notes: ['Changed files were analyzed, but no commits matched the failure evidence.']
    };
  }

  // Sort descending by score, take top 3
  const topCommits = scoredCommits
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    status: 'ranked',
    commits: topCommits,
    notes: []
  };
}

/**
 * Backward-compatible suspect ranking function.
 */
export function rankSuspectCommits(
  commits: CommitInput[],
  category: FailureCategory,
  evidence: EvidenceLine[]
): SuspectCommit[] {
  return rankSuspectCommitsDetailed(commits, category, evidence).commits;
}
