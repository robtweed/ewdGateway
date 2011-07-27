# ewdGateway
 
Node.js-based EWD Gateway for Cache and GT.M

Rob Tweed <rtweed@mgateway.com>  
25 July 2011, M/Gateway Developments Ltd [http://www.mgateway.com](http://www.mgateway.com)  

Twitter: @rtweed

Google Group for discussions, support, advice etc: [http://groups.google.co.uk/group/enterprise-web-developer-community](http://groups.google.co.uk/group/enterprise-web-developer-community)

## Installing ewdGateway

       npm install ewdGateway

You must also install socket.io:

       npm install socket.io
	   
The *ewdGateway* module is compatible with EWD build 876 or later


##  EWD Gateway

EWD is a proven web application/Ajax framework specifically designed for use with GT.M and Cach&#233; databases, 
allowing extremely rapid development of secure, high-performance web applications.

The *ewdGateway* module provides a multi-purpose web application gateway for EWD applications.  Functionality includes:

- web server
- web server gateway to GT.M and Cach&#233;, pre-configured for running EWD applications;
- websockets middle-tier connecting browser to GT.M or Cach&#233;, pre-configured for the EWD Realtime functionality;
- access to globals from Javascript/Node.js

The *ewdGateway* module can be used as a replacement for a standard web server such as IIS or Apache, and no other
 gateway technology is required.  The *ewdGateway* module automatically makes *child_process* connections to your GT.M 
or Cach&#233; database, the number of connections being determined by the *poolSize* that you specify.

For further details about the EWD web application framework for GT.M and Cach&#233;, see [http://www.mgateway.com/ewd.html](http://www.mgateway.com/ewd.html)

##  Using ewdGateway

Node.js should be installed on the same physical server as a GT.M or Cach&#233; database.

The following is a simple example of how to use the *ewdGateway* module:

      var ewd = require('ewdGateway');
      var params = {database:'gtm', httpPort: 8080, poolSize: 5, startWebserver: true};
      ewd.start(params, function(gateway) {
        console.log("version = " + gateway.version());
      });

This will start the webserver on port 8080, create a pool of 5 connections to GT.M.  Change the value of 
*params.database* to 'cache' to connect to a Cach&#233; database instead.  You can now run EWD applications.

Note: to use the *ewdGateway* module with EWD applications on Cach&#233; systems, you must compile the EWD 
applications using the special *'ewd'* technology parameter, eg:

       do compileAll^%zewdAPI("myApp",,"ewd")

If you are using GT.M, compile your applications as normal, eg:

       do compileAll^%zewdAPI("myApp")


##  ewdGateway Start Parameters

The parameters that you can specify for the *ewdGateway* *start* function are as follows:

- *database*  = the database type to which the gateway will connect (*'gtm'* | *'cache'*) (default = *'gtm'*)
- *httpPort*  = the port on which the webserver will listen (default *8081*)
- *poolSize*  = the number of child process connections to the database to be established (default *5*)
- *namespace* = (Cach&#233; only) the Cach&#233; namespace to which *ewdGateway* should connect (default *'USER'*)
- *startWebserver* = *true* | *false*.  Use false if you want to use *ewdGateway* for Node.js-based applications that 
  use/access globals (default = *true*)
- *ewdPath* = the URL path that denotes EWD applications (default = *'/ewd/'*)
- *webServerRootPath* = the physical path to use as the webserver root path (default = *'/var/www'*)
- *trace*   = *true* | *false*.  If *true*, a detailed log is written to the Node.js console (default = *true*)

##  Running EWD Applications

You start EWD applications using a URL as follows:

     http://[ip/domain]:[port][ewdPath][appName]/[pageName].ewd

eg, if you use *ewdGateway's* default ewdPath setting:

     http://192.168.1.100:8081/ewd/myApp/index.ewd

You can only specify EWD pages that are defined as *first* pages.

##  Using EWD's Realtime Web Functionality

EWD's optional Realtime Web functionality makes use of the Node.js *socket.io* module.  *socket.io* uses the new HTML5 Web-Sockets 
capability in the very latest browsers, but in older browsers it provides an emulation using a variety of 
techniques, depending on the capabilities of the browser.  EWD's Realtime Web functionality can therefore 
be used in most browsers (including IE6 and IE7), but a proper web-sockets capable browser is recommended for 
maximum performance.

EWD's Realtime Web functionality allows you to break free of the limitations of the HTTP protocol.  For example, 
you can get your GT.M or Cach&#233; server to send messages at any time to any or all connected browsers.

To activate, add *websockets="true"* to the *&lt;ewd:config&gt;* tag in your EWD Application's *first* page, eg:

      <ewd:config isFirstPage="true" websockets="true" cachePage="false">

You can then use the socket connection that will be established between the user's browser and the Node.js 
process to:

- send messages from a browser to Node.js
- send messages from a browser to GT.M or Cach&#233; (via Node.js)
- return response messages from GT.M or Cach&#233; back to the browser (via Node.js)
- send unsolicited messages from GT.M or Cach&#233; to any or all browsers (via Node.js)
- return JSON to the browser
- request EWD fragments (ie instead of the usual XHR-based Ajax techniques)

The *ewdGateway* module uses the pool of child processes to your GT.M or Cach&#233; database for handling 
socket messages as well as HTTP requests.  So using socket-based messaging communication does not require 
any additional connections to GT.M or Cach&#233;.

Messages are protected by EWD's built-in tokens, and can therefore be used to trigger methods in GT.M or Cach&#233;
 against the user's EWD Session.

##  EWD's Realtime Web: Messages

Messages have two properties:

- type
- message (ie its content)

There are several built-in types, but the idea is that you can define your own message types and the methods that 
handle them, either on the browser, in Node.js or in GT.M/Cach&#233;

EWD therefore provides the secure, automated framework for bi-directional socket-based messaging, and you define 
the messages and their handlers, giving you complete flexibility to use this powerful technology with a minimum
 of effort.

## Sending a message from the browser

Use the Javascript method: *EWD.sockets.sendMessage*, eg:

     EWD.sockets.sendMessage({type: "testing", message:  "This is my message for you to use"});

In the example above, we've specified that this message will be of a type we've called *'testing'*.  You can 
specify as many different message types as you like.

It's your responsibility to define a handler for each message type.  The handler can run in either the Node.js 
process, or in the GT.M/Cach&#233; database.

## Specifying a Node.js Handler for a Specified Message Type

If you've sent a message from the browser, you can opt to handle it within the *ewdGateway* Node.js process.

Simply add the method that will handle the message type inside the *ewdGateway* module's *start* call-back function 
by extending the *gateway.messageHandler* object, eg:

      var ewd = require('ewdGateway');
      var params = {database:'gtm', httpPort: 8080, poolSize: 5, startWebserver: true};
      ewd.start(params, function(gateway) {

        gateway.messageHandler.testing = function(request) {
          console.log("Processing the testing message " + request.message + "; User's EWD token:" + request.token);
        });

      });

Your custom-defined *gatway.messageHandler.testing* handler will now be invoked whenever any message with a 
type=*"testing"* is received by the Node.js process.

In other words, to handle a specific message type, create a method: *gateway.messageHandler.{messageTypeName}*

Note that an EWD token for the user's EWD Session is automatically added to the *request* object for the message.
This can be used to determine the user's EWD Session Id within your handler method as follows:

        gateway.messageHandler.testing = function(request) {
          ewd.getSessid(request.token, function(error, results) {
            console.log("The sessid for this user is: " + results.sessid});
          });
        });

