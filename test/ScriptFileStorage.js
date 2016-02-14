'use strict';

var co = require('co');
var fs = require('mz/fs');
var tree = require('./helpers/fs-tree');
var path = require('path');
var expect = require('chai').expect;
var rimraf = require('rimraf');
var launcher = require('./helpers/launcher.js');
var ScriptFileStorage = require('../lib/ScriptFileStorage.js');

var rmrf = (dir) => new Promise((resolve, reject) =>
                    rimraf(dir, (error, result) =>
                    error ? reject(error) : resolve(result)));
var relative = node => path.relative(TEMP_DIR, node);

var TEMP_FILE = path.join(__dirname, 'fixtures', 'temp.js');
var TEMP_DIR = path.join(__dirname, 'work');

var child;
var session;
var storage;
var originalScript;
var debuggerClient;
var runtimeScript;

function ScriptManagerStub() {
  this.find = () => null;
}

describe('ScriptFileStorage', function() {
  afterEach(() => deleteTemps());

  it('saves new content without node.js module wrapper', () => {
    return co(function * () {
      yield runLiveEdit();
      var storage = new ScriptFileStorage({}, session);
      yield storage.save(TEMP_FILE, edited(runtimeScript));
      var newScript = yield fs.readFile(TEMP_FILE, { encoding: 'utf-8' });
      expect(newScript).to.equal(edited(originalScript));
    });
  });

  it('preserves shebang when saving new content', () => {
    return co(function * () {
      yield runLiveEdit(content => `#!/usr/bin/node\n${content}`);
      var storage = new ScriptFileStorage({}, session);
      yield storage.save(TEMP_FILE, edited(runtimeScript));
      var newScript = yield fs.readFile(TEMP_FILE, { encoding: 'utf-8' });
      expect(newScript).to.equal(edited(originalScript));
    });
  });

  it('loads content with node.js module wrapper', () => {
    return co(function * () {
      yield fs.writeFile(TEMP_FILE, '/* content */');
      var storage = new ScriptFileStorage({}, session);
      var content = yield storage.load(TEMP_FILE)
      expect(content).to.match(
        /^\(function \(exports, require,.*\) \{ \/\* content \*\/\n\}\);$/);
    });
  });

  it('loads content without shebang', () => {
    return co(function * () {
      yield fs.writeFile(TEMP_FILE, '#!/usr/bin/env/node\n/* content */');
      var storage = new ScriptFileStorage({}, session);
      var content = yield storage.load(TEMP_FILE);
      expect(content).to.not.contain('#!');
      expect(content).to.contain('/* content */');
    });
  });

  it('finds application root for subdir/app.js by checking package.json file in parent', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        'subdir': {
          'app.js': true
        },
        'package.json': true
      });
      var storage = new ScriptFileStorage({}, session);
      var root = yield storage.findApplicationRoot(path.join(TEMP_DIR, 'subdir', 'app.js'));
      expect(root).to.equal(TEMP_DIR);
    });
  });

  it('finds application root for root/app.js with no package.json files around', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        'root': {
          'app.js': true
        }
      });
      var storage = new ScriptFileStorage({}, session);
      var root = yield storage.findApplicationRoot(path.join(TEMP_DIR, 'root', 'app.js'));
      expect(root).to.equal(undefined);
    });
  });

  it('finds application root for root/app.js by checking package.json file in root/', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        'root': {
          'app.js': true,
          'package.json': true,
        },
        'package.json': true
      });
      var storage = new ScriptFileStorage({}, session);
      var root = yield storage.findApplicationRoot(path.join(TEMP_DIR, 'root', 'app.js'));
      expect(root).to.equal(path.join(TEMP_DIR, 'root'));
    });
  });

  it('finds also files in start directory', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        // Globally installed module, e.g. mocha
        'global': {
          'runner.js': true,
          'package.json': true,
          'lib': {
            'module.js': true
          }
        },
        // Local application we are developing
        'local': {
          'app.js': true,
          'package.json': true,
          'test': {
            'app.js': true
          }
        },
        // Other files in a place close to globally installed modules
        'unrelated': {
          'file.js': true
        }
      });

      var expected = [
        'global/runner.js',
        'global/lib/module.js',
        'local/app.js',
        'local/test/app.js'
      ];

      var storage = new ScriptFileStorage({}, session);
      var files = yield storage.findAllApplicationScripts(
        path.join(TEMP_DIR, 'local'),
        path.join(TEMP_DIR, 'global', 'runner.js'));

      expect(files.map(relative)).to.have.members(expected);
    });
  });

  it('lists only well-known subdirectories when package.json is missing', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        'app.js': true,
        'root.js': true,
        'lib': {
          'helper.js': true
        },
        'test': {
          'unit.js': true
        },
        'node_modules': {
          'module': {
            'index.js': true
          }
        },
        'extra': {
          'file.js': true
        }
      });

      var expected = [
        'app.js',
        'root.js',
        'lib/helper.js',
        'test/unit.js',
        'node_modules/module/index.js'
      ];

      var storage = new ScriptFileStorage({}, session);
      var files = yield storage.findAllApplicationScripts(
        path.join(TEMP_DIR),
        path.join(TEMP_DIR, 'app.js'));

      expect(files.map(relative)).to.have.members(expected);
    });
  });

  it('lists all subdirectories when package.json is present', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        'app.js': true,
        'root.js': true,
        'lib': {
          'helper.js': true
        },
        'test': {
          'unit.js': true
        },
        'node_modules': {
          'module': {
            'index.js': true
          }
        },
        'extra': {
          'file.js': true
        },
        'package.json': true
      });

      var expected = [
        'app.js',
        'root.js',
        'lib/helper.js',
        'test/unit.js',
        'node_modules/module/index.js',
        'extra/file.js'
      ];

      var storage = new ScriptFileStorage({}, session);
      var files = yield storage.findAllApplicationScripts(
        path.join(TEMP_DIR),
        path.join(TEMP_DIR, 'app.js'));

      expect(files.map(relative)).to.have.members(expected);
    });
  });

  it('removes duplicate entries from files found', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        'app.js': true,
        'package.json': true
      });

      var expected = ['app.js'];

      var storage = new ScriptFileStorage({}, session);
      var files = yield storage.findAllApplicationScripts(
        path.join(TEMP_DIR),
        path.join(TEMP_DIR, 'app.js'));

      expect(files.map(relative)).to.have.members(expected);
      expect(files).to.have.length(expected.length);
    });
  });

  it('excludes files to hide', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        'app.js': true,
        'mod.js': true,
        'test': {
          'hidden.js': true
        },
        'package.json': true
      });

      var expected = ['app.js'];

      var storage = new ScriptFileStorage({hidden: [/mod\.js/i, /test/i]}, session);
      var files = yield storage.findAllApplicationScripts(
        path.join(TEMP_DIR),
        path.join(TEMP_DIR, 'app.js'));

      expect(files.map(relative)).to.have.members(expected);
      expect(files).to.have.length(expected.length);
    });
  });


  it('disables preloading files', () => {
    return co(function * () {
      yield tree(TEMP_DIR, {
        'app.js': true,
        'mod.js': true,
        'package.json': true
      });

      var storage = new ScriptFileStorage({preload: false}, session);
      var files = yield storage.findAllApplicationScripts(
        path.join(TEMP_DIR),
        path.join(TEMP_DIR, 'app.js'));

      expect(files).to.have.length(0);
    });
  });
});

