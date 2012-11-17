Debug NodeJS with Node Inspector on Cloud Foundry
=================================================
Instructions:
-------------
###Your NodeJS application
* Push NodeJS applicaiton to local Cloud Foundry (vcap)
* Run `pgrep -l node` to find out the PID of your NodeJS applicaiton

If you get multiple PIDs, restart your application by `vmc restart <application>`. The application’s PID has be changed. Then run `pgrep -l node` again and find out the diffrent.

* Open NodeJS application to debug mode

Run `kill -s USR1 <NODE_PID>`, replace `<NODE_PID>` with your application’s PID.

Run `lsof -i:5858`, you can get the result like

    COMMAND   PID    USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
    node    12319 mongris   17u  IPv4 561873      0t0  TCP localhost:5858

###Node Inspector
* Push Node Inspector to local Cloud Foundry as another applicaiton, it is `node-inspector` by default
* Open Node Inspector in browser with `http://node-inspector.vcap.me/debug?port=5858`

**You must REFRESH Node Inspector in browser when NodeJS application restart**