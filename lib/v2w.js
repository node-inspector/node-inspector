function wrapperObject(type, desc, frame, scope, ref, subtype) {
	return {
		type: type,
		subtype: subtype,
		description: desc,
		objectId: frame + ':' + scope + ':' + ref
	}
}


function refToObject(ref) {
	var desc = '',
		value,
		name,
		subtype

	switch (ref.type) {
	case 'object':
		name = /#<(\w+)>/.exec(ref.text)
		if (name && name.length > 1) {
			desc = name[1]
			if (desc === 'Array') {
				subtype = "array"
				desc += '[' + (ref.properties.length - 1) + ']'
			}
			else if (desc === 'Buffer') {
				subtype = "array"
				desc += '[' + (ref.properties.length - 4) + ']'
			}
		}
		else {
			desc = ref.className || 'Object'
		}
		break;
	case 'function':
		desc = ref.text || 'function()'
		break;
	default:
		return {
				type: ref.type,
				value: ref.value || ref.text
			};
	}
	if (desc === 'Array') {
		subtype = "array"
	}
	if (desc === 'RegExp') {
		subtype = "regexp"
	}
	if (desc === 'Date') {
		subtype = "date"
	}
	return wrapperObject(ref.type, desc, 0, 0, ref.handle, subtype)
}

function callFrames(frames) {
	if (frames && frames.length > 0) {
		return frames.map(function (frame) {
			var f = {
				type: 'function',
				functionName: frame.func.inferredName,
				index: frame.index,
				callFrameId: String(frame.index),
				location: {
					scriptId: String(frame.func.scriptId),
					lineNumber: frame.line
				}
			}
			f.scopeChain = frame.scopes.map(
						function (scope) {
							var c = {};
							switch (scope.type) {
							case 0:
								c.type = 'global'
								break;
							case 1:
								c.type = 'local'
								f.this =
										wrapperObject(
										'object',
										frame.receiver.className,
										frame.index,
										scope.index,
										frame.receiver.ref)
								break;
							case 2:
								c.type = 'with'
								break;
							case 3:
								c.type = 'closure'
								break;
							case 4:
								c.type = 'catch'
								break;
							default:
								break;
							}
							//c.objectId = frame.index + ':' + scope.index + ':backtrace';
							// TODO: see if we can get more data from 'scopes' so we don't have to use 'scope'
							c.object = { description: 'global', objectId: frame.index + ':' + scope.index + ':backtrace' }
							return c
						})
			return f
		})
	}
	return [{
		type: 'program',
		sourceID: 'internal',
		line: 0,
		id: 0,
		worldId: 1,
		scopeChain: []
	}]
}

exports.refToObject = refToObject
exports.callFrames = callFrames
