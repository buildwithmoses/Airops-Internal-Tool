import { task } from "@trigger.dev/sdk/v3";

const PRE_KICKOFF_TASKS = [
  "AEO Workspace ID - UPGRADE",
  "Set Tasks in Admin",
  "Intake Checklist Sent (AE)",
  "Internal Sync with AE (add Lead)",
  "Kickoff Booked (AE)",
  "Intro Email Sent? (AE)",
  "Deck Created",
  "Slack Channel Created",
  "Add Hubspot ID to Admin",
];

export const preKickoffTask = task({
  id: "pre-kickoff-setup",
  run: async (payload: { clientName: string }) => {
    console.log(`Running pre-kickoff tasks for: ${payload.clientName}`);

    const results = PRE_KICKOFF_TASKS.map((taskName) => ({
      task: taskName,
      status: "pending",
    }));

    return {
      client: payload.clientName,
      preKickoffTasks: results,
    };
  },
});
