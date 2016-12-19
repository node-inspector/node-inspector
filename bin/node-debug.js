#!/usr/bin/env node

var fork = require('child_process').fork;
var fs = require('fs');
var path = require('path');
var util = require('util');
var open = require('opener');
var yargs = require('yargs');
var whichSync = require('which').sync;
var inspector = require('..');

var WIN_CMD_LINK_MATCHER = /node  "%~dp0\\(.*?)"/;

var argvOptions = {
  'debug-brk': {
    alias: 'b',
    default: true,
    description: 'Break on the first line (`node --debug-brk`)'
  },
  'web-port': {
    alias: ['p', 'port'],
    type: 'number',
    description: 'Node Inspector port (`node-inspector --web-port={port}`)'
  },
  'debug-port': {
    alias: 'd',
    type: 'number',
    description: 'Node/V8 debugger port (`node --debug={port}`)'
  },
  nodejs: {
    type: 'string',
    description: 'Pass NodeJS options to debugged process (`node --option={value}`)\n' +
                  'Usage example:  node-debug --nodejs --harmony --nodejs --random_seed=2 app'
  },
  cli: {
    alias: 'c',
    type: 'boolean',
    description: 'CLI mode, do not open browser.'
  },
  version: {
    alias: 'v',
    type: 'boolean',
    description: 'Print Node Inspector\'s version.'
  },
  help: {
    alias: 'h',
    type: 'boolean',
    description: 'Show this help.'
  }
};

var argvParser = createYargs();

module.exports = main;
module.exports.parseArgs = parseArgs;

if (require.main == module)
  main();

//-- Implementation --

var config;

/**
 * By default:
 *
 * 1. Runs node-inspector.
 * 2. Runs the supplied script in debug mode
 * 3. Opens the user's browser, pointing it at the inspector.
 *
 * NOTE: Finishes with a call to process.exit() when running without arguments
 * or when an error occured.
 */
function main() {
  config = parseArgs(process.argv);
  if (config.options.help) {
    argvParser.showHelp(console.log);
    console.log('The [script] argument is resolved relative to the current working\n' +
      'directory. If no such file exists, then env.PATH is searched.\n');
    console.log('The default mode is to break on the first line of the script, to run\n' +
      'immediately on start use `--no-debug-brk` or press the Resume button.\n');
    console.log('When there is no script specified, the module in the current working\n' +
      'directory is loaded in the REPL session as `m`. This allows you to call\n' +
      'and debug arbitrary functions exported by the current module.\n');
    process.exit();
  }

  if (config.options.version) {
    console.log('v' + require('../package.json').version);
    process.exit();
  }

  startInspector(function(err) {
    if (err) {
      console.error(formatNodeInspectorError(err));
      process.exit(1);
    }

    startDebuggedProcess(function(err) {
      if (err) {
        console.error(
          'Cannot start %s: %s',
          config.subproc.script,
          err.message || err
        );
        process.exit(2);
      }

      openBrowserAndPrintInfo();
    });
  });
}

function parseArgs(argv) {
  argv = argv.slice(2);

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
  var printScript = true;

  var subprocArgs;

  if (script) {
    // We want to pass along subarguments, but re-parse our arguments.
    subprocArgs = argv.splice(argv.indexOf(script) + 1);
  } else {
    script = require.resolve('./run-repl');
    subprocArgs = [];
    printScript = false;
    process.env.CMD = process.env.CMD || process.argv[1];
  }

  options = argvParser.parse(argv);

  var subprocPort = options['debug-port'] || 5858;
  var subprocExecArgs = ['--debug=' + subprocPort].concat(nodejsArgs);

  if (options['debug-brk']) {
    subprocExecArgs.push('--debug-brk');
  }

  var inspectorPort = options['web-port'] || 8080;
  var inspectorArgs = extractPassThroughArgs(options, argvOptions)
    .concat(['--web-port=' + inspectorPort]);

  return {
    printScript: printScript,
    options: options,
    subproc: {
      script: script,
      args: subprocArgs,
      execArgs:  subprocExecArgs,
      debugPort: subprocPort
    },
    inspector: {
      port: inspectorPort,
      args: inspectorArgs
    }
  };
}

