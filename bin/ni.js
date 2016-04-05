#!/usr/bin/env node

const program = require('commander');
const Inspector = require('../');

process.on('SIGINT', () => process.exit());

program.version(Inspector.version);
program.arguments('<cmd>');
program.action((name) => {
  const command = Inspector.manifest.config.commands[name];

  if (!command) {
    console.error(`ni: '${name}' is not a ni command. See 'ni --help'.`);
    process.exit(1);
  }

  const action = require(command.path);
  const argv = process.argv.slice(3);
  const config = new Inspector.Config(command.options, argv);

  if (config.help) {
    const message = typeof command.help === 'function'
                  ? command.help(config, Inspector)
                  : command.help;
    return console.log(message);
  }

  action(config, Inspector);
});

program.parse(process.argv);
