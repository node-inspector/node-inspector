'use strict';

const co = require('co');
const fs = require('mz/fs');
const path = require('path');
const fork = require('child_process').fork;
const which = require('which');
const inspector = require('./inspector.js');

const promisify = require('bluebird').promisify;
const open = promisify(require('biased-opener'));


const WIN_CMD_LINK_MATCHER = /node  "%~dp0\\(.*?)"/;
const PREFERRED_BROWSERS = { preferredBrowsers : ['chrome', 'chromium', 'opera'] };

module.exports = function(config, Inspector) {
  return co(function * () {
    const argv = process.argv.slice(3);
    const inspectorOptions = Inspector.manifest.config.commands['inspector'].options;
    const inspectorConfig = new Inspector.Config(inspectorOptions, argv);

    const debug = yield inspector(Object.assign(inspectorConfig, config), Inspector);
    const app = yield startDebuggedProcess(config, argv, config._[0]);

    if (app && !config.cli) {
      try {
        yield open(debug.url, PREFERRED_BROWSERS);
      } catch (error) {
        // unable to launch one of preferred browsers for some reason
        console.warn(error.message);
        console.warn('Please open the URL manually in Chrome/Chromium/Opera or similar browser');
      }
    }

    return debug;
  });
};

function startDebuggedProcess(config, argv, script) {
  return co(function * () {
    const args = argv.splice(argv.indexOf(script) + 1);
    const debugOption = `--debug${config.debugBrk ? '-brk' : ''}=${config.debugPort}`;
    const execArgs = config.nodejs.concat(debugOption);

    script = path.resolve(process.cwd(), script);

    const exists = yield fs.exists(script);
    if (!exists) {
      script = yield which(script);
      script = checkWinCmdFiles(script);
    }

    const debuggedProcess = fork(script, args, { execArgv: execArgs });
    console.log('Debugging `%s`\n', script);

    return debuggedProcess;
  });
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
