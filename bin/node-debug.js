#!/usr/bin/env node

'use strict';

var Config = require('../lib/config');
var fork = require('child_process').fork;
var fs = require('fs');
var path = require('path');
var util = require('util');
var co = require('co');
var promisify = require('bluebird').promisify;
var open = promisify(require('biased-opener'));
var whichSync = require('which').sync;
var inspector = require('..');

var WIN_CMD_LINK_MATCHER = /node  "%~dp0\\(.*?)"/;
var NODE_DEBUG_MODE = true;

module.exports = main;
module.exports.createConfig = createConfig;

if (require.main == module) {
  main();
}

//-- Implementation --

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
  const config = createConfig(process.argv.slice(2));

  if (config.options.help) {
    config.options.showHelp(NODE_DEBUG_MODE);
    process.exit();
  }

  if (config.options.version) {
    config.options.showVersion();
    process.exit();
  }

  process.on('SIGINT', () => {
    process.exit();
  });

  co(function * () {

    yield startInspector(config.inspector);
    yield startDebuggedProcess(config.subproc);

    const url = inspector.buildInspectorUrl(config.inspector.host, config.inspector.port, config.subproc.debugPort);

    console.log('Node Inspector is now available from %s', url);
    if (config.printScript) {
      console.log('Debugging `%s`\n', config.subproc.script);
    }

    if (!config.options.cli) {
      // try to launch the URL in one of those browsers in the defined order
      // (but if one of them is default browser, then it takes priority)
      open(url, { preferredBrowsers : ['chrome', 'chromium', 'opera'] }).catch(err => {
        // unable to launch one of preferred browsers for some reason
        console.warn(err.message);
        console.warn('Please open the URL manually in Chrome/Chromium/Opera or similar browser');
      });
    }

  }).catch(err => {

    let reason = err.message || err.code || err;
    if (err.code === 'EADDRINUSE') {
      reason += `\nThere is another process already listening at ${config.inspector.host}:${config.inspector.port}.`;
      reason += `\nRun '${getCmd()} -p {port}' to use a different port.`;
    }
    console.error(util.format('Cannot start Node Inspector:', reason));

  });
}

function startInspector (config) {
  return new Promise((resolve, reject) => {
    const inspectorProcess = fork(require.resolve('./inspector'), config.args, { silent: true });

    inspectorProcess.once('message', msg => {
      switch (msg.event) {
      case 'SERVER.LISTENING':
        return resolve(msg.address);
      case 'SERVER.ERROR':
        return reject(msg.error);
      default:
        console.warn('Unknown Node Inspector event: %s', msg.event);
        return resolve({ address: config.host, port: config.port });
      }
    });

    process.on('exit', () => inspectorProcess.kill());
    inspectorProcess.on('exit', () => process.exit());
  });
}

function startDebuggedProcess(config) {
  return Promise.resolve().then(() => {
    let script = path.resolve(process.cwd(), config.script);

    if (!fs.existsSync(script)) {
      script = whichSync(config.script);
      script = checkWinCmdFiles(script);
    }

    const debuggedProcess = fork(script, config.args, { execArgv: config.execArgs });

    process.on('exit', () => debuggedProcess.kill());
    debuggedProcess.on('exit', () => process.exit());
  });
}

function getCmd() {
  return process.env.CMD || path.basename(process.argv[1]);
}

function checkWinCmdFiles(script) {
  if (process.platform === 'win32' && path.extname(script).toLowerCase() === '.cmd') {
    const cmdContent = fs.readFileSync(script, 'utf-8');
    const link = (WIN_CMD_LINK_MATCHER.exec(cmdContent) || [])[1];
    if (link) {
      return path.resolve(path.dirname(script), link);
    }
  }
  return script;
}

function createConfig(argv) {
  const options = new Config(argv, NODE_DEBUG_MODE);
  const script = options._[0] || require.resolve('./run-repl');
  const printScript = !!options._[0];

  let subprocArgs = [];

  if (printScript) {
    // We want to pass along subarguments, but re-parse our arguments.
    subprocArgs = argv.splice(argv.indexOf(script) + 1);
  } else {
    process.env.CMD = process.env.CMD || process.argv[1];
  }

  const inspectorArgs = Config.serializeOptions(
    Config.filterDefaultValues(
      Config.filterNodeDebugOptions(options)
    ), { _: true, $0: true }
  );

  let subprocDebugOption = `--debug=${options.debugPort}`;
  if (options.debugBrk) {
    subprocDebugOption = `--debug-brk=${options.debugPort}`;
  }

  const subprocExecArgs = options.nodejs.concat(subprocDebugOption);

  return {
    printScript: printScript,
    options: options,
    subproc: {
      script: script,
      args: subprocArgs,
      execArgs: subprocExecArgs,
      debugPort: options.debugPort
    },
    inspector: {
      host: options.webHost,
      port: options.webPort,
      args: inspectorArgs
    }
  };
}
