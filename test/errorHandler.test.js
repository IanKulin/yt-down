import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  handleError,
  asyncHandler,
  createErrorResponse,
} from '../lib/errorHandler.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

describe('Error Handler', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      path: '/test',
      logger: {
        error: mock.fn(),
      },
      session: {},
      get: mock.fn(() => '/'),
    };

    res = {
      status: mock.fn(() => res),
      json: mock.fn(() => res),
      redirect: mock.fn(() => res),
      render: mock.fn(() => res),
      headersSent: false,
    };

    next = mock.fn();
  });

  describe('createErrorResponse', () => {
    it('should create proper error response for operational errors', () => {
      const error = new ValidationError('Invalid input');
      const response = createErrorResponse(error, req);

      assert.strictEqual(response.error, 'Invalid input');
      assert.strictEqual(response.statusCode, 400);
      assert.ok(response.timestamp);
    });

    it('should create generic error response for non-operational errors', () => {
      const error = new Error('Internal error');
      const response = createErrorResponse(error, req);

      assert.strictEqual(response.error, 'Something went wrong');
      assert.strictEqual(response.statusCode, 500);
      assert.ok(response.timestamp);
    });

    it('should handle errors with custom status codes', () => {
      const error = new NotFoundError('Resource not found');
      const response = createErrorResponse(error, req);

      assert.strictEqual(response.error, 'Resource not found');
      assert.strictEqual(response.statusCode, 404);
    });
  });

  describe('handleError', () => {
    it('should handle API route errors with JSON response', () => {
      req.path = '/api/test';
      const error = new ValidationError('Invalid data');

      handleError(error, req, res, next);

      assert.strictEqual(res.status.mock.callCount(), 1);
      assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);
      assert.strictEqual(res.json.mock.callCount(), 1);
      assert.strictEqual(
        res.json.mock.calls[0].arguments[0].error,
        'Invalid data'
      );
    });

    it('should handle web route errors with flash message and redirect', () => {
      const error = new ValidationError('Invalid input');

      handleError(error, req, res, next);

      assert.strictEqual(req.session.flashMessage, 'Invalid input');
      assert.strictEqual(req.session.flashType, 'error');
      assert.strictEqual(res.redirect.mock.callCount(), 1);
      assert.strictEqual(res.redirect.mock.calls[0].arguments[0], '/');
    });

    it('should call next if headers already sent', () => {
      res.headersSent = true;
      const error = new Error('Test error');

      handleError(error, req, res, next);

      assert.strictEqual(next.mock.callCount(), 1);
      assert.strictEqual(next.mock.calls[0].arguments[0], error);
    });

    it('should log errors with proper context', () => {
      const error = new ValidationError('Test error');

      handleError(error, req, res, next);

      assert.strictEqual(req.logger.error.mock.callCount(), 1);
      assert.ok(
        req.logger.error.mock.calls[0].arguments[0].includes('GET /test')
      );
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const successHandler = asyncHandler(async (req, res, _next) => {
        res.json({ success: true });
      });

      await successHandler(req, res, next);

      assert.strictEqual(res.json.mock.callCount(), 1);
      assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
        success: true,
      });
      assert.strictEqual(next.mock.callCount(), 0);
    });

    it('should catch and pass errors to next', async () => {
      const error = new ValidationError('Async error');
      const errorHandler = asyncHandler(async (_req, _res, _next) => {
        throw error;
      });

      await errorHandler(req, res, next);

      assert.strictEqual(next.mock.callCount(), 1);
      assert.strictEqual(next.mock.calls[0].arguments[0], error);
    });

    it('should handle non-async functions', async () => {
      const syncHandler = asyncHandler((req, res, _next) => {
        res.json({ sync: true });
      });

      await syncHandler(req, res, next);

      assert.strictEqual(res.json.mock.callCount(), 1);
      assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
        sync: true,
      });
    });
  });
});
