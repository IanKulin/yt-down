import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { handleError, createErrorResponse } from '../lib/errorHandler.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

describe('Error Handler', () => {
  let c;

  beforeEach(() => {
    const mockLogger = {
      error: mock.fn(),
    };

    const mockServices = {
      notifications: {
        addNotification: mock.fn(() => Promise.resolve()),
      },
    };

    c = {
      req: {
        method: 'GET',
        path: '/test',
        header: mock.fn(() => '/'),
      },
      get: mock.fn((key) => {
        if (key === 'logger') return mockLogger;
        if (key === 'services') return mockServices;
        return null;
      }),
      json: mock.fn(),
      redirect: mock.fn(),
      html: mock.fn(),
    };
  });

  describe('createErrorResponse', () => {
    it('should create proper error response for operational errors', () => {
      const error = new ValidationError('Invalid input');
      const response = createErrorResponse(error, c);

      assert.strictEqual(response.error, 'Invalid input');
      assert.strictEqual(response.statusCode, 400);
      assert.ok(response.timestamp);
    });

    it('should create generic error response for non-operational errors', () => {
      const error = new Error('Internal error');
      const response = createErrorResponse(error, c);

      assert.strictEqual(response.error, 'Something went wrong');
      assert.strictEqual(response.statusCode, 500);
      assert.ok(response.timestamp);
    });

    it('should handle errors with custom status codes', () => {
      const error = new NotFoundError('Resource not found');
      const response = createErrorResponse(error, c);

      assert.strictEqual(response.error, 'Resource not found');
      assert.strictEqual(response.statusCode, 404);
    });
  });

  describe('handleError', () => {
    it('should handle API route errors with JSON response', async () => {
      c.req.path = '/api/test';
      const error = new ValidationError('Invalid data');

      await handleError(error, c);

      assert.strictEqual(c.json.mock.callCount(), 1);
      assert.strictEqual(
        c.json.mock.calls[0].arguments[0].error,
        'Invalid data'
      );
      assert.strictEqual(c.json.mock.calls[0].arguments[1], 400);
    });

    it('should handle web route errors with notification and redirect', async () => {
      const error = new ValidationError('Invalid input');

      await handleError(error, c);

      const mockServices = c.get('services');
      assert.strictEqual(
        mockServices.notifications.addNotification.mock.callCount(),
        1
      );
      assert.strictEqual(
        mockServices.notifications.addNotification.mock.calls[0].arguments[0],
        'error'
      );
      assert.strictEqual(
        mockServices.notifications.addNotification.mock.calls[0].arguments[1],
        'Invalid input'
      );
      assert.strictEqual(c.redirect.mock.callCount(), 1);
      assert.strictEqual(c.redirect.mock.calls[0].arguments[0], '/');
    });

    it('should log errors with proper context', async () => {
      const error = new ValidationError('Test error');

      await handleError(error, c);

      const mockLogger = c.get('logger');
      assert.strictEqual(mockLogger.error.mock.callCount(), 1);
      assert.ok(
        mockLogger.error.mock.calls[0].arguments[0].includes('GET /test')
      );
    });
  });
});
