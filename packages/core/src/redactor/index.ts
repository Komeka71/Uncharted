import { RedactionResult } from '../types/index.js';

interface RedactionRule {
  type: string;
  pattern: RegExp;
  replacer?: (match: string, ...args: any[]) => string;
}

const REDACTION_RULES: RedactionRule[] = [
  // GitHub Personal Access Tokens and App Tokens
  {
    type: 'github_token',
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g
  },
  {
    type: 'github_fine_grained_pat',
    pattern: /github_pat_[A-Za-z0-9_]{20,255}/g
  },
  // AWS Access Key ID
  {
    type: 'aws_key',
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g
  },
  // Google API Key
  {
    type: 'google_api_key',
    pattern: /AIza[0-9A-Za-z\-_]{35}/g
  },
  // Slack Tokens
  {
    type: 'slack_token',
    pattern: /xox[baprs]-[0-9A-Za-z\-]{10,64}/g
  },
  // Bearer tokens in headers/logs
  {
    type: 'bearer_token',
    pattern: /(Bearer\s+)[A-Za-z0-9\-_\.\~+/]{16,}=*/gi,
    replacer: (_m, p1) => `${p1}[REDACTED:bearer_token]`
  },
  // Basic Auth credentials in Authorization headers
  {
    type: 'basic_auth',
    pattern: /(Authorization:\s*Basic\s+)[A-Za-z0-9+/=]{10,}/gi,
    replacer: (_m, p1) => `${p1}[REDACTED:basic_auth]`
  },
  // JWT tokens
  {
    type: 'jwt',
    pattern: /ey[A-Za-z0-9\-_=]{10,}\.ey[A-Za-z0-9\-_=]{10,}\.[A-Za-z0-9\-_=]{10,}/g
  },
  // Database connection strings with credentials (MongoDB, Postgres, MySQL, Redis - supports empty username like redis://:password@host)
  {
    type: 'connection_string_credentials',
    pattern: /((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/)([^:\s\/]*):([^@\s\/]+)(@)/gi,
    replacer: (_m, proto, _user, _pass, at) => `${proto}[REDACTED:credentials]${at}`
  },
  // CLI flag user:pass credentials (e.g. -u user:password, excluding full URLs)
  {
    type: 'cli_credentials',
    pattern: /(-u\s+(?!https?:\/\/|redis:\/\/|mongodb:\/\/|postgres(?:ql)?:\/\/)[^:\s]+:)([^\s]+)/gi,
    replacer: (_m, p1) => `${p1}[REDACTED:credentials]`
  },
  // Generic key-value secret assignments (e.g. secret=..., password=..., api_key=...)
  // Uses negative lookahead (?!(?:\[REDACTED:)) to avoid overwriting typed tags
  {
    type: 'secret_assignment',
    pattern: /((?:password|passwd|secret|token|api_?key|auth_?token|client_?secret|access_?key|private_?key)\s*[:=]\s*["']?)(?!(?:\[REDACTED:))([^\s"']{8,})(["']?)/gi,
    replacer: (_m, p1, _val, p3) => `${p1}[REDACTED:secret]${p3}`
  }
];

export function redactSecrets(rawText: string): RedactionResult {
  if (!rawText || typeof rawText !== 'string') {
    return {
      cleanedText: '',
      redactionCount: 0,
      redactedTypes: {},
      lines: []
    };
  }

  const lines = rawText.split(/\r?\n/);

  let totalRedactions = 0;
  const redactedTypes: Record<string, number> = {};

  let inPrivateKey = false;
  const cleanedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle multi-line private keys line-by-line to strictly preserve line count
    if (/-----BEGIN [A-Z\s]+PRIVATE KEY-----/i.test(line)) {
      inPrivateKey = true;
      line = '[REDACTED:private_key_start]';
      totalRedactions++;
      redactedTypes['private_key'] = (redactedTypes['private_key'] || 0) + 1;
      cleanedLines.push(line);
      continue;
    }
    if (inPrivateKey) {
      if (/-----END [A-Z\s]+PRIVATE KEY-----/i.test(line)) {
        inPrivateKey = false;
        line = '[REDACTED:private_key_end]';
      } else {
        line = '[REDACTED:private_key_content]';
      }
      cleanedLines.push(line);
      continue;
    }

    // Apply regex redaction rules
    for (const rule of REDACTION_RULES) {
      const matches = line.match(rule.pattern);
      if (matches) {
        totalRedactions += matches.length;
        redactedTypes[rule.type] = (redactedTypes[rule.type] || 0) + matches.length;
        if (rule.replacer) {
          line = line.replace(rule.pattern, rule.replacer);
        } else {
          line = line.replace(rule.pattern, `[REDACTED:${rule.type}]`);
        }
      }
    }

    cleanedLines.push(line);
  }

  return {
    cleanedText: cleanedLines.join('\n'),
    redactionCount: totalRedactions,
    redactedTypes,
    lines: cleanedLines
  };
}
