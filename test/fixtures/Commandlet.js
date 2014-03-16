var commands = {
  'log simple text': function() {
    console.log('test');
  },
  'log object': function() {
    console.log({ a: 'test' });
  }
};

process.stdin.on('data', function(data) {
  data = '' + data;
  if (commands[data]) commands[data]();
});