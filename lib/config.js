'use strict';

const rc = require('rc');
const yargs = require('yargs');
const path = require('path');
const util = require('util');

class Config extends Object {
  constructor(options, argv) {
    const defaults = collectDefaults(options);
    const custom = collectCustom(options, argv);
    const parsed = parseArgs(options, argv);

    // TODO: fix `hidden` overriding
    const collected = rc('ni', defaults, parsed);
    const formatted = format(options, Object.assign(collected, custom));
    const config = normalize(formatted);

    super(config);
  }
}

Config.collectDefaults = collectDefaults;
Config.collectCustom = collectCustom;
Config.parseArgs = parseArgs;
Config.format = format;
Config.normalize = normalize;

/*
Config._collectDefaults = function(command) {
  var dashedKeyDefaults = collectDefaults(command);
  return normalize(dashedKeyDefaults);
};
*/

/*
Config.filterNodeDebugOptions = Config.filterOptions.bind(Config, function(key, value, definition) {
  return !definition || definition && definition._isNodeInspectorOption;
});

Config.filterDefaultValues = Config.filterOptions.bind(Config, function(key, value, definition) {
  return !definition || definition && definition.default !== value;
});

Config.filterOptions = function(filterExpression, options) {
  var filteredOptions = {};

  Object.keys(options)
    .filter(function(key) {
      var value = options[key];
      var dashedKey = keyToDashedKey(key);
      var definition = definitions[dashedKey];
      return filterExpression(key, value, definition);
    })
    .forEach(function(key) {
      filteredOptions[key] = options[key];
    });

  return filteredOptions;
};
*/

Config.serializeOptions = function(options, filter) {
  filter = filter || {};
  var result = [];
  Object.keys(options).forEach(function(key) {
    if (filter[key]) return;

    var serializedOption = serialize(keyToDashedKey(key), options[key]);
    if (serializedOption !== '')
      result.unshift(serializedOption);
  });
  return result;
};

function serialize(key, value, parent) {
  var prefix = (key.length > 1 || parent ? '--' : '-') + parent;
  if (value === undefined) return '';
  if (value === true) {
    return prefix + key;

  }

  if (value === false) {
    return prefix + key + '=false';
  }

  if (util.isArray(value)) {
    if (!value.length) return '';
    return value.map(function(_value) {
      if (util.isRegExp(_value)) _value = _value.source;
      return prefix + key + '=' + _value;
    }).join(' ');
  }

  if (value instanceof Object) {
    const level = parent + key + '.';
    return Object.keys(value)
                 .map((key) => serialize(key, value[key], level))
                 .join(' ');
  }

  return prefix + key + '=' + value;
}


function normalize(options) {
  return reduce(options, (result, key, option) => {
    const camelKey = keyToCamelKey(key);
    result[camelKey] = options[key];
  });
}

function format(options, collected) {
  return reduce(options, (result, key, option) => {
    const value = collected[key];
    if (value === undefined) return;

    result[key] = option.format ? option.format(value) : value;
  });
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

function collectDefaults(options) {
  return reduce(options, (result, key, option) => {
    if ('default' in option) {
      const isArray = util.isArray(option.default);
      result[key] = isArray ? option.default.slice() : option.default;
    }
  });
}

function collectCustom(options, argv) {
  return reduce(options, (result, key, option) => {
    if ('custom' in option) {
      result[key] = option.custom(argv);
    }
  });
}

function parseArgs(options, argv) {
  yargs.resetOptions();

  const cache = reduce(options, (result, key, option) => {
    if ('custom' in option) return;
    result[key] = option;
  });

  const aliases = reduce(options, (result, key, option) => {
    if ('alias' in option) {
      result.push.apply(result, [].concat(option.alias));
    }
  }, []);

  const parser = yargs.options(cache);

  let parsed = parser.parse(argv);
  const script = parsed._[0];

  if (script) {
    // We want to pass along subarguments, but re-parse our arguments.
    argv = argv.slice(0, argv.indexOf(script) + 1);
    parsed = parser.parse(argv);
  }

  // Filter options
  Object.keys(parsed).forEach((key) => {
    if (aliases.indexOf(key) > -1) {
      // Filter aliases
      delete parsed[key];
    } else if (parsed[key] instanceof Object) {
      if (!wasCustomized(key))
        delete parsed[key];
      // Ignore customised array options and object options
    } else if (wasCamelCased(key)) {
      // Filter camelKey options created by yargs
      delete parsed[key];
    } else if (!wasCustomized(key)) {
      // Filter options with default values
      delete parsed[key];
    }
  });

  return parsed;

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
