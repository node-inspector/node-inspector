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
          console.warn('Cannot convert config option %s: %s', key, e.message || e);
        }
      }
      options[camelKey] = fixedVal;
    });
    return options;
  },
  printHelpAndExit: function(value) {
    if (value) {
      console.log('Usage: node-inspector [options]');
      console.log('     Option           Default                  Description');
      Object.keys(definitions).map(function(key) {
        definitions[key].desc && console.log(definitions[key].desc);
      });
      process.exit();
    }
    return value;
  },
  stringToArray: function(value) {
    var hidden;
    if (typeof value === 'string') {
      value = JSON.parse(value);
    }
    if (value.length >= 0) {/*not string, but has length - Array*/
      hidden = value.map(function(s) { return new RegExp(s, 'i'); });
    }
    else {
      throw 'Wrong input type!';
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
    desc: '--help            |             | Print information about options',
    convert: conversions.printHelpAndExit,
    defaultValue: false
  },
  'web-port': {
    desc: '--web-port        |    8080     | Port to host the inspector',
    convert: conversions.stringToInt,
    defaultValue: 8080
  },
  'web-host': {
    desc: '--web-host        |  127.0.0.1  | Host to listen on',
    convert: conversions.checkIfNull,
    defaultValue: null
  },
  'debug-port': {
    desc: '--debug-port      |    5858     | Port to connect to the debugging app',
    convert: conversions.stringToInt,
    defaultValue: 5858
  },
  'save-live-edit': {
    desc: '--save-live-edit  |    false    | Save live edit changes to disk' +
          '\t\t\t          |             | (update the edited files)',
    convert: conversions.stringToBoolean,
    defaultValue: false
  },
  'hidden': {
    desc: '--hidden          |     []      | Array of files to hide from the UI' +
          '\t\t\t          |             | Breakpoints in these files will be ignored',
    convert: conversions.stringToArray,
    defaultValue: []
  }
};

var defaults = loadDefaults();
var rcConfig = rc('node-inspector', defaults);
var config = conversions.rcToInnerConfig(rcConfig);

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
