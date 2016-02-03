module.exports = function(commands) {
  Object.assign(commands, {
    'log simple text': function() {
      console.log('test');
    },
    'log simple text async': function() {
      setTimeout(console.log.bind(console, 'test'), 0);
    },
    'log object': function() {
      console.log({ a: 'test' });
    },
    'log console': function() {
      console.log(console);
    },
    'log in loop': function() {
      var a = 0;
      console.log(a);
      setInterval(function(){
        console.log(++a);
      }, 1000);
    }
  });
};
