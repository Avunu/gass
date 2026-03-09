import { EntryWithJobs, JobFrequency, ScheduledJob } from "../types/jobs";
import * as EntryRegistry from "./EntryRegistry";

let jobs: Map<string, ScheduledJob> = new Map();
const MAX_EXECUTION_TIME = 300000; // 5 minutes in milliseconds

export function registerJob(job: ScheduledJob): void {
  jobs.set(job.id, job);
}

export async function processJobs(frequency: JobFrequency): Promise<void> {
  const startTime = Date.now();
  const now = new Date();

  for (const [id, job] of jobs) {
    if (job.frequency !== frequency) continue;

    try {
      if (shouldRunJob(job, now)) {
        // Check if we're approaching the execution time limit
        if (Date.now() - startTime > MAX_EXECUTION_TIME) {
          Logger.log(
            `Stopping job processing due to execution time limit (5 minutes). Will resume in next run.`,
          );
          break;
        }

        await job.handler();
        job.lastRun = now;
        jobs.set(id, job);

        Logger.log(`Successfully completed job: ${id}`);
      }
    } catch (error) {
      Logger.log(`Error running job ${id}: ${error}`);
    }
  }
}

function shouldRunJob(job: ScheduledJob, now: Date): boolean {
  if (!job.lastRun) return true;

  const hoursSince = (now.getTime() - job.lastRun.getTime()) / (1000 * 60 * 60);

  switch (job.frequency) {
    case "minutely":
      return hoursSince >= 0.0166667; // 1 / 60
    case "hourly":
      return hoursSince >= 1;
    case "daily":
      return hoursSince >= 24;
    case "weekly":
      return hoursSince >= 168; // 24 * 7
    case "monthly":
      return hoursSince >= 720; // 24 * 30
    default:
      return false;
  }
}

export async function collectAndRegisterJobs(): Promise<void> {
  const entryTypes = EntryRegistry.getAllEntryTypes();

  for (const EntryType of entryTypes) {
    if (hasScheduledJobs(EntryType)) {
      const entryJobs = await EntryType.getScheduledJobs();
      entryJobs.forEach((job) => registerJob(job));
    }
  }
}

function hasScheduledJobs(EntryType: unknown): EntryType is EntryWithJobs {
  return (
    typeof EntryType === "function" &&
    "getScheduledJobs" in EntryType &&
    typeof (EntryType as EntryWithJobs).getScheduledJobs === "function"
  );
}
