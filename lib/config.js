var rc = require('rc'),
    util = require('util');

var conversions = {
  checkIfNull: function(value) {
    return value && value !== 'null' ? value : null;
  },
  keyToCamelKey: function(value) {
    return value.replace(/-(.)/g, function(_, lower) {
      return lower.toUpperCase();
    });
  },
  rcToInnerConfig: function(rcConfig) {
    var options = {};
    Object.keys(rcConfig).forEach(function(key) {
      var camelKey = conversions.keyToCamelKey(key),
          fixedVal = rcConfig[key],
          predefined;

      predefined = !!definitions[key];

      if (predefined) {
        try {
          fixedVal = definitions[key].convert(fixedVal);
        }
        catch (e) {
          console.warn('Cannot convert config option %s: %s.', key, e.message || e);
        }
      }
      options[camelKey] = fixedVal;
    });
    return options;
  },
  stringToArray: function(value) {
    var hidden;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (e) {
        throw new Error('The value is not a valid JSON. ' + (e.message || e));
      }
    }
    if (util.isArray(value)) {
      hidden = value.map(function(s) { return new RegExp(s, 'i'); });
    } else {
      var msg = 'The value ' + JSON.stringify(value) + ' is not an array.';
      throw new Error(msg);
    }
    return hidden;
  },
  stringToBoolean: function(value) {
    return !!value;
  },
  stringToInt: function(value) {
    return parseInt(value, 10);
  }
};
var definitions = {
  'help': {
    desc: 'Show this help',
    convert: conversions.stringToBoolean,
    defaultValue: false
  },
  'version': {
    desc: 'Print Node Inspector\'s version',
    convert: conversions.stringToBoolean,
    defaultValue: false
  },
  'web-port': {
    desc: 'Port to host the inspector',
    convert: conversions.stringToInt,
    defaultValue: 8080
  },
  'web-host': {
    desc: 'Host to listen on',
    convert: conversions.checkIfNull,
    defaultValue: ''
  },
  'debug-port': {
    desc: 'Port to connect to the debugging app',
    convert: conversions.stringToInt,
    defaultValue: 5858
  },
  'save-live-edit': {
    desc: 'Save live edit changes to disk (update the edited files)',
    convert: conversions.stringToBoolean,
    defaultValue: false
  },
  'preload': {
    desc: 'Preload *.js files. You can disable this option to speed up the startup.\n' +
          '    (command-line parameter: \u001b[92m--no-preload\u001b[0m)',
    convert: conversions.stringToBoolean,
    defaultValue: true
  },
  'hidden': {
    desc: 'Array of files to hide from the UI (breakpoints in these files' +
          ' will be ignored)',
    convert: conversions.stringToArray,
    defaultValue: []
  },
  'stack-trace-limit': {
    desc: 'Number of stack frames to show on a breakpoint',
    convert: conversions.stringToInt,
    defaultValue: 50
  }
};

var defaults = collectDefaultsFromDefinitions();
var rcConfig = rc('node-inspector', defaults);
var config = conversions.rcToInnerConfig(rcConfig);

if (config.noPreload !== undefined) {
  // Deprecated in v0.7.3
  console.warn('The config option `no-preload` is deprecated, use `preload` instead');
  config.preload = config.preload || !config.noPreload;
}

module.exports = config;

module.exports._collectDefaults = function() {
  var dashedKeyDefaults = collectDefaultsFromDefinitions();
  return conversions.rcToInnerConfig(dashedKeyDefaults);
};

module.exports._describeOptions = function() {
  return Object.keys(definitions)
    .map(function constructMessagePart(key) {
      var definition = definitions[key];

      var defaultValue = definition.defaultValue;
      var defaultString = JSON.stringify(definition.defaultValue);

      var typeString = Object.prototype.toString.call(defaultValue);
      var matchedType = /^\[object (.*)\]$/.exec(typeString)[1];

      var optionKey = '\u001b[92m--' + key;
      var optionTypeAndDefault =
        matchedType !== 'Undefined' && matchedType !== 'Boolean' ?
          '=\u001b[90m{' + matchedType + '}' +
            ' \u001b[96m(default: ' + defaultString + ')' :
          '';
      var optionDescription = '\u001b[0m' + definition.desc;

      return '    ' + optionKey + optionTypeAndDefault +
        '\n    ' + optionDescription;
    })
    .join('\n\n');
};

function collectDefaultsFromDefinitions() {
  var options = {};

  Object.keys(definitions).forEach(function(key) {
    options[key] = definitions[key].defaultValue;
  });

  return options;
}
