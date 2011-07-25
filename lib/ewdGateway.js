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
 | This program is free software: you can redistribute it and/or modify     |
 | it under the terms of the GNU Affero General Public License as           |
 | published by the Free Software Foundation, either version 3 of the       |
 | License, or (at your option) any later version.                          |
 |                                                                          |
 | This program is distributed in the hope that it will be useful,          |
 | but WITHOUT ANY WARRANTY; without even the implied warranty of           |
 | MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the            |
 | GNU Affero General Public License for more details.                      |
 |                                                                          |
 | You should have received a copy of the GNU Affero General Public License |
 | along with this program.  If not, see <http://www.gnu.org/licenses/>.    |
 ----------------------------------------------------------------------------

  Get required modules:

*/

var http = require("http");
var url = require("url");
var queryString = require("querystring");
var path = require("path"); 
var fs = require("fs");
var spawn = require('child_process').spawn;
var events = require("events");
var io = require('socket.io');

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

  buildNo: 16,
  buildDate: "25 July 2011",
  version: function() {
    return 'ewdGateway build ' + this.buildNo + ', ' + this.buildDate;
  },
  token:0,

  nodeListenerRoutine: 'nodeListener^%zewdNode',
  nodeServerRoutine: 'server^%zewdNode',

  addToEWDQueue: function(query, headersString, contentEsc, request, response) {
    var queuedRequest = {
      type:'http',
      query:query,
      headersString: headersString,
      contentEsc: contentEsc,
      request:request,
      response:response
    };
    this.requestQueue.push(queuedRequest);
    this.totalRequests++;
    var qLength = this.requestQueue.length;
    if (qLength > this.maxQueueLength) this.maxQueueLength = qLength;
    if (this.trace) console.log("added to Queue (http): " + queuedRequest.query + "; queue length = " + qLength + "; requestNo = " + this.totalRequests + "; after " + this.elapsedTime() + " sec");
    // trigger the processing of the queue
    this.queueEvent.emit("processEWDQueue");
  },

  socketClientByToken: {},

  addToSocketQueue: function(message,client) {
    console.log("addToSocketQueue - message = " + message);
    var messageObj = JSON.parse(message);
    var messageType = messageObj.type;
    console.log("messageType = " + messageType);
    var token = messageObj.token;
    console.log("token = " + token);
    if (messageType === 'initialise') {
      // reserved - can't be sent from a browser!
      return;
    }
    if (messageType === 'register') {
      ewdGateway.socketClientByToken[token] = client;
      console.log("client registered for token " + token);
      return;
    }
    message = messageObj.message;
    var queuedRequest = {
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
    this.totalRequests++;
    var qLength = this.requestQueue.length;
    if (qLength > this.maxQueueLength) this.maxQueueLength = qLength;
    if (this.trace) console.log("added to Queue (socket): " + message);
    // trigger the processing of the queue
    this.queueEvent.emit("processEWDQueue");
  },

  addToGlobalAccessQueue: function(queuedRequest) {
    this.requestQueue.push(queuedRequest);
    this.totalRequests++;
    var qLength = this.requestQueue.length;
    if (qLength > this.maxQueueLength) this.maxQueueLength = qLength;
    if (this.trace) console.log("added to Queue (globalAccess): " + queuedRequest.method);
    // trigger the processing of the queue
    this.queueEvent.emit("processEWDQueue");
  },

  db: {},

  dbOutput:function(connection) {
    var dataStr;
    var headers = {};
    var headerStr = '';
    var bodyStr = '';
    var contentStr = '';
    var pieces;
    var refreshStr;
    var headerPieces;
    var httpStatus = '';
    var no;
    var i;
    var preBlockResponse = false;
    var returnObj;
    var messageType;
    var messages;
    var message;
    var token;
    var type;
    var messageObj;
    var response;
    var method;

    this.db[connection].stdout.on('data', function (data) {
      dataStr = data.toString();
      if (ewdGateway.trace) {
        console.log("from " + ewdGateway.databaseName + " on connection " + connection + ":" + "\r\n" + dataStr + "\r\n=================\r\n");
        var dump = 'dump: ';
        for (i=0;i<dataStr.length;i++) dump = dump + ":" + dataStr.charCodeAt(i);
        console.log(dump + "\r\n=================\r\n");
      }

      contentStr = contentStr + dataStr;
      var terminator = "\x11\x12\x13\x14" + ewdGateway.eol;
      var len = terminator.length;

      //if (contentStr.indexOf("\x11\x12\x13\x14" + ewdGateway.eol) !== -1) {
      if (contentStr.substr(-len) === terminator) {

        // ** return GlobalAccess value **

        if (ewdGateway.db[connection].type === 'globalAccess') {
          method = ewdGateway.db[connection].method;
          console.log("globalAccess - returning results for " + method);
          pieces = contentStr.split("\x11\x12\x13\x14" + ewdGateway.eol);

          response = pieces[0];
          dataStr = pieces[1];

          pieces = response.split(ewdGateway.eol);

          //console.log("response: " + JSON.stringify(pieces));

          // ** get **

          if (method === 'get') {
            var error = false;
            var value = '';
            if (pieces[0] !== '') error = pieces[0];
            if (!error) value = pieces[2];
            //console.log("*** value = " + value);
            ewdGateway.db[connection].callback(error,{exists: pieces[1],value:value});
          }

          // ** set **

          if (method === 'set') {
            var error = false;
            if (pieces[0] !== '') error = pieces[0];
            var ok = false;
            if (!error) {
              if (pieces[1] === '1') ok = true;
            }
            ewdGateway.db[connection].callback(error,{ok:ok});
          }

          // ** kill **

          if (method === 'kill') {
            var error = false;
            if (pieces[0] !== '') error = pieces[0];
            var ok = false;
            if (!error) {
              if (pieces[1] === '1') ok = true;
            }
            ewdGateway.db[connection].callback(error,{ok:ok});
          }

          // ** getJSON **

          if (method === 'getJSON') {
            var error = false;
            var value = '{}';
            if (pieces[0] !== '') error = pieces[0];
            if (!error) var value = pieces[1];
            //console.log("*** value = " + value);
            ewdGateway.db[connection].callback(error,JSON.parse(value));
          }

          if (method === 'getSubscripts') {
            var error = false;
            var value = '[]';
            if (pieces[0] !== '') error = pieces[0];
            if (!error) value = pieces[1];
            console.log(value);
            ewdGateway.db[connection].callback(error,JSON.parse(value));
          }

          if (method === 'increment') {
            var error = false;
            var value = '';
            if (pieces[0] !== '') error = pieces[0];
            if (!error) value = pieces[1];
            ewdGateway.db[connection].callback(error,{value:value});
          }

          if (method === 'mFunction') {
            var error = false;
            var value = '';
            if (pieces[0] !== '') error = pieces[0];
            if (!error) value = pieces[1];
            //console.log("*** value = " + value);
            ewdGateway.db[connection].callback(error,{value:value});
          }

          contentStr = '';
          ewdGateway.db[connection].isAvailable = true;
          ewdGateway.queueEvent.emit("processEWDQueue");
          return;
        }

        // send socket message back to browser

        if (ewdGateway.db[connection].type === 'socket') {
          console.log("socket - sending response back to browser");
          messages = contentStr.split("\x11\x12\x13\x14" + ewdGateway.eol);
          for (var messageNo = 0; messageNo < messages.length; messageNo++) {
            message = messages[messageNo];

            if (message === '') {
              contentStr = '';
              ewdGateway.db[connection].isAvailable = true;
              ewdGateway.queueEvent.emit("processEWDQueue");
              return;
            }
            console.log("*** message=" + message);
            try {
              messageObj = JSON.parse(message);
            }
            catch(err) {
               // returning markup?  forward raw message to browser
               if (typeof ewdGateway.db[connection] !== 'undefined') {
                 if (typeof ewdGateway.db[connection].client !== 'undefined') {
                   ewdGateway.db[connection].client.json.send(message);
                 }
                }
                contentStr = '';
                ewdGateway.db[connection].isAvailable = true;
                ewdGateway.queueEvent.emit("processEWDQueue");
                return;
            }

            messageType = messageObj.type;
            message = messageObj.message;

            console.log("messageType = " + messageType);
            switch (messageType) {

              case 'noSession':
                token = messageObj.token;
                console.log("NoSession - token = " + token);
                message = 'Session does not exist or has timed out';
                console.log("message=" + message);
                ewdGateway.db[connection].client.json.send({type: 'error', message: message});
                if (typeof ewdGateway.socketClientByToken[token] !== 'undefined') {
                  delete ewdGateway.socketClientByToken[token];
                }
                break;

              case 'serverSend':
                console.log("serverSend: contentStr=" + message);
                type = messageObj.subType;
                token = messageObj.token;
                console.log("serverSend: token = " + token);
                if (typeof ewdGateway.socketClientByToken[token] !== 'undefined') {
                  ewdGateway.socketClientByToken[token].json.send({type: type, message: message});
                }
                break;

              case 'markup':
                if (typeof ewdGateway.db[connection] !== 'undefined') {
                  if (typeof ewdGateway.db[connection].client !== 'undefined') {
                    ewdGateway.db[connection].client.json.send({type: messageType, targetId: messageObj.targetId, content: messageObj.content});
                  }
                }
                break;

              default:
                console.log("messageType: " + messageType + "; message=" + message);
                if (typeof ewdGateway.db[connection] !== 'undefined') {
                  if (typeof ewdGateway.db[connection].client !== 'undefined') {
                    ewdGateway.db[connection].client.json.send({type: messageType, message: message});
                  }
                }
                break;
            }
          }

          contentStr = '';
          ewdGateway.db[connection].isAvailable = true;
          ewdGateway.queueEvent.emit("processEWDQueue");
          return;
        }

        // send HTTP response back to browser

        //entire payload received - now send it to browser
        // first separate the head and body and extract the headers

        pieces = contentStr.split("\x11\x12\x13\x14" + ewdGateway.eol);
        contentStr = pieces[0];
        refreshStr = pieces[1];
        pieces = contentStr.split(ewdGateway.eol + ewdGateway.eol);
        headerStr = pieces[0];
        pieces.splice(0,1)
        bodyStr = pieces.join(ewdGateway.eol + ewdGateway.eol);
        pieces = headerStr.split(" ");
        httpStatus = pieces[1];
        preBlockResponse = false;
        headerPieces = headerStr.split(ewdGateway.eol);
        for (no = 1;no < headerPieces.length;no++) {
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
              if (ewdGateway.trace) console.log("header name=" + name + "; value=" + value);
              headers[name] = value;
            }
          }
        }

        // If this isn't a pre-block, send it all to the browser

        if (!preBlockResponse) {
          if (!headers["Content-type"]) headers["Content-type"] = "text/html";
          if (httpStatus === '') httpStatus = 200;
          ewdGateway.db[connection].response.writeHead(httpStatus, headers);
          ewdGateway.db[connection].response.write(bodyStr);
          ewdGateway.db[connection].response.end();
          //if (ewdGateway.trace) console.log("header and body sent to browser");
          // reset buffers
          headers = {};
          contentStr = '';
          if (ewdGateway.trace) console.log("Connection " + connection + " reset and waiting..");
          ewdGateway.db[connection].isAvailable = true;
          // fire event to process queue in case anything in there
          ewdGateway.queueEvent.emit("processEWDQueue");
        }
        else {

          // this is a pre-block response - run the Javascript 
          // pre-page script and then invoke the body section
          // first determine which original response this relates to
          
          var textArr = bodyStr.split("<endofpre ");
          if (ewdGateway.trace) console.log('<endofpre> response found: ' + textArr[1]);
          var respArr = textArr[1].split(' ');
          var reqNoArr = respArr[0].split('=');
          var sessArr = respArr[1].split('=');
          if (ewdGateway.trace) console.log('pre response relates to request ' + reqNoArr[1]);
           
          // look up against:
          //  ewdGateway.ewdMap.request[requestNo] = {app:app,page:page,query:query,headersString:headersString,
          //                            request:request,response:response};
          
          var req = ewdGateway.ewdMap.request[reqNoArr[1]];
          delete ewdGateway.ewdMap.request[reqNoArr[1]];
           
          // now run JS pre-page script
  
          if (ewdGateway.trace) console.log("Running Javascript pre-page method: " + ewdGateway.ewdMap.method[req.app][req.page]);

          ewdGateway.ewdMap.module[req.app][ewdGateway.ewdMap.method[req.app][req.page]](sessArr[1], function(error, results) {
            if (ewdGateway.trace) console.log("Pre-page script returned: " + JSON.stringify(results));
            // add list of response headers to add to body response
            // Javascript pre-page script can override any of the standard ones
            //  header["name"] = value;
            
            req.headers["response-headers"] = headers;
          
            // flag to just run body()
            req.headers["ewd_page_block"] = "body";
            req.headers["ewd_sessid"] = sessArr[1];
            console.log("sessid = " + sessArr[1]);
            if (results.error !== '') req.headers["ewd_error"] = results.error;
            var headersString = escape(JSON.stringify(req.headers));
            headers = {};
            contentStr = '';
            ewdGateway.db[connection].isAvailable = true;
            ewdGateway.sendRequestTodb(req.query, headersString, req.contentEsc, req.request, req.response);
          });
        }
        if (refreshStr.indexOf('refresh=true')!== -1) {
          /*
          ewdGateway.mwire.clientPool[ewdGateway.mwire.connection()].getJSON('zewd',['nodeModules','methods'],function(error,results) {
            if (!error) {
              ewdGateway.ewdMap.method = results;
              if (ewdGateway.trace) console.log("refreshed module/method table")
            }
          });
          */
        }
      }
    });
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

  makeConnections: function() {
    //console.log("poolSize = " + this.poolSize);

    /*
    if (this.database === 'gtm') {
      spawn('mumps', ['-run', this.nodeInitRoutine]);
    }
    else {
      spawn('csession', ['cache', '-U', this.namespace, this.nodeInitRoutine]);
    }
    */

    for (var i = 0; i < this.poolSize; i++) {
      if (this.database === 'gtm') {
        this.db[i] = spawn('mumps', ['-run', this.nodeListenerRoutine]);
      }
      else {
        this.db[i] = spawn('csession', ['cache', '-U', this.namespace, this.nodeListenerRoutine]);
      }
      this.db[i].response = {};
      this.db[i].isAvailable = true;
      this.requestsByConnection[i] = 0;
    }

    // connect server sender process

    if (this.database === 'gtm') {
      this.db[this.poolSize] = spawn('mumps', ['-run', this.nodeServerRoutine]);
    }
    else {
      this.db[this.poolSize] = spawn('csession', ['cache', '-U', this.namespace, this.nodeServerRoutine]);
    }

  },
  
  maxQueueLength: 0,
  processingEWDQueue: false,

  processEWDQueue: function() {
    if (!ewdGateway.processingEWDQueue) {
      if (ewdGateway.requestQueue.length === 0) return; 
      ewdGateway.processingQueue = true;
      ewdGateway.queueEvents++;
      console.log("processing queue: " + ewdGateway.queueEvents + "; queue length " + ewdGateway.requestQueue.length + "; after " + ewdGateway.elapsedTime() + " seconds");
      var queuedRequest;
      var okToProcess = true;
      while (okToProcess) {
        queuedRequest = ewdGateway.requestQueue.shift();
        okToProcess = ewdGateway.sendRequestTodb(queuedRequest);
        //console.log("okToProcess = " + okToProcess);
        if (!okToProcess) ewdGateway.requestQueue.unshift(queuedRequest);
        if (ewdGateway.requestQueue.length === 0) okToProcess = false;
      }
      if (ewdGateway.requestQueue.length > 0) {
        console.log("queue processing abandoned as no free proceses available");
      }
      ewdGateway.processingQueue = false;
    }
  },

  queueEvents: 0,
  requestsByConnection: {},
  requestNo: 0,
  requestQueue: [],

  sendRequestTodb: function(queuedRequest) {
    var connection = this.getConnection();
    if (connection !== false) {
      if (this.trace) console.log("Request sent to Cache using connection = " + connection);
      this.requestsByConnection[connection]++;
      this.connectionUpdate = true;
      var type = queuedRequest.type;
      this.db[connection].type = type;

      switch (type) {

        case 'http':

          // forward http request to back-end (GT.M / Cache)

          this.db[connection].response = queuedRequest.response;
          this.db[connection].stdin.write(type + "\r\n" + queuedRequest.query + "\r\n" + queuedRequest.headersString + "\r\n" + queuedRequest.request.method + "\r\n" + queuedRequest.contentEsc + "\r\n");
          break;
      
        case 'socket':

          // check to see if locally defined custom method in Javascript (ie via user extension of ewdGateway object)

          if (typeof ewdGateway.messageHandler[queuedRequest.messageType] !== 'undefined') {
            console.log("invoking custom method " + queuedRequest.messageType);
            ewdGateway.db[connection].isAvailable = true;
            queuedRequest.sendResponse = function(json) {
              queuedRequest.client.json.send(json);
            };
            ewdGateway.messageHandler[queuedRequest.messageType](queuedRequest);
          }

          else if (queuedRequest.messageType === 'ewdGetFragment') {
            console.log("ewdGetFragment: " + queuedRequest.targetId);
            this.db[connection].client = queuedRequest.client;
            this.db[connection].stdin.write(type + "\r\n" + queuedRequest.messageType + "\r\n" + queuedRequest.token + "\r\n" + queuedRequest.page + "\r\n" + queuedRequest.targetId + "\r\n" + queuedRequest.nvp + "\r\n");
          }

          else {
            console.log("sending message");
            this.db[connection].client = queuedRequest.client;
            this.db[connection].stdin.write(type + "\r\n" + queuedRequest.messageType + "\r\n" + queuedRequest.token + "\r\n" + queuedRequest.message + "\r\n");
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

  invokeGlobalAccessCommand: function(request, connection) {
    console.log("invokeGlobalAccessCommand: " + request.method + ": connection " + connection);
    var method = request.method;
    var params = request.params;
    var subscripts = '';
    var parameters = '';
    if (typeof params.subscripts !== 'undefined') subscripts = JSON.stringify(params.subscripts);
    if (typeof params.parameters !== 'undefined') parameters = JSON.stringify(params.parameters);
    this.db[connection].callback = request.callback;
    this.db[connection].type = 'globalAccess';
    this.db[connection].method = method;
    switch (method) {

      case 'get':

        this.db[connection].stdin.write("globalAccess\r\n" + method + this.cr + params.global + this.cr + subscripts + this.cr);
        break;

      case 'set':
        this.db[connection].stdin.write("globalAccess\r\n" + method + this.cr + params.global + this.cr + subscripts + this.cr + params.value + this.cr);
        break;

      case 'kill':

        this.db[connection].stdin.write("globalAccess\r\n" + method + this.cr + params.global + this.cr + subscripts + this.cr);
        break;

      case 'getJSON':
        this.db[connection].stdin.write("globalAccess\r\n" + method + this.cr + params.global + this.cr + subscripts + this.cr);
        break;

      case 'getSubscripts':
        this.db[connection].stdin.write("globalAccess\r\n" + method + this.cr + params.global + this.cr + subscripts + this.cr + params.from + this.cr + params.to + this.cr);
        break;

      case 'increment':
        this.db[connection].stdin.write("globalAccess\r\n" + method + this.cr + params.global + this.cr + subscripts + this.cr);
        break;

      case 'mFunction':
        this.db[connection].stdin.write("globalAccess\r\n" + method + this.cr + params.functionName + this.cr + parameters + this.cr);
        break;

      default:
    }
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
     
    if (this.trace) console.log("incoming request for app: " + app + "; page: " + page);
    
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

  webserver: http.createServer(function(request, response) {
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
      if (ewdGateway.trace) console.log(uri);
      if (uri.indexOf(ewdGateway.ewdPath) !== -1) {
        //console.log("add request to queue");
        ewdGateway.sendTodb(request,response,urlObj, request.content);
      }
      else {
        var fileName = ewdGateway.webServerRootPath + uri;
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
    var request = {
      type: "globalAccess",
      method: method,
      params: params,
      callback: callback
    };
    this.addToGlobalAccessQueue(request);
  },
  messageHandler: {}
};


module.exports = {
  start: function(params, callback) {

    // define parameters / set defaults

    ewdGateway.database = 'gtm';
    ewdGateway.databaseName = 'GT.M';
    ewdGateway.eol = '\r\n';
    ewdGateway.cr = '\n';
    if (typeof params.database !== 'undefined') ewdGateway.database = params.database;
    if (ewdGateway.database === 'cache') {
      ewdGateway.databaseName = 'Cache';
      ewdGateway.eol = '\n';
      ewdGateway.cr = '\r\n';
    }
    ewdGateway.poolSize = 5;
    if (typeof params.poolSize !== 'undefined') ewdGateway.poolSize = params.poolSize;
    ewdGateway.httpPort = 8081;
    if (typeof params.httpPort !== 'undefined') ewdGateway.httpPort = params.httpPort;
    ewdGateway.ewdPath = '/ewd/';
    if (typeof params.ewdPath !== 'undefined') ewdGateway.ewdPath = params.ewdPath;
    ewdGateway.trace = true;
    if (typeof params.trace !== 'undefined') ewdGateway.trace = params.trace;
    ewdGateway.namespace = 'USER';
    if (typeof params.namespace !== 'undefined') ewdGateway.namespace = params.namespace;
    ewdGateway.webServerRootPath = '/var/www';
    if (typeof params.webServerRootPath !== 'undefined') ewdGateway.webServerRootPath = params.webServerRootPath;

    var startWebserver = true;
    if (typeof params.startWebserver !== 'undefined') startWebserver = params.startWebserver;

    // now start it all up

    // establish connections to database

    ewdGateway.makeConnections();

    // start up message queue

    ewdGateway.queueEvent.on("processEWDQueue", ewdGateway.processEWDQueue);
    setInterval(function() {
      //console.log("Checking queue just in case..");
      ewdGateway.queueEvent.emit("processEWDQueue")
      // report connection stats if they've changed
      var i;
      if (ewdGateway.trace) {
        if (ewdGateway.connectionUpdate) {
          console.log("Connection utilitisation:");
          for (i=0;i<ewdGateway.poolSize;i++) {
            console.log(i + ": " + ewdGateway.requestsByConnection[i]);
          }
          console.log("Max queue length: " + ewdGateway.maxQueueLength);
          ewdGateway.connectionUpdate = false;
          ewdGateway.maxQueueLength = 0;
        }
      }
    },30000);

    // start up webserver and socket.io listeners

    if (startWebserver) {
      ewdGateway.webserver.listen(ewdGateway.httpPort);

      ewdGateway.io = io.listen(ewdGateway.webserver);
      ewdGateway.io.set('log level', 1);
      ewdGateway.io.sockets.on('connection', function(client){
        client.connected = true;

        client.on('message', function(message){
          console.log("From browser: " + message);
          //for (i=0;i<message.length;i++) dump = dump + ":" + message.charCodeAt(i);
          //console.log(dump);
          ewdGateway.addToSocketQueue(message,client);
        });
      });
    }

    for (var i = 0; i < ewdGateway.poolSize; i++) {
        ewdGateway.dbOutput(i);
    }
    // set up server sender connection
    ewdGateway.db[ewdGateway.poolSize].type = 'socket'
    ewdGateway.dbOutput(ewdGateway.poolSize);

    if (!ewdGateway.silentStart) {
      console.log("********************************************");
      console.log("*** EWD Gateway for " + ewdGateway.databaseName + " Build " + ewdGateway.buildNo + " (" + ewdGateway.buildDate + ") ***");
      console.log("********************************************");
      console.log(ewdGateway.poolSize + " connections established to " + ewdGateway.databaseName);
      if (startWebserver) {
        console.log("Web server started successfully on port " + ewdGateway.httpPort);
      }
      else {
        console.log("Web server not started");
      }
      if (ewdGateway.trace) {
        console.log("Trace mode is on");
      }
      else {
        console.log("Trace mode is off");
      }
    }

    callback(ewdGateway);
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


