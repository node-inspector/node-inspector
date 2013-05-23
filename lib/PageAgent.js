// node-inspector version of on webkit-inspector/InspectorPageAgent.cpp

function PageAgent(session) {
  this._session = session;
}

PageAgent.prototype = {
  enable: function(params, done) {
    done();
  },

  canShowFPSCounter: function(params, done) {
    done(null, { show: false });
  },

  canContinuouslyPaint: function(params, done) {
    done(null, { value: false });
  },

  setTouchEmulationEnabled: function(params, done) {
    done();
  },

  getResourceTree: function(params, done) {
    done(null, {
      frameTree: {
        frame: {
          id: 'toplevel-frame-id',
          url: 'node.js',

          // Front-end keeps a history of local modifications based
          // on loaderId. Ideally we should return such id that it remains
          // same as long as the the debugger process has the same content
          // of scripts and that changes when a new content is loaded.
          //
          // To keep things easy, we are returning an unique value for now.
          // This means that every reload of node-inspector page discards
          // the history of live-edit changes.
          //
          // Perhaps we can use PID as loaderId instead?
          loaderId: createUniqueLoaderId()
        },
        resources: [
        ],
      }
    });
  },

  reload: function(params, done) {
    // This is called when user press Cmd+R (F5?), do we want to perform an action on this?
    done();
  }
};

exports.PageAgent = PageAgent;

function createUniqueLoaderId() {
  var randomPart = String(Math.random()).slice(2);
  return Date.now() + '-' + randomPart;
}
