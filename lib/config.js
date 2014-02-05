var fs = require('fs'),
    rc = require('rc'),
    path = require('path');

var conversions = {
  checkIfNull: function(value) {
    return value && value !== 'null' ? value : null;
  },
  keyToCamelKey: function(value) {
    return value.replace(/-(.)/g, function(_, lower) {
      return lower.toUpperCase();
    });
  },
  keyToDashedKey: function(value) {
    return value.replace(/([A-Z])/g, function(_, upper) {
      return '-' + upper.toLowerCase();
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
  printHelpAndExit: function(value) {
    if (value) {
      var message = 'Usage: node-inspector [options]\nOptions:\n';

      Object.keys(definitions).forEach(function constructMessagePart(key) {
        var definition = definitions[key],
            defaultValue = definition.defaultValue,
            typeString = Object.prototype.toString.call(defaultValue),
            defaultString = JSON.stringify(definition.defaultValue),
            matchedType = /^\[object (.*)\]$/.exec(typeString)[1],
            optionKey = '\u001b[92m--' + key,
            optionTypeAndDefault =
              matchedType !== 'Undefined' && matchedType !== 'Boolean' ?
                '=\u001b[90m{' + matchedType + '}' +
                ' \u001b[96m(default: ' + defaultString + ')' :
                '',
            optionDescription = '\u001b[0m' + definition.desc;

        message += optionKey + optionTypeAndDefault + '\n' +
                   optionDescription + '\n\n';
      });

      console.log(message);
      process.exit();
    }
    return value;
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
    if (value.length >= 0) {/*not string, but has length - Array*/
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
    desc: 'Print information about options and exit',
    convert: conversions.printHelpAndExit,
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
  'no-preload': {
    desc: 'Disables preloading *.js to speed up startup',
    convert: conversions.stringToBoolean,
    defaultValue: false
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

var defaults = loadDefaults();
var rcConfig = rc('node-inspector', defaults);
var config = conversions.rcToInnerConfig(rcConfig);

config.isScriptHidden = function(scriptPath) {
  return config.hidden.some(function fnHiddenScriptMatchesPath(r) {
    return r.test(scriptPath);
  });
};

module.exports = config;

function collectDefaultsFromDefinitions() {
  var options = {};
  Object.keys(definitions).forEach(function(key) {
    var camelKey = conversions.keyToCamelKey(key);
    options[camelKey] = definitions[key].defaultValue;
  });
  return options;
}

function collectDefaultsFromJSONConfig() {
  var options = {},
      camelKeyOptions,
      pathToConfig = path.join(__dirname, '../config.json');

  try {
    camelKeyOptions = JSON.parse(fs.readFileSync(pathToConfig));
  }
  catch (e) {
    camelKeyOptions = {};
  }

  Object.keys(camelKeyOptions).forEach(function(key) {
    var dashedKey = conversions.keyToDashedKey(key);
    options[dashedKey] = camelKeyOptions[key];
  });

  return options;
}

function loadDefaults() {
  var defaults = collectDefaultsFromDefinitions(),
      override = collectDefaultsFromJSONConfig(); /*Backward compatibility*/

  Object.keys(override).forEach(function(dashedKey) {
    defaults[dashedKey] = override[dashedKey];
  });

  return defaults;
}
