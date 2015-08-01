var expect = require('chai').expect,
    Promise = require('promise'),
    launcher = require('./helpers/launcher.js'),
    InjectorClient = require('../lib/InjectorClient').InjectorClient,
    NetworkAgent = require('../lib/NetworkAgent.js').NetworkAgent;

var commandlet,
    debuggerClient,
    frontendClient,
    networkAgent;

describe('NetworkAgent', function() {
  describe('loadResourceForFrontend', function() {
    it('should load data URLs', function(done) {
      var agent = new NetworkAgent({ inject: false }, {});
      agent.loadResourceForFrontend(
        {
          url: 'data:text/plain;base64,aGVsbG8gd29ybGQ='
        },
        function(err, result) {
          if (err) return done(err);
          expect(result.content).to.equal('hello world');
          done();
        }
      );
    });
  });

  describe('HTTP request wrapper', function() {
    var requestWillBeSent,
        responseReceived,
        dataReceived,
        loadingFinished,
        loadingFailed;

    beforeEach(initializeNetwork);
    beforeEach(function() {
      requestWillBeSent = new Promise(function(resolve, reject) {
        frontendClient.once('Network.requestWillBeSent', resolve);
      });
      responseReceived = new Promise(function(resolve, reject) {
        frontendClient.once('Network.responseReceived', resolve);
      });
      dataReceived = new Promise(function(resolve, reject) {
        frontendClient.once('Network.dataReceived', resolve);
      });
      loadingFinished = new Promise(function(resolve, reject) {
        frontendClient.once('Network.loadingFinished', resolve);
        frontendClient.once('Network.loadingFailed', reject);
      });
      loadingFailed = new Promise(function(resolve, reject) {
        frontendClient.once('Network.loadingFailed', resolve);
        frontendClient.once('Network.loadingFinished', reject);
      });
    });

    it('should emit `requestWillBeSent` event', function(done) {
      requestWillBeSent.then(function(message) {
        expect(message.documentURL).to.match(/^http:\/\/127\.0\.0\.1:\d+\/page\?a=b$/);

        var host = /^http:\/\/(127\.0\.0\.1:\d+).*$/.exec(message.documentURL)[1];

        expect(message).to.have.property('requestId').that.is.a('string');
        expect(message).to.have.property('loaderId').that.is.a('string');
        expect(message).to.have.property('timestamp').that.is.a('number');
        expect(message.type).to.equal('XHR');
        expect(message.request).to.deep.equal({
          headers: {
            Host: host,
            'X-REQUEST-HEADER': 'X-REQUEST-DATA'
          },
          method: 'GET',
          postData: 'Body for GET request? Really?!',
          url: message.documentURL
        });
        expect(message.initiator).to.include.keys('type', 'stackTrace');
      })
      .then(done)
      .catch(done);

      commandlet.stdin.write('send GET request\n');
    });

    it('should emit `responseReceived` event', function(done) {
      responseReceived.then(function(message) {
        expect(message).to.have.property('requestId').that.is.a('string');
        expect(message).to.have.property('loaderId').that.is.a('string');
        expect(message).to.have.property('timestamp').that.is.a('number');
        expect(message.type).to.equal('XHR');
        containKeys(message.response, {
          status: 200,
          statusText: 'OK',
          mimeType: 'text/plain',
          connectionId: '0',
          encodedDataLength: -1,
          fromDiskCache: false,
          fromServiceWorker: false
        });
        expect(message.response).to.contain.keys([
          'timing',
          'headers',
          'requestHeaders',
          'requestHeadersText',
          'connectionReused'
        ]);
        expect(message.response.url).to.match(/127\.0\.0\.1:\d+\/page\?a=b/);

        var timings = ['proxy', 'dns', 'connect', 'ssl', 'serviceWorkerFetch', 'send']
          .map(function(name) {
            return [name + 'Start', name + 'End'];
          });

        expect(message.response.timing).to.have.all.keys(Array.prototype.concat.apply([
          'requestTime',
          'serviceWorkerFetchReady',
          'receiveHeadersEnd'
        ], timings));

        timings.forEach(function(timing) {
          var start = timing[0],
              end = timing[1];
          expect(message.response.timing[start], start + ' less than or equal to ' + end)
            .to.be.at.most(message.response.timing[end]);
        });
      })
      .then(done)
      .catch(done);

      commandlet.stdin.write('send GET request\n');
    });

    it('should emit `dataReceived` event', function(done) {
      dataReceived.then(function(message) {
        expect(message).to.have.property('requestId').that.is.a('string');
        expect(message).to.have.property('timestamp').that.is.a('number');
        expect(message.dataLength).to.be.above(0);
        expect(message.encodedDataLength).to.be.above(0);
      })
      .then(done)
      .catch(done);

      commandlet.stdin.write('send GET request\n');
    });

    it('should emit `loadingFinished` event', function(done) {
      loadingFinished.then(function(message) {
        expect(message).to.have.property('requestId').that.is.a('string');
        expect(message).to.have.property('timestamp').that.is.a('number');
        expect(message.encodedDataLength).to.be.equal(13);
      })
      .then(done)
      .catch(done);

      commandlet.stdin.write('send GET request\n');
    });

    it('should capture response data', function(done) {
      loadingFinished.then(function(message) {
        var getBody = Promise.denodeify(networkAgent.getResponseBody);
        return getBody.call(networkAgent, {
          requestId: message.requestId
        });
      }).then(function(result) {
        expect(result).to.deep.equal({
          body: 'RESPONSE DATA',
          base64Encoded: false
        });
      })
      .then(done)
      .catch(done);

      commandlet.stdin.write('send GET request\n');
    });

    it('should clean captured data', function(done) {
      loadingFinished.then(function(message) {
        expect(Object.keys(networkAgent._dataStorage).length).to.be.equal(1);
        networkAgent._clearCapturedData({}, function() {});
        expect(Object.keys(networkAgent._dataStorage).length).to.be.equal(0);
      })
      .then(done)
      .catch(done);

      commandlet.stdin.write('send GET request\n');
    });

    it('should stop data capturing', function(done) {
      expect(Object.keys(networkAgent._dataStorage).length).to.be.equal(0);
      networkAgent._setCapturingEnabled({
        enabled: false
      }, function() {});
      loadingFinished.then(function() {
        expect(Object.keys(networkAgent._dataStorage).length).to.be.equal(0);
        networkAgent._setCapturingEnabled({ enabled: true }, done);
      });

      commandlet.stdin.write('send GET request\n');
    });

    it('should handle failure of request', function(done) {
      loadingFailed.then(function(message) {
        containKeys(message, {
          errorText: 'ECONNRESET',
          type: 'XHR'
        });
        networkAgent.getResponseBody({requestId: message.requestId}, function(error, result) {
          containKeys(result, {
            base64Encoded: false,
            body: ''
          });
          done();
        });
      });

      commandlet.stdin.write('send GET request with handled failure\n');
    });

    it('should handle unhandled failure of request', function(done) {
      loadingFailed.then(function(message) {
        containKeys(message, {
          errorText: '(unhandled) ECONNRESET',
          type: 'XHR'
        });
        done();
      });

      commandlet.stdin.write('send GET request with unhandled failure\n');
    });

    it('should handle failure of request to unexisted server', function(done) {
      this.timeout(5000);
      loadingFailed.then(function(message) {
        containKeys(message, {
          errorText: 'ECONNREFUSED',
          type: 'XHR'
        });
        done();
      });

      commandlet.stdin.write('send GET request to unexisted server\n');
    });

    it('should handle aborted request (on creation step)', function(done) {
      loadingFailed.then(function(message) {
        containKeys(message, {
          type: 'XHR',
          canceled: true
        });
        done();
      });

      commandlet.stdin.write('send GET request aborted on creation step\n');
    });

    it('should handle aborted request (on response step)', function(done) {
      loadingFailed.then(function(message) {
        containKeys(message, {
          type: 'XHR',
          canceled: true
        });
        done();
      });

      commandlet.stdin.write('send GET request aborted on response step\n');
    });
  });

  function containKeys(obj, keys) {
    Object.keys(keys).forEach(function(key) {
      expect(obj[key], key + ' is equal to ' + keys[key]).to.be.equal(keys[key]);
    });
  }

  function initializeNetwork(done) {
    launcher.runCommandlet(true, function(child, session) {
      commandlet = child;
      debuggerClient = session.debuggerClient;
      frontendClient = session.frontendClient;

      commandlet.stdout.pipe(process.stdout);

      var injectorClient = new InjectorClient({}, session);
      session.injectorClient = injectorClient;

      networkAgent = new NetworkAgent({}, session);

      injectorClient.once('inject', function(injected) {
        if (injected) debuggerClient.request('continue', null, done);
      });
      injectorClient.once('error', done);

      injectorClient.inject();
    });
  }
});
