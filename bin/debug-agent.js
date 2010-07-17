#!/usr/bin/env node

var net = require('net'),
		sys = require('sys'),
		ws =  require('./ws');

///////////////////////////////////////////////////////////
//  Browser side

var socket = null;
var seq = 0;

ws.createServer(function (websocket) {
	socket = websocket;
	websocket.addListener('data', function (data) {
		// handle incoming data
		request(data);
	}).addListener('close', function () {
		socket = null;
		//TODO: dis/reconnect to node
	});
}).listen(8080); //TODO: make port configurable

//////////////////////////////////////////////////////////
//  Node side

var buffer = '';
var current = false;

function request(data) {
	var message = 'Content-Length: ' + data.length + '\r\n\r\n' + data;
	conn.write(message);
}

function makeMessage() {
	return {
		headersDone: false,
		headers: null,
		contentLength: 0
	};
}

function parseBody() {
	if (buffer.length >= current.contentLength) {
		current.body = buffer.slice(0, current.contentLength);
		buffer = buffer.slice(current.contentLength);
		if (current.body.length > 0 && socket) {
			socket.write(current.body);
		}
		current = false;
	}	
}

function parse() {
	if (current && current.headersDone) {
		parseBody();
		return;
	}
	
	if (!current) current = makeMessage();
	
	var offset = buffer.indexOf('\r\n\r\n');
	if (offset > 0) {
		current.headersDone = true;
		current.headers = buffer.substr(0, offset+4);
		var m = /Content-Length: (\d+)/.exec(current.headers);
		if (m[1]) {
			current.contentLength = parseInt(m[1], 10);
		}
		else {
			sys.debug('no Content-Length');
		}
		buffer = buffer.slice(offset+4);
		parse();
	}
}

var conn = net.createConnection(5858); //TODO: make port configurable

conn.setEncoding('ascii');

conn.on('data', function(data) {
	buffer += data;
	parse();
});

conn.on('end', function() {
	process.exit();	
});
