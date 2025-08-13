import { Entry } from "../base/Entry";

export type JobFrequency = "minutely" | "hourly" | "daily" | "weekly" | "monthly";

export interface ScheduledJob {
  id: string;
  frequency: JobFrequency;
  lastRun?: Date;
  handler: () => Promise<void>;
}

export type EntryWithJobs = (new () => Entry) & {
  getScheduledJobs(): Promise<ScheduledJob[]>;
};