function createYargs() {
  var y = yargs
    .options(argvOptions)
    .usage('Usage:\n' +
      '    $0 [node-inspector-options] [options] script [script-arguments]');
  y.$0 = getCmd();
  return y;
}

function getCmd() {
  return process.env.CMD || path.basename(process.argv[1]);
}

function extractPassThroughArgs(options, argvOptions) {
  var result = [];
  var optionsToSkip = { _: true, $0: true };

  // Skip options handled by node-debug
  Object.keys(argvOptions).forEach(function(key) {
    optionsToSkip[key] = true;
    var alias = argvOptions[key].alias;
    if (Array.isArray(alias)) {
      alias.forEach(function(opt) { optionsToSkip[opt] = true; });
    } else if (alias) {
      optionsToSkip[alias] = true;
    }
  });

  // Filter options not handled by node-debug
  Object.keys(options).forEach(function(key) {
    //Filter options handled by node-debug
    if (optionsToSkip[key]) return;
    //Filter camelKey options created by yargs
    if (/[A-Z]/.test(key)) return;

    var value = options[key];
    if (value === undefined) return;
    if (value === true) {
      result.push('--' + key);
    } else if (value === false) {
      result.push('--no-' + key);
    } else {
      result.push('--' + key);
      result.push(value);
    }
  });

  return result;
}

function startInspector(callback) {
  var inspectorProcess = fork(
    require.resolve('./inspector'),
    config.inspector.args,
    { silent: true }
  );

  inspectorProcess.once('message', function(msg) {
    switch (msg.event) {
    case 'SERVER.LISTENING':
      return callback(null, msg.address);
    case 'SERVER.ERROR':
      return callback(msg.error);
    default:
      console.warn('Unknown Node Inspector event: %s', msg.event);
      return callback(
        null,
        {
          address: 'localhost',
          port: config.inspector.port
        }
      );
    }
  });

  process.on('exit', function() {
    inspectorProcess.kill();
  });
}

function formatNodeInspectorError(err) {
  var reason = err.message || err.code || err;
  if (err.code === 'EADDRINUSE') {
    reason += '\nThere is another process already listening at 0.0.0.0:' +
      config.inspector.port + '.\n' +
      'Run `' + getCmd() + ' -p {port}` to use a different port.';
  }

  return util.format('Cannot start Node Inspector:', reason);
}

function startDebuggedProcess(callback) {
  var script = path.resolve(process.cwd(), config.subproc.script);
  if (!fs.existsSync(script)) {
    try {
      script = whichSync(config.subproc.script);
      script = checkWinCmdFiles(script);
    } catch (err) {
      return  callback(err);
    }
  }

  var debuggedProcess = fork(
    script,
    config.subproc.args,
    {
      execArgv: config.subproc.execArgs
    }
  );
  debuggedProcess.on('exit', function() { process.exit(); });
  callback();
}

function checkWinCmdFiles(script) {
  if (process.platform == 'win32' && path.extname(script).toLowerCase() == '.cmd') {
    var cmdContent = '' + fs.readFileSync(script);
    var link = (WIN_CMD_LINK_MATCHER.exec(cmdContent) || [])[1];

    if (link) script = path.resolve(path.dirname(script), link);
  }
  return script;
}

function openBrowserAndPrintInfo() {
  var url = inspector.buildInspectorUrl(
    'localhost',
    config.inspector.port,
    config.subproc.debugPort
  );

  if (!config.options.cli) {
    open(url);
  }

  console.log('Node Inspector is now available from %s', url);
  if (config.printScript)
    console.log('Debugging `%s`\n', config.subproc.script);
}
