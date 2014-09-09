var fs = require('fs'),
    rc = require('rc'),
    yargs = require('yargs'),
    util = require('util');

module.exports = Config;

var definitions = {
  'help': {
    type: 'boolean',
    description: 'Show this help',
    default: false
  },
  'version': {
    type: 'boolean',
    description: 'Print Node Inspector\'s version',
    default: false
  },
  'web-port': {
    type: 'number',
    description: 'Port to host the inspector',
    default: 8080
  },
  'web-host': {
    type: 'string',
    description: 'Host to listen on',
    default: '0.0.0.0'
  },
  'debug-port': {
    type: 'number',
    description: 'Port to connect to the debugging app',
    default: 5858
  },
  'save-live-edit': {
    type: 'boolean',
    description: 'Save live edit changes to disk (update the edited files)',
    default: false
  },
  'preload': {
    type: 'boolean',
    description: 'Preload *.js files. You can disable this option to speed up the startup.\n' +
          '    (command-line parameter: \u001b[92m--no-preload\u001b[0m)',
    default: true
  },
  'inject': {
    type: 'boolean',
    description: 'Enables injection of debugger extensions in app',
    default: true
  },
  'hidden': {
    type: 'string',
    description: 'Array of files to hide from the UI (breakpoints in these files' +
          ' will be ignored)',
    default: []
  },
  'stack-trace-limit': {
    type: 'number',
    description: 'Number of stack frames to show on a breakpoint',
    default: 50
  },
  'ssl-key': {
    type: 'string',
    description: 'A file containing a valid SSL key',
    default: ''
  },
  'ssl-cert': {
    type: 'string',
    description: 'A file containing a valid SSL certificate',
    default: ''
  }
};

function Config(argv) {
  var defaults = collectDefaultsFromDefinitions();
  var parsedArgv = parseArgs(argv);

  checkDeprecatedHiddenStyle(parsedArgv);

  var rcConfig = rc('node-inspector', defaults, parsedArgv);
  var config = normalizeOptions(rcConfig);

  checkDeprecatedNoPreloadStyle(config);
  checkDeprecatedWebHostStyle(config);

  util._extend(this, config);
}

function checkDeprecatedNoPreloadStyle(config) {
  if (config.noPreload !== undefined) {
    // Deprecated in v0.7.3
    console.warn('The config option `no-preload` is deprecated, use `preload` instead');
    config.preload = config.preload || !config.noPreload;
    delete config.noPreload;
  }
}

function checkDeprecatedWebHostStyle(config) {
  if (config.webHost === 'null') {
    // Deprecated in v0.8.0
    console.warn('You use deprecated syntax for web-host option. Use 0.0.0.0 instead of null');
    config.webHost = '0.0.0.0';
  }
}

function checkDeprecatedHiddenStyle(parsedArgv) {
  if (parsedArgv.hidden.length == 1) {
    // Deprecated in v0.8.0
    var isDeprecatedDefinitionStyle = false,
        hidden;
    try {
      hidden = JSON.parse(parsedArgv.hidden[0]);
      isDeprecatedDefinitionStyle = util.isArray(hidden);
    } catch (e) {}

    if (isDeprecatedDefinitionStyle) {
      console.warn('You use deprecated syntax for hidden option.\n' +
                   'Use `--hidden value1 --hidden value2` instead');
      parsedArgv.hidden = hidden;
    }
  }
}

Config._collectDefaults = function() {
  var dashedKeyDefaults = collectDefaultsFromDefinitions();
  return normalizeOptions(dashedKeyDefaults);
};

function normalizeOptions(options) {
  var normalizedOptions = {};

  Object.keys(options).forEach(function(key) {
    var camelKey = keyToCamelKey(key);
    normalizedOptions[camelKey] = options[key];
  });

  checkHiddenOption(normalizedOptions);
  checkSslOptions(normalizedOptions);

  return normalizedOptions;
}

function checkHiddenOption(options) {
  function toRegExp(string) {
    return new RegExp(string, 'i');
  }
  options.hidden = [].concat(options.hidden || []).map(toRegExp);
}

function checkSslOptions(options) {
  function realPath(path) {
    if (!path) return '';

    path = fs.realpathSync(path);
    if (!fs.existsSync(path)) throw new Error('The file "' + path + '" does not exist');
    
    return path;
  }

  options.sslKey = realPath(options.sslKey);
  options.sslCert = realPath(options.sslCert);
}

function keyToCamelKey(key) {
  return key.replace(/-./g, function(letter) {
    return letter.slice(1).toUpperCase();
  });
}

function collectDefaultsFromDefinitions() {
  var options = {};

  Object.keys(definitions).forEach(function(key) {
    if (util.isArray(definitions[key].default)) {
      options[key] = definitions[key].default.slice();
    } else {
      options[key] = definitions[key].default;
    }
  });

  return options;
}

function parseArgs(argv) {
  var argvParser = yargs.options(definitions);

  function wasCustomized(key) {
    var definition = definitions[key];
    if (!definition) return true;

    var options = [key].concat(definition.alias || []);

    return argv.some(function(arg) {
      var optionMatcher = /^(?:--no)?-+(.*?)(?:=.*)?$/;
      arg = (optionMatcher.exec(arg) || [])[1];
      if (arg && options.indexOf(arg) !== -1) return true;
    });
  }

  var options = argvParser.parse(argv);

  //filter options
  Object.keys(options).forEach(function(key) {
    if (util.isArray(options[key])) {
      //Ignore array options
    } else if (/[A-Z]/.test(key)) {
      //filter camelKey options created by yargs
      delete options[key];
    } else if (!wasCustomized(key)) {
      //filter options with default values
      delete options[key];
    }
  });

  return options;
}
