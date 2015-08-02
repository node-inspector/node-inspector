var convert = require('./convert');

var injection = require.resolve('./Injections/HeapProfilerAgent');

/**
 * @param {{inject}} config
 * @param {DebuggerClient} debuggerClient
 * @param {InjectorClient} injectorClient
 * @param {FrontendClient} frontendClient
 * @param {HeapProfilerClient} heapProfilerClient
*/
function HeapProfilerAgent(config, session) {
  try {
    this._noInject = config.inject === false || config.inject.profiles === false;
  } catch (e) {
    this._noInject = false;
  }

  this._injected = false;
  this._debuggerClient = session.debuggerClient;
  this._injectorClient = session.injectorClient;
  this._frontendClient = session.frontendClient;
  this._heapProfilerClient = session.heapProfilerClient;

  this._translateCommandToInjection(
    'takeHeapSnapshot',
    'getObjectByHeapObjectId',
    'startTrackingHeapObjects',
    'stopTrackingHeapObjects'
  );

  if (!this._noInject) {
    this._injectorClient.on('inject', this._inject.bind(this));
  }
}

HeapProfilerAgent.prototype._inject = function(injected) {
  if (!injected) return;

  this._translateEventToFrontend(
    'reportHeapSnapshotProgress',
    'addHeapSnapshotChunk',
    'heapStatsUpdate',
    'lastSeenObjectId'
  );

  this._injectorClient.injection(
    function(require, debug, options) {
      require(options.injection)(require, debug, options);
    },
    {
      injection: injection,
      'v8-profiler': require.resolve('v8-profiler')
    },
    function(error, result) {
      this._injected = !error;

      if (error) return this._frontendClient.sendLogToConsole('error', error.message || error);
    }.bind(this)
  );
};

/**
 * @param {...string} eventNames
*/
HeapProfilerAgent.prototype._translateEventToFrontend = function(eventNames) {
  Array.prototype.forEach.call(arguments, function(event) {
    event = 'HeapProfiler.' + event;
    this._debuggerClient.registerDebuggerEventHandlers(event);
    this._debuggerClient.on(event, function(message) {
      this._frontendClient.sendEvent(event, message);
    }.bind(this));
  }, this);
};

/**
 * @param {...string} commandNames
*/
HeapProfilerAgent.prototype._translateCommandToInjection = function(commandNames) {
  Array.prototype.forEach.call(arguments, function(command) {
    this[command] = function(params, done) {
      this._debuggerClient.request('HeapProfiler.' + command, params, function(error, result) {
        if (command == 'getObjectByHeapObjectId' && result && result.result) {
          this._heapProfilerClient.convertHandleToHeapHandle(result.result);
          result.result = convert.v8ResultToInspectorResult(result.result);
        }
        done(error, result);
      }.bind(this));
    };
  }, this);
};

exports.HeapProfilerAgent = HeapProfilerAgent;
