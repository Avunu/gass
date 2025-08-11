// Template-specific value types
type TemplateBasicValue = string | number | boolean | null;
type TemplateDateValue = Date | string; // Allow both Date objects and formatted date strings

// Recursive template value definition
type TemplateValue =
  | TemplateBasicValue
  | TemplateDateValue
  | { [key: string]: TemplateValue }
  | TemplateValue[];

interface DocTemplateData {
  [key: string]: TemplateValue;
}

export class DocService {
  private static isDialogOpen = false;
  private static readonly TEMPLATE_DIR = "src/templates";

  static async createFromTemplate(
    templateName: string,
    data: DocTemplateData,
    filename: string,
  ): Promise<GoogleAppsScript.Drive.File> {
    // Show processing modal
    this.showProcessingModal();

    try {
      // Get template content
      const template = this.getTemplate(`${this.TEMPLATE_DIR}/${templateName}`);
      if (!template) {
        throw new Error(`Template '${templateName}' not found`);
      }

      // Process template
      const processedHtml = this.processTemplate(template, data);

      // Create new doc
      const doc = this.createDocument(filename, processedHtml);

      // Update modal with success message
      this.updateModalWithSuccess(doc);

      return doc;
    } catch (error) {
      this.showErrorMessage(error);
      throw error;
    } finally {
      // Ensure dialog is cleaned up after 5 seconds
      Utilities.sleep(5000);
      this.closeCurrentDialog();
    }
  }

  private static getTemplate(templateName: string): GoogleAppsScript.HTML.HtmlTemplate | null {
    try {
      return HtmlService.createTemplateFromFile(templateName);
    } catch (error) {
      console.error(`Failed to load template '${templateName}':`, error);
      return null;
    }
  }

  private static processTemplate(
    template: GoogleAppsScript.HTML.HtmlTemplate,
    data: DocTemplateData,
  ): string {
    // Type assertion needed because HtmlTemplate allows dynamic properties
    const templateWithData = template as unknown as Record<string, TemplateValue>;

    // Inject data into template
    Object.entries(data).forEach(([key, value]) => {
      templateWithData[key] = value;
    });

    return template.evaluate().getContent();
  }

  private static createDocument(filename: string, content: string): GoogleAppsScript.Drive.File {
    // Create new document
    const doc = DocumentApp.create(filename);
    const docId = doc.getId();

    // Clear the document since we'll be replacing content
    doc.getBody().clear();

    // Create a temporary HTML file
    const htmlFile = DriveApp.createFile("temp.html", content, "text/html");

    try {
      // Convert HTML to Google Doc using Drive API
      // Convert HTML file to Google Doc format
      const blob = htmlFile.getBlob();
      const docFile = DriveApp.getFileById(docId);
      docFile.setContent(blob.getDataAsString());

      return DriveApp.getFileById(docId);
    } finally {
      // Clean up temporary file
      htmlFile.setTrashed(true);
    }
  }

  private static showProcessingModal(): void {
    const html = HtmlService.createHtmlOutputFromFile("src/templates/DocsService-inprogress");

    this.closeCurrentDialog();
    SpreadsheetApp.getUi().showModelessDialog(html, "Creating Document");
    this.isDialogOpen = true;
  }

  private static updateModalWithSuccess(file: GoogleAppsScript.Drive.File): void {
    const url = file.getUrl();

    const template = HtmlService.createTemplateFromFile("src/templates/DocsService-success");
    template.url = url;
    const html = template.evaluate();

    if (this.isDialogOpen) {
      SpreadsheetApp.getUi().showModelessDialog(html, "Success");
    }
  }

  private static showErrorMessage(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.closeCurrentDialog();
    const ui = SpreadsheetApp.getUi();
    ui.alert("Error", `Failed to create document: ${message}`, ui.ButtonSet.OK);
  }

  private static closeCurrentDialog(): void {
    if (this.isDialogOpen) {
      const closeHtml = HtmlService.createHtmlOutput("<script>google.script.host.close();</script>");
      SpreadsheetApp.getUi().showModelessDialog(closeHtml, "Closing...");
      this.isDialogOpen = false;
    }
  }
}
