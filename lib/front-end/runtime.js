var v2w = require('../v2w')

function Runtime(client) {
	this.client = client
}

Runtime.prototype.callFunctionOn = function (params, callback) {
	var objectId = params.objectId
	var functionDeclaration = params.functionDeclaration
	var arguments = params.arguments
	var returnByValue = params.returnByValue
	var handle = objectId.split(':')[2]

	if (/getCompletions/.test(functionDeclaration)) {
		this.client.lookup([handle],
			function (err, msg) {
				var resultSet = {}
				if (msg && msg.body) {
					var obj = msg.body[handle]
					obj.properties.forEach(
						function (p) {
							resultSet[p.name] = true
						}
					)
				}
				callback(err, { result: { value: resultSet }, wasThrown: false })
			}
		)
	}
	else if (/setPropertyValue/.test(functionDeclaration)) {
		//TODO: plus look at "additional_context"
		callback()
	}
	else {
		console.log(functionDeclaration)
		callback()
	}

}

Runtime.prototype.evaluate = function (params, callback) {
	var self = this
	var expression = params.expression
	var objectGroup = params.objectGroup
	var includeCommandLineAPI = params.includeCommandLineAPI
	var doNotPauseOnExceptions = params.doNotPauseOnExceptions

	this.client.evaluate(expression, null, undefined, function (err, body) {
		var result
		if (err) {
			result = { value: err }
		}
		else {
			result = v2w.refToObject(body)
		}
		callback(null, { result: result, wasThrown: !!err })
	})
}

Runtime.prototype.getProperties = function (params, callback) {
	var self = this
	var objectId = params.objectId
	var ownProperties = params.ownProperties
	var tokens = objectId.split(':')
	var frame = +(tokens[0])
	var scope = +(tokens[1])
	var ref = tokens[2]
	if (ref === 'backtrace') {
		this.client.scope(scope, frame,
			function (err, msg) {
				if (msg.success) {
					var refs = {}
					if (msg.refs && Array.isArray(msg.refs)) {
						msg.refs.forEach(function (r) {
							refs[r.handle] = r
						})
					}
					var props = msg.body.object.properties.map(
						function (p) {
							var r = refs[p.value.ref]
							var val = v2w.refToObject(r)
							return {
								name: p.name,
								value: val,
								enumerable: true,
								//writable: val.type !== 'object'
							}
						}
					)
					callback(err, { result: props })
				}
			}
		)
	}
	else {
		var handle = +ref
		this.client.lookup([handle],
			function (err, msg) {
				if (msg.success) {
					var refs = {}
					var props = []
					if (msg.refs && Array.isArray(msg.refs)) {
						var obj = msg.body[handle]
						var objProps = obj.properties
						var proto = obj.protoObject
						msg.refs.forEach(function (r) {
							refs[r.handle] = r
						})
						props = objProps.map(function (p) {
							var r = refs[p.ref]
							var val = v2w.refToObject(r)
							return {
								name: '' + p.name,
								value: val,
								//writable: val.type !== 'object',
								enumerable: true
							}
						})
						if (proto) {
							props.push({
								name: '__proto__',
								value: v2w.refToObject(refs[proto.ref])
							})
						}
					}
					callback(err, { result: props })
				}
			}
		)
	}
}

Runtime.prototype.releaseObject = function (params, callback) {
  callback()
}

Runtime.prototype.releaseObjectGroup = function (params, callback) {
  callback()
}

module.exports = Runtime

function getCompletions(primitiveType) {
	var object;
	if (primitiveType === "string")
		object = new String("");
	else if (primitiveType === "number")
		object = new Number(0);
	else if (primitiveType === "boolean")
		object = new Boolean(false);
	else
		object = this;

	var resultSet = {};
	for (var o = object; o; o = o.__proto__) {
		try {
			var names = Object.getOwnPropertyNames(o);
			for (var i = 0; i < names.length; ++i)
				resultSet[names[i]] = true;
		} catch (e) {

		}
	}
	return resultSet;
}
