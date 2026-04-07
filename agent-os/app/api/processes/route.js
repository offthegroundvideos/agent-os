import {
  getProcesses, stopProcess, stopAll,
  forceKillProcess, forceKillAll,
  clearAllProcesses,
} from '../../../lib/processes.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const processes = getProcesses();
    return Response.json(processes);
  } catch (error) {
    return Response.json([], { status: 200 });
  }
}

export async function POST(request) {
  try {
    const { action, processId } = await request.json();

    if (action === 'stop' && processId) {
      const proc = stopProcess(processId);
      return Response.json({ success: true, proc });
    }

    if (action === 'forceKill' && processId) {
      const proc = forceKillProcess(processId);
      return Response.json({ success: true, proc });
    }

    if (action === 'stopAll') {
      const processes = stopAll();
      return Response.json({ success: true, processes });
    }

    if (action === 'forceKillAll') {
      const processes = forceKillAll();
      return Response.json({ success: true, processes });
    }

    if (action === 'clearAll') {
      clearAllProcesses();
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}