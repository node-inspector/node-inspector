/* jshint evil:true, node:true */
/* global InspectorBackendClass, self:true, window:true */
var fs = require('fs'),
    extendProtocolBy = require('./extend-protocol'),
    extendModulesBy = require('./extend-modules'),
    overrides = require('../front-end-node/protocol.json'),
    injections = require('../front-end-node/injections-inspector.json');

var protocol = extendProtocolBy(overrides);
var modules = extendModulesBy(injections);

modules = toGoogleFormattedJson(modules);

self = window = global;
eval(fs.readFileSync('./front-end/common/WebInspector.js', 'utf8'));
eval(fs.readFileSync('./front-end/common/Object.js', 'utf8'));
eval(fs.readFileSync('./front-end/platform/utilities.js', 'utf8'));
eval(fs.readFileSync('./front-end/sdk/InspectorBackend.js', 'utf8'));

var commands = InspectorBackendClass._generateCommands(protocol);
var header = '// Auto-generated.\n' +
             '// Run `node tools/generate-front-end.js` to update.\n' +
             '\n';

fs.writeFileSync('./front-end-node/inspector.json', modules);
fs.writeFileSync('./front-end/InspectorBackendCommands.js', header + commands);
fs.writeFileSync('./front-end/SupportedCSSProperties.js', '{}');

function toGoogleFormattedJson(modules) {
  var string = JSON.stringify(modules);
  return string
          .replace(/{/g, '\n    {')
          .replace(/}/g, ' }')
          .replace(/(".*?"):(".*?")/g, ' $1: $2')
          .replace(/]/g, '\n]\n');
}