### Returning a Response from Node.js to the Browser

If you are handling a message in the Node.js tier, you may want to return a response to the browser. Simply use 
the *request* object's *sendResponse* function, eg:

      gateway.messageHandler.testing = function(request) {
        ewd.getSessid(request.token, function(error, results) {
          request.sendResponse({type: 'testingResponse', message: "The sessid for this user is: " + results.sessid});
        });
      };

### Handling a Received Message in the Browser

So the browser has received a message of a certain type via *socket.io*: you need to specify a handler to do 
something with it.  You do this by defining a function called *EWD.sockets.serverMessageHandler*.  For example:

      EWD.sockets.serverMessageHandler = function(messageObj) {
        document.getElementById("message").innerHTML = "Sent from Cache: " +  messageObj.message;
      };

This very simple handler will treat all received messages identically, replacing the innerHTML of a tag whose
id is *'message'* with the contents of the received message.

To make it more specific, conditionalise the function's behaviour by identifying the message's type, eg to 
handle *info* messages in a specific way:

      EWD.sockets.serverMessageHandler = function(messageObj) {
        if (messageObj.type === 'info') {
          console.log("info received: " + messageObj.message);
          return;
        }
        document.getElementById("message").innerHTML = "Sent from Cache: " +  messageObj.message;
      };

