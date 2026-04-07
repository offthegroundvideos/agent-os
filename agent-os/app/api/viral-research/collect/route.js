import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const scriptPath = process.cwd() + '/scripts/social-collector.mjs';
    const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, JSON.stringify(body || {})], {
      timeout: (body?.mode === 'creator' || body?.mode === 'urls' || body?.mode === 'niche') ? 240000 : 60000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if (stderr && !stdout) throw new Error(stderr);
    const result = JSON.parse(stdout);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
