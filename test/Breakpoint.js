var expect = require('chai').expect,
    Breakpoint = require('../lib/Breakpoint').Breakpoint;

describe('Breakpoint', function() {
  describe('key', function() {
    it('should return scriptID:line', function() {
      var bp = aBreakpoint({sourceID: 10, line: 20});
      expect(bp.key).to.equal('10:20');
    })
  });

  describe('createRequest()', function() {
    it('should create "script" type request', function() {
      var bp = aBreakpoint({
        url: 'short-name.js',
        sourceName: '/long/script/name.js',
        line: 1,
        enabled: true,
        condition: 'a-condition'
      });

      var request = bp.createRequest();
      var args = request.arguments;

      expect(args.type).to.equal('script');
      expect(args.target).to.equal('/long/script/name.js');
      expect(args.line).to.equal(0); // V8 use zero-based line numbers
      expect(args.enabled).to.equal(true);
      expect(args.condition).to.equal('a-condition');
    });
  });

  describe('sameAs()', function() {
    var aLineNumber = 1;
    var anotherLineNumber = 2;
    var bp;

    beforeEach(function() {
      bp = aBreakpoint({
        sourceID: 'a-source-id',
        line: aLineNumber,
        condition: 'a-condition'
      });
    })

    it('returns true for matching breakpoint', function() {
      var result = bp.sameAs('a-source-id', aLineNumber, 'a-condition');
      expect(result).to.equal(true);
    })

    it('returns false for different source id', function() {
      var result = bp.sameAs('another-source-id', aLineNumber, 'a-condition')
      expect(result).to.equal(false);
    })

    it('returns false for different line', function() {
      var result = bp.sameAs('a-source-id', anotherLineNumber, 'a-condition')
      expect(result).to.equal(false);
    })

    it('returns false for different condition', function() {
      var result = bp.sameAs('a-source-id', aLineNumber, 'another-condition')
      expect(result).to.equal(false);
    })
  });
})
;

function aBreakpoint(props) {
  var val = {
    sourceID: 100, // arbitrary number
    url: 'http://some/script/url',
    line: 10, // arbitrary number
    enabled: true,
    condition: null,
    number: 1 // arbitrary number
  };
  for (var p in props) {
    val[p] = props[p];
  }

  return new Breakpoint(props);
}
