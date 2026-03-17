
const ASANA_PAT = process.env.ASANA_PAT;
const PROJECT_GID = '1213223139200704'; // Solutions Architect Command Center

// Custom field GIDs
const CUSTOMER_STATUS_GID = '1213193818615990';
const USE_CASE_PHASE_GID = '1213301486281125';
const CUSTOMER_FIELD_GID = '1213193818616005';
const KICKOFF_DATE_GID = '1213264165642656';

// Capacity constants
const HOURS_M1 = 35;
const HOURS_M2 = 25;
const HOURS_M3 = 10;

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
    date_value: { date: string; date_time: string | null } | null;
  }>;
}

interface AsanaSubtask {
  gid: string;
  name: string;
  completed: boolean;
  assignee: { gid: string; name: string } | null;
  custom_fields: Array<{
    gid: string;
    display_value: string | null;
    date_value: { date: string; date_time: string | null } | null;
  }>;
}

function getMonth(startDate: string | null, now: Date): 1 | 2 | 3 | null {
  if (!startDate) return null;
  const start = new Date(startDate + 'T00:00:00Z');
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return null; // hasn't started yet
  if (diffDays <= 30) return 1;
  if (diffDays <= 60) return 2;
  if (diffDays <= 90) return 3;
  return null; // past 90 days — excluded
}

function getHoursForMonth(month: 1 | 2 | 3): number {
  if (month === 1) return HOURS_M1;
  if (month === 2) return HOURS_M2;
  return HOURS_M3;
}

async function fetchAllTasks(): Promise<AsanaTask[]> {
  const allTasks: AsanaTask[] = [];
  let nextPage: string | null = null;
  const fields = 'name,completed,assignee.name,custom_fields.display_value,custom_fields.enum_value.name,custom_fields.text_value,custom_fields.date_value';

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

async function fetchSubtasks(taskGid: string): Promise<AsanaSubtask[]> {
  const fields = 'name,completed,assignee.name,custom_fields.display_value,custom_fields.date_value';
  const url = `https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=${fields}&limit=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ASANA_PAT}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.data || [];
}

// Fetch subtasks in parallel with concurrency limit
async function fetchAllSubtasks(taskGids: string[], concurrency = 8): Promise<Record<string, AsanaSubtask[]>> {
  const results: Record<string, AsanaSubtask[]> = {};
  const queue = [...taskGids];

  async function worker() {
    while (queue.length > 0) {
      const gid = queue.shift()!;
      results[gid] = await fetchSubtasks(gid);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(workers);
  return results;
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
    const now = new Date();

    // Filter to active (incomplete) tasks with assignees
    const activeTasks = tasks.filter(t => !t.completed && t.assignee?.name);

    // Fetch subtasks for all active tasks
    const taskGids = activeTasks.map(t => t.gid);
    const subtasksMap = await fetchAllSubtasks(taskGids);

    // Build SA capacity data
    const saMap: Record<string, {
      useCases: Array<{ customer: string; name: string; month: 1 | 2 | 3; hours: number }>;
      clients: string[];
    }> = {};

    for (const task of activeTasks) {
      const saName = task.assignee!.name;

      // Get customer name from custom field or task name
      let customerName: string | null = null;
      for (const cf of task.custom_fields || []) {
        if (cf.gid === CUSTOMER_FIELD_GID) {
          customerName = cf.text_value || cf.display_value || null;
        }
      }
      const customer = customerName || task.name;

      if (!saMap[saName]) {
        saMap[saName] = { useCases: [], clients: [] };
      }
      if (!saMap[saName].clients.includes(customer)) {
        saMap[saName].clients.push(customer);
      }

      // Process subtasks (use cases)
      const subtasks = subtasksMap[task.gid] || [];

      if (subtasks.length > 0) {
        for (const sub of subtasks) {
          if (sub.completed) continue;

          // Get Kickoff Date from subtask custom field
          let kickoffDate: string | null = null;
          for (const cf of sub.custom_fields || []) {
            if (cf.gid === KICKOFF_DATE_GID && cf.date_value?.date) {
              kickoffDate = cf.date_value.date;
            }
          }

          const month = getMonth(kickoffDate, now);

          // Include use case even if no date (month will be null)
          if (month || !kickoffDate) {
            saMap[saName].useCases.push({
              customer,
              name: sub.name,
              month,
              hours: month ? getHoursForMonth(month) : 0,
            });
          }
        }
      } else {
        // No subtasks — check Kickoff Date on the task itself
        let kickoffDate: string | null = null;
        for (const cf of task.custom_fields || []) {
          if (cf.gid === KICKOFF_DATE_GID) {
            kickoffDate = cf.display_value ? cf.display_value.split('T')[0] : null;
          }
        }
        const month = getMonth(kickoffDate, now);

        // Include use case even if no date (month will be null)
        if (month || !kickoffDate) {
          saMap[saName].useCases.push({
            customer,
            name: task.name,
            month,
            hours: month ? getHoursForMonth(month) : 0,
          });
        }
      }
    }

    const saData = Object.entries(saMap)
      .map(([name, data]) => {
        const m1Count = data.useCases.filter(uc => uc.month === 1).length;
        const m2Count = data.useCases.filter(uc => uc.month === 2).length;
        const m3Count = data.useCases.filter(uc => uc.month === 3).length;
        const totalHours = data.useCases.filter(uc => uc.month !== null).reduce((sum, uc) => sum + uc.hours, 0);

        return {
          name,
          useCases: data.useCases,
          totalHours,
          monthBreakdown: { m1: m1Count, m2: m2Count, m3: m3Count },
          capacity: 128,
          utilizationPct: Math.round((totalHours / 128) * 100),
          clients: data.clients,
        };
      })
      .sort((a, b) => b.utilizationPct - a.utilizationPct);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return sendJson(res, 200, { data: saData });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
