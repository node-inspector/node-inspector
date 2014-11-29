/* jshint evil:true */
/* global InspectorBackendClass */
var fs = require('fs'),
    protocol = require('./protocol.json');

self = window = global;
eval(fs.readFileSync('./front-end/common/WebInspector.js', 'utf8'));
eval(fs.readFileSync('./front-end/common/Object.js', 'utf8'));
eval(fs.readFileSync('./front-end/platform/utilities.js', 'utf8'));
eval(fs.readFileSync('./front-end/sdk/InspectorBackend.js', 'utf8'));

var commands = InspectorBackendClass._generateCommands(protocol);
var header = '// Auto-generated.\n' +
             '// Run `node tools/generate-commands.js` to update.\n' +
             '\n';

fs.writeFileSync('./front-end/InspectorBackendCommands.js', header + commands);
fs.writeFileSync('./front-end/SupportedCSSProperties.js', '{}');

