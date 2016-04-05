

var definitions = {
  'help': {
    alias: 'h',
    description: 'Display information about avaible options.',
    usage: {
      '--help': '           display short list of avaible options',
      '--help <option>': '  display quick help on <option>',
      '--help -l': '        display full usage info'
    },
    _isNodeInspectorOption: true,
    _isNodeDebugOption: true,
    default: false
  }
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
