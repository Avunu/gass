import {
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
} from "../types/formService";

/**
 * Service for creating and managing Google Forms for church management purposes
 */
export class FormService {
  private static isDialogOpen = false;
  private static readonly TEMPLATE_DIR = "src/templates";

  /**
   * Creates a new Google Form based on the provided configuration
   * @param config - The form configuration
   * @param sharingOptions - Optional sharing and permission settings
   * @returns Promise resolving to form creation result
   */
  static async createForm(
    config: FormConfiguration,
    sharingOptions?: FormSharingOptions,
  ): Promise<FormCreationResult> {
    // Show processing modal
    this.showProcessingModal();

    try {
      // Create the form
      const form = FormApp.create(config.title);

      // Set form description if provided
      if (config.description) {
        form.setDescription(config.description);
      }

      // Configure form settings
      if (config.collectEmailAddresses) {
        form.setCollectEmail(true);
      }

      if (config.limitToOneResponse) {
        form.setLimitOneResponsePerUser(true);
      }

      if (config.requireSignIn) {
        form.setRequireLogin(true);
      }

      if (config.allowResponseEditing) {
        form.setAllowResponseEdits(true);
      }

      if (config.showLinkToRespondAgain) {
        form.setShowLinkToRespondAgain(true);
      }

      if (config.confirmationMessage) {
        form.setConfirmationMessage(config.confirmationMessage);
      }

      // Add form fields
      for (const field of config.fields) {
        FormService.addFormField(form, field);
      }

      // Set up destination spreadsheet if specified
      let spreadsheetId: string | undefined;
      if (config.destinationSpreadsheetId) {
        const spreadsheet = SpreadsheetApp.openById(config.destinationSpreadsheetId);
        form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
        spreadsheetId = config.destinationSpreadsheetId;
      }

      // Apply sharing options
      if (sharingOptions) {
        FormService.applySharing(form, sharingOptions);
      }

      const result = {
        formId: form.getId(),
        formUrl: form.getEditUrl(),
        editUrl: form.getEditUrl(),
        publishedUrl: form.getPublishedUrl(),
        spreadsheetId,
      };

      // Update modal with success message
      this.updateModalWithSuccess(result);

      return result;
    } catch (error) {
      this.showErrorMessage(error);
      Logger.log(`Error creating form: ${error}`);
      throw new Error(`Failed to create form: ${error}`);
    } finally {
      // Ensure dialog is cleaned up after 5 seconds
      Utilities.sleep(5000);
      this.closeCurrentDialog();
    }
  }

