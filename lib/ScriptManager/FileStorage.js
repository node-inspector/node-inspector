'use strict';

const co = require('co');
const fs = require('mz/fs');
const path = require('path');

const dir = (_path) => path.dirname(_path);

const MODULE_HEADER = '(function (exports, require, module, __filename, __dirname) { ';
const MODULE_TRAILER = '\n});';

const ROOT_JS = /^[^\/]*\.js$/;
const CONVENTIONAL_DIRS = /^(lib|test|node_modules)\/[\s\S]*\.js$/;
const CONVENTIONAL_JS = [ROOT_JS, CONVENTIONAL_DIRS];
const ALL_JS = [/^[\s\S]*\.js$/];

class FileStorage {
  /**
   * @param {Config} config
   * @param {Session} session
   */
  constructor(config, session) {
    config = config || {};
    this._hidden = config.hidden || [];
    this._lists = {};
    this._preload = config.preload !== false;
  }

  /**
   * @param {string} path
   * @param {string} content
   */
  save(path, content) {
    return co(function * () {
      if (!content.startsWith(MODULE_HEADER) || !content.endsWith(MODULE_TRAILER))
        throw new Error('The new content is not a valid node.js script.');

      const oldContent = yield fs.readFile(path, 'utf-8');
      const shebang = /^(\#\!.*)/.exec(oldContent) || [];
      const newSource = (shebang[1] || '') +
        content.slice(MODULE_HEADER.length, -MODULE_TRAILER.length);

      yield fs.writeFile(path, newSource);
    }.bind(this));
  }

  /**
   * @param {string} path
   */
  load(path) {
    return co(function * () {
      let content = yield fs.readFile(path, 'utf-8');
      // remove shebang
      content = content.replace(/^\#\!.*/, '');

      return MODULE_HEADER + content + MODULE_TRAILER;
    }.bind(this));
  }

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
   * @param {String} path
   */
  root(path) {
    return co(function * () {
      try {
        const realPath = yield fs.realpath(path);
        path = realPath;
      } catch (e) {
        console.log('Cannot resolve real path of %s: %s', path, e);
      }

      const mainDir = dir(path);
      const parentDir = dir(mainDir);

      for (let dir of [mainDir, parentDir])
        if (yield isAppRoot(dir)) return dir;
    }.bind(this));
  }

  /**
   * Lists application scripts relative to main script file
   * Lists application scripts relative to start directory, if it exists
   *   (start directory contains package.json)
   * Merges lists
   *
   * @param {String} startDirectory
   * @param {String} mainScript
   * @returns {String[]} Merged list of all accessible absolute paths
   */
  list(startDirectory, mainScript) {
    return co(function * () {
      if (!this._preload) return [];

      const list = {};
      yield [
        this._findScriptsOfRunningApp(list, mainScript),
        this._findScriptsOfStartDirectoryApp(list, startDirectory, mainScript)
      ];

      return Object.keys(list);
    }.bind(this));
  }

  _fill(store, root, include, exclude) {
    if (this._lists[root]) return this._lists[root];

    return this._lists[root] = co(function * () {
      return yield list(root, include, exclude, store);
    }.bind(this));
  }

  _findScriptsOfRunningApp(list, mainScript) {
    return co(function * () {
      // mainScript is null when running in the REPL mode
      if (!mainScript) return [];

      const root = yield this.root(mainScript);
      const include = root ? ALL_JS : CONVENTIONAL_JS;

      return yield this._fill(list, root || dir(mainScript), include, this._hidden);
    }.bind(this));
  }

  _findScriptsOfStartDirectoryApp(list, startDirectory, mainScriptFile) {
    return co(function * () {
      const appRoot = yield isAppRoot(startDirectory);
      const equalToRunningApp = startDirectory === dir(mainScriptFile);
      if (!appRoot || equalToRunningApp) return [];

      return yield this._fill(list, startDirectory, ALL_JS, this._hidden);
    }.bind(this));
  }
}

function isAppRoot(dir) {
  return co(function * () {
    return yield fs.exists(path.join(dir, 'package.json'));
  });
}

function list(root, include, exclude, list) {
  list = list || {};
  include = include || [];
  exclude = exclude || [];
  const included = (rpath) => include.some(rx => rx.test(rpath));
  const excluded = (rpath) => exclude.some(rx => rx.test(rpath));
  const relative = (apath) => path.relative(root, apath);
  const folders = [root];
  const cache = {};

  return co(function * () {
    while (folders.length) yield _list(folders.pop());
    return list;
  });

  function _list(node) {
    return co(function * () {
      let paths
      try {
        paths = yield fs.readdir(node);
      } catch (e) {
        console.warn(`Access to ${node} from ResourceTree denied. (${e})`);
        return;
      }

      yield paths.map(child => co(function * () {
        const apath = path.join(node, child);
        const rpath = relative(apath);

        if (list[apath] || cache[apath] || excluded(rpath)) return;
        cache[apath] = true;

        try {
          const pstat = yield fs.stat(apath);
          if (pstat.isDirectory()) folders.push(apath);
          if (pstat.isFile() && included(rpath)) list[apath] = true;
        } catch (e) {
          console.warn(`Access to ${apath} from ResourceTree denied. (${e})`);
        }
      }));
    });
  }
}

module.exports = FileStorage;
