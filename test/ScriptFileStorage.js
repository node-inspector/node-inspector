var fs = require('fs'),
  path = require('path'),
  expect = require('chai').expect,
  launcher = require('./helpers/launcher.js'),
  ScriptFileStorage = require('../lib/ScriptFileStorage.js').ScriptFileStorage;

describe('ScriptFileStorage', function() {
  var tempFile = path.join(__dirname, 'fixtures', 'temp.js');
  launcher.stopAllDebuggersAfterEachTest();
  afterEach(deleteTempFile);

  it('saves new content without node.js module wrapper', function(done) {
    runLiveEdit(function(debuggerClient, originalScript, runtimeScript) {
      var storage = new ScriptFileStorage();
      storage.save(tempFile, edited(runtimeScript), function(err) {
        if (err) throw err;
        var newScript = fs.readFileSync(tempFile, { encoding: 'utf-8' });
        expect(newScript).to.equal(edited(originalScript));
        done();
      });
    });
  });

  function edited(source) {
    return source.replace(';', '; /* edited */');
  }

  function runLiveEdit(callback) {
    var originalScript = createTempFileAsCopyOf('LiveEdit.js');
    launcher.startDebugger(tempFile, function(childProcess, debuggerClient) {
      getScriptSourceByName(debuggerClient, tempFile, function(source) {
        callback(debuggerClient, originalScript, source);
      });
    });
  }

  function createTempFileAsCopyOf(fixture) {
    var sourcePath = path.join(__dirname, 'fixtures', fixture);
    var content = fs.readFileSync(sourcePath, { encoding: 'utf-8' });
    fs.writeFileSync(tempFile, content);
    return content;
  }

  function deleteTempFile() {
    if (fs.existsSync(tempFile))
      fs.unlinkSync(tempFile);
  }
});

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
