/* jshint evil:true, node:true */
/* global InspectorBackendClass, self:true, window:true */
var fs = require('fs'),
    extendModulesBy = require('./extend-modules'),
    injections = require('../front-end-node/injections-inspector.json');

var modules = extendModulesBy(injections);

modules = toGoogleFormattedJson(modules);

fs.writeFileSync('./front-end-node/inspector.json', modules);
fs.writeFileSync('./front-end/SupportedCSSProperties.js', '{}');

function toGoogleFormattedJson(modules) {
  var string = JSON.stringify(modules);
  return string
          .replace(/{/g, '\n    {')
          .replace(/}/g, ' }')
          .replace(/(".*?"):(".*?")/g, ' $1: $2')
          .replace(/]/g, '\n]\n');
}