  /**
   * Adds a field to the form based on the field configuration
   * @param form - The Google Form to add the field to
   * @param field - The field configuration
   */
  private static addFormField(form: GoogleAppsScript.Forms.Form, field: FormField): void {
    switch (field.type) {
      case "TEXT":
      case "EMAIL":
      case "URL": {
        const textField = field as TextFormField;
        const textItem = form
          .addTextItem()
          .setTitle(textField.title)
          .setRequired(textField.required || false);

        if (textField.description) {
          textItem.setHelpText(textField.description);
        }

        const textValidation = FormApp.createTextValidation();
        if (textField.type === "EMAIL") {
          textValidation.requireTextIsEmail();
        } else if (textField.type === "URL") {
          textValidation.requireTextIsUrl();
        }

        if (textField.maxLength) {
          textValidation.requireTextLengthLessThanOrEqualTo(textField.maxLength);
        }

        textItem.setValidation(textValidation.build());
        break;
      }

      case "PARAGRAPH_TEXT": {
        const paragraphField = field as TextFormField;
        const paragraphItem = form
          .addParagraphTextItem()
          .setTitle(paragraphField.title)
          .setRequired(paragraphField.required || false);

        if (paragraphField.description) {
          paragraphItem.setHelpText(paragraphField.description);
        }
        break;
      }

      case "MULTIPLE_CHOICE": {
        const mcField = field as ChoiceFormField;
        const mcItem = form
          .addMultipleChoiceItem()
          .setTitle(mcField.title)
          .setRequired(mcField.required || false);

        if (mcField.description) {
          mcItem.setHelpText(mcField.description);
        }

        const mcChoices = mcField.choices.map((choice) => mcItem.createChoice(choice));
        if (mcField.hasOtherOption) {
          mcChoices.push(mcItem.createChoice("Other", true));
        }
        mcItem.setChoices(mcChoices);
        break;
      }

      case "CHECKBOXES": {
        const cbField = field as ChoiceFormField;
        const cbItem = form
          .addCheckboxItem()
          .setTitle(cbField.title)
          .setRequired(cbField.required || false);

        if (cbField.description) {
          cbItem.setHelpText(cbField.description);
        }

        const cbChoices = cbField.choices.map((choice) => cbItem.createChoice(choice));
        if (cbField.hasOtherOption) {
          cbChoices.push(cbItem.createChoice("Other", true));
        }
        cbItem.setChoices(cbChoices);
        break;
      }

      case "DROPDOWN": {
        const ddField = field as ChoiceFormField;
        const ddItem = form
          .addListItem()
          .setTitle(ddField.title)
          .setRequired(ddField.required || false);

        if (ddField.description) {
          ddItem.setHelpText(ddField.description);
        }

        const ddChoices = ddField.choices.map((choice) => ddItem.createChoice(choice));
        ddItem.setChoices(ddChoices);
        break;
      }
      case "LINEAR_SCALE": {
        const lsField = field as LinearScaleFormField;
        const lsItem = form
          .addScaleItem()
          .setTitle(lsField.title)
          .setRequired(lsField.required || false)
          .setBounds(lsField.lowValue, lsField.highValue);

        if (lsField.description) {
          lsItem.setHelpText(lsField.description);
        }

        // Note: Google Forms API doesn't support setting custom labels for scale items
        // The lowLabel and highLabel properties are not available in the current API
        break;
      }
      case "DATE": {
        const dateField = field as DateTimeFormField;
        const dateItem = form
          .addDateItem()
          .setTitle(dateField.title)
          .setRequired(dateField.required || false);

        if (dateField.description) {
          dateItem.setHelpText(dateField.description);
        }

        if (dateField.includeYear !== undefined) {
          dateItem.setIncludesYear(dateField.includeYear);
        }
        break;
      }

      case "TIME": {
        const timeField = field as DateTimeFormField;
        const timeItem = form
          .addTimeItem()
          .setTitle(timeField.title)
          .setRequired(timeField.required || false);

        if (timeField.description) {
          timeItem.setHelpText(timeField.description);
        }
        break;
      }

      case "DATETIME": {
        const datetimeField = field as DateTimeFormField;
        const datetimeItem = form
          .addDateTimeItem()
          .setTitle(datetimeField.title)
          .setRequired(datetimeField.required || false);

        if (datetimeField.description) {
          datetimeItem.setHelpText(datetimeField.description);
        }

        if (datetimeField.includeYear !== undefined) {
          datetimeItem.setIncludesYear(datetimeField.includeYear);
        }
        break;
      }
      case "FILE_UPLOAD": {
        // Note: File upload items are not supported in the current Google Apps Script Forms API
        // This field type is included for future compatibility
        Logger.log(`File upload field "${field.title}" skipped - not supported in current API`);
        break;
      }

      default:
        throw new Error(`Unsupported field type: ${(field as unknown as any).type}`);
    }
  }

  /**
   * Applies sharing settings to a form
   * @param form - The Google Form
   * @param options - Sharing options
   */
  private static applySharing(form: GoogleAppsScript.Forms.Form, options: FormSharingOptions): void {
    if (options.editors) {
      options.editors.forEach((email) => {
        form.addEditor(email);
      });
    }

    if (options.viewers) {
      options.viewers.forEach((email) => {
        form.addEditor(email); // Google Forms doesn't have separate viewer permissions
      });
    }

    if (options.makePublic) {
      form.setRequireLogin(false);
    }
  }

