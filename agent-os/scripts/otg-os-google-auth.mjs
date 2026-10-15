// scripts/otg-os-google-auth.mjs
// One-time Google sign-in for OTG-OS. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a "Desktop app" OAuth client)
// in .env.local. Saves GOOGLE_REFRESH_TOKEN to .env.local without printing it.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOOGLE_SCOPES } from '../lib/os/tools/gmail.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(projectDir, '.env.local');
process.loadEnvFile(envFile);
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.');
  process.exit(1);
}

const port = 53682;
const redirectUri = `http://127.0.0.1:${port}/callback`;
const state = crypto.randomUUID();
const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
consent.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: GOOGLE_SCOPES.join(' '),
  access_type: 'offline',
  prompt: 'consent',
  state,
}).toString();

console.log('Open this link, sign in as the business Gmail account, and allow access:\n');
console.log(`${consent.href}\n`);

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, redirectUri);
    if (url.pathname !== '/callback') {
      response.writeHead(404).end();
      return;
    }
    if (url.searchParams.get('state') !== state) {
      response.writeHead(400).end('Sign-in state did not match. Run the script again.');
      return;
    }
    const error = url.searchParams.get('error');
    response.writeHead(200, { 'content-type': 'text/plain' }).end(error ? `Google said: ${error}` : 'OTG-OS is connected. You can close this tab.');
    server.close();
    if (error) reject(new Error(error));
    else resolve(url.searchParams.get('code'));
  });
  server.on('error', (error) => reject(error.code === 'EADDRINUSE'
    ? new Error(`Port ${port} is busy. Close whatever is using it and run the script again.`)
    : error));
  server.listen(port, '127.0.0.1');
});

const response = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
});
const data = await response.json();
if (!data.refresh_token) {
  console.error(`Google did not return a refresh token (${data.error ?? response.status}).`);
  process.exit(1);
}
const original = fs.readFileSync(envFile, 'utf8');
const newline = original.includes('\r\n') ? '\r\n' : '\n';
const lines = original.split(/\r?\n/).filter((line) => !line.startsWith('GOOGLE_REFRESH_TOKEN='));
while (lines.length && lines.at(-1) === '') lines.pop();
lines.push(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`, '');
fs.writeFileSync(envFile, lines.join(newline));
console.log('Saved GOOGLE_REFRESH_TOKEN to .env.local. Restart the OTG-OS worker to start using Gmail.');
