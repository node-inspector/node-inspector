/*jshint debug:true */

var commands = {};

require('./debug-commands.js')(commands);
require('./log-commands.js')(commands);
require('./http-commands.js')(commands);

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
