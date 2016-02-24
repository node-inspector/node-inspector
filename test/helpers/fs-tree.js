'use strict';

var co = require('co');
var fs = require('mz/fs');

module.exports = function tree(name, root) {
  var folders = [[name, root]];
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
