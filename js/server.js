// Global variables
var global_chan = "itp_test_channel_nodejs"; //Global channel name
var private_chan = ""; //Private channel name
var client_uuid = PUBNUB.uuid(); //Temporary UUID
var client_username = null; //Client's username
var serverOnline = false; //Boolean for the server's status
var appInitialized = false; //Boolean for the app's init status
var tempChatStarted = false; //Temp Boolean for the chat start
var tempChannel; //Temp name of chat channel
var loggedIn = false; //Bool to check if user is logged in
var verifyTimeout; //Timeout to verify the server connection

//PUBNUB object
var pubnub = PUBNUB({
    subscribe_key: 'sub-c-a91c35f6-ca98-11e5-a9b2-02ee2ddab7fe',
    publish_key: 'pub-c-0932089b-8fc7-4329-b03d-7c47fe828971',
    uuid: client_uuid,
    heartbeat: 30,
    ssl: true
});

//Debug console log
console.log("Your UUID: " + client_uuid);

/* Initialize the app */
function initialize_app() {
    clearTimeout(verifyTimeout); //Clear the timeout verification
    appInitialized = false;
    
    //Debug Start
    console.log("\n<==========[INITIALIZING APP]==========>");
    console.log("Connecting to GLOBAL CHANNEL");
    //Debug End

    /* 
        Check who is online on the global channel.
        Set the "serverOnline" boolean depending on the SERVER's presence.
    */
    pubnub.here_now({
        channel: global_chan,
        callback: function(m) {
            serverOnline = false; //Reset bool
            
            //Iterate through online UUIDs
            for (i = 0; i < m.uuids.length; i++) {
                /* 
                    If the UUID is the SERVER and the server bool is "Offline",
                    set the server bool to true.
                */
                if ((m.uuids[i] === "SERVER") && !serverOnline) {
                    console.log("SERVER connected!");
                    serverOnline = true;
                    break;
                }
            }
            
            /*
                If the SERVER is offline, unsubscribe from the private channel
            */
            if (!serverOnline) {
                console.log("SERVER offline! Please try again later!");
                tinglrNav.pushPage('connection_error.html', {animation : 'fade'});
                if(private_chan !== "")
                {
                    pubnub.unsubscribe({
                        channel: private_chan,
                    });        
                }
            }
            
            //Connect to the global channel
            connect_to_global();
        }
    });
    
    /*
        Connect to the global channel
    */
    function connect_to_global() {
        pubnub.subscribe({
            channel: global_chan,
            callback: function(m) {
                //console.log("Received message: " + JSON.stringify(m));
                if (m.m_type === "i_connect" && m.uuid === client_uuid) {
                    if (!serverOnline) {
                        console.log("SERVER connected!");
                        serverOnline = true;
                    }
                    private_chan = m.channel;

                    /* Handle messages from the PRIVATE CHANNEL */
                    pubnub.subscribe({
                        channel: private_chan,
                        callback: function(m) {
                            if (m.m_type === "server_shutdown") {
                                serverOnline = false;
                                appInitialized = false;
                                tinglrNav.pushPage('connection_error.html', {animation : 'fade'});
                                console.log("SERVER shutdown message received");
                                pubnub.unsubscribe({
                                    channel: private_chan,
                                    callback: function() {
                                        initialize_app();
                                    }
                                });
                            }
                            else if(m.m_type === "usr_login_reply") {
                                console.log("YOUR USERNAME IS: " + m.username + " | LOGIN SUCCESSFUL");
                                loggedIn = true;
                                client_username = m.username;
                            }
                            else if(m.m_type === "chat_init") {
                                console.log("INITIATING CHAT!");
                                $("#other_username").html(m.sender);
                                pubnub.subscribe({
                                    channel: m.channel,
                                    connect: function() {
                                        console.log("CHAT CONNECTED");
                                        tempChatStarted = true;
                                        tempChannel = m.channel;
                                    },
                                    callback: function(m) {
                                        if(m.m_type === "chat_message") {
                                            console.log(m.sender + ": " + m.contents);
                                            displayMessage(m.sender, m.contents);
                                        }
                                    }
                                })
                            }
                        },
                        connect: function() {
                            console.log("Connected to: " + private_chan);
                            verifyTimeout = setTimeout(function() {
                                verify_server_connection()
                            }, 5000);
                        },
                        presence: function(m) {
                            //console.log("Presence event: " + JSON.stringify(m));
                            if (m.uuid === "SERVER" && m.action === "join" && !appInitialized) {
                                pubnub.unsubscribe({
                                    channel: global_chan,
                                    callback: function(m) {
                                        console.log("Disconnected from GLOBAL CHANNEL!");
                                        console.log("App Initialized!");
                                        appInitialized = true;
                                        tinglrNav.pushPage('landingscreen.html', {animation : 'fade'});
                                    }
                                });
                            }

                            if ((m.uuid === "SERVER" && (m.action === "leave" || m.action === "timeout")) && serverOnline) {
                                console.log("SERVER offline! Disconnecting from: " + private_chan);
                                pubnub.unsubscribe({
                                    channel: private_chan,
                                    callback: function() {
                                        initialize_app();        
                                    }
                                });
                            }
                        }
                    });
                } else if (m.m_type === "server_shutdown") {
                    if (m.m_type === "server_shutdown") {
                        serverOnline = false;
                        appInitialized = false;
                        tinglrNav.pushPage('connection_error.html', {animation : 'fade'});
                        console.log("SERVER shutdown message received");
                        pubnub.unsubscribe({
                            channel: private_chan,
                            callback: function() {
                                initialize_app();
                            }
                        });
                    }
                }
            },
            presence: function(m) {
                //console.log(JSON.stringify(m));
                if ((m.uuid === "SERVER" && (m.action === "leave" || m.action === "timeout")) && serverOnline) {
                    console.log("SERVER offline! Please try again later!");
                    serverOnline = false;
                    tinglrNav.pushPage('connection_error.html', {animation : 'fade'});
                    pubnub.unsubscribe({
                        channel: private_chan,
                        callback: function() {
                            initialize_app();
                        }
                    });
                }
            }
        });
    }

    /*
        Verify that the client has connected with the server on the private channel
    */
    function verify_server_connection() {
        //If the app is not initialized...
        if (appInitialized === false) {
            
            /*
                Check who is online on the private channel,
                if the SERVER is connected, the app is
                initialized.
            */
            pubnub.here_now({
                channel: private_chan,
                callback: function(m) {
                    //Check for the SERVER
                    for (i = 0; i < m.uuids.length; i++) {
                        if (m.uuids[i] === "SERVER") {
                            appInitialized = true;
                            tinglrNav.pushPage('landingscreen.html', {animation : 'fade'});
                        }
                    }

                    //If the app is not initialized, then restart the app
                    if (appInitialized === false) {
                        console.log("SERVER offline! Please try again later!");
                        serverOnline = false;
                        tinglrNav.pushPage('connection_error.html', {animation : 'fade'});
                        private_chan = "";
                        pubnub.unsubscribe({
                            channel: private_chan,
                            callback: function() {
                                appInitialized();
                            }
                        });
                    } else {
                    //Otherwise disconnect from the global channel and finish initialization
                        pubnub.unsubscribe({
                            channel: global_chan,
                            callback: function(m) {
                                console.log("Disconnected from GLOBAL CHANNEL!");
                                console.log("App Initialized!");
                                appInitialized = true;
                                tinglrNav.pushPage('landingscreen.html', {animation : 'fade'});
                            }
                        });
                    }
                }
            });
        }
    }
}

