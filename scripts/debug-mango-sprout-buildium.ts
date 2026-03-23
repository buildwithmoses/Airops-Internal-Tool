import 'dotenv/config';

const ASANA_PAT = process.env.ASANA_PAT;
const PROJECT_GID = '1213223139200704'; // Solutions Architect Command Center

const CUSTOMER_STATUS_GID = '1213193818615990';
const KICKOFF_DATE_GID = '1213264165642656';
const CUSTOMER_FIELD_GID = '1213193818616005';

const targetCustomers = ['Mango Technologies, Inc. DBA ClickUp', 'Buildium', 'Sprout Social Inc'];

async function fetchAllTasks() {
  const allTasks: any[] = [];
  let nextPage: string | null = null;
  const fields = 'name,completed,assignee.name,gid,custom_fields.gid,custom_fields.display_value,custom_fields.enum_value.name,custom_fields.text_value,custom_fields.date_value';

  do {
    const url = nextPage
      ? nextPage
      : `https://app.asana.com/api/1.0/projects/${PROJECT_GID}/tasks?opt_fields=${fields}&limit=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ASANA_PAT}` },
    });

    if (!res.ok) throw new Error(`Asana API error: ${res.status}`);

    const data = await res.json();
    allTasks.push(...data.data);
    nextPage = data.next_page?.uri || null;
  } while (nextPage);

  return allTasks;
}

async function fetchSubtasks(taskGid: string) {
  const fields = 'name,completed,assignee.name,gid,custom_fields.gid,custom_fields.display_value,custom_fields.enum_value.name,custom_fields.text_value,custom_fields.date_value';
  const url = `https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=${fields}&limit=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ASANA_PAT}` },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

function getMonth(startDate: string | null, now: Date): 1 | 2 | 3 | null {
  if (!startDate) return null;
  const start = new Date(startDate + 'T00:00:00Z');
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  console.log(`    Date: ${startDate}, diffDays: ${diffDays}`);
  if (diffDays < 0) {
    console.log(`    → In the future, returning null`);
    return null;
  }
  if (diffDays <= 30) {
    console.log(`    → Within 30 days (M1)`);
    return 1;
  }
  if (diffDays <= 60) {
    console.log(`    → Within 60 days (M2)`);
    return 2;
  }
  if (diffDays <= 90) {
    console.log(`    → Within 90 days (M3)`);
    return 3;
  }
  console.log(`    → Past 90 days, returning null`);
  return null;
}

async function main() {
  if (!ASANA_PAT) {
    console.error('ASANA_PAT not set');
    process.exit(1);
  }

  console.log('Fetching all tasks...');
  const allTasks = await fetchAllTasks();
  const now = new Date();

  // Filter to active tasks with assignees
  const activeTasks = allTasks.filter(t => !t.completed && t.assignee?.name);
  console.log(`Found ${activeTasks.length} active tasks with assignees\n`);

  // Filter for our target customers
  const targetTasks = activeTasks.filter(t => {
    let customerName: string | null = null;
    for (const cf of t.custom_fields || []) {
      if (cf.gid === CUSTOMER_FIELD_GID) {
        customerName = cf.text_value || cf.display_value || null;
      }
    }
    const customer = customerName || t.name;
    return targetCustomers.includes(customer);
  });

  console.log(`Found ${targetTasks.length} target tasks\n`);

  for (const task of targetTasks) {
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
    const saName = task.assignee!.name;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TASK: ${customer}`);
    console.log(`SA: ${saName}`);
    console.log(`Task Assignee: ${task.assignee?.name}`);
    console.log(`Task Status: ${customerStatus || 'none'}`);
    console.log(`Task Completed: ${task.completed}`);
    console.log(`${'='.repeat(60)}`);

    const subtasks = await fetchSubtasks(task.gid);
    console.log(`\nFetched ${subtasks.length} subtasks:`);

    for (const sub of subtasks) {
      console.log(`\n  Subtask: "${sub.name}"`);
      console.log(`    Completed: ${sub.completed}`);
      console.log(`    Assignee: ${sub.assignee?.name || '(none)'}`);

      // Check integration filter
      if (sub.name.toLowerCase().includes('integration')) {
        console.log(`    ✗ FILTERED OUT: Contains "integration"`);
        continue;
      }

      // Get custom fields
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

      console.log(`    Kickoff Date: ${kickoffDate || '(none)'}`);
      console.log(`    Status: ${subtaskCustomerStatus || '(none)'}`);

      // Check month filter
      const month = getMonth(kickoffDate, now);
      if (month || !kickoffDate) {
        console.log(`    ✓ INCLUDED in dashboard`);
      } else {
        console.log(`    ✗ FILTERED OUT: No valid month and has kickoff date`);
      }
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
