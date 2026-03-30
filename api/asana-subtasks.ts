const ASANA_PAT = process.env.ASANA_PAT;
const PROJECT_GID = '1213223139200704'; // Solutions Architect Command Center

// Custom field GIDs (same as asana-sa-data.ts)
const CUSTOMER_STATUS_GID = '1213193818615990';
const CUSTOMER_FIELD_GID = '1213193818616005';
const KICKOFF_DATE_GID = '1213264165642656';
const USE_CASE_PHASE_GID = '1213301486281125';

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function fetchAllTasks() {
  const allTasks: any[] = [];
  let nextPage: string | null = null;
  const fields = [
    'name', 'completed', 'assignee.name', 'assignee.gid',
    'custom_fields.gid', 'custom_fields.display_value',
    'custom_fields.enum_value.name', 'custom_fields.text_value',
    'custom_fields.date_value', 'num_subtasks',
  ].join(',');

  do {
    const url = nextPage
      ? nextPage
      : `https://app.asana.com/api/1.0/projects/${PROJECT_GID}/tasks?opt_fields=${fields}&limit=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ASANA_PAT}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Asana tasks fetch failed: ${res.status} ${res.statusText} — ${text}`);
    }

    const data = await res.json();
    allTasks.push(...data.data);
    nextPage = data.next_page?.uri || null;
  } while (nextPage);

  return allTasks;
}

async function fetchSubtasksForTask(taskGid: string): Promise<{ subtasks: any[]; error: string | null }> {
  const fields = [
    'name', 'completed', 'assignee.name', 'assignee.gid',
    'custom_fields.gid', 'custom_fields.display_value',
    'custom_fields.enum_value.name', 'custom_fields.text_value',
    'custom_fields.date_value', 'parent.gid', 'parent.name',
  ].join(',');

  const url = `https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=${fields}&limit=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ASANA_PAT}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return { subtasks: [], error: `${res.status} ${res.statusText}: ${text}` };
  }

  const data = await res.json();
  return { subtasks: data.data || [], error: null };
}

function extractCustomFields(customFields: any[]) {
  const result: Record<string, any> = {};
  for (const cf of customFields || []) {
    if (cf.gid === CUSTOMER_FIELD_GID) {
      result.customerName = cf.text_value || cf.display_value || null;
    }
    if (cf.gid === CUSTOMER_STATUS_GID) {
      result.customerStatus = cf.enum_value?.name || cf.display_value || null;
    }
    if (cf.gid === KICKOFF_DATE_GID) {
      result.kickoffDate = cf.date_value?.date || null;
    }
    if (cf.gid === USE_CASE_PHASE_GID) {
      result.useCasePhase = cf.enum_value?.name || cf.display_value || null;
    }
  }
  return result;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!ASANA_PAT) {
    return sendJson(res, 500, { error: 'ASANA_PAT environment variable not set' });
  }

  const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
  // Optional: filter to a specific task GID for targeted debugging
  const taskGidFilter = params.get('taskGid');

  try {
    const tasks = await fetchAllTasks();

    // If a specific task GID is requested, only process that one
    const tasksToProcess = taskGidFilter
      ? tasks.filter(t => t.gid === taskGidFilter)
      : tasks;

    const results: any[] = [];
    const errors: { taskGid: string; taskName: string; error: string }[] = [];

    // Fetch subtasks with concurrency limit of 8
    const queue = [...tasksToProcess];
    const concurrency = 8;

    async function worker() {
      while (queue.length > 0) {
        const task = queue.shift()!;
        const taskFields = extractCustomFields(task.custom_fields || []);

        const { subtasks, error } = await fetchSubtasksForTask(task.gid);

        if (error) {
          errors.push({ taskGid: task.gid, taskName: task.name, error });
        }

        results.push({
          taskGid: task.gid,
          taskName: task.name,
          taskAssignee: task.assignee?.name || null,
          taskCompleted: task.completed,
          numSubtasksReported: task.num_subtasks ?? null, // Asana's own count
          customerName: taskFields.customerName || task.name,
          customerStatus: taskFields.customerStatus || null,
          subtasksFetched: subtasks.length,
          subtasks: subtasks.map(sub => {
            const subFields = extractCustomFields(sub.custom_fields || []);
            return {
              subtaskGid: sub.gid,
              subtaskName: sub.name,
              subtaskCompleted: sub.completed,
              assignee: sub.assignee?.name || null,
              kickoffDate: subFields.kickoffDate || null,
              customerStatus: subFields.customerStatus || null,
              useCasePhase: subFields.useCasePhase || null,
              rawCustomFields: sub.custom_fields || [], // full raw fields for debugging
            };
          }),
        });
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, tasksToProcess.length || 1) }, () => worker())
    );

    // Summary stats
    const summary = {
      totalTasks: tasks.length,
      tasksProcessed: tasksToProcess.length,
      tasksWithSubtasks: results.filter(r => r.subtasksFetched > 0).length,
      tasksWithZeroSubtasks: results.filter(r => r.subtasksFetched === 0).length,
      totalSubtasksFetched: results.reduce((sum, r) => sum + r.subtasksFetched, 0),
      fetchErrors: errors.length,
      // Discrepancies: Asana says X subtasks but we fetched Y
      discrepancies: results
        .filter(r => r.numSubtasksReported !== null && r.numSubtasksReported !== r.subtasksFetched)
        .map(r => ({
          taskGid: r.taskGid,
          taskName: r.taskName,
          asanaReports: r.numSubtasksReported,
          weFetched: r.subtasksFetched,
        })),
    };

    return sendJson(res, 200, {
      summary,
      errors,
      tasks: results,
    });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
