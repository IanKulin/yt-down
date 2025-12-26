import { beforeEach, describe, it } from '@std/testing/bdd';
import { assert, assertEquals } from '@std/assert';
import { createErrorResponse, handleError } from '../lib/errorHandler.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

// Simple mock function helper for Deno
function createMockFn(impl) {
  const calls = [];
  const fn = (...args) => {
    calls.push({ arguments: args });
    return impl ? impl(...args) : undefined;
  };
  fn.mock = {
    calls,
    callCount: () => calls.length,
  };
  return fn;
}

describe('Error Handler', () => {
  let c;

  beforeEach(() => {
    const mockLogger = {
      error: createMockFn(),
    };

    const mockServices = {
      notifications: {
        addNotification: createMockFn(() => Promise.resolve()),
      },
    };

    c = {
      req: {
        method: 'GET',
        path: '/test',
        header: createMockFn(() => '/'),
      },
      get: createMockFn((key) => {
        if (key === 'logger') return mockLogger;
        if (key === 'services') return mockServices;
        return null;
      }),
      json: createMockFn(),
      redirect: createMockFn(),
      html: createMockFn(),
    };
  });

  describe('createErrorResponse', () => {
    it('should create proper error response for operational errors', () => {
      const error = new ValidationError('Invalid input');
      const response = createErrorResponse(error, c);

      assertEquals(response.error, 'Invalid input');
      assertEquals(response.statusCode, 400);
      assert(response.timestamp);
    });

    it('should create generic error response for non-operational errors', () => {
      const error = new Error('Internal error');
      const response = createErrorResponse(error, c);

      assertEquals(response.error, 'Something went wrong');
      assertEquals(response.statusCode, 500);
      assert(response.timestamp);
    });

    it('should handle errors with custom status codes', () => {
      const error = new NotFoundError('Resource not found');
      const response = createErrorResponse(error, c);

      assertEquals(response.error, 'Resource not found');
      assertEquals(response.statusCode, 404);
    });
  });

  describe('handleError', () => {
    it('should handle API route errors with JSON response', async () => {
      c.req.path = '/api/test';
      const error = new ValidationError('Invalid data');

      await handleError(error, c);

      assertEquals(c.json.mock.callCount(), 1);
      assertEquals(
        c.json.mock.calls[0].arguments[0].error,
        'Invalid data',
      );
      assertEquals(c.json.mock.calls[0].arguments[1], 400);
    });

    it('should handle web route errors with notification and redirect', async () => {
      const error = new ValidationError('Invalid input');

      await handleError(error, c);

      const mockServices = c.get('services');
      assertEquals(
        mockServices.notifications.addNotification.mock.callCount(),
        1,
      );
      assertEquals(
        mockServices.notifications.addNotification.mock.calls[0].arguments[0],
        'error',
      );
      assertEquals(
        mockServices.notifications.addNotification.mock.calls[0].arguments[1],
        'Invalid input',
      );
      assertEquals(c.redirect.mock.callCount(), 1);
      assertEquals(c.redirect.mock.calls[0].arguments[0], '/');
    });

    it('should log errors with proper context', async () => {
      const error = new ValidationError('Test error');

      await handleError(error, c);

      const mockLogger = c.get('logger');
      assertEquals(mockLogger.error.mock.callCount(), 1);
      assert(
        mockLogger.error.mock.calls[0].arguments[0].includes('GET /test'),
      );
    });
  });
});
