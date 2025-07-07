import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../lib/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create AppError with default values', () => {
      const error = new AppError('Test error');

      assert.strictEqual(error.message, 'Test error');
      assert.strictEqual(error.statusCode, 500);
      assert.strictEqual(error.isOperational, true);
      assert.ok(error.timestamp);
      assert.ok(error.stack);
    });

    it('should create AppError with custom values', () => {
      const error = new AppError('Custom error', 418, false);

      assert.strictEqual(error.message, 'Custom error');
      assert.strictEqual(error.statusCode, 418);
      assert.strictEqual(error.isOperational, false);
      assert.ok(error.timestamp);
    });

    it('should inherit from Error', () => {
      const error = new AppError('Test error');

      assert.ok(error instanceof Error);
      assert.ok(error instanceof AppError);
    });
  });

  describe('ValidationError', () => {
    it('should create ValidationError with 400 status code', () => {
      const error = new ValidationError('Invalid input');

      assert.strictEqual(error.message, 'Invalid input');
      assert.strictEqual(error.statusCode, 400);
      assert.strictEqual(error.isOperational, true);
      assert.ok(error instanceof AppError);
      assert.ok(error instanceof ValidationError);
    });
  });

  describe('NotFoundError', () => {
    it('should create NotFoundError with default message', () => {
      const error = new NotFoundError();

      assert.strictEqual(error.message, 'Resource not found');
      assert.strictEqual(error.statusCode, 404);
      assert.strictEqual(error.isOperational, true);
    });

    it('should create NotFoundError with custom message', () => {
      const error = new NotFoundError('Custom not found message');

      assert.strictEqual(error.message, 'Custom not found message');
      assert.strictEqual(error.statusCode, 404);
    });
  });

  describe('ForbiddenError', () => {
    it('should create ForbiddenError with default message', () => {
      const error = new ForbiddenError();

      assert.strictEqual(error.message, 'Access denied');
      assert.strictEqual(error.statusCode, 403);
      assert.strictEqual(error.isOperational, true);
    });

    it('should create ForbiddenError with custom message', () => {
      const error = new ForbiddenError('Custom forbidden message');

      assert.strictEqual(error.message, 'Custom forbidden message');
      assert.strictEqual(error.statusCode, 403);
    });
  });

  describe('ConflictError', () => {
    it('should create ConflictError with default message', () => {
      const error = new ConflictError();

      assert.strictEqual(error.message, 'Resource already exists');
      assert.strictEqual(error.statusCode, 409);
      assert.strictEqual(error.isOperational, true);
    });

    it('should create ConflictError with custom message', () => {
      const error = new ConflictError('Custom conflict message');

      assert.strictEqual(error.message, 'Custom conflict message');
      assert.strictEqual(error.statusCode, 409);
    });
  });

  describe('Error timestamp', () => {
    it('should create timestamp in ISO format', () => {
      const error = new AppError('Test error');

      // Test that timestamp is a valid ISO string
      assert.doesNotThrow(() => new Date(error.timestamp));

      // Test that timestamp is recent (within last 1000ms)
      const now = new Date();
      const errorTime = new Date(error.timestamp);
      const timeDiff = now.getTime() - errorTime.getTime();
      assert.ok(timeDiff < 1000);
    });
  });
});
