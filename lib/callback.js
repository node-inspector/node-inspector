function CallbackStore() {
	this.lastId = 1;
	this.callbacks = {};
}

CallbackStore.prototype.add = function (callback) {
	var id = this.lastId++;
	this.callbacks[id] = callback;
	return id;
}

CallbackStore.prototype.exec = function (id) {
	var args = Array.prototype.slice.call(arguments, 1);
	var callback = this.callbacks[id] || function () {};
	callback.apply(null, args);
	delete this.callbacks[id];
}

exports.CallbackStore = CallbackStore;
