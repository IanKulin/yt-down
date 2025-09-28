import { renderWithContext } from './ejsHelper.js';

const createErrorResponse = (error, _c) => {
  const isOperational = error.isOperational || false;
  const statusCode = error.statusCode || 500;
  const message = isOperational ? error.message : 'Something went wrong';

  return {
    error: message,
    timestamp: error.timestamp || new Date().toISOString(),
    statusCode,
  };
};

const handleError = async (error, c) => {
  const errorResponse = createErrorResponse(error, c);
  const logger = c.get('logger');
  const services = c.get('services');

  // Log the error
  if (logger) {
    logger.error(`${c.req.method} ${c.req.path} - ${error.message}`, {
      error: error.stack,
      statusCode: errorResponse.statusCode,
    });
  }

  // Determine if this is an API route
  const isApiRoute = c.req.path.startsWith('/api/');

  if (isApiRoute) {
    return c.json(errorResponse, errorResponse.statusCode);
  }

  // For web routes, send error notification via WebSocket
  if (services?.notifications) {
    // Send error notification (fire and forget)
    services.notifications
      .addNotification('error', errorResponse.error, {
        statusCode: errorResponse.statusCode,
      })
      .catch((notificationError) => {
        if (logger) {
          logger.error('Failed to send error notification:', notificationError);
        }
      });
  }

  // If it's a GET request, render an error page or redirect to referrer
  if (c.req.method === 'GET') {
    const referrer = c.req.header('Referer') || '/';
    return c.redirect(referrer);
  }

  // For POST requests, redirect to referrer or home
  const referrer = c.req.header('Referer') || '/';
  return c.redirect(referrer);
};

const notFoundHandler = async (c) => {
  const logger = c.get('logger');
  const isApiRoute = c.req.path.startsWith('/api/');

  // Log 404 requests
  if (logger) {
    logger.warn(`404 Not Found: ${c.req.method} ${c.req.path}`);
  }

  if (isApiRoute) {
    return c.json(
      {
        error: 'Endpoint not found',
        timestamp: new Date().toISOString(),
        statusCode: 404,
      },
      404
    );
  }

  const html = await renderWithContext(c, 'error', {
    title: 'Page Not Found',
    message: 'The page you requested could not be found.',
    statusCode: 404,
  });

  return c.html(html, 404);
};

// Error handling middleware for Hono
const errorMiddleware = async (c, next) => {
  try {
    await next();
  } catch (error) {
    return await handleError(error, c);
  }
};

export { handleError, notFoundHandler, createErrorResponse, errorMiddleware };
