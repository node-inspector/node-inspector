var fs = require('fs'),
    rc = require('rc'),
    yargs = require('yargs'),
    util = require('util');

module.exports = Config;

var definitions = {
  'help': {
    alias: 'h',
    type: 'boolean',
    description: 'Show this help',
    _isNodeInspectorOption: true,
    default: false
  },
  'version': {
    alias: 'v',
    type: 'boolean',
    description: 'Print Node Inspector\'s version',
    _isNodeInspectorOption: true,
    default: false
  },
  'web-port': {
    alias: ['port', 'p'],
    type: 'number',
    description: 'Port to host the inspector',
    _isNodeInspectorOption: true,
    default: 8080
  },
  'web-host': {
    type: 'string',
    description: 'Host to listen on',
    _isNodeInspectorOption: true,
    default: '0.0.0.0'
  },
  'debug-port': {
    alias: 'd',
    type: 'number',
    description: 'Port to connect to the debugging app',
    _isNodeInspectorOption: true,
    default: 5858
  },
  'save-live-edit': {
    type: 'boolean',
    description: 'Save live edit changes to disk (update the edited files)',
    _isNodeInspectorOption: true,
    default: false
  },
  'preload': {
    type: 'boolean',
    description: 'Preload *.js files. You can disable this option to speed up the startup.\n' +
          '    (command-line parameter: \u001b[92m--no-preload\u001b[0m)',
    _isNodeInspectorOption: true,
    default: true
  },
  'inject': {
    type: 'boolean',
    description: 'Enables injection of debugger extensions in app',
    _isNodeInspectorOption: true,
    default: true
  },
  'hidden': {
    type: 'string',
    description: 'Array of files to hide from the UI (breakpoints in these files' +
          ' will be ignored)',
    _isNodeInspectorOption: true,
    default: []
  },
  'stack-trace-limit': {
    type: 'number',
    description: 'Number of stack frames to show on a breakpoint',
    _isNodeInspectorOption: true,
    default: 50
  },
  'ssl-key': {
    type: 'string',
    description: 'A file containing a valid SSL key',
    _isNodeInspectorOption: true,
    default: ''
  },
  'ssl-cert': {
    type: 'string',
    description: 'A file containing a valid SSL certificate',
    _isNodeInspectorOption: true,
    default: ''
  },
  'nodejs': {
    type: 'string',
    description: 'Pass NodeJS options to debugged process (`node --option={value}`)\n' +
                  'Usage example:  node-debug --nodejs --harmony --nodejs --random_seed=2 app',
    default: []
  },
  'debug-brk': {
    alias: 'b',
    type: 'boolean',
    description: 'Break on the first line (`node --debug-brk`)',
    default: false
  },
  'cli': {
    alias: 'c',
    type: 'boolean',
    description: 'CLI mode, do not open browser.',
    default: false
  }
};

function Config(argv, NODE_DEBUG_MODE) {
  var defaults = collectDefaultsFromDefinitions(NODE_DEBUG_MODE);
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

Config._collectDefaults = function(NODE_DEBUG_MODE) {
  var dashedKeyDefaults = collectDefaultsFromDefinitions(NODE_DEBUG_MODE);
  return normalizeOptions(dashedKeyDefaults);
};

Config.serializeOptions = function(options, filter) {
  filter = filter || {};
  var result = [];
  Object.keys(options).forEach(function(key) {
    if (filter[key]) return;

    var serializedOption = serializeOption(keyToDashedKey(key), options[key]);
    if (serializedOption !== '')
      result.unshift(serializedOption);
  });
  return result;
};

function serializeOption(key, value) {
  var prefix = key.length > 1 ? '--' : '-';
  if (value === undefined) return '';
  if (value === true) {
    return prefix + key;
  } else if (value === false) {
    return prefix + key + '=false';
  } else if (util.isArray(value)) {
    if (!value.length) return '';
    return value.map(function(_value) {
      return prefix + key + '=' + _value;
    }).join(' ');
  } else {
    return prefix + key + '=' + value;
  }
}

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

Config.filterNodeDebugOptions = Config.filterOptions.bind(Config, function(key, value, definition) {
  return !definition || definition && definition._isNodeInspectorOption;
});

Config.filterDefaultValues = Config.filterOptions.bind(Config, function(key, value, definition) {
  return !definition || definition && definition.default !== value;
});

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

function keyToDashedKey(key) {
  return key.replace(/[A-Z]/g, function(letter) {
    return '-' + letter.toLowerCase();
  });
}

function collectDefaultsFromDefinitions(NODE_DEBUG_MODE) {
  var options = {};

  Object.keys(definitions).forEach(function(key) {
    if (util.isArray(definitions[key].default)) {
      options[key] = definitions[key].default.slice();
    } else {
      options[key] = definitions[key].default;
    }
  });

  if (NODE_DEBUG_MODE) {
    options['web-host'] = '127.0.0.1';
    options['debug-brk'] = true;
  }

  return options;
}

function collectAliasesFromDefinitions() {
  var aliases = [];

  Object.keys(definitions).forEach(function(key) {
    if (definitions[key].alias)
      aliases = aliases.concat(definitions[key].alias);
  });

  return aliases;
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

  //Preparse --nodejs options
  var nodejsArgs = [];
  var nodejsIndex = argv.indexOf('--nodejs');
  while (nodejsIndex !== -1) {
    var nodejsArg = argv.splice(nodejsIndex, 2)[1];
    if (nodejsArg !== undefined) {
      nodejsArgs.push(nodejsArg);
    }
    nodejsIndex = argv.indexOf('--nodejs');
  }

  var options = argvParser.parse(argv);
  var script = options._[0];

  if (script) {
    // We want to pass along subarguments, but re-parse our arguments.
    argv = argv.slice(0, argv.indexOf(script) + 1);
    options = argvParser.parse(argv);
  }

  //filter options
  var aliases = collectAliasesFromDefinitions();
  Object.keys(options).forEach(function(key) {
    if (aliases.indexOf(key) > -1) {
      //Filter aliases
      delete options[key];
    } else if (util.isArray(options[key])) {
      //Ignore array options
    } else if (/[A-Z]/.test(key)) {
      //filter camelKey options created by yargs
      delete options[key];
    } else if (!wasCustomized(key)) {
      //filter options with default values
      delete options[key];
    }
  });

  options['nodejs'] = nodejsArgs;

  return options;
}
