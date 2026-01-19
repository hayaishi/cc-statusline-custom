/**
 * Tests for ANSI color utilities.
 */

import { describe, it, expect } from 'vitest';
import pc from 'picocolors';
import { getThresholdColor, colorByThreshold, stripAnsi } from './colors.js';

describe('getThresholdColor', () => {
  describe('with default thresholds (low: 50, medium: 80)', () => {
    it('should return green for values below low threshold', () => {
      expect(getThresholdColor(0)).toBe(pc.green);
      expect(getThresholdColor(25)).toBe(pc.green);
      expect(getThresholdColor(49)).toBe(pc.green);
      expect(getThresholdColor(49.9)).toBe(pc.green);
    });

    it('should return yellow for values at or above low but below medium threshold', () => {
      expect(getThresholdColor(50)).toBe(pc.yellow);
      expect(getThresholdColor(51)).toBe(pc.yellow);
      expect(getThresholdColor(65)).toBe(pc.yellow);
      expect(getThresholdColor(79)).toBe(pc.yellow);
      expect(getThresholdColor(79.9)).toBe(pc.yellow);
    });

    it('should return red for values at or above medium threshold', () => {
      expect(getThresholdColor(80)).toBe(pc.red);
      expect(getThresholdColor(81)).toBe(pc.red);
      expect(getThresholdColor(95)).toBe(pc.red);
      expect(getThresholdColor(100)).toBe(pc.red);
    });
  });

  describe('with custom thresholds', () => {
    it('should respect custom low threshold', () => {
      expect(getThresholdColor(29, 30, 80)).toBe(pc.green);
      expect(getThresholdColor(30, 30, 80)).toBe(pc.yellow);
    });

    it('should respect custom medium threshold', () => {
      expect(getThresholdColor(69, 50, 70)).toBe(pc.yellow);
      expect(getThresholdColor(70, 50, 70)).toBe(pc.red);
    });
  });

  describe('edge cases', () => {
    it('should handle boundary values at thresholds', () => {
      // At exactly 50 (low threshold) -> yellow
      expect(getThresholdColor(50, 50, 80)).toBe(pc.yellow);
      // At exactly 80 (medium threshold) -> red
      expect(getThresholdColor(80, 50, 80)).toBe(pc.red);
    });

    it('should handle negative values', () => {
      expect(getThresholdColor(-10)).toBe(pc.green);
    });

    it('should handle values over 100', () => {
      expect(getThresholdColor(150)).toBe(pc.red);
    });
  });
});

describe('colorByThreshold', () => {
  it('should apply green color for low values', () => {
    const result = colorByThreshold('42%', 42);
    expect(result).toBe(pc.green('42%'));
    expect(stripAnsi(result)).toBe('42%');
  });

  it('should apply yellow color for medium values', () => {
    const result = colorByThreshold('65%', 65);
    expect(result).toBe(pc.yellow('65%'));
  });

  it('should apply red color for high values', () => {
    const result = colorByThreshold('90%', 90);
    expect(result).toBe(pc.red('90%'));
  });

  it('should handle empty strings', () => {
    const result = colorByThreshold('', 50);
    expect(stripAnsi(result)).toBe('');
  });

  it('should respect custom thresholds', () => {
    // 40% with thresholds (30, 60) -> yellow zone
    const result = colorByThreshold('40%', 40, 30, 60);
    expect(result).toBe(pc.yellow('40%'));
  });
});

describe('stripAnsi', () => {
  it('should remove ANSI color codes', () => {
    const colored = pc.green('test');
    expect(stripAnsi(colored)).toBe('test');
  });

  it('should handle strings with multiple ANSI codes', () => {
    const colored = pc.red(pc.bold('bold red'));
    expect(stripAnsi(colored)).toBe('bold red');
  });

  it('should return plain strings unchanged', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  it('should handle empty strings', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('should handle strings with emojis', () => {
    const colored = pc.green('🧠 42%');
    expect(stripAnsi(colored)).toBe('🧠 42%');
  });
});
