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
  top?: number; // in points (1 inch = 72 points)
  bottom?: number; // in points
  left?: number; // in points
  right?: number; // in points
}

let isDialogOpen = false;
const TEMPLATE_DIR = "src/templates";

export async function createFromTemplate(
  templateName: string,
  data: DocTemplateData,
  filename: string,
  margins?: PageMargins,
): Promise<GoogleAppsScript.Drive.File> {
  // Show processing modal
  showProcessingModal();

  try {
    // Get template content
    const template = getTemplate(`${TEMPLATE_DIR}/${templateName}`);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Process template
    const processedHtml = processTemplate(template, data);

    // Create new doc
    const doc = createDocument(filename, processedHtml, margins);

    // Update modal with success message
    updateModalWithSuccess(doc);

    return doc;
  } catch (error) {
    showErrorMessage(error);
    throw error;
  } finally {
    // Ensure dialog is cleaned up after 5 seconds
    Utilities.sleep(5000);
    closeCurrentDialog();
  }
}

function getTemplate(templateName: string): GoogleAppsScript.HTML.HtmlTemplate | null {
  try {
    return HtmlService.createTemplateFromFile(templateName);
  } catch (error) {
    console.error(`Failed to load template '${templateName}':`, error);
    return null;
  }
}

function processTemplate(template: GoogleAppsScript.HTML.HtmlTemplate, data: DocTemplateData): string {
  // Type assertion needed because HtmlTemplate allows dynamic properties
  const templateWithData = template as unknown as Record<string, TemplateValue>;

  // Inject data into template
  Object.entries(data).forEach(([key, value]) => {
    templateWithData[key] = value;
  });

  return template.evaluate().getContent();
}

function createDocument(
  filename: string,
  content: string,
  margins?: PageMargins,
): GoogleAppsScript.Drive.File {
  if (!Docs?.Documents) {
    throw new Error(
      "Advanced Docs API is not enabled. Please enable it in the Apps Script project settings.",
    );
  }
  if (!Drive?.Files) {
    throw new Error(
      "Advanced Drive API is not enabled. Please enable it in the Apps Script project settings.",
    );
  }

  // Create new document using Docs API
  const doc = Docs.Documents.create({
    title: filename,
  });
  const docId = doc.documentId;

  if (!docId) {
    throw new Error("Failed to create document: no document ID returned");
  }

  // Convert HTML content to blob and update document using Drive API
  const blob = Utilities.newBlob(content, "text/html", "content.html");

  Drive.Files.update({ mimeType: MimeType.GOOGLE_DOCS }, docId, blob, { convert: true });

  // Apply margins if specified using Advanced Docs API
  if (margins) {
    applyMargins(docId, margins);
  }

  return DriveApp.getFileById(docId);
}

function applyMargins(docId: string, margins: PageMargins): void {
  if (!Docs?.Documents) {
    Logger.log("Warning: Advanced Docs API not enabled, skipping margin application");
    return;
  }

  try {
    // Get document structure to find section
    const docData = Docs.Documents.get(docId, {
      fields: "body(content(sectionBreak,startIndex,endIndex))",
    });

    if (!docData.body?.content) {
      Logger.log("Warning: Document body or content not found");
      return;
    }

    const sections = docData.body.content.filter((e: any) => e.sectionBreak);
    if (sections.length === 0) {
      Logger.log("Warning: No sections found in document for margin application");
      return;
    }

    // Apply margins to first section
    const section = sections[0];
    const { startIndex, endIndex } = section;

    const sectionStyle: any = {};
    const fields: string[] = [];

    if (margins.top !== undefined) {
      sectionStyle.marginTop = { unit: "PT", magnitude: margins.top };
      fields.push("marginTop");
    }
    if (margins.bottom !== undefined) {
      sectionStyle.marginBottom = { unit: "PT", magnitude: margins.bottom };
      fields.push("marginBottom");
    }
    if (margins.left !== undefined) {
      sectionStyle.marginLeft = { unit: "PT", magnitude: margins.left };
      fields.push("marginLeft");
    }
    if (margins.right !== undefined) {
      sectionStyle.marginRight = { unit: "PT", magnitude: margins.right };
      fields.push("marginRight");
    }

    if (fields.length > 0) {
      const requests: Request[] = [
        {
          updateSectionStyle: {
            range: { startIndex: startIndex || 0, endIndex: endIndex || 1 },
            sectionStyle,
            fields: fields.join(","),
          },
        },
      ] as any;

      Docs.Documents.batchUpdate({ requests }, docId);
    }
  } catch (error) {
    Logger.log(`Warning: Failed to apply margins: ${error}`);
  }
}

function showProcessingModal(): void {
  const html = HtmlService.createHtmlOutputFromFile("src/templates/DocsService-inprogress");

  closeCurrentDialog();
  SpreadsheetApp.getUi().showModelessDialog(html, "Creating Document");
  isDialogOpen = true;
}

function updateModalWithSuccess(file: GoogleAppsScript.Drive.File): void {
  const url = file.getUrl();

  const template = HtmlService.createTemplateFromFile("src/templates/DocsService-success");
  template.url = url;
  const html = template.evaluate();

  if (isDialogOpen) {
    SpreadsheetApp.getUi().showModelessDialog(html, "Success");
  }
}

function showErrorMessage(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  closeCurrentDialog();
  const ui = SpreadsheetApp.getUi();
  ui.alert("Error", `Failed to create document: ${message}`, ui.ButtonSet.OK);
}

function closeCurrentDialog(): void {
  if (isDialogOpen) {
    const closeHtml = HtmlService.createHtmlOutput("<script>google.script.host.close();</script>");
    SpreadsheetApp.getUi().showModelessDialog(closeHtml, "Closing...");
    isDialogOpen = false;
  }
}
