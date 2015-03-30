/*jshint debug:true */
var commands = {
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
  'pause': function() {
    debugger;
  }
};

var buffer = '';
process.stdin.on('data', function(data) {
  buffer += data;
  while(/\n/.test(buffer)) {
    var parts = buffer.split('\n');
    var command = parts.splice(0, 1);
    buffer = parts.join('\n');

    if (commands[command]) commands[command]();
  }
});