  /**
   * Retrieves responses from a form
   * @param formId - The ID of the form
   * @returns Array of form responses
   */
  static getFormResponses(formId: string): FormResponse[] {
    try {
      const form = FormApp.openById(formId);
      const responses = form.getResponses();
      return responses.map((response) => ({
        responseId: response.getId(),
        timestamp: new Date(response.getTimestamp().getTime()),
        respondentEmail: response.getRespondentEmail(),
        answers: FormService.parseResponseAnswers(response),
      }));
    } catch (error) {
      Logger.log(`Error retrieving form responses: ${error}`);
      throw new Error(`Failed to retrieve form responses: ${error}`);
    }
  }

  /**
   * Parses response answers into a readable format
   * @param response - The form response
   * @returns Object mapping question titles to answers
   */
  private static parseResponseAnswers(response: GoogleAppsScript.Forms.FormResponse): {
    [questionTitle: string]: string | string[];
  } {
    const answers: { [questionTitle: string]: string | string[] } = {};
    const itemResponses = response.getItemResponses();

    itemResponses.forEach((itemResponse) => {
      const title = itemResponse.getItem().getTitle();
      const responseValue = itemResponse.getResponse();

      if (Array.isArray(responseValue)) {
        answers[title] = responseValue as string[];
      } else {
        answers[title] = String(responseValue);
      }
    });

    return answers;
  }

  /**
   * Gets statistics about a form
   * @param formId - The ID of the form
   * @returns Form statistics
   */
  static getFormStatistics(formId: string): FormStatistics {
    try {
      const form = FormApp.openById(formId);
      const responses = form.getResponses();

      const stats: FormStatistics = {
        totalResponses: responses.length,
      };

      if (responses.length > 0) {
        const timestamps = responses.map((r) => r.getTimestamp());
        stats.lastResponseDate = new Date(Math.max(...timestamps.map((t) => t.getTime())));
      }

      return stats;
    } catch (error) {
      Logger.log(`Error retrieving form statistics: ${error}`);
      throw new Error(`Failed to retrieve form statistics: ${error}`);
    }
  }

  /**
   * Deletes a form
   * @param formId - The ID of the form to delete
   */
  static deleteForm(formId: string): void {
    try {
      DriveApp.getFileById(formId).setTrashed(true);
    } catch (error) {
      Logger.log(`Error deleting form: ${error}`);
      throw new Error(`Failed to delete form: ${error}`);
    }
  }

  private static showProcessingModal(): void {
    const html = HtmlService.createHtmlOutputFromFile(`${this.TEMPLATE_DIR}/FormService-inprogress`);

    this.closeCurrentDialog();
    SpreadsheetApp.getUi().showModelessDialog(html, "Creating Form");
    this.isDialogOpen = true;
  }

  private static updateModalWithSuccess(result: FormCreationResult): void {
    const template = HtmlService.createTemplateFromFile(`${this.TEMPLATE_DIR}/FormService-success`);
    template.editUrl = result.editUrl;
    template.publishedUrl = result.publishedUrl;
    const html = template.evaluate();

    if (this.isDialogOpen) {
      SpreadsheetApp.getUi().showModelessDialog(html, "Success");
    }
  }

  private static showErrorMessage(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.closeCurrentDialog();
    const ui = SpreadsheetApp.getUi();
    ui.alert("Error", `Failed to create form: ${message}`, ui.ButtonSet.OK);
  }

  private static closeCurrentDialog(): void {
    if (this.isDialogOpen) {
      const closeHtml = HtmlService.createHtmlOutput("<script>google.script.host.close();</script>");
      SpreadsheetApp.getUi().showModelessDialog(closeHtml, "Closing...");
      this.isDialogOpen = false;
    }
  }
}
