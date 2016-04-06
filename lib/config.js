'use strict';

const rc = require('rc');
const yargs = require('yargs');
const path = require('path');
const util = require('util');

class Config extends Object {
  constructor(options, argv) {
    const defaults = Config.collectDefaults(options);
    const custom = Config.collectCustom(options, argv);
    const parsed = Config.parseArgs(options, argv);

    // TODO: fix `hidden` overriding
    // TODO: collected[command]
    const collected = rc('ni', defaults, parsed);
    const formatted = Config.format(options, Object.assign(collected, custom));
    const config = Config.normalize(formatted);

    super(config);
  }

  static collectDefaults(options) {
    return reduce(options, (result, key, option) => {
      if ('default' in option) {
        const isArray = util.isArray(option.default);
        result[key] = isArray ? option.default.slice() : option.default;
      }
    });
  }

  static collectCustom(options, argv) {
    return reduce(options, (result, key, option) => {
      if ('custom' in option) {
        result[key] = option.custom(argv);
      }
    });
  }

  static parseArgs(options, argv) {
    yargs.resetOptions();

    const cache = reduce(options, (result, key, option) => {
      if ('custom' in option) return;
      result[key] = option;
    });

    const parser = yargs.options(cache);

    let parsed = parser.parse(argv);
    const script = parsed._[0];

    if (script) {
      // We want to pass along subarguments, but re-parse our arguments.
      argv = argv.slice(0, argv.indexOf(script) + 1);
      parsed = parser.parse(argv);
    }

    return filterArgs(options, cache, parsed);
  }

  static format(options, collected) {
    return reduce(collected, (result, key, value) => {
      if (value === undefined) return;

      const option = options[key];
      result[key] = option && option.format ? option.format(value) : value;
    });
  }

  static normalize(options) {
    return reduce(options, (result, key, value) => {
      const camelKey = keyToCamelKey(key);
      result[camelKey] = value;
    });
  }
}

function keyToCamelKey(key) {
  return key.replace(/-./g, letter => letter.slice(1).toUpperCase());
}

function keyToDashedKey(key) {
  return key.replace(/[A-Z0-9]/g, letter => '-' + letter.toLowerCase());
}

function reduce(options, reducer, result) {
  return Object.keys(options).reduce((result, key) => {
    reducer(result, key, options[key]);
    return result;
  }, result || {});
}

function filterArgs(options, cache, parsed) {
  const aliases = reduce(options, (result, key, option) => {
    if ('alias' in option) {
      result.push.apply(result, [].concat(option.alias));
    }
  }, []);

  const result = {};

  Object.keys(parsed).forEach((key) => {
    // Filter aliases
    if (aliases.indexOf(key) > -1) return;
    // Filter not customised array options and object options
    if (parsed[key] instanceof Object && !wasCustomized(key)) return;
    // Filter camelKey options created by yargs
    if (wasCamelCased(key)) return;
    // Filter options with default values
    if (!wasCustomized(key)) return;

    result[key] = parsed[key];
  });

  return result;

  function wasCamelCased(key) {
    if (!/[A-Z0-9]/.test(key))
      return false;

    const dashed = keyToDashedKey(key);
    if (cache[dashed]) return true;
  }

  function wasCustomized(key) {
    var option = cache[key];
    if (!option) return true;

    return option.default === undefined ||
           option.default !== parsed[key];
  }
}

module.exports = Config;
