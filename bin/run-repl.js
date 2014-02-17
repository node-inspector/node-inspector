// Load the module contained in the current directory (cwd) and start REPL
// NOTE: Calls process.exit() after REPL was closed

var Module = require('module');
var path = require('path');
var repl = require('repl');
var util = require('util');

var location = process.cwd();

var moduleToDebug;
var sampleLine;
var prompt;

try {
  loadAndDescribeModuleInCwd();
} catch (e) {
  sampleLine = util.format(
    'The module in the current directory was not loaded: %s.',
    e.message || e
  );
}

startRepl();

//---- Implementation ----

function loadAndDescribeModuleInCwd() {
// Hack: Trick node into changing process.mainScript to moduleToDebug
  moduleToDebug = Module._load(location, module, true);

  var sample = getSampleCommand();
  sampleLine = util.format('You can access your module as `m`%s.', sample);

  prompt = getModuleName() + '> ';
}

function startRepl() {
  var cmd = process.env.CMD || process.argv[1];

  console.log(
    '\nStarting the interactive shell (REPL). Type `.help` for help.\n' +
      '%s\n' +
      'Didn\'t want to start REPL? Run `%s .` instead.',
    sampleLine,
    cmd
  );

  var r = repl.start( { prompt: prompt });
  if (moduleToDebug !== undefined)
    r.context.m = moduleToDebug;
  r.on('exit', onReplExit);
}

function onReplExit() {
  console.log('\nLeaving the interactive shell (REPL).');
  process.exit();
}

function getModuleName() {
  try {
    var packageJson = require(path.join(location, 'package.json'));
    if (packageJson.name)
      return packageJson.name;
  } catch (e) {
    // ignore missing package.json
  }

  return path.basename(location);
}

function getSampleCommand() {
  var exportedSymbols = Object.keys(moduleToDebug);
  if (!exportedSymbols.length) return '';

  var sample = exportedSymbols[0];
  if (typeof(moduleToDebug[sample]) === 'function')
    sample += '()';

  return ', e.g. `m.' + sample + '`';
}
