import { JobFrequency, ScheduledJob, EntryWithJobs } from "../types/jobs";
import { EntryRegistry } from "./EntryRegistry";

export class SchedulerService {
  private static jobs: Map<string, ScheduledJob> = new Map();
  private static readonly MAX_EXECUTION_TIME = 300000; // 5 minutes in milliseconds

  static registerJob(job: ScheduledJob): void {
    this.jobs.set(job.id, job);
  }

  static async processJobs(frequency: JobFrequency): Promise<void> {
    const startTime = Date.now();
    const now = new Date();

    for (const [id, job] of this.jobs) {
      if (job.frequency !== frequency) continue;

      try {
        if (this.shouldRunJob(job, now)) {
          // Check if we're approaching the execution time limit
          if (Date.now() - startTime > this.MAX_EXECUTION_TIME) {
            Logger.log(
              `Stopping job processing due to execution time limit (5 minutes). Will resume in next run.`,
            );
            break;
          }

          await job.handler();
          job.lastRun = now;
          this.jobs.set(id, job);

          Logger.log(`Successfully completed job: ${id}`);
        }
      } catch (error) {
        Logger.log(`Error running job ${id}: ${error}`);
      }
    }
  }

  private static shouldRunJob(job: ScheduledJob, now: Date): boolean {
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

  static async collectAndRegisterJobs(): Promise<void> {
    const entryTypes = EntryRegistry.getAllEntryTypes();

    for (const EntryType of entryTypes) {
      if (this.hasScheduledJobs(EntryType)) {
        const jobs = await EntryType.getScheduledJobs();
        jobs.forEach((job) => this.registerJob(job));
      }
    }
  }

  private static hasScheduledJobs(EntryType: unknown): EntryType is EntryWithJobs {
    return (
      typeof EntryType === "function" &&
      "getScheduledJobs" in EntryType &&
      typeof (EntryType as EntryWithJobs).getScheduledJobs === "function"
    );
  }
}
