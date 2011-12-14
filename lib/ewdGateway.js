/*

 ----------------------------------------------------------------------------
 | Node.js based GT.M/Cache gateway for EWD                                 |
 |                                                                          |
 | Copyright (c) 2011 M/Gateway Developments Ltd,                           |
 | Reigate, Surrey UK.                                                      |
 | All rights reserved.                                                     |
 |                                                                          |
 | http://www.mgateway.com                                                  |
 | Email: rtweed@mgateway.com                                               |
 |                                                                          |
 |                                                                          |
 | The MIT License                                                          |
 |                                                                          |
 | Permission is hereby granted, free of charge, to any person obtaining a  |
 | copy of this software and associated documentation files (the            |
 | 'Software'), to deal in the Software without restriction, including      |
 | without limitation the rights to use, copy, modify, merge, publish,      |
 | distribute, sublicense, and/or sell copies of the Software, and to       |
 | permit persons to whom the Software is furnished to do so, subject to    |
 | the following conditions:                                                |
 |                                                                          |
 | The above copyright notice and this permission notice shall be included  |
 | in all copies or substantial portions of the Software.                   |
 |                                                                          |
 | THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS  |
 | OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF               |
 | MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.   |
 | IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY     |
 | CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,     |
 | TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE        |
 | SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                   |
 ----------------------------------------------------------------------------

  ** Thanks to Stephen Chadwick (SJC) for modifications and improvements **
 
  Get required modules:

*/

var http = require("http");
var url = require("url");
var queryString = require("querystring");
var path = require("path"); 
var fs = require("fs");
var spawn = require('child_process').spawn;
var events = require("events");
var net = require('net');
var io;

/*
 ************************************************************
 *
 * Running the gateway:
 *
 *   GT.M: node ewdGateway.js
 *              will start the gateway on port 8081 using 5 connections to GT.M in current path
 *
 *         node ewdGateway.js 8000 10
 *               will start the gateway on port 8000 using 10 connections to GT.M in current path
 *
 *
 *   Cache: node ewdGateway.js 'cache' 'user'
 *              will start the gateway on port 8081 using 5 connections to USER namespace in Cache
 *      
 *          node ewdGateway.js 'cache' 'user' 8000 10
 *              will start the gateway on port 8000 using 10 connections to USER namespace in Cache
 *          
 *
 * EWD Gateway parameters
 *
 *  The parameters below can be edited as required
 *    poolSize = the number of concurrent GT.M/Cache connections to use to support web access
 *    httpPort = the TCP port on which Node.js is listening for web connections
 *    webServerRootPath = the path where Node.js will find standard resource files such as JS, CSS, jpeg  etc files
 *    ewdPath = the URL path used to indicate an EWD page (note: it must be wrapped in / characters)
 *
 *   trace = true if you want to get a detailed activity trace to the Node.js console
 *   silentStart = true if you don't want any message to the console when the gateway starts

 ************************************************************
*/

