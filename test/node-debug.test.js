var cli = require('../bin/node-debug');
var expect = require('chai').expect;

describe('node-debug', function() {
  describe('argument parser', function() {
    it('handles `app.js`', function() {
      var config = cli.parseArgs(argv('app.js'));
      delete config.options;
      expect(config).to.eql({
        printScript: true,
        subproc: {
          script: 'app.js',
          args: [],
          execArgs: ['--debug=5858', '--debug-brk'],
          debugPort: 5858
        },
        inspector: {
          port: 8080,
          args: ['--web-port=8080']
        }
      });
    });

    it('handles empty arguments', function() {
      var config = cli.parseArgs(argv());
      expect(config.printScript, 'printScript').to.equal(false);
      expect(config.subproc.script, 'subproc.script')
        .to.eql(require.resolve('../bin/run-repl'));
    });

    it('handles options', function() {
      var config = cli.parseArgs(argv('--no-debug-brk -p 10 -d 20 -c app.js'));
      expect(config.subproc).to.eql({
        script: 'app.js',
        args: [],
        execArgs: ['--debug=20'],
        debugPort: 20
      });
      expect(config.inspector).to.eql({
        port: 10,
        args: ['--web-port=10']
      });
    });

    it('handles long options with =val and no script file', function() {
      var config = cli.parseArgs(argv('--debug-port=10'));
      expect(config.subproc.debugPort).to.equal(10);
    });

    it('handles nodejs options', function() {
      var config = cli.parseArgs(argv('--nodejs --harmony --nodejs --random_seed=2'));
      expect(config.subproc.execArgs).to.include.members(['--harmony', '--random_seed=2']);
    });

    it('ignores options of the debugged application', function() {
      var config = cli.parseArgs(argv('app.js -b -p 10 -d 20 -c carg rest'));
      expect(config.subproc).to.eql({
        script: 'app.js',
        args: '-b -p 10 -d 20 -c carg rest'.split(' '),
        execArgs: ['--debug=5858', '--debug-brk'],
        debugPort: 5858
      });
      expect(config.inspector.port, 'inspector.port').to.eql(8080);
    });

    it('supports slc-debug argument names', function() {
      var config = cli.parseArgs(argv('--suspend --port=10 --debug-port=20'));
      expect(config.subproc.execArgs).to.contain('--debug-brk');
      expect(config.subproc.debugPort, 'subproc.debugPort').to.equal(20);
      expect(config.inspector.port, 'inspector.port').to.equal(10);
    });

    it('supports node-inspector argument names', function() {
      var config = cli.parseArgs(argv('--web-port=10 --debug-port=20 app.js'));
      expect(config.subproc.debugPort, 'subproc.debugPort').to.equal(20);
      expect(config.inspector.port, 'inspector.port').to.equal(10);
    });

    it('forwards unknown options to node-inspector', function() {
      var config = cli.parseArgs(argv('--some-bool --no-some-other-bool --some-string val app.js'));
      expect(config.inspector.args, 'inspector args')
        .to.eql(['--some-bool', '--no-some-other-bool', '--some-string', 'val', '--web-port=8080']);
      expect(config.subproc.execArgs, 'subprocess args')
        .to.not.include.members(['--some-bool', '--no-some-other-bool', '--some-string', 'val']);
    });

    function argv(cmdString) {
      cmdString = cmdString || '';
      return ['node', 'node-debug'].concat(cmdString.split(' '));
    }
  });
});
