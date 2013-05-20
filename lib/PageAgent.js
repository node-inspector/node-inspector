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
          url: 'node.js'
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
