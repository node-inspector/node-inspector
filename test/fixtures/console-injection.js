module.exports = function event(require, debug, options) {
  debug.register('testcommand', function(request, response) {
    response.body = request.arguments;
  });

  console.log = (function(fn) {
    return function() {
      var message = arguments[0];

      debug.emitEvent('console', {
        level: 'log',
        message: options.message + message
      });

      return fn && fn.apply(console, arguments);
    };
  })(console.log);

  console.log('test');
};
