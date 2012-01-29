var EventEmitter = require('events').EventEmitter,
	inherits = require('util').inherits,
	nilBuffer = new Buffer(0)

function HeadState(buf) {
	this.buffer = nilBuffer
	this.rest = buf
	this.end = -1
}

HeadState.prototype.next = function (buf) {
	this.appendBuffer(buf)
	if (this.end === -1) {
		return this
	}
	return new BodyState(this.parseHeaders(), this.buffer.slice(this.end + 4))
}

HeadState.prototype.appendBuffer = function (b) {
	var c = new Buffer(this.buffer.length + b.length)
	this.buffer.copy(c)
	b.copy(c, this.buffer.length)
	this.buffer = c
	this.rest = nilBuffer
	this.end = this.indexOfEndOfHeaders()
}

HeadState.prototype.indexOfEndOfHeaders = function () {
	for (var i = 0; i < this.buffer.length - 3; i++) {
		if (this.isEndAt(i)) {
			return i
		}
	}
	return -1
}

HeadState.prototype.isEndAt = function (i) {
	return this.buffer[i] === 0x0D && // '\r'
		this.buffer[i + 1] === 0x0A && // '\n'
		this.buffer[i + 2] === 0x0D &&
		this.buffer[i + 3] === 0x0A
}

HeadState.prototype.parseHeaders = function () {
	var lines = this.buffer.slice(0, this.end).toString('utf8').split('\r\n')
	var headers = {}
	for (var i = 0; i < lines.length; i++) {
		var kv = lines[i].split(/: +/)
		headers[kv[0]] = kv[1]
	}
	return headers
}

function BodyState(headers, buf) {
	this.headers = headers
	this.buffer = new Buffer(+headers['Content-Length'])
	this.index = 0
	this.rest = buf
}

BodyState.prototype.next = function (buf) {
	var bytesLeft = this.buffer.length - this.index
	var bytesCopied = Math.min(buf.length, bytesLeft)
	buf.copy(this.buffer, this.index, 0, bytesCopied)
	this.rest = buf.slice(bytesCopied)
	this.index += bytesCopied

	if (this.index === this.buffer.length) {
		var body = this.index > 0 ? JSON.parse(this.buffer.toString('utf8')) : {}
		return new MessageState(this.headers, body, this.rest)
	}
	return this
}

function MessageState(headers, body, buf) {
	this.message = {
		headers: headers,
		body: body
	}
	this.rest = buf
}

MessageState.prototype.next = function (buf) {
	return new HeadState(buf)
}

function Protocol() {
	this.state = new HeadState(nilBuffer)
}
inherits(Protocol, EventEmitter)

Protocol.prototype.append = function (buf) {
	while (buf.length > 0) {
		this.state = this.state.next(buf)
		buf = this.state.rest
		if (this.state.message) {
			this.emit('message', this.state.message)
		}
	}
}

Protocol.prototype.serialize = function (msg) {
	msg.type = 'request'
	var serial = JSON.stringify(msg)
	return 'Content-Length: ' + Buffer.byteLength(serial) + '\r\n\r\n' + serial
}

module.exports = Protocol
