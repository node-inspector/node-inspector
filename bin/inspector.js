#!/usr/bin/env node

var DebugServer = require('../lib/debug-server'),
		fs = require('fs'),
		path = require('path'),
		options = {}

process.argv.forEach(function (arg) {
	if (arg.indexOf('--') > -1) {
		var parts = arg.split('=')
		if (parts.length > 1) {
			if (parts[0] === '--web-port') {
				options.webPort = parseInt(parts[1], 10)
			}
			else {
				console.log('unknown option: ' + parts[0])
			}
		}
		else if (parts[0] === '--help') {
			console.log('Usage: node-inspector [options]')
			console.log('Options:')
			console.log('--web-port=[port]     port to host the inspector (default 8080)')
			process.exit()
		}
	}
})

fs.readFile(path.join(__dirname, '../config.json'), function (err, data) {
	var config
	if (err) {
		console.warn("could not load config.json\n" + err.toString())
		config = {}
	}
	else {
		config = JSON.parse(data)
		if (config.hidden) {
			config.hidden = config.hidden.map(function (s) {
				return new RegExp(s, 'i')
			})
		}
	}
	if (!config.webPort) {
		config.webPort = 8080
	}
	if (!config.debugPort) {
		config.debugPort = 5858
	}
	if (options.webPort) {
		config.webPort = options.webPort
	}

	var debugServer = new DebugServer()
	debugServer.on('close', function () {
		console.log('session closed')
		process.exit()
	})
	debugServer.start(config)
})
