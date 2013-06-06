var fs = require('fs');
var MODULE_WRAP = /^\(function \(exports, require, module, __filename, __dirname\) \{ ([\s\S]*)\n\}\);$/;

/**
 * @constructor
 */
function ScriptFileStorage() {
}

var $class = ScriptFileStorage.prototype;

$class.save = function(path, content, callback) {
  var match = MODULE_WRAP.exec(content);
  if (!match) {
    callback(new Error('The new content is not a valid node.js script.'));
    return;
  }
  var newSource = match[1];
  fs.writeFile(path, newSource, function(err) {
    callback(err);
  });
};

exports.ScriptFileStorage = ScriptFileStorage;