var ewdGateway = {

  buildNo: 22,
  buildDate: "13 December 2011",
  version: function() {
    return 'ewdGateway build ' + this.buildNo + ', ' + this.buildDate;
  },
  token:0,

  nodeListenerRoutine: 'nodeListener^%zewdNode',
  nodeServerRoutine: 'server^%zewdNode',

  fd: "\x01",
  rd: "\x02",
  terminator: "\x11\x12\x13\x14",
  requestInProcess: [],

  dump: function(string) {
    var dump = 'dump: ';
    for (var i=0; i<string.length; i++) dump = dump + ":" + string.charCodeAt(i);
    return dump;
  },

  addToEWDQueue: function(query, headersString, contentEsc, request, response) {
    ewdGateway.totalRequests++;
    var queuedRequest = {
      no: ewdGateway.totalRequests,
      type:'http',
      query:query,
      headersString: headersString,
      contentEsc: contentEsc,
      request:request,
      response:response
    };
    this.requestQueue.push(queuedRequest);

    var qLength = this.requestQueue.length;
    if (qLength > this.maxQueueLength) this.maxQueueLength = qLength;
    //if (ewdGateway.trace) console.log("added to Queue (http): " + queuedRequest.query + "; queue length = " + qLength + "; requestNo = " + ewdGateway.totalRequests + "; after " + this.elapsedTime() + " sec");
    // trigger the processing of the queue
    this.queueEvent.emit("processEWDQueue");
  },

  socketClientByToken: {},
  socketClient: {},

  addToSocketQueue: function(message,client) {
    if (ewdGateway.trace) ewdGateway.log("addToSocketQueue - message = " + message, false);
    var messageObj = JSON.parse(message);
    var messageType = messageObj.type;
    if (ewdGateway.trace) ewdGateway.log("messageType = " + messageType);
    var token = messageObj.token;
    //if (ewdGateway.trace) ewdGateway.log("token = " + token);
    if (messageType === 'initialise') {
      // reserved - can't be sent from a browser!
      return;
    }
    if (messageType === 'register') {
      ewdGateway.socketClientByToken[token] = client;
      ewdGateway.socketClient[client.id] = {token: token, connected: true};
      //if (ewdGateway.trace) ewdGateway.log("client " + client.id + " registered for token " + token);
      return;
    }
    message = messageObj.message;
    ewdGateway.totalRequests++;
    var queuedRequest = {
      no: ewdGateway.totalRequests,
      type:'socket',
      messageType: messageType,
      message: message,
      client: client,
      token: token
    };
    if (messageType === 'ewdGetFragment') {
      queuedRequest.targetId = messageObj.targetId;
      queuedRequest.page = messageObj.page;
      queuedRequest.nvp = messageObj.nvp;
    }
    this.requestQueue.push(queuedRequest);

    var qLength = this.requestQueue.length;
    if (qLength > this.maxQueueLength) this.maxQueueLength = qLength;
    //if (ewdGateway.trace) console.log("added to Queue (socket): " + message);
    // trigger the processing of the queue
    this.queueEvent.emit("processEWDQueue");
  },

  addToGlobalAccessQueue: function(queuedRequest) {
    this.requestQueue.push(queuedRequest);
    //this.totalRequests++;
    var qLength = this.requestQueue.length;
    if (qLength > this.maxQueueLength) this.maxQueueLength = qLength;
    //if (ewdGateway.trace) ewdGateway.log("added to Queue (globalAccess): " + queuedRequest.method);
    // trigger the processing of the queue
    this.queueEvent.emit("processEWDQueue");
  },

  db: {},

  onChildProcessData: function(connection, callback) {
    if (ewdGateway.connectionType === 'telnet') {
      ewdGateway.db[connection].on('data', function (data) {
        callback(data);
      });
    }
    else {
      ewdGateway.db[connection].stdout.on('data', function (data) {
        callback(data);
      });
    }
  },

  writeToChildProcess: function(connection, message) {
    if (ewdGateway.connectionType === 'telnet') {
      //console.log("writing to telnet connection: " + message)
      //console.log(ewdGateway.dump(message));
      this.db[connection].write(message);
    }
    else {
      this.db[connection].stdin.write(message);
    }
  },

  dbOutput:function(connection) {
    var contentStr = '';
    ewdGateway.onChildProcessData(connection, function(data) {
      var dataStr = data.toString();

      if (ewdGateway.trace) {
        if (ewdGateway.trace) ewdGateway.log("from " + ewdGateway.databaseName + " on connection " + connection + ":" + "\r\n" + dataStr + "\r\n=================\r\n");
        var dump = 'dump: ';
        for (i=0;i<dataStr.length;i++) dump = dump + ":" + dataStr.charCodeAt(i);
        //if (ewdGateway.trace) console.log(dump + "\r\n=================\r\n");
      }

      contentStr = contentStr + dataStr;
      var contentStr2 = contentStr.replace(/(\r\n|\n|\r)/g, '');
      var terminator = "\x11\x12\x13\x14";
      //var terminator = "\x11\x12\x13\x14" + ewdGateway.eol;
      //var terminator2 = "\x12\x13\x14" + ewdGateway.eol + "\n";
      var len = terminator.length;
      //if (contentStr.indexOf("\x11\x12\x13\x14" + ewdGateway.eol) !== -1) {
      if (contentStr2.substr(-len) === terminator) {
        ewdGateway.processDBData(contentStr, terminator, connection);
        contentStr = '';
      }
    });
  },

  processDBData: function(contentStr, terminator, connection) {
    var messageNo;
    var requestNo;
    if (ewdGateway.trace) ewdGateway.log("contentStr: " + contentStr);
    //console.log("contentStr: " + ewdGateway.dump(contentStr));
    //console.log("ewdGateway.cr = " + ewdGateway.dump(ewdGateway.cr));
    console.log("ewdGateway.eol = " + ewdGateway.dump(ewdGateway.eol));
    var eol = '\n';
    if (contentStr.indexOf('\r\n') !== -1) eol = '\r\n';
    var messages = contentStr.split(terminator + ewdGateway.eol);
    var limitx = 1;
    if (messages.length === 1) limitx = 0;
    console.log("!!! **** No of messages = " + messages.length);
    for (messageNo = 0; messageNo < (messages.length - limitx); messageNo++) {
      console.log("** messageNo = " + messageNo);
      ewdGateway.processDBMessage(messages[messageNo], connection);
    }
  },

  processDBMessage: function(message, connection) {
    var queuedRequest;
    var contentStr = message;
    //if (ewdGateway.trace) ewdGateway.log("message: " + contentStr);
    //console.log("message: " + ewdGateway.dump(contentStr));
    var pieces = contentStr.split("\x14\x13\x12\x11");
    var requestNo = pieces.shift();
    requestNo = requestNo.replace(/(\r\n|\n|\r)/g, '');
    contentStr = pieces.join("\x14\x13\x12\x11");
    if (ewdGateway.trace) ewdGateway.log("\n*** requestNo = " + requestNo + "\n");
    if (requestNo === '-99') {
      queuedRequest = {
        type: 'socket'
      };
    }
    else {
      queuedRequest = ewdGateway.requestInProcess[requestNo];
    }
    if (typeof queuedRequest === 'undefined') {
      //console.log("\r\n\!!!!!!!!!!!!!!!!!!!!! queuedRequest not found for request " + requestNo + "\r\n");
      //console.log("requestNo = " + ewdGateway.dump(requestNo));
      //console.log("contentStr = " + contentStr + "\r\n" + ewdGateway.dump(contentStr));
      //console.log("!!!!!!!!!!!!!!!!!!!!!!!!\r\n");
      return;
    }
    // ** return GlobalAccess value **
    if (ewdGateway.trace) ewdGateway.log("queuedRequest.type = " + queuedRequest.type);
    if (queuedRequest.type === 'globalAccess') {
      ewdGateway.processGlobalAccessMessage(requestNo, queuedRequest, contentStr, connection);
    }
    if (queuedRequest.type === 'socket') {
      ewdGateway.processSocketMessage(requestNo, queuedRequest, contentStr, connection);
    }
    if (queuedRequest.type === 'http') {
      ewdGateway.processHTTPMessage(requestNo, queuedRequest, contentStr, connection);
    }
  },

  processGlobalAccessMessage: function(requestNo, queuedRequest, contentStr, connection) {
    var method = queuedRequest.method;
    if (ewdGateway.trace) ewdGateway.log("globalAccess - returning results for request " + requestNo + ": " + method);
  
    /* 
      SJC (22-Aug-11): added a 'start of record' string to ensure that any unwanted additional
       output from Mumps is not inadvertantly treated as an error response.
       I retain data from before the start of record and pass it as result.output for
       mFunction - just in case someone's interested in such output... 
    */
    var pieces = contentStr.split("\x14\x13\x12\x11");
    if( pieces.length > 1 ) {
      /* 
        SJC: if this isn't the case, then one of the responses from mumps does not prefix
          the start of record string 
      */
      var outputStr = pieces[0];
      contentStr = pieces[1];
    } 
    else {
      outputStr = "";
    }
    pieces = contentStr.split("\x11\x12\x13\x14");
    var response = pieces[0];
    var dataStr = pieces[1];
    pieces = response.split(ewdGateway.cr);

    //console.log("outputStr: " + outputStr.length );
    //if (ewdGateway.trace) console.log("response: " + JSON.stringify(pieces));
    //console.log("dataStr: " + dataStr);

    // ** get **

    if (method === 'get') {
      var error = false;
      var value = '';
      if (pieces[0] !== '') error = pieces[0];
      if (!error) value = pieces[2];
      //console.log("*** value = " + value);
      queuedRequest.callback(error,{exists: pieces[1],value:value});
    }

    // ** set **
    if (method === 'set') {
      var error = false;
      if (pieces[0] !== '') error = pieces[0];
      var ok = false;
      if (!error) {
        if (pieces[1] === '1') ok = true;
      }
      queuedRequest.callback(error,{ok:ok});
    }

    // ** kill **
    if (method === 'kill') {
      var error = false;
      if (pieces[0] !== '') error = pieces[0];
      var ok = false;
      if (!error) {
        if (pieces[1] === '1') ok = true;
      }
      queuedRequest.callback(error,{ok:ok});
    }
			
    if (method === 'halt') {
      var error = false;
      if (pieces[0] !== '') error = pieces[0];
      var ok = false;
      if (!error) {
        if (pieces[1] === '1') ok = true;
      }
      queuedRequest.callback(error,{ok:ok});
    }

    // ** getJSON **

    if (method === 'getJSON') {
      var error = false;
      var value = '{}';
      if (pieces[0] !== '') error = pieces[0];
      if (!error) var value = pieces[1];
      queuedRequest.callback(error,JSON.parse(value));
    }

    if (method === 'getSubscripts') {
      var error = false;
      var value = '[]';
      if (pieces[0] !== '') error = pieces[0];
      if (!error) value = pieces[1];
      //if (ewdGateway.trace) console.log(value);
      queuedRequest.callback(error,JSON.parse(value));
    }

    if (method === 'increment') {
      var error = false;
      var value = '';
      if (pieces[0] !== '') error = pieces[0];
      if (!error) value = pieces[1];
      queuedRequest.callback(error,{value:value});
    }

    if (method === 'mFunction') {
      var error = false;
      var value = '';
      if (pieces[0] !== '') error = pieces[0];
      if (!error) value = pieces[1];
      //console.log("*** value = " + value);
      //SJC (22-Aug-11): added output to callback response object
      queuedRequest.callback(error,{value:value,output:outputStr});
    }

    if (ewdGateway.trace) ewdGateway.log("requestNo = " + requestNo + "; lastRequestNo = " + ewdGateway.db[connection].lastRequestNo);
    if (ewdGateway.db[connection].lastRequestNo === parseInt(requestNo)) {
      ewdGateway.db[connection].isAvailable = true;
      //console.log("connection " + connection + " is available again");
      ewdGateway.queueEvent.emit("processEWDQueue");
    }
    delete ewdGateway.requestInProcess[requestNo];
  },

  processSocketMessage: function(requestNo, queuedRequest, contentStr, connection) {

    // send socket message back to browser

    var smessageNo;
    var messageObj;

    if (ewdGateway.trace) ewdGateway.log("socket - sending response back to browser");
    var smessages = contentStr.split("\x11\x11\x11\x11");
    for (smessageNo = 0; smessageNo < smessages.length; smessageNo++) {
      smessage = smessages[smessageNo];
      if (smessage === '') {
        //contentStr = '';
        if (ewdGateway.db[connection].lastRequestNo === parseInt(requestNo)) {
          ewdGateway.db[connection].isAvailable = true;
          ewdGateway.queueEvent.emit("processEWDQueue");
        }
        delete ewdGateway.requestInProcess[requestNo];
      }
      if (ewdGateway.trace) ewdGateway.log("*** socket message=" + smessage);
      var markup = false;
      try {
        messageObj = JSON.parse(smessage);
      }
      catch(err) {
        // returning markup?  forward raw message to browser
        if (typeof queuedRequest !== 'undefined') {
          if (typeof queuedRequest.client !== 'undefined') {
            queuedRequest.client.json.send(smessage);
          }
        }
        //contentStr = '';
        if (ewdGateway.db[connection].lastRequestNo === parseInt(requestNo)) {
          ewdGateway.db[connection].isAvailable = true;
          ewdGateway.queueEvent.emit("processEWDQueue");
        }
        delete ewdGateway.requestInProcess[requestNo];
        markup = true;
      }
      if (!markup) {
        var token;
        var type;
        var messageType = messageObj.type;
        smessage = messageObj.message;

        if (ewdGateway.trace) ewdGateway.log("messageType = " + messageType);
        switch (messageType) {

          case 'noSession':
            token = messageObj.token;
            if (ewdGateway.trace) ewdGateway.log("NoSession - token = " + token);
            smessage = 'Session does not exist or has timed out';
            if (ewdGateway.trace) ewdGateway.log("message=" + smessage);
            queuedRequest.client.json.send({type: 'error', message: smessage});
            if (typeof ewdGateway.socketClientByToken[token] !== 'undefined') {
              delete ewdGateway.socketClientByToken[token];
            }
            break;

          case 'serverSend':
            if (ewdGateway.trace) ewdGateway.log("serverSend: contentStr=" + smessage);
            type = messageObj.subType;
            token = messageObj.token;
            if (ewdGateway.trace) ewdGateway.log("serverSend: token = " + token);
            if (typeof ewdGateway.socketClientByToken[token] !== 'undefined') {
              var socketClient = ewdGateway.socketClientByToken[token];
              if (ewdGateway.socketClient[socketClient.id].connected) {
                console.log("sending message to clientId " + socketClient.id + ": " + smessage);
                socketClient.json.send({type: type, message: smessage});
              }
            }
            break;

          case 'markup':
            if (typeof queuedRequest !== 'undefined') {
              if (typeof queuedRequest.client !== 'undefined') {
                queuedRequest.client.json.send({type: messageType, targetId: messageObj.targetId, content: messageObj.content});
              }
            }
            break;

          default:
            if (ewdGateway.trace) ewdGateway.log("messageType: " + messageType + "; message=" + smessage);
            if (typeof queuedRequest !== 'undefined') {
              if (typeof queuedRequest.client !== 'undefined') {
                queuedRequest.client.json.send({type: messageType, message: smessage});
              }
            }
            break;
        }
            
        contentStr = '';
        if (requestNo !== '-99') {
          if (ewdGateway.db[connection].lastRequestNo === parseInt(requestNo)) {
            ewdGateway.db[connection].isAvailable = true;
            ewdGateway.queueEvent.emit("processEWDQueue");
          }
          delete ewdGateway.requestInProcess[requestNo];
        }
      }
    }
  },

  processHTTPMessage: function(requestNo, queuedRequest, contentStr, connection) {

    // send HTTP response back to browser

    //entire payload received - now send it to browser
    // first separate the head and body and extract the headers

    var headers = {};
    var pieces = contentStr.split("\x11\x12\x13\x14");
    contentStr = pieces[0];
    //var dmp = contentStr.substr(0,200);
    //console.log("contentStr = " + ewdGateway.dump(dmp));
    var refreshStr = pieces[1];
    pieces = contentStr.split(ewdGateway.eol + ewdGateway.eol);
    var headerStr = pieces[0];
    if (headerStr.substr(0,6) === '<html>') {
      pieces[1] = headerStr;
      headerStr = 'HTTP/1.1 200 OK/r/nContent-type: text/html/r/nEWD-headerEnd: 1';
    }
    if (ewdGateway.trace) ewdGateway.log("headerStr = " + headerStr);
    pieces.splice(0,1)
    var bodyStr = pieces.join(ewdGateway.eol + ewdGateway.eol);
    pieces = headerStr.split(" ");
    var httpStatus = pieces[1];
    var preBlockResponse = false;
    var headerPieces = headerStr.split(ewdGateway.eol);
    for (var no = 1;no < headerPieces.length;no++) {
      var header = headerPieces[no];
      var nvps = header.split(": ");
      var name = nvps[0];
      if (name == '') {
        no = 999999999;
      }
      else {
        var value = nvps[1];
        if (name === 'EWD-pre') {
          preBlockResponse = true;
        }
        else {
          if (ewdGateway.trace) ewdGateway.log("header name=" + name + "; value=" + value);
          headers[name] = value;
        }
      }
    }

    // If this isn't a pre-block, send it all to the browser

    if (!preBlockResponse) {
      if (!headers["Content-type"]) headers["Content-type"] = "text/html";
      if (httpStatus === '') httpStatus = 200;
      if (ewdGateway.trace) {
        ewdGateway.log("httpStatus = " + httpStatus);
        ewdGateway.log("headers = " + JSON.stringify(headers));
      }
      queuedRequest.response.writeHead(httpStatus, headers);
      queuedRequest.response.write(bodyStr);
      queuedRequest.response.end();
      //if (ewdGateway.trace) console.log("header and body sent to browser");
      // reset buffers
      headers = {};
      contentStr = '';
      if (ewdGateway.db[connection].lastRequestNo === parseInt(requestNo)) {
        if (ewdGateway.trace) ewdGateway.log("Connection " + connection + " reset and waiting..");
        ewdGateway.db[connection].isAvailable = true;
        // fire event to process queue in case anything in there
        ewdGateway.queueEvent.emit("processEWDQueue");
      }
      delete ewdGateway.requestInProcess[requestNo];
    }
    else {
      // this is a pre-block response - run the Javascript 
      // pre-page script and then invoke the body section
      // first determine which original response this relates to
        
      var textArr = bodyStr.split("<endofpre ");
      if (ewdGateway.trace) ewdGateway.log('<endofpre> response found: ' + textArr[1]);
      var respArr = textArr[1].split(' ');
      var reqNoArr = respArr[0].split('=');
      var sessArr = respArr[1].split('=');
      if (ewdGateway.trace) ewdGateway.log('pre response relates to request ' + reqNoArr[1]);
           
      // look up against:
      //  ewdGateway.ewdMap.request[requestNo] = {app:app,page:page,query:query,headersString:headersString,
      //                            request:request,response:response};
        
      var req = ewdGateway.ewdMap.request[reqNoArr[1]];
      delete ewdGateway.ewdMap.request[reqNoArr[1]];
        
      // now run JS pre-page script
    
      if (ewdGateway.trace) ewdGateway.log("Running Javascript pre-page method: " + ewdGateway.ewdMap.method[req.app][req.page]);

      ewdGateway.ewdMap.module[req.app][ewdGateway.ewdMap.method[req.app][req.page]](sessArr[1], function(error, results) {
        if (ewdGateway.trace) ewdGateway.log("Pre-page script returned: " + JSON.stringify(results));
        // add list of response headers to add to body response
        // Javascript pre-page script can override any of the standard ones
        //  header["name"] = value;
          
        req.headers["response-headers"] = headers;
          
        // flag to just run body()
        req.headers["ewd_page_block"] = "body";
        req.headers["ewd_sessid"] = sessArr[1];
        if (ewdGateway.trace) ewdGateway.log("sessid = " + sessArr[1]);
        if (results.error !== '') req.headers["ewd_error"] = results.error;
        var headersString = escape(JSON.stringify(req.headers));
        headers = {};
        contentStr = '';
        if (ewdGateway.db[connection].lastRequestNo === parseInt(requestNo)) {
          ewdGateway.db[connection].isAvailable = true;
        }
        ewdGateway.sendRequestTodb(req.query, headersString, req.contentEsc, req.request, req.response);
      });
    }
  },

  connectionUpdate: false,

  display404: function(response) {
    response.writeHead(404, {"Content-Type" : "text/plain" });  
    response.write("404 Not Found \n");  
    response.end();  
  },

  elapsedTime: function() {
    var now = new Date().getTime();
    //console.log("now = " + now + "; StartTime = " + this.startTime);
    return (now - this.startTime)/1000;
  },

  ewdMap: {
    method: {},
    module: {},
    request: {},
    obj: {}
  },

  getConnection: function() {
    var i;
    // try to find a free connection, otherwise return false
    //console.log("in getConnection");
    for (i=0;i<this.poolSize;i++) {
      if (this.db[i].isAvailable) {
        //console.log("connection " + i + " available");
        this.db[i].isAvailable = false;
        return i;
      }
    }
    //console.log("no connections available");
    return false;
  },
  connectionsMade: 0,

  makeTelnetConnection: function(i, port, host, callback) {
    var io = net.createConnection(port, host);
    ewdGateway.db[i] = io;
    io.connectionNo = i;
    ewdGateway.db[i].terminator = ewdGateway.telnetTerminator;

    ewdGateway.db[i].on("close", function() {
      if (ewdGateway.trace) ewdGateway.log("connection " + i + " closed");
      delete ewdGateway.requestsByConnection[i];
      delete ewdGateway.db[i];
    });

    ewdGateway.db[i].on("connect", function() {
      if (ewdGateway.trace) ewdGateway.log(io.connectionNo + ": telnet connection to host (" + ewdGateway.host + ":" + ewdGateway.telnetPort + ") initialised");
      var contentStr = '';
      var dataStr;
      var ready1 = false;
      var ready2 = false;
      var pieces;
      var started = false;
      ewdGateway.db[i].on('data', function (data) {
        dataStr = data.toString();
        contentStr = contentStr + dataStr;
        if (!ready1) {
          if (contentStr.indexOf(ewdGateway.db[i].terminator) !== -1) {
            ewdGateway.db[i].terminator = "\r\n";
            contentStr = '';
            ready1 = true;
            ewdGateway.db[i].write('do ' + ewdGateway.nodeListenerRoutine + "\r\n");
          }
        }
        else {
          if ((!ready2)&&(contentStr.indexOf(ewdGateway.db[i].terminator) !== -1)) {
            pieces = contentStr.split("\r\n");
            var response = pieces[0];
            if (contentStr.indexOf(ewdGateway.nodeListenerRoutine) !== -1) response = '';
            contentStr = '';
            ewdGateway.dbOutput(ewdGateway.db[i].connectionNo);
            ready2 = true;
            if (!started)  {
              ewdGateway.connectionsMade++;
              started = true;
            }
            //ewdGateway.log("connection " + i + ": connectionsMade = " + ewdGateway.connectionsMade);
            if (ewdGateway.connectionsMade === (ewdGateway.poolSize)) {
              ewdGateway.connectionsMade = false;
              if (!ewdGateway.silentStart) {
                ewdGateway.log("********************************************");
                ewdGateway.log("*** EWD Gateway for " + ewdGateway.databaseName + " Build " + ewdGateway.buildNo + " (" + ewdGateway.buildDate + ") ***");
                ewdGateway.log("********************************************");
                ewdGateway.log(ewdGateway.poolSize + " connections established to " + ewdGateway.databaseName);
                if (ewdGateway.startWebserver) {
                  ewdGateway.log("Web server started successfully on port " + ewdGateway.httpPort);
                }
                else {
                  ewdGateway.log("Web server not started");
                }
                if (ewdGateway.trace) {
                  ewdGateway.log("Trace mode is on");
                }
                else {
                  ewdGateway.log("Trace mode is off");
                }
              }			  
              callback(ewdGateway);
            }
          }
        }
      });
    });
  },


  makeConnections: function(callback) {
    //ewdGateway.log("poolSize = " + this.poolSize);
    for (var i = 0; i < ewdGateway.poolSize; i++) {
      if (this.database === 'gtm') {
        this.db[i] = spawn(ewdGateway.gtmShellCommand, ['-run', this.nodeListenerRoutine]);
      }
      else {
        if (ewdGateway.connectionType === 'telnet') {
          ewdGateway.makeTelnetConnection(i, ewdGateway.telnetPort, ewdGateway.host, callback)
        }
        else {
          ewdGateway.db[i] = spawn('csession', ['cache', '-U', this.namespace, this.nodeListenerRoutine]);

          ewdGateway.db[i].on('exit', function (code) {
	     if (ewdGateway.trace) ewdGateway.log("connection " + i + " closed");
	     delete ewdGateway.requestsByConnection[i];
	     delete ewdGateway.db[i];
	   });
        }
      }
      this.db[i].response = {};
      this.db[i].isAvailable = true;
      this.requestsByConnection[i] = 0;
    }

    // connect server sender process

    if (this.database === 'gtm') {
      this.db[this.poolSize] = spawn(ewdGateway.gtmShellCommand, ['-run', this.nodeServerRoutine]);
    }
    else {
      if (ewdGateway.connectionType !== 'telnet') {
        this.db[this.poolSize] = spawn('csession', ['cache', '-U', this.namespace, this.nodeServerRoutine]);
      }
    }

    //

    if (ewdGateway.connectionType !== 'telnet') {

      for (var i = 0; i < ewdGateway.poolSize; i++) {
        ewdGateway.dbOutput(i);
      }

      // set up server sender connection
      ewdGateway.db[ewdGateway.poolSize].type = 'socket'
      ewdGateway.dbOutput(ewdGateway.poolSize);

      if (!ewdGateway.silentStart) {
        ewdGateway.log("********************************************");
        ewdGateway.log("*** EWD Gateway for " + ewdGateway.databaseName + " Build " + ewdGateway.buildNo + " (" + ewdGateway.buildDate + ") ***");
        ewdGateway.log("********************************************");
        ewdGateway.log(ewdGateway.poolSize + " connections established to " + ewdGateway.databaseName);
        if (ewdGateway.startWebserver) {
          ewdGateway.log("Web server started successfully on port " + ewdGateway.httpPort);
        }
        else {
          ewdGateway.log("Web server not started");
        }
        if (ewdGateway.trace) {
          ewdGateway.log("Trace mode is on");
        }
        else {
          ewdGateway.log("Trace mode is off");
        }
      }

      callback(ewdGateway);
    }
  },

  maxQueueLength: 0,
  processingEWDQueue: false,

  processEWDQueue: function() {
    // requestNo <1> command <1> globalName <1> subscripts <1> data <2> ...repeat
    //ewdGateway.log("processing EWD Queue");
    if (ewdGateway.requestQueue.length === 0) {
      // nothing in the queue
      //console.log("EWD Queue empty");
      if (typeof connection !== 'undefined') gateway.db[connection].isAvailable = true;
      return;
    }
    var connection = ewdGateway.getConnection();
    //console.log("connection allocated = " + connection);
    if (connection !== false) {
      ewdGateway.queueEvents++;
      ewdGateway.connectionUpdate = true;
      if (typeof ewdGateway.requestsByConnection[connection] === 'undefined') ewdGateway.requestsByConnection[connection] = 0;
      ewdGateway.requestsByConnection[connection]++;
      if (ewdGateway.trace) ewdGateway.log("processing queue: " + ewdGateway.queueEvents + "; queue length " + ewdGateway.requestQueue.length + "; after " + ewdGateway.elapsedTime() + " seconds");
      var requestString = '';
      var getAnother = true;
      var request;
      var params;
      var string;
      var value;
      var type;
      var totalLen;
      var lastRequestNo = 0;
      while (getAnother) {
        if (ewdGateway.trace) ewdGateway.log("Queue length: " + ewdGateway.requestQueue.length);
        if (ewdGateway.requestQueue.length === 0) {
          getAnother = false;
          //console.log("1: sending to connection " + connection + ": " + requestString);
          if (requestString !== '') {
            ewdGateway.writeToChildProcess(connection, requestString + ewdGateway.cr);
            requestString = '';
            ewdGateway.db[connection].lastRequestNo = lastRequestNo;
          }
        }
        else {
          queuedRequest = ewdGateway.requestQueue.shift();
          var type = queuedRequest.type;
          var requestNo = queuedRequest.no;

          switch (type) {

            case 'http':

              string = type + ewdGateway.fd + queuedRequest.query + ewdGateway.fd + queuedRequest.headersString + ewdGateway.fd + queuedRequest.request.method + ewdGateway.fd + queuedRequest.contentEsc + ewdGateway.rd;
              break;

            case 'socket':
              //console.log("found a socket message on the queue");

              // check to see if locally defined custom method in Javascript (ie via user extension of ewdGateway object)

              if (typeof ewdGateway.messageHandler[queuedRequest.messageType] !== 'undefined') {
                if (ewdGateway.trace) ewdGateway.log("invoking custom method " + queuedRequest.messageType);
                queuedRequest.sendResponse = function(json) {
                  queuedRequest.client.json.send(json);
                };
                ewdGateway.messageHandler[queuedRequest.messageType](queuedRequest);
                ewdGateway.db[connection].isAvailable = true;
              }

              else if (queuedRequest.messageType === 'ewdGetFragment') {
                if (ewdGateway.trace) ewdGateway.log("ewdGetFragment: " + queuedRequest.targetId);
                string = type + ewdGateway.fd + queuedRequest.messageType + ewdGateway.fd + queuedRequest.token + ewdGateway.fd + queuedRequest.page + ewdGateway.fd + queuedRequest.targetId + ewdGateway.fd + queuedRequest.nvp + ewdGateway.rd;
              }

              else {
                if (ewdGateway.trace) ewdGateway.log("sending message");
                string = type + ewdGateway.fd + queuedRequest.messageType + ewdGateway.fd + queuedRequest.token + ewdGateway.fd + queuedRequest.message + ewdGateway.rd;
              }
              break;

            case 'globalAccess':

              string = ewdGateway.globalAccessCommand(queuedRequest);
			  //console.log("globalAccess: string = " + string);
              break;


            default:
              //ignore
          }

          string = requestNo + ewdGateway.fd + string;
          totalLen = requestString.length + string.length;
          if (totalLen > ewdGateway.maxMsgLength) {
            ewdGateway.requestQueue.unshift(queuedRequest); // put last request back on the queue
            getAnother = false;
            //console.log("2: sending to connection " + connection + ": " + requestString);
            ewdGateway.writeToChildProcess(connection, requestString + ewdGateway.cr);
            //ewdGateway.db[connection].stdin.write(requestString + ewdGateway.cr);
            requestString = '';
            ewdGateway.db[connection].lastRequestNo = lastRequestNo;
          }
          else {
            requestString = requestString + string;
            //console.log("requestString = " + requestString);
            //ewdGateway.log("*** saving queuedRequest object no " + queuedRequest.no);
            //ewdGateway.log("*** string = " + string);
            //ewdGateway.log("this will be for connection " + connection);
            ewdGateway.requestInProcess[queuedRequest.no] = queuedRequest;
            lastRequestNo = requestNo;
          }
        }
      }
    }
  },

  queueEvents: 0,
  requestsByConnection: {},
  requestNo: 0,
  requestQueue: [],

  sendRequestTodb: function(queuedRequest) {
    var connection = this.getConnection();
    if (connection !== false) {
      if (this.trace) ewdGateway.log("Request sent to Cache using connection = " + connection);
      this.requestsByConnection[connection]++;
      this.connectionUpdate = true;
      var type = queuedRequest.type;
      this.db[connection].type = type;

      switch (type) {

        case 'http':

          // forward http request to back-end (GT.M / Cache)

          this.db[connection].response = queuedRequest.response;
          ewdGateway.writeToChildProcess(connection, type + "\r\n" + queuedRequest.query + "\r\n" + queuedRequest.headersString + "\r\n" + queuedRequest.request.method + "\r\n" + queuedRequest.contentEsc + "\r\n");
          //this.db[connection].stdin.write(type + "\r\n" + queuedRequest.query + "\r\n" + queuedRequest.headersString + "\r\n" + queuedRequest.request.method + "\r\n" + queuedRequest.contentEsc + "\r\n");
          break;
      
        case 'socket':

          // check to see if locally defined custom method in Javascript (ie via user extension of ewdGateway object)

          if (typeof ewdGateway.messageHandler[queuedRequest.messageType] !== 'undefined') {
            if (ewdGateway.trace) ewdGateway.log("invoking custom method " + queuedRequest.messageType);
            ewdGateway.db[connection].isAvailable = true;
            queuedRequest.sendResponse = function(json) {
              queuedRequest.client.json.send(json);
            };
            ewdGateway.messageHandler[queuedRequest.messageType](queuedRequest);
          }

          else if (queuedRequest.messageType === 'ewdGetFragment') {
            if (ewdGateway.trace) ewdGateway.log("ewdGetFragment: " + queuedRequest.targetId);
            this.db[connection].client = queuedRequest.client;
            ewdGateway.writeToChildProcess(connection, type + "\r\n" + queuedRequest.messageType + "\r\n" + queuedRequest.token + "\r\n" + queuedRequest.page + "\r\n" + queuedRequest.targetId + "\r\n" + queuedRequest.nvp + "\r\n");
            //this.db[connection].stdin.write(type + "\r\n" + queuedRequest.messageType + "\r\n" + queuedRequest.token + "\r\n" + queuedRequest.page + "\r\n" + queuedRequest.targetId + "\r\n" + queuedRequest.nvp + "\r\n");
          }

          else {
            if (ewdGateway.trace) ewdGateway.log("sending message");
            this.db[connection].client = queuedRequest.client;
            ewdGateway.writeToChildProcess(connection, type + "\r\n" + queuedRequest.messageType + "\r\n" + queuedRequest.token + "\r\n" + queuedRequest.message + "\r\n");
            //this.db[connection].stdin.write(type + "\r\n" + queuedRequest.messageType + "\r\n" + queuedRequest.token + "\r\n" + queuedRequest.message + "\r\n");
          }
          break;

        case 'globalAccess':

          // forward socket message to back-end (GT.M / Cache)
          this.invokeGlobalAccessCommand(queuedRequest, connection);
          break;

        default:
          //ignore
      }
      return true;
    }
    else {
      return false;
    }
  },

  globalAccessCommand: function(request) {
    //if (ewdGateway.trace) console.log("invoke GlobalAccessCommand: " + request.method);
    var method = request.method;
    var string = "globalAccess" + ewdGateway.fd + method + ewdGateway.fd;
    var params = request.params;
    var subscripts = '';
    var parameters = '';
    var value = '';
    var from = '';
    var to = '';
    if (typeof params.value !== 'undefined') value = params.value;
    if (typeof params.from !== 'undefined') from = params.from;
    if (typeof params.to !== 'undefined') to = params.to;
    if (typeof params.subscripts !== 'undefined') subscripts = JSON.stringify(params.subscripts);
    if (typeof params.parameters !== 'undefined') parameters = JSON.stringify(params.parameters);
    
    if (method === 'mFunction') {
      string = string + params.functionName + ewdGateway.fd + parameters + ewdGateway.rd;
    }
    else {
      string = string + params.global + ewdGateway.fd + subscripts + ewdGateway.fd + value + ewdGateway.fd + from + ewdGateway.fd + to + ewdGateway.rd;
    }
    return string;
  },

  sendTodb: function(request,response,urlObj, content) {
    var error;
    var headers = {
      headers: request.headers,
      server_protocol: 'HTTP/' + request.httpVersion,
      remote_Addr: request.connection.remoteAddress,
      script_name: urlObj.pathname
    };
    var contentEsc = escape(content);
    var query = escape(JSON.stringify(urlObj.query));
    //if (this.trace) console.log("sending query: " + query);
    //if (this.trace) console.log("pathname: " + urlObj.pathname);
    var pathParts = urlObj.pathname.split("/");
    var noOfParts = pathParts.length;
    var page = pathParts[noOfParts - 1];
    var pageParts = page.split(".");
    page = pageParts[0].toLowerCase();
    var app = pathParts[noOfParts - 2].toLowerCase();
    var headersString = escape(JSON.stringify(headers));
     
    if (this.trace) ewdGateway.log("incoming request for app: " + app + "; page: " + page);
    
    // Does this app have a Javascript pre-page script?

    if (this.ewdMap.method[app]) {
     
      // load the module for this app
      if (!this.ewdMap.module[app]) {
        this.ewdMap.module[app] = require('./node-' + app);
      }
       
      // does this page have a pre-page script?
      if (this.ewdMap.method[app][page]) {
        if (this.ewdMap.method[app][page] !== '') {
          // flag to just run pre() part
          this.requestNo++;
          headers["ewd_page_block"] = "pre";
          headers["ewd_requestNo"] = this.requestNo;
          headersString = escape(JSON.stringify(headers));
          this.ewdMap.request[requestNo] = {app:app,page:page,query:query,headers:headers,contentEsc:contentEsc,request:request,response:response};
          this.addToEWDQueue(query, headersString, contentEsc, request, response);
        }
        else {
          // this page doesn't have a Javascript pre-page script: run this page as standard
          this.addToEWDQueue(query, headersString, contentEsc, request, response);
        }
      }
      else {
        // this page doesn't have a Javascript pre-page script: run this page as standard
        this.addToEWDQueue(query, headersString, contentEsc, request, response);
      }
    }
    else {
      // if not then run as standard page
      this.addToEWDQueue(query, headersString, contentEsc, request, response);
    }
  },

  silentStart: false,
  startTime: new Date().getTime(),
  totalRequests: 0,
  queueEvent: new events.EventEmitter(),

  dump: function(text) {
    var dump = '';
    for (var i = 0; i < text.length; i++) dump = dump + ":" + text.charCodeAt(i);
    return dump;
  },

  webserver: http.createServer(function(request, response) {
    /*
      SJC: Added following check for multi-part forms, if a formHandler has been registered then use that.
        Avoids potentially multi-megabyte file uploads being collected in the request.content field.
        If the custom formHandler doesn't want to handle the form, then it should return boolean false,
        otherwise return a boolean true value.
    */
    if((request.method.toLowerCase() === 'post')&&(request.headers['content-type'].substring(0,20) === 'multipart/form-data;')&&(typeof ewdGateway.formHandler === 'function')&&(ewdGateway.formHandler(request,response))) return;
    request.content = '';
    request.on("data", function(chunk) {
      request.content += chunk;
    });
    request.on("end", function(){
      var contentType;
      var urlObj = url.parse(request.url, true); 
      var uri = urlObj.pathname;
      if (uri === '/favicon.ico') {
        ewdGateway.display404(response);
        return;
      }
      if (ewdGateway.trace) ewdGateway.log(uri);

      /*
        SJC: Changed the following 'if' statement to ensure that only requests that should be handled by EWD
          are sent to the database, anything else that happens to share the same path will then fall through
          this check.
          Extensions other than 'ewd' and 'mgwsi' are not checked for. 
      */
      //if (uri.indexOf(ewdGateway.ewdPath) !== -1) {
      if((uri.substring(0,ewdGateway.ewdPath.length)===ewdGateway.ewdPath)&&((uri.substring(uri.length-4)==='.ewd')||(uri.substring(uri.length-6)==='.mgwsi'))) {
        //console.log("add request to queue");
        ewdGateway.sendTodb(request,response,urlObj, request.content);
      }
      /*
        SJC: Added the following 'if' statement to the 'else' to allow a custom request handler to be included,
          if this function is not defined or it returns boolean false then the existing code in the following
          else block will be executed as normal.
          If the custom request handler will handle the request then it must return boolean true. 
      */
      else if((typeof ewdGateway.requestHandler === 'function')&&(ewdGateway.requestHandler(urlObj,request,response))) return;
      else {
        //*SJC: Added the 'unescape' function below to handle filenames containing spaces (%20) or other odd characters
        var fileName = unescape(ewdGateway.webServerRootPath + uri);
		if (ewdGateway.trace) ewdGateway.log("fileName = " + fileName);
        path.exists(fileName, function(exists) {  
          if(!exists) {  
            response.writeHead(404, {"Content-Type": "text/plain"});  
            response.write("404 Not Found\n");  
            response.end();  
            return;  
          }
          fs.readFile(fileName, "binary", function(err, file) {  
            if(err) {  
              response.writeHead(500, {"Content-Type": "text/plain"});  
              response.write(err + "\n");  
              response.end();  
              return;  
            }
            contentType = "text/plain";
            if (fileName.indexOf(".htm") !== -1) contentType = "text/html";
            if (fileName.indexOf(".js") !== -1) contentType = "application/javascript";
            if (fileName.indexOf(".css") !== -1) contentType = "text/css";
            if (fileName.indexOf(".jpg") !== -1) contentType = "image/jpeg";
            response.writeHead(200, {"Content-Type": contentType});  
            response.write(file, "binary");  
            response.end();  
          });  
        }); 
      }
    });
  }),
  queueCommand: function(method, params, callback) {
    ewdGateway.totalRequests++;
    var request = {
      no: ewdGateway.totalRequests,
      type: "globalAccess",
      method: method,
      params: params,
      callback: callback
    };
    this.addToGlobalAccessQueue(request);
  },
  messageHandler: {},
  setDefault: function(propertyName, defaultValue, params) {
    ewdGateway[propertyName] = defaultValue;
    if (typeof params[propertyName] !== 'undefined') ewdGateway[propertyName] = params[propertyName];
  },
  setDefaults: function(defaults, params) {
    var name;
    var value;
    for (name in defaults) {
      ewdGateway.setDefault(name, defaults[name], params);
    }
  },
  log: function(message, clearLog) {
    if (ewdGateway.logTo === 'console') {
      console.log(message);
    }
    if (ewdGateway.logTo === 'global') {
      //if (logToGlobal) ewdGateway.logToGlobal(message);
    }
    if (ewdGateway.logTo === 'file') {
      ewdGateway.logToFile(message, clearLog);
    }
  },
  logToGlobal: function(message) {
    var logMessage = message;
    var gloRef = {global: ewdGateway.logGlobal, subscripts: []};
    ewdGateway.queueCommand('increment', gloRef, function(error, results) {
      var index = results.value;
      var gloRef = {global: ewdGateway.logGlobal, subscripts: [index], value: logMessage};
      ewdGateway.queueCommand('set', gloRef, function(error, results) {
      });
    });
  },
  logToFile: function(message, clearLog) {
    var logpath = ewdGateway.logFile;
    var s = message.toString().replace(/\r\n|\r/g, '\n'); // hack
    var flag = 'a+';
    if (clearLog) flag = 'w+';
    var fd = fs.openSync(logpath, flag, 0666);
    fs.writeSync(fd, s + '\r\n');
    fs.closeSync(fd);
  }
};


