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
	   
		
##  EWD Gateway

The ewdGateway module provides a multi-purpose gateway for the GT.M and Cach&#233; databases.  Functionality includes:

- web server
- web server gateway to GT.M and Cach&#233, pre-configured for running EWD applications;
- websockets middle-tier connecting browser to GT.M or Cach&#233, pre-configured for the EWD Realtime functionality;
- access to globals from Javascript/Node.js

##  Using ewdGateway

Node.js should be installed on the same physical server as a GT.M or Cach&#233; database.

The following is a simple example of how to use the ewdGateway module:

      var ewd = require('ewdGateway');
      var params = {database:'gtm', httpPort: 8080, poolSize: 5, startWebserver: true};
      ewd.start(params, function(gateway) {
        console.log("version = " + gateway.version());
      });

This will start the webserver on port 8080, create a pool of 5 connections to GT.M.  Change the value of 
params.database to 'cache' to connect to a Cach&#233; database instead.  You can now run EWD applications.

Note: to use the ewdGateway module with EWD applications on Cach&#233; systems, you must compile the EWD 
applications using the special 'ewd' technology parameter, eg:

       do compileAll^%zewdAPI("myApp",,"ewd")

If you are using GT.M, compile your applications as normal, eg:

       do compileAll^%zewdAPI("myApp")


##  ewdGateway Start Parameters

The parameters that you can specify for the ewdGateway start function are as follows:

- database  = the database type to which the gateway will connect ('gtm' | 'cache')
- httpPort  = the port on which the webserver will listen
- poolSize  = the number of child process connections to the database to be established.
- namespace = (Cach&#233; only) the Cach&#233; namespace to which ewdGateway should connect
- startWebserver = true | false.  Use false if you want to use ewdGateway for Node.js-based applications that 
  use/access globals
- ewdPath = the URL path that denotes EWD applications (default = '/ewd/')
- webServerRootPath = the physical path to use as the webserver root path (default = '/var/www')
- trace   = true | false.  If true, a detailed log is written to the Node.js console



## License

Copyright (c) 2010 M/Gateway Developments Ltd,
Reigate, Surrey UK.
All rights reserved.

http://www.mgateway.com
Email: rtweed@mgateway.com

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <http://www.gnu.org/licenses/>.

