// Core base classes
export { Entry, IEntryMeta, ValidationResult } from "./base/Entry";
export { EntryRegistry, MenuItem, MenuHandler, GlobalMenuFunctions } from "./base/EntryRegistry";
export { SchedulerService } from "./base/ScheduledJob";
export { CacheManager } from "./base/cacheManager";
export { Link, LinkArray, LinkMetadata, link, linkArray, getLinkMetadata, createLinkProxy, createLinkArrayProxy, IS_LINK_PROXY } from "./base/Link";
export { MetadataLoader } from "./base/MetadataLoader";

// Core services
export { SheetService, SheetValue, FilterCriteria } from "./services/SheetService";
export { EmailService } from "./services/EmailService";
export { CalendarService } from "./services/CalendarService";
export { DocService } from "./services/DocService";
export { ContactsService } from "./services/ContactsService";
export { FormService } from "./services/FormService";
export { TemplateService } from "./services/TemplateService";
export { DataEntryService } from "./services/DataEntryService";

// Core types
export { ScheduledJob, JobFrequency, EntryWithJobs } from "./types/jobs";
