var expect = require('chai').expect,
    NetworkAgent = require('../lib/NetworkAgent.js').NetworkAgent;

describe('NetworkAgent', function() {
  describe('loadResourceForFrontend', function() {
    it('should load data URLs', function(done) {
      var agent = new NetworkAgent();
      agent.loadResourceForFrontend(
        {
          url: 'data:text/plain;base64,aGVsbG8gd29ybGQ='
        },
        function(err, result) {
          if (err) return done(err);
          expect(result.content).to.equal('hello world');
          done();
        }
      );
    });
  });
});
