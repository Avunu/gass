// Core base classes and shared interfaces
export { Entry, ValidationResult } from "./base/Entry";
export type { IEntryMeta } from "./base/Entry";
export * as EntryRegistry from "./base/EntryRegistry";
export type { MenuItem, MenuHandler, GlobalMenuFunctions } from "./base/EntryRegistry";
export * as SchedulerService from "./base/ScheduledJob";
export { CacheManager } from "./base/cacheManager";
export {
  Link,
  LinkArray,
  LinkMetadata,
  link,
  linkArray,
  getLinkMetadata,
  createLinkProxy,
  createLinkArrayProxy,
  IS_LINK_PROXY,
} from "./base/Link";
export * as MetadataLoader from "./base/MetadataLoader";

// Core services
export * as SheetService from "./services/SheetService";
export type { SheetValue, FilterCriteria } from "./services/SheetService";
export * as EmailService from "./services/EmailService";
export { CalendarService } from "./services/CalendarService";
export * as DocService from "./services/DocService";
export * as ContactsService from "./services/ContactsService";
export * as FormService from "./services/FormService";
export * as TemplateService from "./services/TemplateService";
export * as DataEntryService from "./services/DataEntryService";

// Core types
export type { ScheduledJob, JobFrequency, EntryWithJobs } from "./types/jobs";

// extra types
export type {
  FormConfiguration,
  FormField,
  FormCreationResult,
  FormResponse,
  FormSharingOptions,
  FormStatistics,
  TextFormField,
  ChoiceFormField,
  LinearScaleFormField,
  DateTimeFormField,
} from "./types/formService";
