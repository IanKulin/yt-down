import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function for manual EJS template rendering
export async function renderTemplate(templateName, data = {}, options = {}) {
  const viewsDir = path.join(__dirname, '..', 'views');
  const templatePath = path.join(viewsDir, `${templateName}.ejs`);

  const renderOptions = {
    ...options,
    views: [viewsDir],
    filename: templatePath,
  };

  try {
    const html = await ejs.renderFile(templatePath, data, renderOptions);
    return html;
  } catch (error) {
    throw new Error(
      `Error rendering template ${templateName}: ${error.message}`
    );
  }
}

// Helper function to merge view data from Hono context with template-specific data
export function mergeViewData(c, templateData = {}) {
  const baseViewData = c.get('viewData') || {};
  return {
    ...baseViewData,
    ...templateData,
  };
}

// Combined helper for rendering with Hono context
export async function renderWithContext(
  c,
  templateName,
  templateData = {},
  options = {}
) {
  const data = mergeViewData(c, templateData);
  return await renderTemplate(templateName, data, options);
}
