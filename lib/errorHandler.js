// Custom error classes are used in error handling

const createErrorResponse = (error, _req) => {
  const isOperational = error.isOperational || false;
  const statusCode = error.statusCode || 500;
  const message = isOperational ? error.message : 'Something went wrong';

  return {
    error: message,
    timestamp: error.timestamp || new Date().toISOString(),
    statusCode,
  };
};

const handleError = (error, req, res, next) => {
  const errorResponse = createErrorResponse(error, req);

  // Log the error
  if (req.logger) {
    req.logger.error(`${req.method} ${req.path} - ${error.message}`, {
      error: error.stack,
      statusCode: errorResponse.statusCode,
    });
  }

  // Check if response has already been sent
  if (res.headersSent) {
    return next(error);
  }

  // Determine if this is an API route
  const isApiRoute = req.path.startsWith('/api/');

  if (isApiRoute) {
    return res.status(errorResponse.statusCode).json(errorResponse);
  }

  // For web routes, send error notification via WebSocket
  if (req.services?.notifications) {
    // Send error notification (fire and forget)
    req.services.notifications.addNotification(
      'error',
      errorResponse.error,
      { statusCode: errorResponse.statusCode }
    ).catch((notificationError) => {
      if (req.logger) {
        req.logger.error('Failed to send error notification:', notificationError);
      }
    });
  }

  // If it's a GET request, render an error page or redirect to referrer
  if (req.method === 'GET') {
    const referrer = req.get('Referrer') || '/';
    return res.redirect(referrer);
  }

  // For POST requests, redirect to referrer or home
  const referrer = req.get('Referrer') || '/';
  return res.redirect(referrer);
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const notFoundHandler = (req, res, _next) => {
  const isApiRoute = req.path.startsWith('/api/');

  if (isApiRoute) {
    return res.status(404).json({
      error: 'Endpoint not found',
      timestamp: new Date().toISOString(),
      statusCode: 404,
    });
  }

  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you requested could not be found.',
  });
};

export { handleError, asyncHandler, notFoundHandler, createErrorResponse };
