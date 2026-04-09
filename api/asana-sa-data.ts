
const ASANA_PAT = process.env.ASANA_PAT;
const PROJECT_GID = '1213223139200704'; // Solutions Architect Command Center

// Custom field GIDs
const CUSTOMER_STATUS_GID = '1213193818615990';
const USE_CASE_PHASE_GID = '1213301486281125';
const CUSTOMER_FIELD_GID = '1213193818616005';
const KICKOFF_DATE_GID = '1213264165642656';

// Asana section GID → pod name + lead (sections ARE pods in this project)
const SECTION_POD_MAP: Record<string, { pod: string; lead: string }> = {
  '1213272400614397': { pod: "Andreea's Pod", lead: 'Andreea Volzer' },
  '1213272400614388': { pod: "Melanie's Pod", lead: "Melanie Dell'Olio" },
  '1213272400614398': { pod: 'Pod Sqod', lead: 'Richard Li' },
};

// Capacity constants
const HOURS_M1 = 35;
const HOURS_M2 = 25;
const HOURS_M3 = 10;

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  assignee: { gid: string; name: string } | null;
  memberships: Array<{
    project: { gid: string } | null;
    section: { gid: string; name: string } | null;
  }>;
  custom_fields: Array<{
    gid: string;
    display_value: string | null;
    enum_value: { name: string } | null;
    text_value: string | null;
    date_value: { date: string; date_time: string | null } | null;
  }>;
}

interface UseCase {
  customer: string;
  name: string;
  month: 1 | 2 | 3 | null;
  hours: number;
  customerStatus?: string;
  isPlaceholder?: boolean; // Marks use cases with no subtasks
}