Note: *all* received messages that have a *type* property defined will be handled by your method.  Whether and 
how you handle them is entirely up to you.

## Specifying a GT.M or Cach&#233; handler for a Specified Message Type

When you send a message of a particular type from the browser, you can opt to handle it in the GT.M or Cach&#233;
database instead of within the Node.js tier.  To do this:

- don't specify a handler in your Node.js layer
- create a handler procedure in M code / Cach&#233; ObjectScript
- set a handler dispatch link in the ^zewd Global

For example, if the browser created a message with type *dbmsMessage*, eg:

      function testInGTM() {
        EWD.sockets.sendMessage({type: "dbmsMessage", message: "Handle this in GT.M"});
      }

In GT.M (or Cach&#233;), create a handler procedure, eg in a routine file named *^myHandlers*:

      dbmsMessage(message,sessid)
        new no
        set no=$increment(^myMessages(sessid))
        set ^myMessages(sessid,no)=message
        QUIT

Now define the handler dispatch link:

      set ^zewd("websocketHandler","dbmsMessage")="dbmsMessage^myHandlers"

That's all there is to it!  Every message of type *dbmsMessage* will now be forwarded to GT.M/Cach&#233; and
 handled by your procedure.  Note the way that EWD automatically figures out the sessid associated with the 
 message - it does this via the unique EWD session token that is automatically sent to the ewdGateway with 
 every message sent from the browser.

Note: users of Cach&#233; can make use of class methods.  Simply specify the class method in the format:

      ##class(packageName).method

For example:

      set ^zewd("websocketHandler","dbmsMessage")="##class(my.handlers).dbmsMessage"

The class method must be specified with two string parameters: *message* and *sessid*.


Messages sent from browsers must contain a valid EWD Session token.  If the token does not match any EWD 
tokens for currently active EWD Sessions, a response message of type 'error' will be returned by EWD/ *ewdGateway*.

### Returning a response message from GT.M or Cach&#233; back to the browser

This is also very straightforward.  Simply use the *sendSocketMessage* procedure in EWD's *^%zewdNode* routine within 
your handler procedure, eg:

      dbmsMessage(message,sessid)
        d sendSocketMessage^%zewdNode("dbmsMessageResponse","The message handled in GT.M was: "_message)
        QUIT

The response message will be automatically relayed back to the browser that sent the original message to GT.M/Cach&#233;

Of course you should define a corresponding handler within the browser page for this response message type.

## Sending messages from GT.M or Cach&#233; to one or more browsers

One of the exciting features of EWD's Real-time functionality is that you can generate messages within 
GT.M/Cach&#233; and send them to a browser without the browser having first requested the message.  In other words 
you can break free of the usual limitations of browsers that are imposed by the HTTP protocol.

Of course, you need to be confident that this can be done in a safe and secure manner.  EWD and the *ewdGateway*
module make this both possible *and* incredibly simple.

In fact you can test the functionality immediately by just running a test procedure that is built into EWD's *^%zewdNode* 
 routine.  With the *ewdGateway* module running, now, from within a GT.M/Cach&#233; terminal session just 
 run the following:


      do serverMessageTest^%zewdNode(5)

This will send a message every 5 seconds to all currently active EWD sessions.  If the page in the browser for 
each of those sessions includes a handler method for the message (type = *'alert'*), you'll see the message appear 
automatically in every browser.

If you look at the code in serverMessageTest(), you'll see how you can send messages to browsers:


      serverMessageTest(delay)
       ;
       n message,ok,sessid,trigger
       ;
       s trigger=$zv'["GT.M"
       s delay=$g(delay) i delay="" s delay=10
       f  d
       . h $g(delay)
       . s sessid=""
       . f  s sessid=$o(^%zewdSession("session",sessid)) q:sessid=""  d
       . . w "sessid="_sessid,!
       . . s message="Server message test for sessid "_sessid_" from "_$j_" at "_$$inetDate^%zewdAPI($h)
       . . s ok=$$createServerMessage^%zewdNode("alert",message,sessid,trigger)
       . i 'trigger d triggerServerMessage^%zewdNode
       . w "======",!
       QUIT

The key command is:

       s ok=$$createServerMessage^%zewdNode(messageType,message,sessid,trigger)

The input parameters are as follows:

- *messageType*:  the type of message to send to the browser
- *message*: the message contents
- *sessid*: the EWD Session Id for the browser user who you want to receive the message
- *trigger*: (GT.M only) If set to 1, you will immediately trigger the sending of the message.  If you're sending 
a batch of messages, it is better to trigger the sending of the entire batch in one go (as happens in the
*serverMessageTest()* example above.

Note: on Cach&#233; systems, triggering is done automatically and the trigger parameter can be left out, ie:

       s ok=$$createServerMessage^%zewdNode(messageType,message,sessid)

## Using Messages to deliver JSON to the browser

You can use the special reserved type *'json'* to deliver JSON objects to browsers.  The JSON messages can 
be generated either in the Node.js or database tiers.

The following example generates a JSON response message in a GT.M/Cach&#233; procedure:

      getJSON(message,sessid)
       n array,json
       s array("a")=12345
       s array("b")="hello!"
       s array("c",1)="true"
       s array("c","x")=message
       s json=$$arrayToJSON^%zewdJSON("array")
       d sendSocketMessage^%zewdNode("json",json)
       QUIT

This procedure would be registered as a handler, eg:

       set ^zewd("websocketHandler","getjson")="getJSON^myHandlers"


Request the JSON message from the browser, eg:

        function jsontest() {
          EWD.sockets.sendMessage({type: "getjson", message: "abcdef"});
        }

And finally provide a handler in the browser page to deal with JSON response messages, eg:

      EWD.sockets.serverMessageHandler = function(messageObj) {
        if (messageObj.type === 'json') {
          console.log("json received: " + JSON.stringify(messageObj.json));
          console.log("a = " + messageObj.json.a);
          console.log("You sent " + messageObj.json.c.x);
          return;
        }
        document.getElementById("message").innerHTML = "Sent from Cache: " +  messageObj.message;
      };


## Using Socket Messages to request EWD fragments

EWD's Realtime functionality even allows you to use Socket Messages to make requests for EWD fragments, ie 
instead of using the standard Ajax XHR-based techniques.  There is no difference in functionality: you can
still invoke the fragment's pre-page script as normal, and any Javascript in the fragment's contents will be 
executed as usual.

To request/fetch an EWD fragment in this way, just do the following in the browser page:

        function fragmenttest() {
          EWD.sockets.getPage({page: "testFrag", targetId: 'message'});
        }

You can add extra name/value pairs to the request for the page in a way similar to the EWD Ajax technique, eg:

        function fragmenttest2() {
          var nvp = 'a=12345&b=hello world';
          EWD.sockets.getPage({page: "testFrag2", targetId: 'message', nvp: nvp});
        }

It is not yet clear whether there are any performance benefits in using this socket-based approach to
fetching EWD fragments.  Experience from users should inform this in due course.

## Accessing globals from Node.js

Globals are the unit of data storage in GT.M and Cach&#233; databases (see [http://www.mgateway.com/docs/universalNoSQL.pdf] 
(http://www.mgateway.com/docs/universalNoSQL.pdf).

The *ewdGateway* additionally allows your Node.js process to access and manipulate globals and even execute 
functions written in M or Cach&#233; ObjectScript.  You can turn off the webserver capability and just use 
ewdGateway as an interface between Node.js and the global database provided by GT.M and Cach&#233;.  The *ewdGateway* 
module uses the same pool of *child_process* connections to GT.M or Cach&#233; for this purpose.

The following APIs are currently available:

- *set*: set a global node
- *get*: get the value stored in a global node (if it exists)
- *kill*: delete a global node
- *getJSON*: return a sub-tree of global nodes as a JSON object
- *increment*: increment a global node
- *getSubscripts*: return (as an array) the values of a specified subscript within a global
- *mFunction*: execute a specified M/Cach&#233; ObjectScript function and return its value

All the APIs have the same calling interface:

      ewd.globals.[APIName](parameterObject, function(error, results) {
        // do something here
      });

For example:

       ewd.globals.increment({global: 'testing', subscripts: ['xx','y','z']}, function(error, results) {
          console.log("error: " + error + "; incremented value = " + results.value);
       });

### API Details

#### set

  parameters:

  - *global*: name of the global
  - *subscripts*: array of subscript values (to identify the node to be set)
  - *value*: the value to be set for the specified global node

  error: true if an error occurred | false if the API ran successfully

  results:

  - *ok*: true

  Example:

      ewd.globals.set({global: 'rob', subscripts: ["a","b"], value: 'hello!'}, function(error, results) {
        console.log("error: " + error + "; ok = " + results.ok);
      });

#### get

  parameters:

  - *global*: name of the global
  - *subscripts*: array of subscript values (to identify the node to be accessed)

  error: true if an error occurred | false if the API ran successfully

  results:

  - *value*: value of global node (empty string if node does not exist or does not contain data)
  - *exists*: 0  = node does not exist
              1  = node exists and has data value
              10 = node exists but does not have a data value (ie it just has child subscripts)
              11 = node exists, has data *and* has child subscripts

  Example:

      ewd.globals.get({global: 'rob', subscripts: ["a","b"]}, function(error, results) {
        console.log("error: " + error + "; exists = " + results.exists + "; value = " + results.value);
      });

#### kill

  parameters:

  - *global*: name of the global
  - *subscripts*: array of subscript values (to identify the node to be deleted)

  error: true if an error occurred | false if the API ran successfully

  results:

  - *ok*: true

  Example:

      ewd.globals.kill({global: 'rob', subscripts: ["a","b"]}, function(error, results) {
        console.log("error: " + error + "; ok = " + results.ok);
      });

#### getJSON

  parameters:

  - *global*: name of the global
  - *subscripts*: array of subscript values (to identify the top of the sub-tree to retrieve)

  error: true if an error occurred | false if the API ran successfully

  results: the JSON object representing the global sub-tree

  Example:

      ewd.globals.getJSON({global: 'rob', subscripts: ["a","b"]}, function(error, results) {
        console.log("error: " + error + "; json = " + JSON.stringify(results));
      });

#### increment

  parameters:

  - *global*: name of the global
  - *subscripts*: array of subscript values (to identify the node whose value is to be incremented)

  error: true if an error occurred | false if the API ran successfully

  results:

  - *value*: new incremented value of the specified node.  If the node previously didn't exist, value will be 1

  Example:

      ewd.globals.increment({global: 'rob', subscripts: ["a","b"]}, function(error, results) {
        console.log("error: " + error + "; value = " + results.value);
      });

#### getSubscripts

  parameters:

  - *global*: name of the global
  - *subscripts*: array of subscript values (to identify the subscripting level immediately below the one you 
 want to search)
  - *from*: (optional) the start value for the list of subscripts
  - *to*: (optional) the last value for the list of subscripts
  - *all*: if you want to retrieve all subscripts, specify *all:true*

  error: true if an error occurred | false if the API ran successfully

  results: array of subscript values

  Examples:

  ewd.globals.getSubscripts({global: 'rob', subscripts: ["a"], from:'hello', to:'world'}, function(error, results) {
     console.log("error: " + error + "; array of subscripts: " + JSON.stringify(results));
  });

  ewd.globals.getSubscripts({global: 'rob', subscripts: ["a", "b"], all:true}, function(error, results) {
     console.log("error: " + error + "; array of subscripts: " + JSON.stringify(results));
  });

#### mFunction

  parameters:

  - *functionName*: name of the M function
  - *parameters*: array of parameter values to pass to the function)

  error: true if an error occurred | false if the API ran successfully

  results:

  - *value*: value returned by the function

  Examples:

    ewd.globals.mFunction({functionName: 'testFunction^myMethods', parameters: [123, 'y']}, function(error, results) {
      console.log("error: " + error + "; value returned by function: " + results.value);
    });

    ewd.globals.mFunction({functionName: '##class(my.methods).testFunction', parameters: [123, 'y']}, function(error, results) {
      console.log("error: " + error + "; value returned by function: " + results.value);
    });


## License

Copyright (c) 2011 M/Gateway Developments Ltd,
Reigate, Surrey UK.
All rights reserved.

http://www.mgateway.com
Email: rtweed@mgateway.com

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <http://www.gnu.org/licenses/>.

