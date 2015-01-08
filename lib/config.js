var fs = require('fs'),
    rc = require('rc'),
    yargs = require('yargs'),
    path = require('path'),
    util = require('util');

module.exports = Config;

var definitions = {
  'help': {
    alias: 'h',
    type: 'boolean',
    description: 'Display information about avaible options.',
    usage: {
      '--help': '           display short list of avaible options',
      '--help <option>': '  display quick help on <option>',
      '--help -l': '        display full usage info'
    },
    _isNodeInspectorOption: true,
    _isNodeDebugOption: true,
    default: false
  },
  'version': {
    alias: 'v',
    type: 'boolean',
    description: 'Display Node Inspector\'s version.',
    usage: '--version',
    _isNodeInspectorOption: true,
    _isNodeDebugOption: true,
    default: false
  },
  'web-port': {
    alias: ['port', 'p'],
    type: 'number',
    description: 'Port to listen on for Node Inspector\'s web interface.',
    usage: {
      '--web-port 8081': '',
      '-p 8081': ''
    },
    _isNodeInspectorOption: true,
    default: 8080
  },
  'web-host': {
    type: 'string',
    description: 'Host to listen on for Node Inspector\'s web interface.',
    usage: {
      '--web-host 127.0.0.1': '',
      '--web-host www.example.com': ''
    },
    _isNodeInspectorOption: true,
    default: '0.0.0.0'
  },
  'debug-port': {
    alias: 'd',
    type: 'number',
    description: 'Node/V8 debugger port (`node --debug={port}`).',
    _isNodeInspectorOption: true,
    _isNodeDebugOption: true,
    default: 5858
  },
  'save-live-edit': {
    type: 'boolean',
    description: 'Save live edit changes to disk (update the edited files).',
    usage: {
      '--save-live-edit': '',
      '--no-save-live-edit': '    disable saving live edit changes to disk'
    },
    _isNodeInspectorOption: true,
    default: false
  },
  'preload': {
    type: 'boolean',
    description: 'Preload *.js files. You can disable this option to speed up the startup.',
    usage: {
      '--preload': '',
      '--no-preload': '    disable preloading *.js files'
    },
    _isNodeInspectorOption: true,
    default: true
  },
  'inject': {
    type: 'boolean',
    description: 'Enable injection of debugger extensions into the debugged process.',
    usage: {
      '--inject': '',
      '--no-inject': '    disable injecting of debugger extensions'
    },
    _isNodeInspectorOption: true,
    default: true
  },
  'hidden': {
    type: 'string',
    description: 'Array of files to hide from the UI,\n' +
                 'breakpoints in these files will be ignored.\n' +
                 'All paths are interpreted as regular expressions.',
    usage: {
      '--hidden .*\\.test\\.js$ --hidden node_modules/': 'ignore node_modules directoty' +
        'and all `*.test.js` files'
    },
    _isNodeInspectorOption: true,
    default: []
  },
  'stack-trace-limit': {
    type: 'number',
    description: 'Number of stack frames to show on a breakpoint.',
    _isNodeInspectorOption: true,
    default: 50
  },
  'ssl-key': {
    type: 'string',
    description: 'A file containing a valid SSL key.',
    usage: '--ssl-key ./ssl/key.pem --ssl-cert ./ssl/cert.pem',
    _isNodeInspectorOption: true,
    default: ''
  },
  'ssl-cert': {
    type: 'string',
    description: 'A file containing a valid SSL certificate.',
    usage: '--ssl-key ./ssl/key.pem --ssl-cert ./ssl/cert.pem',
    _isNodeInspectorOption: true,
    default: ''
  },
  'nodejs': {
    type: 'string',
    description: 'Pass NodeJS options to debugged process (`node --option={value}`).',
    usage: '--nodejs --harmony --nodejs --random_seed=2 app',
    _isNodeDebugOption: true,
    default: []
  },
  'debug-brk': {
    alias: 'b',
    type: 'boolean',
    description: 'Break on the first line (`node --debug-brk`).',
    _isNodeDebugOption: true,
    default: false
  },
  'cli': {
    alias: 'c',
    type: 'boolean',
    description: 'CLI mode, do not open browser.',
    usage: '--cli',
    _isNodeDebugOption: true,
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

Config.prototype.showVersion = function() {
  console.log('Node Inspector v' + require('../package.json').version);
};

Config.prototype.showHelp = function(NODE_DEBUG_MODE) {
  var cmd = getCmd();

  var inspectorOptions = [];
  var nodeDebugOptions = [];
  Object.keys(definitions).forEach(function(key) {
    if (definitions[key]._isNodeDebugOption && NODE_DEBUG_MODE) {
      nodeDebugOptions.push(key);
    } else if (definitions[key]._isNodeInspectorOption) {
      inspectorOptions.push(key);
    }
  }, this);
  
  var inspectorPart = color('green', '[node-inspector-options]');
  var optionsPart = color('cyan', '[options]');
  var scriptPart = color('red', '[script [script-arguments]]');
  var configurationParts = [inspectorPart];
  if (NODE_DEBUG_MODE) {
    configurationParts.unshift(optionsPart);
    configurationParts.push(scriptPart);
  }

  if (typeof this.help == 'string') {
    //Display help for target option
    showOptionHelp(this.help);
  } else if (this.l) {
    //Display options format and options usage info
    console.log('Usage:\n    %s %s\n', cmd, configurationParts.join(' '));
    if (NODE_DEBUG_MODE) {
      nodeDebugOptions.forEach(showOptionHelp);
    }
    inspectorOptions.forEach(showOptionHelp);
  } else {
    //Display options format, options list and some help information
    console.log(
        'Usage:\n    %s %s\n', cmd, configurationParts.join(' '));

    if (NODE_DEBUG_MODE) {
      console.log(
        'Where %s is one or more of:\n' +
        '    %s\n', optionsPart, nodeDebugOptions.join('\n    '));
    }
    console.log(
        'Where %s is one or more of:\n' +
        '    %s\n', inspectorPart, inspectorOptions.join('\n    '));
    console.log('Use:' + formatUsage(definitions.help.usage) + '\n');

    if (NODE_DEBUG_MODE) {
      console.log(
        'The %s argument is resolved relative to the current working\n' +
        'directory. If no such file exists, then env.PATH is searched.\n',
        color('red', '[script]'));
      console.log(
        'The default mode is to break on the first line of the script, to run\n' +
        'immediately on start use `--no-debug-brk` or press the Resume button.\n');
      console.log(
        'When there is no script specified, the module in the current working\n' +
        'directory is loaded in the REPL session as `m`. This allows you to call\n' +
        'and debug arbitrary functions exported by the current module.\n');
    }

    console.log(
        'Configuration can be also stored in a \'.node-inspectorrc\' file,\n' +
        'see README for more details:\n' +
        '  https://github.com/node-inspector/node-inspector#configuration');
  }
};

function getCmd() {
  return process.env.CMD || path.basename(process.argv[1]);
}

function color(_color, string) {
  var colors = util.inspect.colors;
  return '\u001b[' + colors[_color][0] + 'm' + string +
         '\u001b[' + colors[_color][1] + 'm';
}

function showOptionHelp(option) {
  var info = definitions[option];

  if (info) {
    var optionLine = '--' + option;
    if (info.alias) {
      var aliases = [].concat(info.alias);
      optionLine += ', ' + aliases.map(function(alias) {
        var prefix = alias.length == 1 ? '-' : '--';
        return prefix + alias;
      }).join(', ');
    }
    console.log(color('green', optionLine));
    console.log('  ' + info.description);
    if (info.default !== undefined) {
      console.log('  Default: ' + color('yellow', JSON.stringify(info.default)));
    }
    if (info.usage) {
      var formattedUsage = formatUsage(info.usage);
      console.log('  Usage:' + formattedUsage);
    }
    console.log();
  } else {
    console.error('Description for %s not found', option);
  }
}

function formatUsage(usage) {
  var formattedUsage = '';
  var cmd = getCmd();
  if (typeof usage == 'object') {
    Object.keys(usage).forEach(function(key) {
      formattedUsage += '\n    ' + cmd + ' ' + key + ' ' + color('grey', usage[key]);
    });
  } else if (typeof usage == 'string') {
    formattedUsage += '\n    ' + cmd + ' ' + usage;
  }
  return formattedUsage;
}

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
