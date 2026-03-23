import 'dotenv/config';

const ASANA_PAT = process.env.ASANA_PAT;
const PROJECT_GID = '1213223139200704'; // Solutions Architect Command Center

if (!ASANA_PAT) {
  console.error('ASANA_PAT not set in .env');
  process.exit(1);
}

async function fetchAllTasks() {
  const allTasks: any[] = [];
  let nextPage: string | null = null;
  const fields = 'name,completed,assignee.name,gid';

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
  const fields = 'name,completed,custom_fields.gid,custom_fields.display_value,custom_fields.enum_value.name,custom_fields.text_value,custom_fields.date_value';
  const url = `https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=${fields}&limit=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ASANA_PAT}` },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

async function main() {
  try {
    console.log('Fetching Asana tasks...');
    const tasks = await fetchAllTasks();
    const activeTasks = tasks.filter(t => !t.completed);

    console.log(`Found ${activeTasks.length} active tasks\n`);

    // Get subtasks from first 3 tasks to get a sample of custom fields
    const sampleTasks = activeTasks.slice(0, 3);
    const fieldsMap = new Map<string, { gid: string; names: Set<string> }>();

    for (const task of sampleTasks) {
      console.log(`Fetching subtasks for: ${task.name}`);
      const subtasks = await fetchSubtasks(task.gid);

      subtasks.forEach(sub => {
        sub.custom_fields?.forEach((cf: any) => {
          if (cf.gid) {
            const displayName = cf.display_value || cf.enum_value?.name || cf.text_value || 'unknown';
            if (!fieldsMap.has(cf.gid)) {
              fieldsMap.set(cf.gid, { gid: cf.gid, names: new Set() });
            }
            fieldsMap.get(cf.gid)!.names.add(displayName);
          }
        });
      });
    }

    console.log('\n--- SUBTASK CUSTOM FIELDS ---\n');
    fieldsMap.forEach(({ gid, names }) => {
      console.log(`GID: ${gid}`);
      console.log(`Values: ${Array.from(names).join(', ')}`);
      console.log('');
    });
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
