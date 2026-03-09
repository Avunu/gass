const TEMPLATE_DIR = "src/templates";

export function createTemplate(templateName: string): GoogleAppsScript.HTML.HtmlTemplate {
  const template = HtmlService.createTemplateFromFile(`${TEMPLATE_DIR}/${templateName}`);
  return template;
}

export function getTemplateContent(templateName: string): string {
  return HtmlService.createHtmlOutputFromFile(`${TEMPLATE_DIR}/${templateName}`).getContent();
}
