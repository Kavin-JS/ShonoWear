// Puts a backup file back into the database.
//   node --env-file=.env scripts/restore.mjs <file> [--yes] [--force]
// Without --yes it only checks the file and shows what is inside. An existing, non-empty database is never overwritten unless --force is given.
import fs from 'node:fs';
import { unseal, restoreDump, summarise } from '../server/backup.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('Usage: node --env-file=.env scripts/restore.mjs <backup-file> [--yes] [--force]'); process.exit(1); }
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) { console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN first.'); process.exit(1); }
let dump;
try { dump = unseal(fs.readFileSync(file), process.env.BACKUP_PASSPHRASE || ''); } catch (e) { console.error(e.message); process.exit(1); }
const s = summarise(dump);
console.log(`Backup from ${dump.createdAt}: ${s.keys} records, ${s.orders} orders. Checksum OK.`);
if (!flags.includes('--yes')) { console.log('Nothing was changed. Add --yes to restore.'); process.exit(0); }
try { const r = await restoreDump(dump, { force: flags.includes('--force') }); console.log(`Restored ${r.written} records.`); }
catch (e) { console.error(e.message); process.exit(1); }