function edited(source) {
  return source.replace(';', '; /* edited */');
}

function expand(instance) {
  child = instance.child;
  session = instance.session;
  debuggerClient = session.debugger;
}

function runLiveEdit(transform) {
  return co(function * () {
    originalScript = yield copyInTempFile('LiveEdit.js', transform);

    yield launcher.startDebugger(TEMP_FILE).then(expand);
    session.scripts = new ScriptManagerStub();
    runtimeScript = yield getScriptSourceByName(TEMP_FILE);
  });
}

function copyInTempFile(fixture, transform) {
  return co(function * () {
    var sourcePath = path.join(__dirname, 'fixtures', fixture);
    var content = yield fs.readFile(sourcePath, { encoding: 'utf-8' });
    if (transform) content = transform(content);
    yield fs.writeFile(TEMP_FILE, content);
    return content;
  });
}

function getScriptSourceByName(scriptName, callback) {
  return co(function * () {
    var result = yield debuggerClient.request('scripts', {
      includeSource: true,
      types: 4,
      filter: scriptName
    });
    return result[0].source;
  });
}

function deleteTemps() {
  return co(function * () {
    if (yield fs.exists(TEMP_FILE))
      yield fs.unlink(TEMP_FILE);

    if (yield fs.exists(TEMP_DIR))
      yield rmrf(TEMP_DIR);
  });
}
