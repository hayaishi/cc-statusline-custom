import { describe, it, expect } from 'vitest';
import { parseSegmentsArg, parseNoEmojisArg, parseNoBarsArg, parseDisableBgUpdateArg, parseAutoArg, parseDebugArg, parseConfigArg } from './cli-args.js';

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

describe('parseDisableBgUpdateArg', () => {
  it('returns false when flag not present', () => {
    expect(parseDisableBgUpdateArg([])).toBe(false);
    expect(parseDisableBgUpdateArg(['--segments=model'])).toBe(false);
  });

  it('returns true when flag present', () => {
    expect(parseDisableBgUpdateArg(['--disable-bg-update'])).toBe(true);
  });

  it('handles flag in various positions', () => {
    expect(parseDisableBgUpdateArg(['--disable-bg-update', '--segments=model'])).toBe(true);
    expect(parseDisableBgUpdateArg(['--segments=model', '--disable-bg-update'])).toBe(true);
  });

  it('handles multiple occurrences (always true if any present)', () => {
    expect(parseDisableBgUpdateArg(['--disable-bg-update', '--disable-bg-update'])).toBe(true);
  });
});

describe('parseAutoArg', () => {
  it('returns false when flag not present', () => {
    expect(parseAutoArg([])).toBe(false);
    expect(parseAutoArg(['--update-cache'])).toBe(false);
  });

  it('returns true when flag present', () => {
    expect(parseAutoArg(['--auto'])).toBe(true);
  });

  it('handles flag in various positions', () => {
    expect(parseAutoArg(['--auto', '--update-cache'])).toBe(true);
    expect(parseAutoArg(['--update-cache', '--auto'])).toBe(true);
  });

  it('handles multiple occurrences (always true if any present)', () => {
    expect(parseAutoArg(['--auto', '--auto'])).toBe(true);
  });
});

describe('parseDebugArg', () => {
  it('returns false when flag not present', () => {
    expect(parseDebugArg([])).toBe(false);
    expect(parseDebugArg(['--segments=model'])).toBe(false);
  });

  it('returns true when flag present', () => {
    expect(parseDebugArg(['--debug'])).toBe(true);
  });

  it('handles flag in various positions', () => {
    expect(parseDebugArg(['--debug', '--segments=model'])).toBe(true);
    expect(parseDebugArg(['--segments=model', '--debug'])).toBe(true);
  });

  it('handles multiple occurrences (always true if any present)', () => {
    expect(parseDebugArg(['--debug', '--debug'])).toBe(true);
  });
});

describe('parseConfigArg', () => {
  describe('flag not present', () => {
    it('returns undefined when no flags provided', () => {
      expect(parseConfigArg([])).toBeUndefined();
    });

    it('returns undefined when only other flags provided', () => {
      expect(parseConfigArg(['--update-cache'])).toBeUndefined();
      expect(parseConfigArg(['--segments=model'])).toBeUndefined();
    });
  });

  describe('--config=value format', () => {
    it('parses --config=value correctly', () => {
      expect(parseConfigArg(['--config=/path/to/plugins.yaml'])).toBe('/path/to/plugins.yaml');
    });

    it('returns empty string for --config= (empty value)', () => {
      expect(parseConfigArg(['--config='])).toBe('');
    });

    it('handles --config=value with other args', () => {
      expect(parseConfigArg(['--foo', '--config=/path/file.yaml', '--bar'])).toBe('/path/file.yaml');
    });
  });

  describe('--config value format (space separator)', () => {
    it('parses --config value correctly', () => {
      expect(parseConfigArg(['--config', '/path/to/plugins.yaml'])).toBe('/path/to/plugins.yaml');
    });

    it('returns empty string when --config is at end', () => {
      expect(parseConfigArg(['--config'])).toBe('');
    });

    it('returns empty string when --config is followed by another flag', () => {
      expect(parseConfigArg(['--config', '--foo'])).toBe('');
      expect(parseConfigArg(['--config', '-f'])).toBe('');
    });
  });

  describe('-c value format (short flag)', () => {
    it('parses -c value correctly', () => {
      expect(parseConfigArg(['-c', '/path/to/plugins.yaml'])).toBe('/path/to/plugins.yaml');
    });

    it('returns empty string when -c is at end', () => {
      expect(parseConfigArg(['-c'])).toBe('');
    });

    it('returns empty string when -c is followed by another flag', () => {
      expect(parseConfigArg(['-c', '--foo'])).toBe('');
      expect(parseConfigArg(['-c', '-f'])).toBe('');
    });
  });

  describe('last-wins semantics', () => {
    it('uses last --config=value when multiple provided', () => {
      expect(parseConfigArg(['--config=/first.yaml', '--config=/last.yaml'])).toBe('/last.yaml');
    });

    it('uses last -c value when multiple provided', () => {
      expect(parseConfigArg(['-c', '/first.yaml', '-c', '/last.yaml'])).toBe('/last.yaml');
    });

    it('uses last value when mixing --config and -c', () => {
      expect(parseConfigArg(['--config=/first.yaml', '-c', '/last.yaml'])).toBe('/last.yaml');
      expect(parseConfigArg(['-c', '/first.yaml', '--config=/last.yaml'])).toBe('/last.yaml');
    });
  });

  describe('edge cases', () => {
    it('handles paths with spaces when quoted', () => {
      expect(parseConfigArg(['--config=/path/with spaces/file.yaml'])).toBe('/path/with spaces/file.yaml');
    });

    it('handles tilde in path', () => {
      expect(parseConfigArg(['--config=~/.config/cc-statusline/plugins.yaml'])).toBe('~/.config/cc-statusline/plugins.yaml');
    });
  });
});
