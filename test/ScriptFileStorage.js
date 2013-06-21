var fs = require('fs'),
  path = require('path'),
  expect = require('chai').expect,
  glob = require('glob'),
  launcher = require('./helpers/launcher.js'),
  ScriptFileStorage = require('../lib/ScriptFileStorage.js').ScriptFileStorage;

var TEMP_FILE = path.join(__dirname, 'fixtures', 'temp.js');
var TEMP_DIR = path.join(__dirname, 'work');
// directory that does not look like a part of a node.js application
var NON_APP_DIR = path.join(__dirname, '..', 'front-end', 'cm');

beforeEach(deleteTemps);
describe('ScriptFileStorage', function() {
  var storage;
  launcher.stopAllDebuggersAfterEachTest();
  beforeEach(function() {
    storage = new ScriptFileStorage();
  });

  it('saves new content without node.js module wrapper', function(done) {
    runLiveEdit(function(debuggerClient, originalScript, runtimeScript) {
      var storage = new ScriptFileStorage();
      storage.save(TEMP_FILE, edited(runtimeScript), function(err) {
        if (err) throw err;
        var newScript = fs.readFileSync(TEMP_FILE, { encoding: 'utf-8' });
        expect(newScript).to.equal(edited(originalScript));
        done();
      });
    });
  });

  it('loads content with node.js module wrapper', function(done) {
    fs.writeFileSync(TEMP_FILE, '/* content */');
    storage.load(TEMP_FILE, function(err, content) {
      if (err) throw err;
      expect(content).to.match(
        /^\(function \(exports, require,.*\) \{ \/\* content \*\/\n\}\);$/);
      done();
    });
  });

  it('finds application root for bin/app.js by checking lib/ folder', function(done) {
    givenTempFiles('bin/', 'bin/app.js', 'lib/');
    storage.findApplicationRoot(
      path.join(TEMP_DIR, 'bin', 'app.js'),
      expectRootToEqualTempDir.bind(this, done)
    );
  });

  it('finds application root for bin/app.js by checking node_modules/ folder', function(done) {
    givenTempFiles('bin/', 'bin/app.js', 'node_modules/');
    storage.findApplicationRoot(
      path.join(TEMP_DIR, 'bin', 'app.js'),
      expectRootToEqualTempDir.bind(this, done)
    );
  });

  it('finds application root for app.js by checking lib/ folder', function(done) {
    givenTempFiles('app.js', 'lib/');
    storage.findApplicationRoot(
      path.join(TEMP_DIR, 'app.js'),
      expectRootToEqualTempDir.bind(this, done)
    );
  });

  it('finds application root for app.js by checking node_modules/ folder', function(done) {
    givenTempFiles('app.js', 'node_modules/');
    storage.findApplicationRoot(
      path.join(TEMP_DIR, 'app.js'),
      expectRootToEqualTempDir.bind(this, done)
    );
  });

  it('finds all application files', function(done) {
    var expectedFiles = givenTempFiles(
      'bin/', 'bin/app.js',
      'lib/', 'lib/module.js',
      'toplevel.js'
    );

    storage.findAllApplicationScripts(
      NON_APP_DIR,
      path.join(TEMP_DIR, 'bin', 'app.js'),
      function(err, files) {
        if (err) throw err;
        expect(files.map(relativeToTemp))
          .to.have.members(expectedFiles.map(relativeToTemp));
        done();
      }
    );
  });

  it('finds also files in start directory', function(done) {
    var expectedFiles = givenTempFiles(
      // Globally installed module, e.g. mocha
      'global/',
      'global/runner.js',
      'global/lib/', 'global/lib/module.js',
      // Local application we are developing
      'local/',
      'local/app.js',
      'local/test/', 'local/test/app.js',
      // Other files in a place close to globally installed modules
      'unrelated/',
      'unrelated/file.js'
    );

    // remove unrelated/file.js
    expect(expectedFiles.pop()).to.match(/unrelated[\/\\]file.js$/);

    storage.findAllApplicationScripts(
      path.join(TEMP_DIR, 'local'),
      path.join(TEMP_DIR, 'global', 'runner.js'),
      function(err, files) {
        if (err) throw err;
        expect(files.map(relativeToTemp))
          .to.have.members(expectedFiles.map(relativeToTemp));
        done();
      }
    );
  });

  it('removes duplicate entries from files found', function(done) {
    var expectedFiles = givenTempFiles('app.js', 'node_modules/');

    storage.findAllApplicationScripts(
      TEMP_DIR,
      path.join(TEMP_DIR, 'app.js'),
      function(err, files) {
        if (err) throw err;
        expect(files.map(relativeToTemp))
          .to.have.members(expectedFiles.map(relativeToTemp));
        expect(files).to.have.length(expectedFiles.length);
        done();
      }
    );
  });

  function relativeToTemp(p) {
    return path.relative(TEMP_DIR, p);
  }

  function expectRootToEqualTempDir(done, err, root) {
    if (err) throw err;
    expect(root).to.equal(TEMP_DIR);
    done();
  }

  function edited(source) {
    return source.replace(';', '; /* edited */');
  }

  function runLiveEdit(callback) {
    var originalScript = createTempFileAsCopyOf('LiveEdit.js');
    launcher.startDebugger(TEMP_FILE, function(childProcess, debuggerClient) {
      getScriptSourceByName(debuggerClient, TEMP_FILE, function(source) {
        callback(debuggerClient, originalScript, source);
      });
    });
  }

  function createTempFileAsCopyOf(fixture) {
    var sourcePath = path.join(__dirname, 'fixtures', fixture);
    var content = fs.readFileSync(sourcePath, { encoding: 'utf-8' });
    fs.writeFileSync(TEMP_FILE, content);
    return content;
  }

  function givenTempFiles() {
    var files = [];
    fs.mkdirSync(TEMP_DIR);
    Array.prototype.forEach.call(arguments, function(f) {
      f = path.join(TEMP_DIR, globPathToNative(f));
      if (isDir(f)) {
        fs.mkdirSync(f);
      } else {
        fs.writeFileSync(f, '');
        files.push(f);
      }
    });
    return files;
  }
});

function globPathToNative(p) {
  return p.split('/').join(path.sep);
}

function getScriptSourceByName(debuggerClient, scriptName, callback) {
  debuggerClient.request(
    'scripts',
    {
      includeSource: true,
      types: 4,
      filter: scriptName
    },
    function(err, result) {
      if (err) throw err;
      callback(result[0].source);
    }
  );
}

function isDir(path) {
  return path.match(/[\/\\]$/);
}

function deleteTemps() {
  if (fs.existsSync(TEMP_FILE)) {
    fs.unlinkSync(TEMP_FILE);
  }

  if (fs.existsSync(TEMP_DIR)) {
    var entries = glob.sync(
      '**',
      {
        cwd: TEMP_DIR,
        dot: true,
        mark: true
      }
    );

    entries = entries
      .map(function(f) {
        return path.join(TEMP_DIR, globPathToNative(f));
      })
      .sort()
      .reverse();

    entries.forEach(function(f) {
      if (isDir(f)) {
        fs.rmdirSync(f);
      } else {
        fs.unlinkSync(f);
      }
    });
  }
}
