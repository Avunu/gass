export class TemplateService {
  private static readonly TEMPLATE_DIR = "src/templates";

  static createTemplate(templateName: string): GoogleAppsScript.HTML.HtmlTemplate {
    const template = HtmlService.createTemplateFromFile(`${this.TEMPLATE_DIR}/${templateName}`);
    return template;
  }

  static getTemplateContent(templateName: string): string {
    return HtmlService.createHtmlOutputFromFile(`${this.TEMPLATE_DIR}/${templateName}`).getContent();
  }
}
