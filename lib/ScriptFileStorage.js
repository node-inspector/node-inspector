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
 * @param {Object} config
 * @constructor
 */
function ScriptFileStorage(config) {
  config = config || {}
  this._isHidden = config.isScriptHidden || function() { return false; };
  this._noPreload = config.noPreload;
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
 * For a given script file, find the root directory containing all application
 * source files.
 *
 * Example:
 *   file = ~/work/app/bin/cli.js
 *   root = ~/work/app
 *
 * The algorithm:
 *
 * By default, we assume that the source file is in the root directory
 * (~/work/app/bin in the example above).
 *
 * If this directory does not contain 'package.json' and the parent directory
 * contains 'package.json', then we assume the parent directory is
 * the application root (~/work/app in the example above).
 *
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
  fs.exists(path.join(folder, 'package.json'), callback);
};

/**
 * @param {string} rootFolder
 * @param {function(Object, Array.<string>?)} callback
 */
$class.listScripts = function(rootFolder, callback) {
  // This simpler solution unfortunately does not work on windows
  // see https://github.com/isaacs/node-glob/pull/68
  // glob(
  //   '**/*.js',
  //   { root: rootFolder },
  //    callback
  // );

  glob(
     '**/*.js',
     { cwd: rootFolder },
    function(err, result) {
      if (err) return callback(err);
      result = result.map(function(relativeUnixPath) {
        var relativePath = relativeUnixPath.split('/').join(path.sep);
        return path.join(rootFolder, relativePath);
      });
      callback(null, result);
    }
  );
};

$class._findScriptsOfRunningApp = function(mainScriptFile, callback) {
  if (!mainScriptFile) {
    // mainScriptFile is null when running in the REPL mode
    return process.nextTick(callback.bind(null, null, []));
  }

  async.waterfall(
    [
      this.findApplicationRoot.bind(this, mainScriptFile),
      this.listScripts.bind(this)
    ],
    callback
  );
};

$class._findScriptsOfStartDirectoryApp = function(startDirectory, callback) {
  this._isApplicationRoot(
    startDirectory,
    function handleIsStartDirectoryApplicationRoot(result) {
      if (!result) {
        callback(null, []);
      } else {
        this.listScripts(startDirectory, callback);
      }
    }.bind(this)
  );
};

/**
 * @param {string} startDirectory
 * @param {string} mainScriptFile
 * @param {function(Object, Array.<string>)} callback
 * @this {ScriptFileStorage}
 */
$class.findAllApplicationScripts = function(startDirectory, mainScriptFile, callback) {
  if (this._noPreload) {
    return process.nextTick(function() { callback(null, []); });
  }
  async.series(
    [
      this._findScriptsOfRunningApp.bind(this, mainScriptFile),
      this._findScriptsOfStartDirectoryApp.bind(this, startDirectory)
    ],
    function(err, results) {
      if (err) return callback(err);

      var files = results[0].concat(results[1]);
      // filter out duplicates and files to hide
      files = files.filter(function(elem, ix, arr) {
        return arr.indexOf(elem) >= ix && !this._isHidden(elem);
      }.bind(this));

      return callback(null, files);
    }.bind(this)
  );
};

exports.ScriptFileStorage = ScriptFileStorage;
