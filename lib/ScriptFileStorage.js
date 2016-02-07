var co = require('co');
var fs = require('fs');
var path = require('path');
var promisify = require('bluebird').promisify;
var debug = require('debug')('node-inspector:ScriptFileStorage');

var stat = promisify(fs.stat);
var readdir = promisify(fs.readdir);
var exists = path => new Promise(resolve => fs.exists(path, resolve));
var realpath = promisify(fs.realpath);
var readFile = promisify(fs.readFile);
var writeFile = promisify(fs.writeFile);

var MODULE_HEADER = '(function (exports, require, module, __filename, __dirname) { ';
var MODULE_TRAILER = '\n});';
var MODULE_WRAP_REGEX = new RegExp(
  '^' + escapeRegex(MODULE_HEADER) +
    '([\\s\\S]*)' +
    escapeRegex(MODULE_TRAILER) + '$'
);

var CONVENTIONAL_DIRS_PATTERN = [
  /^[^\/]*\.js$/,
  /^lib\/[\s\S]*\.js$/,
  /^test\/[\s\S]*\.js$/,
  /^node_modules\/[\s\S]*\.js$/
];
var ALL_JS_PATTERN = [
  /^[\s\S]*\.js$/
];

function escapeRegex(str) {
  return str.replace(/([/\\.?*()^${}|[\]])/g, '\\$1');
}

/**
 * @param {{preload}} config
 * @param {ScriptManager} scriptManager
 * @constructor
 */
function ScriptFileStorage(config, session) {
  config = config || {};
  this._hidden = config.hidden || [];
  this._lists = {};
  this._scriptManager = session.scriptManager;
  this._noPreload = config.preload === false;
}

/**
 * @param {string} path
 * @param {string} content
 */
ScriptFileStorage.prototype.save = function(path, content) {
  return co(function * () {
    var match = MODULE_WRAP_REGEX.exec(content);

    if (!match)
      return Promise.reject(new Error('The new content is not a valid node.js script.'));

    var newSource = match[1];
    var oldContent = yield readFile(path, 'utf-8');
    var match = /^(\#\!.*)/.exec(oldContent);
    if (match)
      newSource = match[1] + newSource;

    yield writeFile(path, newSource);
  }.bind(this));
};

/**
 * @param {string} path
 */
ScriptFileStorage.prototype.load = function(path) {
  return co(function * () {
    var scriptId = this._scriptManager.findScriptIdByPath(path);

    // If requested source was loaded in app (scriptId != null), we can't expect that it is equal
    // to the file with requested name stored in fs.
    // So, if requested source was loaded in app, we need to require it from app.
    if (scriptId != null)
      return yield this._scriptManager.getScriptSourceById(scriptId);

    var content = yield readFile(path, 'utf-8');

    // remove shebang
    content = content.replace(/^\#\!.*/, '');

    return MODULE_HEADER + content + MODULE_TRAILER;
  }.bind(this));
};

/**
 * @param {string} mainScriptFile
 */
ScriptFileStorage.prototype.findApplicationRoot = function(mainScriptFile) {
  return co(function * () {
    var realPath
    try {
      realPath = yield realpath(mainScriptFile);
    } catch (e) {
      console.log('Cannot resolve real path of %s: %s', mainScriptFile, e);
      realPath = mainScriptFile;
    }

    return yield this._findApplicationRootForRealFile(realPath);
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
 * @this {ScriptFileStorage}
 */
ScriptFileStorage.prototype._findApplicationRootForRealFile = function(file) {
  return co(function * () {
    var mainDir = path.dirname(file);
    var parentDir = path.dirname(mainDir);

    for (var dir of [mainDir, parentDir]) {
      var isAppRoot = yield this._isApplicationRoot(dir);
      if (isAppRoot) return dir;
    }
  }.bind(this));
};

/**
 * @param {string} folder
 * @param {function(boolean)} callback
 */
ScriptFileStorage.prototype._isApplicationRoot = function(dir) {
  return co(function * () {
    return yield exists(path.join(dir, 'package.json'));
  });
};

/**
 * @param {string} rootFolder
 * @param {string} include
 * @param {function(Object, Array.<string>?)} callback
 */
ScriptFileStorage.prototype.list = function(rootFolder, include) {
  if (this._lists[rootFolder] instanceof Promise) return this._lists[rootFolder];

  return this._lists[rootFolder] = co(function * () {
    debug('glob %s on %s', include, rootFolder);

    var exclude = this._hidden;
    var result = yield list(rootFolder, include, exclude);

    debug('glob returned %s files', result.length);

    return result;
  }.bind(this));
};

ScriptFileStorage.prototype._findScriptsOfRunningApp = function(mainScriptFile) {
  return co(function * () {
    // mainScriptFile is null when running in the REPL mode
    if (!mainScriptFile) return [];

    var rootDir = yield this.findApplicationRoot(mainScriptFile);

    var include = rootDir ? ALL_JS_PATTERN : CONVENTIONAL_DIRS_PATTERN;
    rootDir = rootDir || path.dirname(mainScriptFile);

    return yield this.list(rootDir, include);
  }.bind(this));
};

ScriptFileStorage.prototype._findScriptsOfStartDirectoryApp = function(startDirectory, mainScriptFile) {
  return co(function * () {
    var isAppRoot = yield this._isApplicationRoot(startDirectory);
    var isEqualToRunningApp = startDirectory === path.dirname(mainScriptFile);
    if (!isAppRoot || isEqualToRunningApp) return [];

    return yield this.list(startDirectory, ALL_JS_PATTERN);
  }.bind(this));
};

/**
 * @param {string} startDirectory
 * @param {string} mainScriptFile
 * @this {ScriptFileStorage}
 */
ScriptFileStorage.prototype.findAllApplicationScripts = function(startDirectory, mainScriptFile) {
  return co(function * () {
    if (this._noPreload) return [];

    var lists = yield [
      this._findScriptsOfRunningApp(mainScriptFile),
      this._findScriptsOfStartDirectoryApp(startDirectory, mainScriptFile)
    ];

    var files = Array.prototype.concat.apply([], lists);
    // filter out duplicates and files to hide
    files = Object.keys(files.reduce((result, script) => {
      if (result[script]) return result;

      result[script] = true;
      return result;
    }, {}));

    debug('findAllApplicationScripts returned %s files', files.length);

    return files;
  }.bind(this));
};

function list(root, include, exclude) {
  include = include || [];
  exclude = exclude || [];
  var included = (rpath) => include.some(rx => rx.test(rpath));
  var excluded = (rpath) => exclude.some(rx => rx.test(rpath));
  var relative = (apath) => path.relative(root, apath);
  var folders = [root];
  var cache = {};
  var list = [];

  return co(function * () {
    while (folders.length) yield _list(folders.pop());
    return list;
  });

  function _list(node) {
    return co(function * () {
      try {
        var paths = yield readdir(node);
      } catch (e) {
        console.warn(`Access to ${node} from ResourceTree denied. (${e})`);
        return;
      }

      yield paths.map(child => co(function * () {
        const apath = path.join(node, child);
        const rpath = relative(apath);

        if (cache[apath] || excluded(rpath)) return;
        cache[apath] = true;

        try {
          const pstat = yield stat(apath);
        } catch (e) {
          console.warn(`Access to ${apath} from ResourceTree denied. (${e})`);
          return;
        }

        if (pstat.isDirectory()) folders.push(apath);
        if (pstat.isFile() && included(rpath)) list.push(apath);
      }));
    });
  }
}

module.exports = ScriptFileStorage;
module.exports.ScriptFileStorage = ScriptFileStorage;
