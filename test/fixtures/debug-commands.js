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
    }
  });
};
