import { describe, it, expect } from 'vitest';
import { shortHash } from './hash.js';

describe('hash', () => {
  describe('shortHash', () => {
    it('should return 8 character hex string', () => {
      const result = shortHash('/Users/test/project');
      expect(result).toHaveLength(8);
      expect(result).toMatch(/^[0-9a-f]{8}$/);
    });

    it('should return same hash for same input', () => {
      const input = '/Users/test/project';
      expect(shortHash(input)).toBe(shortHash(input));
    });

    it('should return different hashes for different inputs', () => {
      expect(shortHash('/path/a')).not.toBe(shortHash('/path/b'));
    });

    it('should handle empty string', () => {
      const result = shortHash('');
      expect(result).toHaveLength(8);
      expect(result).toMatch(/^[0-9a-f]{8}$/);
    });
  });
});
