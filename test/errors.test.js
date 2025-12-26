import { describe, it } from '@std/testing/bdd';
import { assert, assertEquals } from '@std/assert';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create AppError with default values', () => {
      const error = new AppError('Test error');

      assertEquals(error.message, 'Test error');
      assertEquals(error.statusCode, 500);
      assertEquals(error.isOperational, true);
      assert(error.timestamp);
      assert(error.stack);
    });

    it('should create AppError with custom values', () => {
      const error = new AppError('Custom error', 418, false);

      assertEquals(error.message, 'Custom error');
      assertEquals(error.statusCode, 418);
      assertEquals(error.isOperational, false);
      assert(error.timestamp);
    });

    it('should inherit from Error', () => {
      const error = new AppError('Test error');

      assert(error instanceof Error);
      assert(error instanceof AppError);
    });
  });

  describe('ValidationError', () => {
    it('should create ValidationError with 400 status code', () => {
      const error = new ValidationError('Invalid input');

      assertEquals(error.message, 'Invalid input');
      assertEquals(error.statusCode, 400);
      assertEquals(error.isOperational, true);
      assert(error instanceof AppError);
      assert(error instanceof ValidationError);
    });
  });

  describe('NotFoundError', () => {
    it('should create NotFoundError with default message', () => {
      const error = new NotFoundError();

      assertEquals(error.message, 'Resource not found');
      assertEquals(error.statusCode, 404);
      assertEquals(error.isOperational, true);
    });

    it('should create NotFoundError with custom message', () => {
      const error = new NotFoundError('Custom not found message');

      assertEquals(error.message, 'Custom not found message');
      assertEquals(error.statusCode, 404);
    });
  });

  describe('ForbiddenError', () => {
    it('should create ForbiddenError with default message', () => {
      const error = new ForbiddenError();

      assertEquals(error.message, 'Access denied');
      assertEquals(error.statusCode, 403);
      assertEquals(error.isOperational, true);
    });

    it('should create ForbiddenError with custom message', () => {
      const error = new ForbiddenError('Custom forbidden message');

      assertEquals(error.message, 'Custom forbidden message');
      assertEquals(error.statusCode, 403);
    });
  });

  describe('ConflictError', () => {
    it('should create ConflictError with default message', () => {
      const error = new ConflictError();

      assertEquals(error.message, 'Resource already exists');
      assertEquals(error.statusCode, 409);
      assertEquals(error.isOperational, true);
    });

    it('should create ConflictError with custom message', () => {
      const error = new ConflictError('Custom conflict message');

      assertEquals(error.message, 'Custom conflict message');
      assertEquals(error.statusCode, 409);
    });
  });

  describe('Error timestamp', () => {
    it('should create timestamp in ISO format', () => {
      const error = new AppError('Test error');

      // Test that timestamp is a valid ISO string (doesn't throw)
      new Date(error.timestamp);

      // Test that timestamp is recent (within last 1000ms)
      const now = new Date();
      const errorTime = new Date(error.timestamp);
      const timeDiff = now.getTime() - errorTime.getTime();
      assert(timeDiff < 1000);
    });
  });
});
