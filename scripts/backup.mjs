// Saves a backup of the whole database to a file on your computer.
//   node --env-file=.env scripts/backup.mjs [folder]        (fish: same command)
// Needs UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (in .env). If BACKUP_PASSPHRASE (12+ characters) is set the file is encrypted.
import fs from 'node:fs';
import path from 'node:path';
import { dumpAll, seal, summarise } from '../server/backup.js';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (for example in .env, then run with --env-file=.env).'); process.exit(1); }
const pass = process.env.BACKUP_PASSPHRASE || '';
if (pass && pass.length < 12) { console.error('BACKUP_PASSPHRASE must be at least 12 characters.'); process.exit(1); }
const dir = process.argv[2] || 'backups';
fs.mkdirSync(dir, { recursive: true });
const dump = await dumpAll();
const buf = seal(dump, pass);
const file = path.join(dir, `shonowear-backup-${dump.createdAt.slice(0, 10)}${pass ? '.swb' : '.json.gz'}`);
fs.writeFileSync(file, buf, { mode: 0o600 });
const s = summarise(dump);
console.log(`Saved ${file}  (${s.keys} records, ${s.orders} orders, ${(buf.length / 1024).toFixed(1)} KB, ${pass ? 'encrypted' : 'NOT encrypted: it contains customer details, keep it private'})`);
