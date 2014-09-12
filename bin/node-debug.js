#!/usr/bin/env node

var Config = require('../lib/config');
var fork = require('child_process').fork;
var fs = require('fs');
var path = require('path');
var util = require('util');
var open = require('opener');
var whichSync = require('which').sync;
var inspector = require('..');

var WIN_CMD_LINK_MATCHER = /node  "%~dp0\\(.*?)"/;
var NODE_DEBUG_MODE = true;

module.exports = main;
module.exports.createConfig = createConfig;

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
  config = createConfig(process.argv.slice(2));

  if (config.options.help) {
    config.options.showHelp(NODE_DEBUG_MODE);
    process.exit();
  }

  if (config.options.version) {
    config.options.showVersion();
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

function createConfig(argv) {
  var options = new Config(argv, NODE_DEBUG_MODE);
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

  var inspectorArgs = Config.serializeOptions(
    Config.filterDefaultValues(
      Config.filterNodeDebugOptions(options)),
    {_: true, $0: true });

  var subprocDebugOption = (options.debugBrk ? '--debug-brk' : '--debug') + '=' + options.debugPort;
  var subprocExecArgs = options.nodejs.concat(subprocDebugOption);

  return {
    printScript: printScript,
    options: options,
    subproc: {
      script: script,
      args: subprocArgs,
      execArgs:  subprocExecArgs,
      debugPort: options.debugPort
    },
    inspector: {
      host: options.webHost,
      port: options.webPort,
      args: inspectorArgs
    }
  };
}

function getCmd() {
  return process.env.CMD || path.basename(process.argv[1]);
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
          address: config.inspector.host,
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
    reason += '\nThere is another process already listening at ' +
      config.inspector.host + ':' +
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
    config.inspector.host,
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
