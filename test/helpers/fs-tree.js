'use strict';

var co = require('co');
var fs = require('mz/fs');
var path = require('path');
var rimraf = require('rimraf');

var TEMP_DIR = path.join(__dirname, 'work');

var rmrf = (dir) => new Promise((resolve, reject) =>
                    rimraf(dir, (error, result) =>
                    (error ? reject(error) : resolve(result))));

module.exports = function tree(root) {
  var folders = [[TEMP_DIR, root]];
  return co(function * () {
    while (folders.length) yield _tree.apply(null, folders.pop());
  });

  function _tree(name, node) {
    return co(function * () {
      yield fs.mkdir(name);
      yield Object.keys(node).map(key => {
        if (node[key] === true) return fs.writeFile(`${name}/${key}`, '', 'utf-8');
        if (typeof node[key] === 'object') folders.push([`${name}/${key}`, node[key]]);
      });
    });
  }
};

module.exports.clear = function() {
  return co(function * () {
    if (yield fs.exists(TEMP_DIR))
      yield rmrf(TEMP_DIR);
  });
};

module.exports.dir = TEMP_DIR;
