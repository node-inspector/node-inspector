module.exports = function(commands) {
  Object.assign(commands, {
    'pause': function() {
      debugger;
    },
    'steps': function() {
      debugger;
      var a = 'test';
      var b = into();
      var e = 'test';
      var f = 'test';
      return 'test';

      function into() {
        var c = 'test';
        var d = 'test';
        return 'test';
      }
    },
    'set-variable-value-frame': function() {
      var a = 10;
      var b = {c: 20};
      debugger;
    },
    'set-script-source': function() {
      var __watermark__ = '1';
      debugger;
    },
    'throw-caught-exception': function() {
      try {
        throw new Error('caught exception');
      } catch (e) {}
    },
    'throw-uncaught-exception': function() {
      process.once('uncaughtException', function() {});
      throw new Error('uncaught exception');
    },
    'ignore-exception': function() {
      try {
        throw new Error('caught exception');
      } catch (e) {}
      debugger;
    },
  });
};
