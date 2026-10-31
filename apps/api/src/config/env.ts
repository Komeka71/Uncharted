import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.string().default('4000').transform((v) => parseInt(v, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/culprit'),
  GEMINI_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('gemini-1.5-flash'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  ORIGIN_TOKEN: z.string().optional(),
  N8N_WEBHOOK_URL: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

if (env.NODE_ENV === 'production') {
  if (!env.MONGODB_URI || env.MONGODB_URI.includes('localhost')) {
    console.error('[env] MONGODB_URI must be configured for production.');
    process.exit(1);
  }
}

export { env };
export default env;