module.exports = {
  start: function(params, callback) {

    // define parameters / set defaults

    ewdGateway.database = 'gtm';
    ewdGateway.databaseName = 'GT.M';
    ewdGateway.eol = '\r\n';
    ewdGateway.cr = '\r\n';
    if (typeof params.database !== 'undefined') ewdGateway.database = params.database;
    ewdGateway.connectionType = "childProcess";
    if (typeof params.connectionType !== 'undefined') ewdGateway.connectionType = params.connectionType;
    if (ewdGateway.database === 'cache') {
      ewdGateway.databaseName = 'Cache';
      if (ewdGateway.connectionType === 'telnet') {
        ewdGateway.eol = '\r\n';
        ewdGateway.cr = '\n';
      }
      else { 
        ewdGateway.eol = '\n';
        ewdGateway.cr = '\n';
      }
    }

    if ((ewdGateway.database === 'gtm')&&(ewdGateway.connectionType === 'telnet')) {
      console.log("You cannot use telnet connections with GT.M");
      return;
    }

    var defaults = {
      host: '127.0.0.1',
      telnetPort: 23,
      telnetTerminator: 'USER>',
      poolSize: 4,
      httpPort: 8081,
      ewdPath: '/ewd/',
      gtmShellCommand: 'mumps',
      trace: true,
      silentStart: false,
      namespace: 'USER',
      webServerRootPath: '/var/www',
      useWebsockets: true,
      maxMsgLength: 8192,
      logTo: 'console',
      logFile: 'ewdLog.txt',
      connectionCheckInterval: 30000
    };

    ewdGateway.setDefaults(defaults, params);
    if (typeof params.eol !== 'undefined') ewdGateway.eol = params.eol;
    if (typeof params.cr !== 'undefined') ewdGateway.cr = params.cr;
    if (ewdGateway.logTo === 'file') ewdGateway.log('ewdGateway Log started',true);

    var startWebserver = true;
    if (typeof params.startWebserver !== 'undefined') ewdGateway.startWebserver = params.startWebserver;

    /*
      SJC: Added the following to allow a custom request handler to be specified to handle non-EWD requests.
       This should accept 3 parameters: (urlObj,request,response)
         1) a url object (as returned by url.parse())
         2) a http.ServerRequest object
         3) a http.ServerResponse object
    */
    if (typeof params.requestHandler === 'function') ewdGateway.requestHandler = params.requestHandler;
    /*
      SJC: Added the following to allow a custom multipart form handler to be specified.
       This should accept a http.ServerRequest object and a http.ServerResponse object as parameters.
    */
    if (typeof params.formHandler === 'function') ewdGateway.formHandler = params.formHandler;

    // now start it all up

    ewdGateway.queueEvent.on("processEWDQueue", ewdGateway.processEWDQueue);
	
    // Queue/parameter checker

    setInterval(function() {
      //console.log("Checking queue just in case..");
      ewdGateway.queueEvent.emit("processEWDQueue")
      // report connection stats if they've changed
      var i;
      if (ewdGateway.connectionUpdate) {
        ewdGateway.log("=====================================");
        ewdGateway.log("Connection utilitisation:");
        for (i=0;i<ewdGateway.poolSize;i++) {
          ewdGateway.log(i + ": " + ewdGateway.requestsByConnection[i]);
        }
        ewdGateway.log("Max queue length: " + ewdGateway.maxQueueLength);
        ewdGateway.connectionUpdate = false;
        ewdGateway.maxQueueLength = 0;
        ewdGateway.log("=====================================");
      }
      var gloRef = {global: 'zewd', subscripts: ['ewdGateway']};
      ewdGateway.queueCommand('getJSON', gloRef, function(error, results) {
        ewdGateway.log("new pool size requested: " + results.poolSize + "; current = " + ewdGateway.poolSize);
        if (typeof results.poolSize !== 'undefined') {
          if (results.poolSize < 1) results.poolSize = 1;
          if (results.poolSize > 1000) results.poolSize = 1000;
        }
        if (results.poolSize > ewdGateway.poolSize) {
          var diff = results.poolSize - ewdGateway.poolSize;
          var no;
          var connectionNo;
          for (no = 0; no < diff; no++) {
            connectionNo = ewdGateway.poolSize + no;
            ewdGateway.log("adding connection " + connectionNo);
            if (ewdGateway.connectionType === 'telnet') {
              ewdGateway.makeTelnetConnection(connectionNo, ewdGateway.telnetPort, ewdGateway.host);
            }
            else {
              if (ewdGateway.database === 'gtm') {
                ewdGateway.db[connectionNo] = spawn(ewdGateway.gtmShellCommand, ['-run', ewdGateway.nodeListenerRoutine]);
                ewdGateway.log("GT.M connection spawned");
              }
              else {
                ewdGateway.db[connectionNo] = spawn('csession', ['cache', '-U', ewdGateway.namespace, ewdGateway.nodeListenerRoutine]);
                ewdGateway.log("Cache connection spawned");
              }
            }
            ewdGateway.db[connectionNo].response = {};
            ewdGateway.db[connectionNo].isAvailable = true;
            ewdGateway.requestsByConnection[connectionNo] = 0;
          }
          ewdGateway.poolSize = results.poolSize;
        }
        else if (results.poolSize < ewdGateway.poolSize) {
          ewdGateway.log("no Of Connections needs reducing to " + results.poolSize);
          var diff = ewdGateway.poolSize - results.poolSize;
          var no;
          var connectionNo;
          if (ewdGateway.connectionType === 'telnet') {
            var haltString = '-1' + ewdGateway.fd + 'globalAccess' + ewdGateway.fd + 'halt' + ewdGateway.rd + ewdGateway.cr;
            ewdGateway.log("removing " + diff + " connections");
            for (no = 0; no < diff; no++) {
              connectionNo = ewdGateway.poolSize - no -1;
              ewdGateway.log("removing connection " + connectionNo);
              ewdGateway.writeToChildProcess(connectionNo, haltString);
	     }
	     ewdGateway.poolSize = results.poolSize;
          }
          else {
	     for (no = 0; no < diff; no++) {
              connectionNo = ewdGateway.poolSize - no -1;
              ewdGateway.log("removing connection " + connectionNo);
              ewdGateway.db[connectionNo].kill();
	       delete ewdGateway.requestsByConnection[connectionNo];
	       delete ewdGateway.db[connectionNo];
	     }
	     ewdGateway.poolSize = results.poolSize;
          }
        }
        if (typeof results.maxMsgLength !== 'undefined') {
          ewdGateway.maxMsgLength = parseInt(results.maxMsgLength);
          if (ewdGateway.maxMsgLength < 2048) ewdGateway.maxMsgLength = 2048;
        }
        if (typeof results.logTo !== 'undefined') {
          ewdGateway.logTo = results.logTo;
          ewdGateway.log("logging to " + ewdGateway.logTo);
        }
        if (typeof results.clearLog !== 'undefined') {
          if (results.clearLog) {
            if (ewdGateway.logTo === 'file') ewdGateway.log('ewdGateway Log started',true);
	   }
          var gloRef = {global: 'zewd', subscripts: ['ewdGateway', 'clearLog']};
          ewdGateway.queueCommand('kill', gloRef, function(error, results) {});
	 }
        if (typeof results.trace !== 'undefined') {
          if (ewdGateway.trace !== results.trace) {
            ewdGateway.trace = results.trace;
  	     ewdGateway.log("trace = " + ewdGateway.trace);
	   }
        }
      });
    },ewdGateway.connectionCheckInterval);

    // start up webserver and socket.io listeners

    if (startWebserver) {
      ewdGateway.webserver.listen(ewdGateway.httpPort);
      //console.log("useWebSockets = " + ewdGateway.useWebsockets);
      if (ewdGateway.useWebsockets) {
        io = require('socket.io');
        ewdGateway.io = io.listen(ewdGateway.webserver);
        //console.log("socket.io initialised");
        ewdGateway.io.set('log level', 1);
        ewdGateway.io.sockets.on('connection', function(client){
          if (ewdGateway.trace) ewdGateway.log("socket connected: " + client.id);
          if (ewdGateway.socketClient[client.id]) {
            ewdGateway.socketClient[client.id].connected = true;
            if (ewdGateway.trace) ewdGateway.log("socketClient connection set back to true");
          }
          else {
            if (ewdGateway.trace) ewdGateway.log("that client.id hasn't been recognised");
          }
          client.connected = true;

          client.on('message', function(message){
            if (ewdGateway.trace) ewdGateway.log("From browser: " + message);
            //for (i=0;i<message.length;i++) dump = dump + ":" + message.charCodeAt(i);
            //console.log(dump);
            ewdGateway.addToSocketQueue(message,client);
          });
          client.on('disconnect', function() {
            if (ewdGateway.trace) ewdGateway.log("socket disconnected: " + client.id);
            if (ewdGateway.socketClient[client.id]) ewdGateway.socketClient[client.id].connected = false;
          });
        });
      }
    }

    // establish connections to database

    ewdGateway.makeConnections(callback);
  },

  globals: {

    get: function(params, callback) {
      ewdGateway.queueCommand('get', params, callback);
    },

    set: function(params, callback) {
      ewdGateway.queueCommand('set', params, callback);
    },

    getJSON: function(params, callback) {
      ewdGateway.queueCommand('getJSON', params, callback);
    },

    getSubscripts: function(params, callback) {
      if (typeof params.all === 'undefined') params.all = false;
      if (params.all === false) {
        if (typeof params.from === 'undefined') params.from = '';
        if (typeof params.to === 'undefined') params.to = '';
      }
      else {
        params.from = '';
        params.to = '';
      }
      ewdGateway.queueCommand('getSubscripts', params, callback);
    },

    increment: function(params, callback) {
      ewdGateway.queueCommand('increment', params, callback);
    },

    kill: function(params, callback) {
      ewdGateway.queueCommand('kill', params, callback);
    },

    halt: function(callback) {
      ewdGateway.queueCommand('halt', '', callback);
    },
	
    mFunction: function(params, callback) {
      ewdGateway.queueCommand('mFunction', params, callback);
    }
  },

  getSessid: function(token, callback) {
    var params = {
      functionName: 'getSessid^%zewdPHP',
      parameters: [token]
    };
    ewdGateway.queueCommand('mFunction', params, function(error, results) {
       callback(error, {sessid: results.value});
    });
  }

};


// EWD Session Methods  - Uses global variable ewd to allow its use in modules loaded later!

/*
ewd = {
  setSessionValue: function(sessionName, value, sessid, callback) {
    ewdGateway.mwire.clientPool[ewdGateway.mwire.connection()].remoteFunction('setSessionValue^%zewdSTAPI', [sessionName, value, sessid], function(error, results) {
      callback(error, results);
    });
  },
  getSessionValue: function(sessionName, sessid, callback) {
    ewdGateway.mwire.clientPool[ewdGateway.mwire.connection()].remoteFunction('getSessionValue^%zewdAPI', [sessionName, sessid], function(error, results) {
      callback(error, results.value);
    });
  },
  getSessionArray: function(sessionName,sessid,callback) {
    ewdGateway.mwire.clientPool[ewdGateway.mwire.connection()].getJSON('%zewdSession', [sessid, sessionName], function(error, results) {
      callback(error, results.value);
    });
  },
  setSessionArray: function(json, sessionName,sessid,callback) {
    ewdGateway.mwire.clientPool[ewdGateway.mwire.connection()].setJSON('%zewdSession', ['session', sessid, sessionName], json, true, function(error, results) {
      callback(error, results.value);
    });
  }
};
*/