//START OF SCRIPT
initialize_app();

//TEMPORARY CODE FOR USER'S INPUT
function sendMessage(data){
    if(!serverOnline)
    {
        console.log("ERROR! Can not send message: Server offline!");
    } 
    else if(!appInitialized)
    {
        console.log("ERROR! Can't send message: App not yet initialized!");
    }
    else if(!loggedIn)
    {
        
        msg = {
            "m_type": "usr_login",
            "uuid": client_uuid,
            "contents": data
        };
        
        pubnub.publish({
            channel: private_chan,
            message: msg,
            callback: function(m){
                if (m[0] == "1")
                {
                    console.log("MESSAGE SENT SUCCESSFULLY: " + m);
                }
                else
                {
                    console.log("MESSAGE SENT FAILED: " + m);
                }
            }
        });
    }
    else if(!tempChatStarted)
    {
        console.log("STARTING CHAT WITH: " + data);
        
        msg = {
            "m_type": "chat_start",
            "sender": client_username,
            "receiver": data
            }
        
        pubnub.publish({
            channel: private_chan,
            message: msg,
            callback: function(m){
                if (m[0] == "1")
                {
                    console.log("MESSAGE SENT SUCCESSFULLY: " + m);
                }
                else
                {
                    console.log("MESSAGE SENT FAILED: " + m);
                }
            }
        });
    }
    else
    {
        msg = {
            "m_type": "chat_message",
            "sender": client_username,
            "contents": data
        }
        
        pubnub.publish({
            channel: tempChannel,
            message: msg,
            callback: function(m){
                if (m[0] == "1")
                {
                    console.log("MESSAGE SENT SUCCESSFULLY: " + m);
                }
                else
                {
                    console.log("MESSAGE SENT FAILED: " + m);
                }
            }
        })
    }
};