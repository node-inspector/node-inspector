var Http = require('http'),
	EventEmitter = require('events').EventEmitter,
	io = require('socket.io'),
	connect = require('connect'),
	Session = require('./session2'),
	inherits = require('util').inherits,
	WEBROOT = require('path').join(__dirname, '../front-end'),
	sessions = {},
	config = {},
	connectionTimeout,
	webPort

function getDebuggerPort(url, defaultPort) {
	return parseInt((/\?port=(\d+)/.exec(url) || [null, defaultPort])[1], 10)
}

function serveStaticFiles(req, res, next) {
	var re = /^\/debug/
	if (re.test(req.url)) {
		config.debugPort = getDebuggerPort(req.url, config.debugPort)
		req.url = req.url.replace(re, '/')
	}
	next()
}

function getSession(debuggerPort) {
	var session = sessions[debuggerPort]
	if (!session) {
		session = new Session(debuggerPort, config)
		sessions[debuggerPort] = session
		session.on('close', function () {
			sessions[debuggerPort] = null
		})
	}
	session.attach()
	return session
}

function handleWebSocketConnection(socket) {
	clearTimeout(connectionTimeout)
	getSession(config.debugPort).join(socket)
}

function handleServerListening() {
  console.log(
    'visit http://' + (config.webHost || '0.0.0.0') + ':' +
    config.webPort +
    '/debug?port=' + config.debugPort + ' to start debugging')
}

function DebugServer() {}

inherits(DebugServer, EventEmitter)

DebugServer.prototype.start = function (options) {
	config = options
	var app = connect()
		.use(serveStaticFiles)
		.use(connect.static(WEBROOT))
	var httpServer = Http.createServer(app)

	var ws = io.listen(httpServer)
	ws.configure(function () {
		ws.set('log level', 1)
	})
	ws.sockets.on('connection', handleWebSocketConnection)
	this.wsServer = ws
	httpServer.on('listening', handleServerListening)
	httpServer.listen(config.webPort, config.webHost)
}

DebugServer.prototype.close = function () {
	if (this.wsServer) {
		this.wsServer.close()
		this.emit('close')
	}
}

module.exports = DebugServer
