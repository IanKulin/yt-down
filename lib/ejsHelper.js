import ejs from 'ejs';
import { dirname, join } from '@std/path';

const __dirname = dirname(new URL(import.meta.url).pathname);

// Helper function for manual EJS template rendering
export async function renderTemplate(templateName, data = {}, options = {}) {
  const viewsDir = join(__dirname, '..', 'views');
  const templatePath = join(viewsDir, `${templateName}.ejs`);

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
      `Error rendering template ${templateName}: ${error.message}`,
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
  options = {},
) {
  const data = mergeViewData(c, templateData);
  return await renderTemplate(templateName, data, options);
}
