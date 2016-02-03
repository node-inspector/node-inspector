'use strict';

var co = require('co');
var expect = require('chai').expect;
var launcher = require('./helpers/launcher.js');
var SessionStub = require('./helpers/SessionStub.js');
var InjectorClient = require('../lib/InjectorClient.js');
var NetworkAgent = require('../lib/Agents/NetworkAgent.js');

var session;
var commandlet;
var debuggerClient;
var frontendClient;
var networkAgent;

describe('NetworkAgent', () => {
  describe('loadResourceForFrontend', function() {
    it('should load data URLs', () => {
      var agent = new NetworkAgent({ inject: false }, new SessionStub());
      return agent.handle('loadResourceForFrontend', {
        url: 'data:text/plain;base64,aGVsbG8gd29ybGQ='
      }).then(result => expect(result.content).to.equal('hello world'));
    });
  });

  describe('HTTP request wrapper', () => {
    var requestWillBeSent;
    var responseReceived;
    var dataReceived;
    var loadingFinished;
    var loadingFailed;

    beforeEach(() => initializeNetwork());
    beforeEach(() => {
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

    it('should emit `requestWillBeSent` event', () => {
      commandlet.stdin.write('send GET request\n');
      return requestWillBeSent.then(message => {
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
      });
    });

    it('should emit `responseReceived` event', () => {
      commandlet.stdin.write('send GET request\n');
      return responseReceived.then(message => {
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
          .map(name => [name + 'Start', name + 'End']);

        expect(message.response.timing).to.have.all.keys(Array.prototype.concat.apply([
          'requestTime',
          'serviceWorkerFetchReady',
          'receiveHeadersEnd'
        ], timings));

        timings.forEach(timing => {
          var start = timing[0];
          var end = timing[1];

          expect(message.response.timing[start], start + ' less than or equal to ' + end)
            .to.be.at.most(message.response.timing[end]);
        });
      });
    });

    it('should emit `dataReceived` event', () => {
      commandlet.stdin.write('send GET request\n');
      return dataReceived.then(message => {
        expect(message).to.have.property('requestId').that.is.a('string');
        expect(message).to.have.property('timestamp').that.is.a('number');
        expect(message.dataLength).to.be.above(0);
        expect(message.encodedDataLength).to.be.above(0);
      });
    });

    it('should emit `loadingFinished` event', () => {
      commandlet.stdin.write('send GET request\n');
      return loadingFinished.then(message => {
        expect(message).to.have.property('requestId').that.is.a('string');
        expect(message).to.have.property('timestamp').that.is.a('number');
        expect(message.encodedDataLength).to.be.equal(13);
      });
    });

    it('should capture response data', () => {
      commandlet.stdin.write('send GET request\n');
      return co(function * () {
        var message = yield loadingFinished;
        var result = yield networkAgent.handle('getResponseBody', {
          requestId: message.requestId
        });
        expect(result).to.deep.equal({
          body: 'RESPONSE DATA',
          base64Encoded: false
        });
      });
    });

    it('should clean captured data', () => {
      commandlet.stdin.write('send GET request\n');
      return co(function * () {
        var message = yield loadingFinished;
        expect(Object.keys(networkAgent._dataStorage).length).to.be.equal(1);
        yield networkAgent.handle('_clearCapturedData');
        expect(Object.keys(networkAgent._dataStorage).length).to.be.equal(0);
      });
    });

    it('should stop data capturing', () => {
      expect(Object.keys(networkAgent._dataStorage).length).to.be.equal(0);
      commandlet.stdin.write('send GET request\n');
      return co(function * () {
        yield networkAgent.handle('_setCapturingEnabled', { enabled: false });
        yield loadingFinished;
        expect(Object.keys(networkAgent._dataStorage).length).to.be.equal(0);
        yield networkAgent.handle('_setCapturingEnabled', { enabled: true });
      });
    });

    it('should handle failure of request', () => {
      commandlet.stdin.write('send GET request with handled failure\n');
      return co(function * () {
        var message = yield loadingFailed;
        containKeys(message, {
          errorText: 'ECONNRESET',
          type: 'XHR'
        });
        var result = yield networkAgent.handle('getResponseBody', { requestId: message.requestId });
        containKeys(result, {
          base64Encoded: false,
          body: ''
        });
      });
    });

    it('should handle unhandled failure of request', () => {
      commandlet.stdin.write('send GET request with unhandled failure\n');
      return loadingFailed.then(message => containKeys(message, {
        errorText: '(unhandled) ECONNRESET',
        type: 'XHR'
      }));
    });

    it('should handle aborted request (on creation step)', () => {
      commandlet.stdin.write('send GET request aborted on creation step\n');
      return loadingFailed.then(message => containKeys(message, {
        type: 'XHR',
        canceled: true
      }));
    });

    it('should handle aborted request (on response step)', () => {
      commandlet.stdin.write('send GET request aborted on response step\n');
      return loadingFailed.then(message => containKeys(message, {
        type: 'XHR',
        canceled: true
      }));
    });
  });

  function containKeys(obj, keys) {
    Object.keys(keys).forEach(key =>
      expect(obj[key], key + ' is equal to ' + keys[key]).to.be.equal(keys[key]));
  }

  function expand(instance) {
    commandlet = instance.child;
    session = instance.session;
    debuggerClient = session.debuggerClient;
    frontendClient = session.frontendClient;
  }

  function initializeNetwork() {
    return co(function * () {
      yield launcher.runCommandlet(true).then(expand);

      commandlet.stdout.pipe(process.stdout);

      var injectorClient = new InjectorClient({}, session);
      session.injectorClient = injectorClient;

      networkAgent = new NetworkAgent({}, session);

      yield networkAgent.ready();
      yield debuggerClient.request('continue');
    });
  }
});
