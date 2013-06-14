var fs = require('fs');
var path = require('path');
var async = require('async');
var glob = require('glob');

var MODULE_HEADER = '(function (exports, require, module, __filename, __dirname) { ';
var MODULE_TRAILER = '\n});';
var MODULE_WRAP_REGEX = new RegExp(
  '^' + escapeRegex(MODULE_HEADER) +
    '([\\s\\S]*)' +
    escapeRegex(MODULE_TRAILER) + '$'
);

function escapeRegex(str) {
  return str.replace(/([/\\.?*()^${}|[\]])/g, '\\$1');
}

/**
 * @constructor
 */
function ScriptFileStorage() {
}

var $class = ScriptFileStorage.prototype;

$class.save = function(path, content, callback) {
  var match = MODULE_WRAP_REGEX.exec(content);
  if (!match) {
    callback(new Error('The new content is not a valid node.js script.'));
    return;
  }
  var newSource = match[1];
  fs.writeFile(path, newSource, function(err) {
    callback(err);
  });
};

/**
 * @param {string} path
 * @param {function(Object, string)} callback
 */
$class.load = function(path, callback) {
  fs.readFile(
    path,
    { encoding: 'utf-8' },
    function(err, content) {
      if (err) return callback(err);
      var source = MODULE_HEADER + content + MODULE_TRAILER;
      return callback(null, source);
    }
  );
};

/**
 * @param {string} mainScriptFile
 * @param {function(Object, string)} callback
 * @this {ScriptFileStorage}
 */
$class.findApplicationRoot = function(mainScriptFile, callback) {
  fs.realpath(mainScriptFile, function(err, realPath) {
    if (err) {
      console.log('Cannot resolve real path of %s: %s', mainScriptFile, err);
      realPath = mainScriptFile;
    }
    this._findApplicationRootForRealFile(realPath, callback);
  }.bind(this));
};

/**
 * @param {string} file
 * @param {function(Object, string)} callback
 * @this {ScriptFileStorage}
 */
$class._findApplicationRootForRealFile = function(file, callback) {
  var mainDir = path.dirname(file);
  var parentDir = path.dirname(mainDir);
  async.detect(
    [mainDir, parentDir],
    this._isApplicationRoot.bind(this),
    function(result) {
      callback(null, result || mainDir);
    }
  );
};

/**
 * @param {string} folder
 * @param {function(boolean)} callback
 */
$class._isApplicationRoot = function(folder, callback) {
  async.any(
    ['lib', 'node_modules'],
    function(f, cb) {
      fs.exists(path.join(folder, f), cb);
    },
    callback
  );
};

/**
 * @param {string} rootFolder
 * @param {function(Object, Array.<string>)} callback
 */
$class.listScripts = function(rootFolder, callback) {
  glob(
    '/**/*.js',
    { root: rootFolder },
    callback
  );
};

/**
 * @param {string} mainScriptFile
 * @param {function(Object, Array.<string>)} callback
 * @this {ScriptFileStorage}
 */
$class.findAllApplicationScripts = function(mainScriptFile, callback) {
  async.waterfall(
    [
      this.findApplicationRoot.bind(this, mainScriptFile),
      this.listScripts.bind(this)
    ],
    callback
  );
};

exports.ScriptFileStorage = ScriptFileStorage;
