import fs from 'node:fs';
import path from 'node:path';

export function createBackup({ osDb, dir, keep = 14, now = () => new Date() }) {
  function run() {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `otg-os-${stamp}.sqlite`);
    osDb.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const backups = fs.readdirSync(dir).filter((name) => /^otg-os-.*\.sqlite$/.test(name)).sort();
    for (const name of backups.slice(0, Math.max(0, backups.length - keep))) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
    return file;
  }
  return { run };
}
