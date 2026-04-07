
import json, urllib.request
url = 'http://localhost:8001/api/runs/wait'
payload = {
  'assistant_id': 'lead_agent',
  'input': {
    'messages': [
      {
        'type': 'human',
        'content': (
          'Use invoke_acp_agent with the codex ACP agent for a bounded coding task. '
          'Inside the current repository, create a file named hello_from_codex.txt at the repo root '
          'with exactly this content: Codex ACP live\\n '
          'Do not do the task yourself. Delegate it to codex, wait for codex to complete it, '
          'then report success briefly.'
        )
      }
    ]
  },
  'config': {
    'recursion_limit': 60,
    'configurable': {
      'model_name': 'qwen2.5-14b',
      'thread_id': 'codex-acp-bounded-test',
      'enable_background_run': False,
      'context': {
        'thinking_enabled': False,
        'subagent_enabled': False
      }
    }
  }
}
req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req, timeout=360) as resp:
    print(resp.read().decode('utf-8', errors='replace'))
