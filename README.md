# node-mwire
 
Extension to redis-node, for accessing GT.M and Cach&#233; Globals (via M/Wire interface)

Thanks to Brian Noguchi for advice on extending his redis-node client

Rob Tweed <rtweed@mgateway.com>  
06 July 2011, M/Gateway Developments Ltd [http://www.mgateway.com](http://www.mgateway.com)  

Twitter: @rtweed

Google Group for discussions, support, advice etc: [http://groups.google.co.uk/group/mdb-community-forum](http://groups.google.co.uk/group/mdb-community-forum)

## Installing node-mwire

       npm install node-mwire

You must also install redis-node:

       npm install redis-node
	   
		
##  GT.M and Cach&#233; Globals?

GT.M and Cach&#233; are relatively little-known, but extremely versatile, high-performance NoSQL databases.  They both store data in sparse hierarchical array-like structures known as "Globals".  These are extremely flexible: unlike other NoSQL databases that are designed with one particular storage model in mind, Global-based databases are more like a "Swiss Army Knife of databases".  You can use Globals to store simple key/value pairs, tabular data (cf BigTable, SimpleDB, Cassandra), documents (cf CouchDB, MongoDB) or more complex data such as graphs or DOMs.  GT.M and Cach&#233; use sophisticated mechanisms for automatically ensuring that the data you require most frequently is cached in memory: you get in-memory key/value store performance with the security and integrity of an on-disk database.

For more background on Globals, you should read [http://www.mgateway.com/docs/universalNoSQL.pdf](http://www.mgateway.com/docs/universalNoSQL.pdf)

GT.M is a particularly attractive option as it is available as a Free Open Source version.

I've developed *node-mwire* to make it possible for the growing Node.js community to benefit from the great flexibility and performance that these Global-based databases provide. The combination of Node.js and Globals is truly remarkable, and I'm hoping node-mwire will result in them becoming much better known for NoSQL database storage.

*node-mwire* is one of two Node.js clients available for GT.M and Cach&#233;.  It uses an adaptation of the Redis wire protocol and is implemented as an extension to Brian Noguchi's high-performance *redis-node* client. 

One application of *node-mwire* is to provide an HTTP server log (ie the equivalent of Apache or IIS's server log).  *node-mwire* includes an automated HTTP Server log function that saves the full available details of each incoming HTTP request as a persistent JSON document, storing each request document in a GT.M or Cach&#233; database.  Full details are towards the bottom of this ReadMe document.

##  Installing the Global-based back-end System

**Manual Installation:**

In order to use *node-mwire* you'll need to have a have a Cach&#233; system or a Linux system with GT.M installed.  You'll also need to install the following on the GT.M or Cach&#233; system:

- M/Wire routines (make sure you get the latest versions from the repository: *https://github.com/robtweed/mdb*)

I've provided specific instructions for Cach&#233; at the end of this README file.  If you'd prefer to use the Free Open Source GT.M database, read on:

To install and configure the M/Wire routines manually in GT.M, you need just 3 files from the *mdb* repository:

       zmwire.m (the GT.M routine file that does the work)
	   mwire and zmwire (the xinetd service files)
	   
The comments at the top of the zmwire.m file will tell you how to install and configure everything.  Ignore the paragraph on requiring 
MGWSI and m_apache as you won't need these if you're just using *node-mwire*.

**Using the M/DB Installer:**

Alternatively, the easiest way to get a GT.M system going is to use Mike Clayton's *M/DB installer* for Ubuntu Linux which will create you a fully-working environment within a few minutes.  Node.js and *node-mwire* can reside on the same server as GT.M or on a different server.  Mike has also created an installer that will add Node.js and our node-mbdm and node-mwire modules, to create a complete front-end and back-end environment on a single server: ideal for testing and evaluation.

The instructions below assume you'll be installing Node.js and *node-wire* on the same server.

You can apply Mike's installer to a Ubuntu Linux system running on your own hardware, or running as a virtual machine.  However, I find Amazon EC2 servers to be ideal for trying this kind of stuff out.  I've tested it with both Ubuntu 10.4 and 10.10.

So, for example, to create an M/DB Appliance using Amazon EC2:

- Start up a Ubuntu Lucid (10.10) instance, eg use ami-508c7839 for a 32-bit server version, or ami-548c783d for a 64-bit server version.

**32-bit Ubuntu:**

- Log in to your Ubuntu system and start a terminal session. If you've started a Ubuntu 10.4 or 10.10 EC2 AMI, log in with the username *ubuntu*

        sudo apt-get update
        cd /tmp
        wget http://michaelgclayton.s3.amazonaws.com/mgwtools/mgwtools-1.11_i386.deb
        sudo dpkg -i mgwtools-1.11_i386.deb (Ignore the errors that will be reported)
        sudo apt-get -f install (and type y when asked)
        rm mgwtools-1.11_i386.deb
	 
	 
**64-bit Ubuntu:**

- Log in to your Ubuntu system and start a terminal session. If you've started a Ubuntu 10.4 or 10.10 EC2 AMI, log in with the username *ubuntu*

        sudo apt-get update
        cd /tmp
        wget http://michaelgclayton.s3.amazonaws.com/mgwtools/mgwtools-1.11_amd64.deb
        sudo dpkg -i mgwtools-1.11_amd64.deb (Ignore the errors that will be reported)
        sudo apt-get -f install (and type y when asked)
        rm mgwtools-1.11_amd64.deb

If you point a browser at the domain name/IP address assigned to the Ubuntu machine, you should now get the M/DB welcome screen.  If you're going to just use the *node-mwire* client, you don't need to initialise the M/DB server.

If you want to make a completely self-contained test system that also includes Node.js and *node-mwire*, then continue as follows:
	      
      cd /tmp
      wget http://michaelgclayton.s3.amazonaws.com/mgwtools/node-mdbm-1.11_all.deb (Fetch the installer file)
      sudo dpkg -i node-mdbm-1.11_all.deb (Ignore the errors that will be reported)
      sudo apt-get -f install (and type y when asked)
	  
Note - the Node.js build process can take quite a long time and is very verbose, so be patient!
	
OK! That's it all installed. You should now be ready to try out *node-mwire*!

## Testing node-mwire

If you used Mike Clayton's installers as described above:

  In */usr/local/gtm/ewd* create a file named *test1.js* containing:
  
    var mwireLib = require("node-mwire");
    var mwire = new mwireLib.Client({port:6330, host: '127.0.0.1'});

     mwire.clientPool[mwire.connection()].version(function (error, json) {
        if (error) throw error;
        console.log("Build = " + json.Build + "; date=" + json.Date + "; zv=" + json.Host);
    });
	
Now run it (from within */usr/local/gtm/ewd*).  If everything is working properly, you should see:

    ubuntu@domU-12-31-39-09-B8-03:/usr/local/gtm/ewd$ node test1.js
    Build = Build 9; date=07 November 2010; zv=GT.M V5.4-001 Linux x86

If this is what you get, then you have Node.js successfully communicating with your GT.M database.
	
## Running node-mwire

To use node-mdbm in your Node.js applications, you must add:

        var mwireLib = require("node-mwire");
        var mwire = new mwireLib.Client({port:6330, host: '127.0.0.1', poolSize:4});
	
By default, the back-end M/Wire routines in GT.M and/or Cach&#233; listen on port 6330.  If you don't specify a poolSize, a pool of 5 connections will be created and used.  Initial testing suggests that the optimum poolSize value is quite low - betwen 4 and 6. Performance appears to be adversely affected if you use too large a connection pool, so experimentation is recommended.  For most lightly-loaded systems, the default poolSize of 5 is probably quite satisfactory.

For a default setup that connects to GT.M and/or Cach&#233; using port 6330, localhost (127.0.0.1) with a poolSize of 5, you can simply replace the lines above with:

        var mwireLib = require("node-mwire");
        var mwire = new mwireLib.Client();
	
(*If you are using a self-contained M/DB Appliance-based system, the host will normally be 127.0.0.1, but you can access a remote GT.M or Cach&#233; system from Node.js by specifying the IP Address or Domain Name of the GT.M or Cach&#233; machine.  Note that in order to access a remote GT.M or Cach&#233; system using node-mwire you must install the routines from the robtweed/mdb repository on the GT.M system*)

When executing an M/Wire API commands, you must select a connection.  The simplest approach is to use one of the available ones in the pool at random using:

		mwire.clientPool[mwire.connection()].<command>();

Now you can use any of the node-mwire APIs.


## APIs

- setGlobal (sets a Global node, using the specified subscripts and data value)
- getGlobal (gets a Global node, using the specified subscripts)
- setJSON   (maps a JSON object to a Global)
- getJSON   (returns a JSON object from Global storage)
- kill      (deletes a Global node, using the specified subscripts)
- getGlobalList  (returns an array of Global names that exist in your database)
- getNextSubscript     (returns the next subscript at a specified level of Global subscripting)
- getPreviousSubscript     (returns the next subscript at a specified level of Global subscripting)
- getSubscripts  (returns an array containing subscript values within a specified range, below a specified level of subscripting)
- getAllSubscripts  (returns an array containing all subscript values below a specified level of subscripting)
- increment (Atomically increments a Global node, using the specified subscripts)
- decrement (Atomically decrements a Global node, using the specified subscripts)
- remoteFunction   (Execute a function within the GT.M or Cach&#233; system and return the response)
- transaction   (Execute a sequence of Global manipulations in strict order, specified as an array of setJSON and kill JSON documents.)
- backupGlobal   (Backs up an entire global to a specified text file path)
- cloneGlobal   (Make a snapshot/clone of one Global subtree into another Global sub-tree)
- version   (returns the M/Wire build number and date)

- onNext  (built-in event emitter that supports sequential processing of Global nodes by subscript)

## Commands

( substitute *client.* with *mwire.clientPool[mwire.connection()]* )

- client.*version*(function(error, results) {});

    Returns the current build number and date in the results object:
	
	    results.Build = build number  
	    results.Date = build date
	
	
- client.*setGlobal*(GlobalName, subscripts, value, function(error, results) {});
	
	Sets a Global node:
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the subscripts ('' if value to be set at top of Global)
	    eg ["a","b","c"]
	value = the data value to be set at the specified Global node
	
	Returns ok=true if successful, ie:
	
       results.ok = true

- client.getGlobal(GlobalName, subscripts, function(error, results) {});

	Gets the value for a Global node:
	
	GlobalName = name of Global (literal)  
	subscripts = optional array specifying the subscripts ('' if value at top of Global to be returned)
	    eg ["a","b","c"]
	
	Returns the value (if any) and the status of the specified node
	
       results.value
	   results.dataStatus
	   
	   If the specified node does not exist, results.dataStatus = 0 and results.value = ''
	   If the specified node exists, has lower-level subscripts but no data value, results.dataStatus = 10 and results.value = ''
	   If the specified node exists, has lower-level subscripts has a data value, results.dataStatus = 11 and results.value = the value of the node
	   If the specified node exists, has no lower-level subscripts and has a data value, results.dataStatus = 1 and results.value = the value of the node
	   
- client.setJSON(GlobalName, subscripts, json, deleteBeforeSave, function(error, results) {});

    Maps the specified JSON object and saves it into a Global node.  The JSON object can be saved into the top node of a Global, or merged under a specified subscript level within a Global.  Optionally you can clear down any existing data at the specified Global node.  The default is the new JSON object gets merged with existing data in the Global.
	
	GlobalName = name of Global (literal)  
	subscripts = optional array specifying the subscripts ('' if JSON to be stored at top level of Global)
	    eg ["a","b","c"]
	json = the JSON object to be saved (object literal)  
	deleteBeforeSave = true|false (default = false)
	
	Returns ok=true if successful, ie:
	
       results.ok = true
	   
- client.getJSON(GlobalName, subscripts, function(error, results) {});

    Gets the data stored at and under the specified Global node, and maps it to a JSON object before returning it.
	
	GlobalName = name of Global (literal)  
	subscripts = optional array specifying the subscripts ('' if JSON to be stored at top level of Global)
	    eg ["a","b","c"]

	
	Returns the JSON object as results
	
       results = returned JSON object
	   
- client.kill(GlobalName, subscripts, function(error, results) {});
	
	Deletes a Global node and the sub-tree below it:
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the subscripts ('' if the entire Global is to be deleted)
	    eg ["a","b","c"]
	
	Returns ok=true if successful, ie:
	
       results.ok = true
	
- client.getGlobalList(function(error, results) {});

    Returns an array of Global Names in your database (ie results):

	
- client.getNextSubscript(GlobalName, subscripts, function(error, results) {});
	
	Gets the next subscript value (if any) in collating sequence at the specified level of subscripting, following the last specified subscript:
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the subscripts ('' if the first 1st subscript is to be returned)
	    eg ["a","b","c"]  will return the value of the 3rd subscript the follows the value "c" where subscript1 = "a" and subscript2 = "b"
	
	Returns:
	
	    results.subscriptValue = the value of the next subscript
		results.dataStatus = the data status at the next subscript:
					10 = no data at the next subscripted node but child subscripts exist
					11 = data at the next subscripted node, and child subscripts exist
					1  = data at the next subscripted node, but no child subscripts exist
		results.dataValue = the value (if any) at the next subscript

- client.getPreviousSubscript(GlobalName, subscripts, function(error, results) {});
	
	Gets the previous subscript value (if any) in collating sequence at the specified level of subscripting, preceding the last specified subscript:
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the subscripts ('' if the last 1st subscript is to be returned)
	    eg ["a","b","c"]  will return the value of the 3rd subscript the precedes the value "c" where subscript1 = "a" and subscript2 = "b"
	
	Returns:
	
	    results.subscriptValue = the value of the previous subscript
		results.dataStatus = the data status at the previous subscript:
					10 = no data at the previous subscripted node but child subscripts exist
					11 = data at the previous subscripted node, and child subscripts exist
					1  = data at the previous subscripted node, but no child subscripts exist
		results.dataValue = the value (if any) at the previous subscript

- client.getSubscripts(GlobalName, subscripts, , fromValue, toValue, function(error, results) {});
	
	Gets the values of subscripts within the specified range, that exist below the specified subscript(s):
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the required subscripts ('' if all 1st subscript values are to be returned)
	    eg ["a","b","c"]  will return an array of all subscripts that exist below this level of subscripting
	fromValue  = starting value of range (inclusive)
	toValue    = end value of range (inclusive)
	
	Returns:
	
	    results = array of subscripts within the range found immediately below the specified Global node.
		
- client.getAllSubscripts(GlobalName, subscripts, function(error, results) {});
	
	Gets all the values of the subscripts that exist below the specified subscript(s):
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the required subscripts ('' if all 1st subscript values are to be returned)
	    eg ["a","b","c"]  will return an array of all subscripts that exist below this level of subscripting
		
	
	Returns:
	
	    results = array of all subscripts found immediately below the specified Global node.

- client.increment(GlobalName, subscripts, delta, function(error, results) {});
	
	Atomically increments the speficied Global node by the specified amount.  If the node does not exist, it is created and its initial value is assumed to be zero:
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the required subscripts ('' if the top-level Global node is to be incremented)
	    eg ["a","b","c"] 
	delta: the amount by which the specified Global node is to be incremented (default = 1)	
	
	Returns:
	
	    results.value = the new value of the incremented node

- client.decrement(GlobalName, subscripts, delta, function(error, results) {});
	
	Atomically decrements the speficied Global node by the specified amount.  If the node does not exist, it is created and its initial value is assumed to be zero:
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the required subscripts ('' if the top-level Global node is to be decremented)
	    eg ["a","b","c"] 
	delta: the amount by which the specified Global node is to be decremented (default = 1)	
	
	Returns:
	
	    results.value = the new value of the decremented node

- client.transaction(json, function(error, results) {});
	
	Invokes a sequence of actions within the back-end GT.M or Cach&#233; system.  These actions are applied in strict sequence and constitute a transaction.
	
	json = a JSON array of object literals.  Each object literal defines either a setJSON or kill command.

	For example:
	
		var action1 = {
			method:'setJSON',
			GlobalName:'mdbmTest9',
			subscripts:['a'],
			json:{this:{is:{too:'cool',really:"nice!"}}}
		};
		var action2 = {
			method:'kill',
			GlobalName:'mdbmTest9',
			subscripts:['b','c']
		};
		var json = [action1,action2];
	
	Returns ok=true if successful, ie:
	
       results.ok = true

	In the example above, the actions are invoked in the GT.M or Cach&#233; back-end in strict sequence according to their position in the *json* array, ie *action1*, followed by *action 2*.  The transaction details are sent as a single request to the back-end from Node.js and the invocation of the commands that make up the transaction occurs entirely within the back-end system.  As a result, the Node.js thread is not blocked.  The call-back function is invoked only when the entire transaction has completed at the back-end.
		
- client.remoteFunction(functionName, parameters, function(error, results) {});
	
	Execute a native GTM or Cach&#233; function.  This is usually for legacy applications:
	
	functionName = function name/reference (literal), eg 'myFunc&#94;theRoutine'  
	parameters = array specifying the values for the remote function's parameters ('' if no parameters required)
	    eg ["a","b","c"] 
	
	Returns:
	
	    results.value = the response/result returned by the remote function
		
- mwire.onNext(GlobalName, subscripts, callback)
		
	This is an event emitter wrapper around the *getNextSubscript* command that can be used to invoke a specified callback for each successive subscript found by the *getNextSubscript* command.
	
	GlobalName = name of Global (literal)  
	subscripts = array specifying the subscripts ('' if the first 1st subscript is to be returned)
	    eg ["a","b","c"]  will return the value of the 3rd subscript the follows the value "c" where subscript1 = "a" and subscript2 = "b"
	callback = the name of the callback function to invoke.
	
	For example, suppose you have a Global: ^nwd("session",sessionId)=someData

	To apply some processing to every sessionId node in this global, first fire a callback for the first sessionId in the global:
	
		mwire.onNext("nwd", ["session", ""], processSession);

	The *processSession* callback would look something like the following:
	
		var processSession = function(error, results) {
		   var sessionId = results.subscriptValue;
		   if (sessionId != '') {
		      // process the Global Node here...
			  mwire.onNext("nwd", ["session", sessionId], processSession);
		   }
		};
	
	*mwire.onNext* will emit a new "getNext" event for each sessionId found in the global, and will stop when no more subscript values are found.

- client.cloneGlobal(fromGlobalName, fromSubscripts, , toGlobalName, toSubscripts, toClearDown, function(error, results) {});
	
	Makes a copy of an entire Global or specified sub-tree of a Global into another Global or Global sub-tree:
	
	fromGlobalName = name of Global to be cloned (literal)  
	fromSubscripts = array specifying the required subscripts of the cloned Global
	    eg ["a","b","c"]  will clone the Global sub-tree of nodes beneath these subscripts
		   [] will clone the entire Global
	toGlobalName = name of Global to hold the cloned copy (literal)  
	toSubscripts = array specifying the subscripts of the toGlobal into which the fromGlobal will be copied
	    eg ["a","b","c"]  will copy the cloned nodes beneath these subscripts of the toGlobal
		   [] will copy the cloned nodes directly under the root node of the toGlobal
	toClearDown  = true|false.  If true, the specified toGlobal subtree is cleared down before the cloning process begins
	
	Returns:
	
	    results = {ok:true} if the clone process completed successfully
	
- client.backupGlobal(GlobalName, Subscripts, , filePath, function(error, results) {});
	
	Makes a backup copy of an entire Global or specified sub-tree of a Global into a specified text file:
	
	GlobalName = name of Global to be backed up (literal)  
	Subscripts = array specifying the required subscripts of the Global subtree to be backed up
	    eg ["a","b","c"]  will backup the Global sub-tree of nodes beneath these subscripts
		   [] will backup the entire Global
	filePath  =  path of file into which the Global node references and data will be copied.  If the file does 
	             not exist, it will be created.
	
	Returns:
	
	    results = {ok:true} if the backup process completed successfully
		
## Examples

To set the Global:  


    ^mdbmTest("check","this","out")="Too cool!"

   
and then retrieve the value again (note the asynchronous nature of Node.js will 
not guarantee the order in which the APIs below are executed in the GT.M or Cach&#233; back-end)


    var mwireLib = require("node-mwire");
    var mwire = new mwireLib.Client({port:6330, host: '127.0.0.1'});
	
    mwire.clientPool[mwire.connection()].setGlobal('mdbmTest', ["check","this","out"], "Too cool!",
       function(err, results) {
          if (err) throw err;
          console.log("setGlobal: " + results.ok);
    });
	
    mwire.clientPool[mwire.connection()].getGlobal('mdbmTest', ["check","this","out"],
       function(err, results) {
          if (err) throw err;
          console.log("getGlobal: " + results.value);
    });

Note: this Global node could also have been created using SetJSON:

    var json = {"check":{"this":{"out":"Too cool!"}}};
    mwire.clientPool[mwire.connection()].setJSON('mdbmTest', '', json, true,
       function(err, results) {
          if (err) throw err;
          console.log("setJSON: " + results.ok);
     });
 
and the original JSON could be retrieved using:

    mwire.clientPool[mwire.connection()].getJSON('mdbmTest', '',
       function(err, json) {
          if (err) throw err;
          console.log("getJSON: " + JSON.stringify(json));
     });
	
## HTTP Server Logging

*node-mwire* includes an HTTP server log mechanism, allowing you to store in a GT.M or Cach&#233; database the complete details of every incoming HTTP request to your Node.js web server (ie the equivalent of Apache's log file, but saved in JSON format).

To use this facility, simply install node-mwire, install and configure a GT.M or Cach&#233; database and add the following *requires* at the top of your web server code:

		var mwireLib = require("node-mwire");
		var mwire = new mwireLib.Client({port:6330, host:'127.0.0.1'});

[Modify the host and port paramaters if required]

Then, add the following within your main web server logic:

		mwire.httpLog(request);
		
eg:

		http.createServer(function(request, response) {
			var urlObj = url.parse(request.url); 
			var uri = urlObj.pathname;
			if (uri === '/favicon.ico') {
				display404(response);
				return;
			}
			mwire.httpLog(request);
			//....etc
		}).listen(8080); 

		
By default, up to 5 days' worth of logs will be maintained in the GT.M or Cach&#233; database.  A timed event kicks in automatically each hour to trim down the HTTP log Global.

Each request is saved as an event record.  Here's a typical example of an event in the Global:

		^nodeHTTPLog("log",214,"headers","accept")="application/xml,application/xhtml+xm
				l,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5"
		^nodeHTTPLog("log",214,"headers","accept-encoding")="gzip, deflate"
		^nodeHTTPLog("log",214,"headers","accept-language")="en-us"
		^nodeHTTPLog("log",214,"headers","cache-control")="max-age=0"
		^nodeHTTPLog("log",214,"headers","connection")="keep-alive"
		^nodeHTTPLog("log",214,"headers","host")="192.168.1.115:8080"
		^nodeHTTPLog("log",214,"headers","user-agent")="Mozilla/5.0 (Macintosh; U; Intel
				Mac OS X 10_6_4; en-us) AppleWebKit/533.18.1 (KHTML, like Gecko) Vers
				ion/5.0.2 Safari/533.18.5"
		^nodeHTTPLog("log",214,"httpVerion")=1.1
		^nodeHTTPLog("log",214,"method")="GET"
		^nodeHTTPLog("log",214,"remoteAddr")="192.168.1.100"
		^nodeHTTPLog("log",214,"time")="Wed, 10 Nov 2010 13:07:44 GMT"
		^nodeHTTPLog("log",214,"timeStamp")=1289394464293
		^nodeHTTPLog("log",214,"url")="/ewd/testpage2/?a=1&b=2"

You can change the number of days' worth of logs that will be maintained in this Global using the command:

		mwire.setHttpLogDays(noOfDays);
		
		eg: 
		
		mwire.setHttpLogDays(7);
		
You can retrieve a logged event using the getJSON command, eg:

		mwire.clientPool[mwire.connection()].getJSON('nodeHTTPLog', ["log", 214] ,
			function(err, json) {
				console.log("HTTP request event 214: " + JSON.stringify(json));
				console.log("The browser used was " + json.headers["user-agent"]);
				console.log("The request was from IP address " + json.remoteAddr);
				});

			
## Using node-mwire with Cach&#233;

The node-mwire client can be used with a Cach&#233; database

On the client system you need to install *Node.js*, the *redis-node* client and the *node-mwire* extension.

On the Cach&#233; back-end system, you need to do the following:

- install EWD for Cach&#233; (build 827 or later): [http://www.mgateway.com/ewd.html](http://www.mgateway.com/ewd.html)

- download the M/DB and M/Wire files from the **robtweed/mdb** repository (*http://github.com:robtweed/mdb.git*)

- you'll find a directory named */cache* in the **robtweed/mdb** repository and inside it is a file named **mdb.xml**.  Use $system.OBJ.Load(filePath) to install the M/DB and M/Wire routines that it contains into your working namespace (eg USER)
	
By default, M/Wire will run on port 6330.  On Cach&#233; systems, remote access to the M/Wire protocol is controlled by a daemon process.  To start this:

     job start^zmwireDaemon
	 
You can now access the Cach&#233; system from Node.js, eg:

     var mwireLib = require("node-mwire");
     var mwire = new mwireLib.Client({port:6330, host: '192.168.1.105'});

    mwire.clientPool[mwire.connection()].version(function (err, json) {
      if (err) throw err;
       console.log("Build = " + json.Build + "; date=" + json.Date + "; zv=" + json.Host);
    });

You should see something like:

      Build = Build 9; date=07 November 2010; zv=Cache for Windows (x86-32) 2008.2.1 (Build 902) Thu Jan 22 2009 13:50:37 EST


## License

Copyright (c) 2010 M/Gateway Developments Ltd,
Reigate, Surrey UK.
All rights reserved.

http://www.mgateway.com
Email: rtweed@mgateway.com

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <http://www.gnu.org/licenses/>.

