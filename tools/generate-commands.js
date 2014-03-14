/* jshint evil:true */
/* global InspectorBackendClass */
var fs = require('fs'),
    protocol = require('./protocol.json');


eval(fs.readFileSync('./front-end/utilities.js', 'utf8'));
eval(fs.readFileSync('./front-end/InspectorBackend.js', 'utf8'));

var commands = InspectorBackendClass._generateCommands(protocol);
var header = '// Auto-generated.\n' +
             '// Run `node tools/generate-commands.js` to update.\n' +
             '\n';

fs.writeFileSync('./front-end/InspectorBackendCommands.js', header + commands);

