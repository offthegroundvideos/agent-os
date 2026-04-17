import path from 'path';
import { spawn } from 'child_process';
import { getAsset } from '../../../lib/assets.js';
import {
  buildAgentSummaries,
  buildSummaryDocument,
  parseTopicField,
  sanitizeClientFacingText,
} from '../../../lib/pipelineReports.js';

function buildPdfPayload(asset) {
  const agentSummaries = buildAgentSummaries(asset || {});
  const summaryDocument = buildSummaryDocument(asset || {}, agentSummaries);
  const clientName = parseTopicField(asset?.topic, 'Client') || asset?.title || 'Client';
  const niche = parseTopicField(asset?.topic, 'Niche');
  const offer = parseTopicField(asset?.topic, 'Primary offer');
  const audience = parseTopicField(asset?.topic, 'Target audience');
  const geography = parseTopicField(asset?.topic, 'Service area or geography');
  const platforms = parseTopicField(asset?.topic, 'Priority platforms');
  const research = agentSummaries.find((summary) => summary.agentId === 'alex');
  const scripts = agentSummaries.find((summary) => summary.agentId === 'maya');
  const social = agentSummaries.find((summary) => summary.agentId === 'sam');
  const strategy = agentSummaries.find((summary) => summary.agentId === 'jordan');
  const production = agentSummaries.find((summary) => summary.agentId === 'iris');

  const executiveSummary = sanitizeClientFacingText(
    research?.handoffJson?.summary ||
    strategy?.handoffJson?.summary ||
    research?.bullets?.[0] ||
    summaryDocument.actionItems?.[0] ||
    'This report captures the strongest opportunities, content directions, and execution priorities identified in this run.'
  );

  const contextRows = [
    ['Client', clientName],
    ['Niche', niche],
    ['Primary Offer', offer],
    ['Target Audience', audience],
    ['Geography', geography],
    ['Priority Platforms', platforms],
    ['Pipeline Type', asset?.pipelineType || 'general'],
  ].filter(([, value]) => value);

  const sections = [
    {
      title: 'Executive Summary',
      body: executiveSummary,
    },
    {
      title: 'Strategic Priorities',
      bullets: [
        ...((research?.bullets || []).slice(0, 3)),
        ...((strategy?.bullets || []).slice(0, 3)),
      ].map(sanitizeClientFacingText),
    },
    {
      title: 'Content Plan',
      bullets: [
        ...((scripts?.bullets || []).slice(0, 4)),
        ...((social?.bullets || []).slice(0, 4)),
      ].map(sanitizeClientFacingText),
    },
    {
      title: 'Production Notes',
      bullets: ((production?.bullets || []).slice(0, 5)).map(sanitizeClientFacingText),
    },
    {
      title: 'Recommended Next Steps',
      bullets: (summaryDocument.actionItems || []).slice(0, 10).map(sanitizeClientFacingText),
    },
  ].filter((section) => section.body || (section.bullets && section.bullets.length));

  return {
    title: `${clientName} Strategy Report`,
    subtitle: `Prepared ${new Date(asset?.updatedAt || asset?.updated_at || Date.now()).toLocaleDateString()} from your pipeline run`,
    context_rows: contextRows,
    sections,
  };
}

function renderPdf(payload) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'generate_pipeline_report_pdf.py');
    const child = spawn('python', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString('utf8') || `PDF render failed with code ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    if (!assetId) {
      return Response.json({ error: 'assetId is required' }, { status: 400 });
    }

    const asset = getAsset(assetId);
    if (!asset) {
      return Response.json({ error: 'Asset not found' }, { status: 404 });
    }

    const pdfPayload = buildPdfPayload(asset);
    const pdfBuffer = await renderPdf(pdfPayload);
    const clientName = parseTopicField(asset?.topic, 'Client') || asset?.title || asset?.id || 'client-report';
    const filename = `${String(clientName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client-report'}-strategy-report.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
