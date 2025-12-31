import Request = GoogleAppsScript.Docs.Schema.Request;

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

interface PageMargins {
  top?: number;    // in points (1 inch = 72 points)
  bottom?: number; // in points
  left?: number;   // in points
  right?: number;  // in points
}

export class DocService {
  private static isDialogOpen = false;
  private static readonly TEMPLATE_DIR = "src/templates";

  static async createFromTemplate(
    templateName: string,
    data: DocTemplateData,
    filename: string,
    margins?: PageMargins,
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
      const doc = this.createDocument(filename, processedHtml, margins);

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

  private static createDocument(
    filename: string,
    content: string,
    margins?: PageMargins,
  ): GoogleAppsScript.Drive.File {
    // Create new document
    const doc = DocumentApp.create(filename);
    const docId = doc.getId();
    const body = doc.getBody();

    // Clear default content
    body.clear();

    // Use UrlFetchApp to convert HTML via Drive API without creating a file
    const accessToken = ScriptApp.getOAuthToken();
    const boundary = "boundary123";

    const metadata = {
      mimeType: MimeType.GOOGLE_DOCS
    };

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/html\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const response = UrlFetchApp.fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${docId}?uploadType=multipart`,
      {
        method: 'patch',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        payload: multipartBody,
        muteHttpExceptions: true
      }
    );

    if (response.getResponseCode() !== 200) {
      throw new Error(`Failed to update document with HTML: ${response.getContentText()}`);
    }

    // Apply margins if specified using Advanced Docs API
    if (margins) {
      this.applyMargins(docId, margins);
    }

    return DriveApp.getFileById(docId);
  }

  private static applyMargins(docId: string, margins: PageMargins): void {

    if (Docs?.Documents) {
      try {
        // Get document structure to find section
        const docData = Docs.Documents.get(docId, {
          fields: "body(content(sectionBreak,startIndex,endIndex))"
        });

        if (!docData.body?.content) {
          Logger.log('Warning: Document body or content not found');
          return;
        }

        const sections = docData.body.content.filter((e: any) => e.sectionBreak);
        if (sections.length === 0) {
          Logger.log('Warning: No sections found in document for margin application');
          return;
        }

        // Apply margins to first section
        const section = sections[0];
        const { startIndex, endIndex } = section;

        const sectionStyle: any = {};
        const fields: string[] = [];

        if (margins.top !== undefined) {
          sectionStyle.marginTop = { unit: "PT", magnitude: margins.top };
          fields.push('marginTop');
        }
        if (margins.bottom !== undefined) {
          sectionStyle.marginBottom = { unit: "PT", magnitude: margins.bottom };
          fields.push('marginBottom');
        }
        if (margins.left !== undefined) {
          sectionStyle.marginLeft = { unit: "PT", magnitude: margins.left };
          fields.push('marginLeft');
        }
        if (margins.right !== undefined) {
          sectionStyle.marginRight = { unit: "PT", magnitude: margins.right };
          fields.push('marginRight');
        }

        if (fields.length > 0) {
          const requests: Request[] = [{
            updateSectionStyle: {
              range: { startIndex: startIndex || 0, endIndex: endIndex || 1 },
              sectionStyle,
              fields: fields.join(',')
            }
          }] as any; // Type assertion to bypass outdated types
          Docs.Documents.batchUpdate({ requests }, docId);
        }
      } catch (error) {
        Logger.log(`Warning: Failed to apply margins: ${error}`);
      }
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
