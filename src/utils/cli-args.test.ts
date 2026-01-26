import { describe, it, expect } from 'vitest';
import { parseSegmentsArg, parseNoEmojisArg, parseNoBarsArg } from './cli-args.js';

describe('parseSegmentsArg', () => {
  describe('flag not present', () => {
    it('returns undefined when no flags provided', () => {
      expect(parseSegmentsArg([])).toBeUndefined();
    });

    it('returns undefined when only other flags provided', () => {
      expect(parseSegmentsArg(['--update-cache'])).toBeUndefined();
      expect(parseSegmentsArg(['--foo', '--bar'])).toBeUndefined();
    });
  });

  describe('--segments=value format', () => {
    it('parses --segments=value correctly', () => {
      expect(parseSegmentsArg(['--segments=model,context'])).toBe('model,context');
    });

    it('returns empty string for --segments= (empty value)', () => {
      expect(parseSegmentsArg(['--segments='])).toBe('');
    });

    it('handles --segments=value with other args', () => {
      expect(parseSegmentsArg(['--foo', '--segments=model', '--bar'])).toBe('model');
    });
  });

  describe('--segments value format (space separator)', () => {
    it('parses --segments value correctly', () => {
      expect(parseSegmentsArg(['--segments', 'model,context'])).toBe('model,context');
    });

    it('returns empty string when --segments is at end', () => {
      expect(parseSegmentsArg(['--segments'])).toBe('');
    });

    it('returns empty string when --segments is followed by another flag', () => {
      expect(parseSegmentsArg(['--segments', '--foo'])).toBe('');
      expect(parseSegmentsArg(['--segments', '-f'])).toBe('');
    });

    it('handles --segments value with other args', () => {
      expect(parseSegmentsArg(['--foo', '--segments', 'model', '--bar'])).toBe('model');
    });
  });

  describe('-s value format (short flag)', () => {
    it('parses -s value correctly', () => {
      expect(parseSegmentsArg(['-s', 'model,context'])).toBe('model,context');
    });

    it('returns empty string when -s is at end', () => {
      expect(parseSegmentsArg(['-s'])).toBe('');
    });

    it('returns empty string when -s is followed by another flag', () => {
      expect(parseSegmentsArg(['-s', '--foo'])).toBe('');
      expect(parseSegmentsArg(['-s', '-f'])).toBe('');
    });

    it('handles -s value with other args', () => {
      expect(parseSegmentsArg(['--foo', '-s', 'model', '--bar'])).toBe('model');
    });
  });

  describe('last-wins semantics', () => {
    it('uses last --segments=value when multiple provided', () => {
      expect(parseSegmentsArg(['--segments=first', '--segments=last'])).toBe('last');
    });

    it('uses last -s value when multiple provided', () => {
      expect(parseSegmentsArg(['-s', 'first', '-s', 'last'])).toBe('last');
    });

    it('uses last value when mixing --segments and -s', () => {
      expect(parseSegmentsArg(['--segments=first', '-s', 'last'])).toBe('last');
      expect(parseSegmentsArg(['-s', 'first', '--segments=last'])).toBe('last');
    });

    it('uses last value when mixing all formats', () => {
      expect(parseSegmentsArg([
        '--segments=a',
        '--segments', 'b',
        '-s', 'c',
        '--segments=d',
      ])).toBe('d');
    });

    it('last empty value takes precedence over earlier valid value', () => {
      expect(parseSegmentsArg(['--segments=model', '--segments='])).toBe('');
      expect(parseSegmentsArg(['-s', 'model', '-s'])).toBe('');
    });

    it('last valid value takes precedence over earlier empty value', () => {
      expect(parseSegmentsArg(['--segments=', '--segments=model'])).toBe('model');
      expect(parseSegmentsArg(['-s', '-s', 'model'])).toBe('model');
    });
  });

  describe('edge cases', () => {
    it('handles value that looks like a flag but is after =', () => {
      // --segments=--foo should treat --foo as the value
      expect(parseSegmentsArg(['--segments=--foo'])).toBe('--foo');
    });

    it('handles whitespace in value', () => {
      expect(parseSegmentsArg(['--segments=  model  '])).toBe('  model  ');
    });

    it('handles comma-separated values with spaces', () => {
      expect(parseSegmentsArg(['--segments=model, context, cost'])).toBe('model, context, cost');
    });
  });
});

describe('parseNoEmojisArg', () => {
  it('returns undefined when flag not present', () => {
    expect(parseNoEmojisArg([])).toBeUndefined();
    expect(parseNoEmojisArg(['--segments=model'])).toBeUndefined();
  });

  it('returns true when flag present', () => {
    expect(parseNoEmojisArg(['--no-emojis'])).toBe(true);
  });

  it('handles flag in various positions', () => {
    expect(parseNoEmojisArg(['--no-emojis', '--segments=model'])).toBe(true);
    expect(parseNoEmojisArg(['--segments=model', '--no-emojis'])).toBe(true);
  });

  it('handles multiple occurrences (always true if any present)', () => {
    expect(parseNoEmojisArg(['--no-emojis', '--no-emojis'])).toBe(true);
  });
});

describe('parseNoBarsArg', () => {
  it('returns undefined when flag not present', () => {
    expect(parseNoBarsArg([])).toBeUndefined();
    expect(parseNoBarsArg(['--segments=model'])).toBeUndefined();
  });

  it('returns true when flag present', () => {
    expect(parseNoBarsArg(['--no-bars'])).toBe(true);
  });

  it('handles flag in various positions', () => {
    expect(parseNoBarsArg(['--no-bars', '--segments=model'])).toBe(true);
    expect(parseNoBarsArg(['--segments=model', '--no-bars'])).toBe(true);
  });

  it('handles multiple occurrences (always true if any present)', () => {
    expect(parseNoBarsArg(['--no-bars', '--no-bars'])).toBe(true);
  });
});
