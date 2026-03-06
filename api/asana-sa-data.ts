
const ASANA_PAT = process.env.ASANA_PAT;
const PROJECT_GID = '1213223139200704'; // Solutions Architect Command Center

// Custom field GIDs
const CUSTOMER_STATUS_GID = '1213193818615990';
const USE_CASE_PHASE_GID = '1213301486281125';
const CUSTOMER_FIELD_GID = '1213193818616005';

// Classify into pipeline stages
function classifyStage(customerStatus: string | null, useCasePhase: string | null): 'early' | 'mid' | 'late' {
  const phase = useCasePhase?.toLowerCase() || '';
  const status = customerStatus?.toLowerCase() || '';

  if (phase.includes('pre-activation') || phase.includes('intake')) return 'early';
  if (phase.includes('calibration') || phase.includes('go-live')) return 'mid';
  if (phase.includes('maintenance')) return 'late';

  if (status.includes('pre-activation') || status.includes('activation')) return 'early';
  if (status.includes('live but syncs')) return 'mid';
  if (status.includes('async') || status.includes('churned')) return 'late';

  return 'early';
}

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  assignee: { gid: string; name: string } | null;
  custom_fields: Array<{
    gid: string;
    display_value: string | null;
    enum_value: { name: string } | null;
    text_value: string | null;
  }>;
}

async function fetchAllTasks(): Promise<AsanaTask[]> {
  const allTasks: AsanaTask[] = [];
  let nextPage: string | null = null;
  const fields = 'name,completed,assignee.name,custom_fields.display_value,custom_fields.enum_value.name,custom_fields.text_value';

  do {
    const url = nextPage
      ? nextPage
      : `https://app.asana.com/api/1.0/projects/${PROJECT_GID}/tasks?opt_fields=${fields}&limit=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ASANA_PAT}` },
    });

    if (!res.ok) {
      throw new Error(`Asana API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    allTasks.push(...data.data);
    nextPage = data.next_page?.uri || null;
  } while (nextPage);

  return allTasks;
}

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (!ASANA_PAT) {
    return sendJson(res, 500, { error: 'ASANA_PAT environment variable not set' });
  }

  try {
    const tasks = await fetchAllTasks();

    // Group by task ASSIGNEE (the SA assigned to each task/client)
    const saMap: Record<string, { activeProjects: number; earlyStage: number; midStage: number; lateStage: number; clients: string[] }> = {};

    for (const task of tasks) {
      if (task.completed) continue;
      if (!task.assignee?.name) continue;

      const saName = task.assignee.name;

      let customerStatus: string | null = null;
      let useCasePhase: string | null = null;
      let customerName: string | null = null;

      for (const cf of task.custom_fields || []) {
        if (cf.gid === CUSTOMER_STATUS_GID) {
          customerStatus = cf.enum_value?.name || cf.display_value || null;
        } else if (cf.gid === USE_CASE_PHASE_GID) {
          useCasePhase = cf.enum_value?.name || cf.display_value || null;
        } else if (cf.gid === CUSTOMER_FIELD_GID) {
          customerName = cf.text_value || cf.display_value || null;
        }
      }

      if (!saMap[saName]) {
        saMap[saName] = { activeProjects: 0, earlyStage: 0, midStage: 0, lateStage: 0, clients: [] };
      }

      saMap[saName].activeProjects++;
      const stage = classifyStage(customerStatus, useCasePhase);
      if (stage === 'early') saMap[saName].earlyStage++;
      else if (stage === 'mid') saMap[saName].midStage++;
      else saMap[saName].lateStage++;

      const clientLabel = customerName || task.name;
      saMap[saName].clients.push(clientLabel);
    }

    const saData = Object.entries(saMap)
      .map(([name, data]) => ({
        name,
        activeProjects: data.activeProjects,
        earlyStage: data.earlyStage,
        midStage: data.midStage,
        lateStage: data.lateStage,
        notes: '',
        clients: data.clients,
      }))
      .sort((a, b) => b.activeProjects - a.activeProjects);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return sendJson(res, 200, { data: saData, totalTasks: tasks.length });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