interface AsanaSubtask {
  gid: string;
  name: string;
  completed: boolean;
  assignee: { gid: string; name: string } | null;
  custom_fields: Array<{
    gid: string;
    display_value: string | null;
    enum_value: { name: string } | null;
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
  const fields = 'name,completed,assignee.name,memberships.project.gid,memberships.section.gid,memberships.section.name,custom_fields.gid,custom_fields.display_value,custom_fields.enum_value.name,custom_fields.text_value,custom_fields.date_value';

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
  const fields = 'name,completed,assignee.name,custom_fields.gid,custom_fields.display_value,custom_fields.enum_value.name,custom_fields.date_value';
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

    // Identify Integration Engineers (anyone assigned to tasks with "integration" in the name)
    const ieSet = new Set<string>();
    for (const task of activeTasks) {
      if (task.name.toLowerCase().includes('integration')) {
        ieSet.add(task.assignee!.name);
      }
    }

    // Identify CMS specialists (anyone assigned to tasks with "cms" in the name)
    const cmsSet = new Set<string>();
    for (const task of activeTasks) {
      if (task.name.toLowerCase().includes('cms')) {
        cmsSet.add(task.assignee!.name);
      }
    }

    // Filter out IEs and CMS from active tasks
    const saTasks = activeTasks.filter(t => !ieSet.has(t.assignee!.name) && !cmsSet.has(t.assignee!.name));

    // Fetch subtasks for all SA tasks
    const taskGids = saTasks.map(t => t.gid);
    const subtasksMap = await fetchAllSubtasks(taskGids);

    // Build SA → section mapping from SUBTASK assignees (first occurrence wins).
    // Pod membership is determined by who is assigned to subtasks, not main task assignees.
    const saSectionMap: Record<string, string> = {}; // saName → section GID
    for (const task of saTasks) {
      const membership = (task.memberships || []).find(m => m.project?.gid === PROJECT_GID);
      const sectionGid = membership?.section?.gid;
      if (!sectionGid) continue;

      const subtasks = subtasksMap[task.gid] || [];
      for (const sub of subtasks) {
        if (!sub.assignee) continue;
        const assigneeName = sub.assignee.name;
        if (ieSet.has(assigneeName) || cmsSet.has(assigneeName)) continue;
        if (!saSectionMap[assigneeName]) {
          saSectionMap[assigneeName] = sectionGid;
        }
      }
    }

    // Build SA capacity data
    const saMap: Record<string, {
      useCases: UseCase[];
      clients: string[];
      customerStatus: Record<string, string | null>;
    }> = {};

    for (const task of saTasks) {
      const saName = task.assignee!.name;

      // Get customer name from custom field or task name
      let customerName: string | null = null;
      let customerStatus: string | null = null;
      for (const cf of task.custom_fields || []) {
        if (cf.gid === CUSTOMER_FIELD_GID) {
          customerName = cf.text_value || cf.display_value || null;
        }
        if (cf.gid === CUSTOMER_STATUS_GID) {
          customerStatus = cf.enum_value?.name || cf.display_value || null;
        }
      }
      const customer = customerName || task.name;

      if (!saMap[saName]) {
        saMap[saName] = { useCases: [], clients: [], customerStatus: {} };
      }
      if (!saMap[saName].clients.includes(customer)) {
        saMap[saName].clients.push(customer);
      }
      saMap[saName].customerStatus[customer] = customerStatus;

      // Process only subtasks (use cases)
      const subtasks = subtasksMap[task.gid] || [];
      let hasValidUseCase = false;

      for (const sub of subtasks) {
        if (sub.name.toLowerCase().includes('integration')) continue;

        // Skip subtasks assigned to IE or CMS people
        if (sub.assignee && (ieSet.has(sub.assignee.name) || cmsSet.has(sub.assignee.name))) continue;

        // Get Kickoff Date and Customer Status from subtask custom fields
        let kickoffDate: string | null = null;
        let subtaskCustomerStatus: string | null = null;
        for (const cf of sub.custom_fields || []) {
          if (cf.gid === KICKOFF_DATE_GID && cf.date_value?.date) {
            kickoffDate = cf.date_value.date;
          }
          if (cf.gid === CUSTOMER_STATUS_GID) {
            subtaskCustomerStatus = cf.enum_value?.name || cf.display_value || null;
          }
        }

        // Determine assignee: use subtask assignee if available, otherwise use main task assignee
        const useAssignee = sub.assignee?.name || saName;

        const month = getMonth(kickoffDate, now);

        // Always include the subtask as a use case — month/hours are used only for
        // capacity math and will be null/0 for expired or future-dated kickoffs.
        // Previously this gated on `if (month || !kickoffDate)`, which silently
        // dropped 90+ day old subtasks and caused clients to show "(No use cases)".
        if (!saMap[useAssignee]) {
          saMap[useAssignee] = { useCases: [], clients: [], customerStatus: {} };
        }
        if (!saMap[useAssignee].clients.includes(customer)) {
          saMap[useAssignee].clients.push(customer);
        }
        saMap[useAssignee].customerStatus[customer] = subtaskCustomerStatus || customerStatus;

        saMap[useAssignee].useCases.push({
          customer,
          name: sub.name,
          month,
          hours: month ? getHoursForMonth(month) : 0,
          customerStatus: subtaskCustomerStatus || customerStatus,
        });
        hasValidUseCase = true;
      }

      // If no valid use cases found, add a placeholder so customer still shows up
      if (!hasValidUseCase) {
        saMap[saName].useCases.push({
          customer,
          name: '(No use cases)',
          month: null,
          hours: 0,
          customerStatus,
          isPlaceholder: true,
        });
      }
    }

    const saData = Object.entries(saMap)
      .map(([name, data]) => {
        // Count only non-placeholder use cases for capacity calculation
        const nonPlaceholderUseCases = data.useCases.filter(uc => !uc.isPlaceholder);
        const m1Count = nonPlaceholderUseCases.filter(uc => uc.month === 1).length;
        const m2Count = nonPlaceholderUseCases.filter(uc => uc.month === 2).length;
        const m3Count = nonPlaceholderUseCases.filter(uc => uc.month === 3).length;
        const totalHours = nonPlaceholderUseCases.filter(uc => uc.month !== null).reduce((sum, uc) => sum + uc.hours, 0);

        const sectionGid = saSectionMap[name];
        const podInfo = sectionGid ? SECTION_POD_MAP[sectionGid] : null;

        return {
          name,
          pod: podInfo?.pod || '',
          lead: podInfo?.lead || '',
          useCases: data.useCases, // Includes both real use cases and placeholders
          totalHours,
          monthBreakdown: { m1: m1Count, m2: m2Count, m3: m3Count },
          capacity: 128,
          utilizationPct: Math.round((totalHours / 128) * 100),
          clients: data.clients,
        };
      })
      .sort((a, b) => b.utilizationPct - a.utilizationPct);

    // Return the authoritative pod list from SECTION_POD_MAP so the frontend
    // always has all pods regardless of which SAs have active subtasks.
    const pods = Object.values(SECTION_POD_MAP).map(p => p.pod);

    res.setHeader('Cache-Control', 'no-store');
    return sendJson(res, 200, {
      data: saData,
      pods,
      excludedPeople: Array.from(ieSet).concat(Array.from(cmsSet))
    });
  } catch (err: any) {
    return sendJson(res, 500, { error: err.message });
  }
}
