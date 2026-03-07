import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "tr_prod_6CXzopmRKMfPphX0dUgo",
  runtime: "node",
  logLevel: "log",
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
    },
  },
  dirs: ["src/trigger"],
});
