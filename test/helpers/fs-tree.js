'use strict';

var co = require('co');
var fs = require('fs-extra');
var promisify = require('bluebird').promisify;

var mkdir = promisify(fs.mkdir);
var writeFile = promisify(fs.writeFile);

module.exports = function tree(name, root) {
  var folders = [[name, root]];
  return co(function * () {
    while (folders.length) yield _tree.apply(null, folders.pop());
  });

  function _tree(name, node) {
    return co(function * () {
      yield mkdir(name);
      yield Object.keys(node).map(key => {
        if (node[key] === true) return writeFile(`${name}/${key}`, '', 'utf-8');
        if (typeof node[key] === 'object') folders.push([`${name}/${key}`, node[key]]);
      });
    });
  }
};
