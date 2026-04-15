/**
 * Represents the different types of form questions available in Google Forms
 */
export type FormQuestionType =
  | "TEXT"
  | "PARAGRAPH_TEXT"
  | "MULTIPLE_CHOICE"
  | "CHECKBOXES"
  | "DROPDOWN"
  | "LINEAR_SCALE"
  | "MULTIPLE_CHOICE_GRID"
  | "CHECKBOX_GRID"
  | "DATE"
  | "TIME"
  | "DATETIME"
  | "FILE_UPLOAD"
  | "EMAIL"
  | "URL";

/**
 * Base interface for all form field configurations
 */
export interface BaseFormField {
  title: string;
  description?: string;
  required?: boolean;
  type: FormQuestionType;
}

/**
 * Configuration for text input fields
 */
export interface TextFormField extends BaseFormField {
  type: "TEXT" | "PARAGRAPH_TEXT" | "EMAIL" | "URL";
  placeholder?: string;
  maxLength?: number;
}

/**
 * Configuration for choice-based fields
 */
export interface ChoiceFormField extends BaseFormField {
  type: "MULTIPLE_CHOICE" | "CHECKBOXES" | "DROPDOWN";
  choices: string[];
  hasOtherOption?: boolean;
  shuffleOptions?: boolean;
}

/**
 * Configuration for linear scale fields
 */
export interface LinearScaleFormField extends BaseFormField {
  type: "LINEAR_SCALE";
  lowValue: number;
  highValue: number;
  lowLabel?: string;
  highLabel?: string;
}

/**
 * Configuration for grid-based fields
 */
export interface GridFormField extends BaseFormField {
  type: "MULTIPLE_CHOICE_GRID" | "CHECKBOX_GRID";
  rows: string[];
  columns: string[];
}

/**
 * Configuration for date/time fields
 */
export interface DateTimeFormField extends BaseFormField {
  type: "DATE" | "TIME" | "DATETIME";
  includeYear?: boolean;
  includeTime?: boolean;
}

/**
 * Configuration for file upload fields
 */
export interface FileUploadFormField extends BaseFormField {
  type: "FILE_UPLOAD";
  allowedFileTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
}

/**
 * Union type representing all possible form field configurations
 */
export type FormField =
  | TextFormField
  | ChoiceFormField
  | LinearScaleFormField
  | GridFormField
  | DateTimeFormField
  | FileUploadFormField;

/**
 * Configuration for creating a Google Form
 */
export interface FormConfiguration {
  title: string;
  description?: string;
  fields: FormField[];
  collectEmailAddresses?: boolean;
  limitToOneResponse?: boolean;
  requireSignIn?: boolean;
  allowResponseEditing?: boolean;
  showLinkToRespondAgain?: boolean;
  confirmationMessage?: string;
  destinationSpreadsheetId?: string;
}

/**
 * Response data from a form submission
 */
export interface FormResponse {
  responseId: string;
  timestamp: Date;
  respondentEmail?: string;
  answers: { [questionTitle: string]: string | string[] };
}

/**
 * Result of form creation operation
 */
export interface FormCreationResult {
  formId: string;
  formUrl: string;
  editUrl: string;
  publishedUrl: string;
  spreadsheetId?: string;
}

/**
 * Options for form sharing and permissions
 */
export interface FormSharingOptions {
  editors?: string[];
  viewers?: string[];
  makePublic?: boolean;
  allowAnonymousResponses?: boolean;
}

/**
 * Template for pre-defined church management forms
 */
export interface FormTemplate {
  name: string;
  description: string;
  configuration: FormConfiguration;
}

/**
 * Statistics about form responses
 */
export interface FormStatistics {
  totalResponses: number;
  averageCompletionTime?: number;
  responseRate?: number;
  lastResponseDate?: Date;
}
