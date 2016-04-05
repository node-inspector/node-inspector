'use strict';

const fs = require('fs');

const commons = {
  "web-host": {
    type: "string",
    description: "Host to listen on for Node Inspector`s web interface.",
    //usage: {
    //  --web-host 127.0.0.1: "",
    //  --web-host www.example.com: ""
    //},
  },
  "debug-port": {
    alias: "d",
    type: "number",
    description: "Node/V8 debugger port (`node --debug={port}`).",
    default: 5858
  },
  "debug-brk": {
    alias: "b",
    type: "boolean",
    description: "Break on the first line (`node --debug-brk`)."
  }
};

const specials = {
  inspector: {
    "web-port": {
      alias: [ "port", "p" ],
      type: "string",
      description: "Port to listen on for Node Inspector`s web interface.",
      //usage: {
      //  --web-port 8081: "",
      //  -p 8081: ""
      //},
      default: "8080"
    },
    "web-host": {
      default: "0.0.0.0"
    },
    "debug-brk": {
      default: false
    },
    "save-live-edit": {
      type: "boolean",
      description: "Save live edit changes to disk (update the edited files).",
      //usage: {
      //  --save-live-edit: "",
      //  --no-save-live-edit: "    disable saving live edit changes to disk"
      //},
      default: false
    },
    "preload": {
      type: "boolean",
      description: "Preload *.js files. You can disable this option to speed up the startup.",
      //usage: {
      //  --preload: "",
      //  --no-preload: "    disable preloading *.js files"
      //},
      default: true
    },
    "inject": {
      description: "Enable/disable injection of debugger extensions into the debugged process.\n  It`s posiible to disable only part of injections using subkeys.\n  Available subkeys: network, profiles, console",
      //usage: {
      //  --inject: "",
      //  --no-inject: "            disable injecting of debugger extensions",
      //  --no-inject.network: "    disable injecting of debugger network extension only\n",
      //},
      default: true
    },
    "plugins": {
      type: "boolean",
      description: "Enable plugin system.",
      //usage: {
      //  --plugins: "",
      //  --no-plugins: "    disable plugin system"
      //},
      default: true
    },
    "hidden": {
      type: "string",
      description: "Array of files to hide from the UI.\n Breakpoints in these files will be ignored.\n  All paths are interpreted as regular expressions.",
      //usage: {
      //  --hidden .*\\.test\\.js$ --hidden node_modules: "ignore node_modules directory and all `*.test.js` files"
      //},
      default: [],
      format: mapToRx
    },
    "stack-trace-limit": {
      type: "number",
      description: "Number of stack frames to show on a breakpoint.",
      default: 50
    },
    "ssl-key": {
      type: "string",
      description: "A file containing a valid SSL key.",
      //usage: "--ssl-key ./ssl/key.pem --ssl-cert ./ssl/cert.pem",
      format: realpath
    },
    "ssl-cert": {
      type: "string",
      description: "A file containing a valid SSL certificate.",
      //usage: "--ssl-key ./ssl/key.pem --ssl-cert ./ssl/cert.pem",
      format: realpath
    },
  },
  debug: {
    "web-host": {
      default: "127.0.0.1"
    },
    "debug-brk": {
      default: true
    },
    "nodejs": {
      type: "string",
      description: "Pass NodeJS options to debugged process (`node --option={value}`).",
      //usage: "--nodejs --harmony --nodejs --random_seed=2 app",
      custom: collectNodejs,
      default: []
    },
    "cli": {
      alias: "c",
      type: "boolean",
      description: "CLI mode, do not open browser.",
      //usage: "--cli",
      default: false
    }
  }
};

function collectNodejs(argv) {
  const nodejsArgs = [];
  let index = 0;
  //let nodejsIndex = argv.indexOf('--nodejs');
  while (index !== -1) {
    if (!argv[index]) return nodejsArgs;

    if (argv[index] !== '--nodejs') {
      index++; continue;
    }

    const nodejsArg = argv.splice(index, 2)[1];
    if (nodejsArg !== undefined) {
      nodejsArgs.push(nodejsArg);
    }
    nodejsArgs.push(nodejsArg);
  }

  return nodejsArgs;
}

function realpath(value) {
  return fs.realpathSync(value);
}

function mapToRx(value) {
  return [].concat(value || []).map(string => new RegExp(string, 'i'));
}

function merge(command) {
  const special = specials[command];

  Object.keys(commons).forEach((key) => {
    special[key] = Object.assign({}, commons[key], special[key]);
  });

  return special;
}


module.exports = {
  commands: [
    {
      name: 'inspector',
      path: 'commands/inspector.js',
      description: ``,
      options: merge('inspector')
    }, {
      name: 'debug',
      path: 'commands/debug.js',
      options: merge('debug')
    }
  ]
};
