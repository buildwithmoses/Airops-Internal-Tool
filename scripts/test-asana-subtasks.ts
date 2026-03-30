/**
 * Test script: validates what Asana actually returns for all tasks + subtasks.
 *
 * Usage:
 *   ASANA_PAT=your_token npx tsx scripts/test-asana-subtasks.ts
 *
 * Optional — scope to one task for faster debugging:
 *   ASANA_PAT=your_token npx tsx scripts/test-asana-subtasks.ts --task 1234567890
 */

const ASANA_PAT = process.env.ASANA_PAT;
const PROJECT_GID = '1213223139200704';

// Known custom field GIDs
const CUSTOMER_STATUS_GID = '1213193818615990';
const CUSTOMER_FIELD_GID = '1213193818616005';
const KICKOFF_DATE_GID = '1213264165642656';
const USE_CASE_PHASE_GID = '1213301486281125';

if (!ASANA_PAT) {
  console.error('\n❌  ASANA_PAT is not set. Run as:\n   ASANA_PAT=your_token npx tsx scripts/test-asana-subtasks.ts\n');
  process.exit(1);
}

const taskGidFilter = (() => {
  const idx = process.argv.indexOf('--task');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ─── Asana fetch helpers ───────────────────────────────────────────────────

async function fetchAllTasks(): Promise<any[]> {
  const allTasks: any[] = [];
  let nextPage: string | null = null;
  const fields = [
    'name', 'completed', 'assignee.name',
    'custom_fields.gid', 'custom_fields.display_value',
    'custom_fields.enum_value.name', 'custom_fields.text_value',
    'custom_fields.date_value', 'num_subtasks',
  ].join(',');

  do {
    const url = nextPage
      ? nextPage
      : `https://app.asana.com/api/1.0/projects/${PROJECT_GID}/tasks?opt_fields=${fields}&limit=100`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${ASANA_PAT}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Tasks fetch failed ${res.status}: ${text}`);
    }
    const data = await res.json();
    allTasks.push(...data.data);
    nextPage = data.next_page?.uri || null;
  } while (nextPage);

  return allTasks;
}

async function fetchSubtasksForTask(taskGid: string): Promise<{ subtasks: any[]; error: string | null }> {
  const fields = [
    'name', 'completed', 'assignee.name',
    'custom_fields.gid', 'custom_fields.display_value',
    'custom_fields.enum_value.name', 'custom_fields.text_value',
    'custom_fields.date_value',
  ].join(',');

  const url = `https://app.asana.com/api/1.0/tasks/${taskGid}/subtasks?opt_fields=${fields}&limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${ASANA_PAT}` } });

  if (!res.ok) {
    const text = await res.text();
    return { subtasks: [], error: `${res.status}: ${text}` };
  }

  const data = await res.json();
  return { subtasks: data.data || [], error: null };
}

function extractFields(customFields: any[]) {
  const out: Record<string, any> = {};
  for (const cf of customFields || []) {
    if (cf.gid === CUSTOMER_FIELD_GID)  out.customerName   = cf.text_value || cf.display_value;
    if (cf.gid === CUSTOMER_STATUS_GID) out.customerStatus = cf.enum_value?.name || cf.display_value;
    if (cf.gid === KICKOFF_DATE_GID)    out.kickoffDate    = cf.date_value?.date;
    if (cf.gid === USE_CASE_PHASE_GID)  out.useCasePhase   = cf.enum_value?.name || cf.display_value;
  }
  return out;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍  Fetching all tasks from Asana project...');
  const allTasks = await fetchAllTasks();
  const activeTasks = allTasks.filter(t => !t.completed);
  const tasksToCheck = taskGidFilter
    ? activeTasks.filter(t => t.gid === taskGidFilter)
    : activeTasks;

  console.log(`   Total tasks in project : ${allTasks.length}`);
  console.log(`   Active (incomplete)    : ${activeTasks.length}`);
  if (taskGidFilter) console.log(`   Filtering to task GID  : ${taskGidFilter}`);
  console.log('');

  // Fetch subtasks concurrently (limit 8)
  const queue = [...tasksToCheck];
  const results: any[] = [];

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift()!;
      const { subtasks, error } = await fetchSubtasksForTask(task.gid);
      const taskFields = extractFields(task.custom_fields || []);
      results.push({ task, taskFields, subtasks, error });
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, tasksToCheck.length || 1) }, () => worker()));

  // ─── Print results ──────────────────────────────────────────────────────

  let totalSubtasks = 0;
  let tasksWithMismatch = 0;
  const now = new Date();

  for (const { task, taskFields, subtasks, error } of results) {
    const customer = taskFields.customerName || task.name;
    const asanaCount = task.num_subtasks ?? '?';
    const fetchedCount = subtasks.length;
    const mismatch = typeof asanaCount === 'number' && asanaCount !== fetchedCount;
    if (mismatch) tasksWithMismatch++;
    totalSubtasks += fetchedCount;

    const statusIcon = error ? '❌' : mismatch ? '⚠️ ' : fetchedCount === 0 ? '⬜' : '✅';
    console.log(`${statusIcon}  ${task.name}`);
    console.log(`    GID: ${task.gid}  |  Assignee: ${task.assignee?.name || '—'}  |  Customer field: "${customer}"`);
    console.log(`    Asana reports ${asanaCount} subtask(s), we fetched ${fetchedCount}`);

    if (error) {
      console.log(`    ⚠️  Fetch error: ${error}`);
    }

    if (subtasks.length > 0) {
      for (const sub of subtasks) {
        const sf = extractFields(sub.custom_fields || []);
        const kickoffDate = sf.kickoffDate || null;
        let dateStatus = '(no date)';
        let wouldBeDropped = false;

        if (kickoffDate) {
          const diffDays = Math.floor((now.getTime() - new Date(kickoffDate + 'T00:00:00Z').getTime()) / 86400000);
          if (diffDays < 0) {
            dateStatus = `📅 FUTURE — ${kickoffDate} (${Math.abs(diffDays)}d from now)`;
          } else if (diffDays <= 30)  dateStatus = `M1 — ${kickoffDate}`;
          else if (diffDays <= 60)    dateStatus = `M2 — ${kickoffDate}`;
          else if (diffDays <= 90)    dateStatus = `M3 — ${kickoffDate}`;
          else {
            dateStatus = `⏸ EXPIRED — ${kickoffDate} (${diffDays}d ago, shows with 0 hrs)`;
          }
        }

        const dropWarning = '';
        console.log(`       • [${sub.completed ? 'done' : 'open'}] ${sub.name}`);
        console.log(`         Assignee: ${sub.assignee?.name || '—'}  |  Date: ${dateStatus}${dropWarning}`);
        console.log(`         Status: ${sf.customerStatus || '—'}  |  Phase: ${sf.useCasePhase || '—'}`);

        // Show any raw custom field values we didn't recognise
        const unknownFields = (sub.custom_fields || []).filter(
          (cf: any) => ![CUSTOMER_STATUS_GID, CUSTOMER_FIELD_GID, KICKOFF_DATE_GID, USE_CASE_PHASE_GID].includes(cf.gid)
            && (cf.display_value || cf.text_value || cf.date_value || cf.enum_value)
        );
        if (unknownFields.length > 0) {
          console.log(`         Unknown fields: ${unknownFields.map((cf: any) => `${cf.gid}=${cf.display_value || cf.text_value || JSON.stringify(cf.date_value)}`).join(', ')}`);
        }
      }
    }

    console.log('');
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Tasks checked          : ${tasksToCheck.length}`);
  console.log(`Total subtasks fetched : ${totalSubtasks}`);
  console.log(`Tasks with count mismatch (Asana vs fetched): ${tasksWithMismatch}`);
  console.log('');
  console.log('✅  All subtasks are now included regardless of kickoff date.');
  console.log('   Expired/future subtasks show with month=null and 0 capacity hours.');
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
