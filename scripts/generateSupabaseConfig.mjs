import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'supabase-config.json');

const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl && !supabaseAnonKey) {
  console.log('Supabase config generation skipped; SUPABASE_URL and SUPABASE_ANON_KEY are not set.');
  process.exit(0);
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Both SUPABASE_URL and SUPABASE_ANON_KEY are required to generate supabase-config.json.');
  process.exit(1);
}

const config = {
  supabaseUrl,
  supabaseAnonKey
};

await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log('Generated supabase-config.json from environment variables.');
