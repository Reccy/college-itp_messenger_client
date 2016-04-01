// Global variables
var global_chan = "chan_global"; //Global channel name
var private_chan = ""; //Private channel name
var db_chan = "chan_database";
var client_uuid = PUBNUB.uuid(); //Temporary UUID
var client_username = null; //Client's username
var serverOnline = false; //Boolean for the server's status
var appInitialized = false; //Boolean for the app's init status
var tempChatStarted = false; //Temp Boolean for the chat start
var tempChannel; //Temp name of chat channel
var loggedIn = false; //Bool to check if user is logged in
var verifyTimeout; //Timeout to verify the server connection
var verifyLogin; //Timeout to verify the user has reconnected after a disconnect
var userlist = []; //List of users from the database
var channellist = []; //List of connected channels
var currentConversation = null; //The name of the other user that the current user is talking with
var currentChannel = null; //The id of the channel that is currently being communicated on
var historyChannel = null; //The channel used to store the channellist between sessions

//PUBNUB object
var pubnub = PUBNUB({
    ssl: true, // Enable TLS Tunneling over TCP, allows the app to run on HTTPS servers.
    subscribe_key: 'sub-c-a91c35f6-ca98-11e5-a9b2-02ee2ddab7fe',
    publish_key: 'pub-c-0932089b-8fc7-4329-b03d-7c47fe828971',
    uuid: client_uuid,
    heartbeat: 10
});

//Debug console log
console.log("Your UUID: " + client_uuid);

/**************************/
/*Initialization Functions*/
/**************************/

/* 
    Initialize the app 
    SHOULD ONLY BE CALLED ON STARTUP!!!
*/
function initialize_app() {
    clearTimeout(verifyTimeout); //Clear the timeout verification
    //appInitialized = false;
    
    console.log("\n<==========[INITIALIZING APP]==========>");
    console.log("Connecting to GLOBAL CHANNEL");

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
                displayError("serverOffline");
                if(private_chan !== "")
                {
                    pubnub.unsubscribe({
                        channel: private_chan,
                    });        
                }
            } else {
                //Verify server's connection
                verifyTimeout = setTimeout(function() {
                    verify_server_connection()
                }, 5000);
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
                if (m.m_type === "initial_connect" && m.uuid === client_uuid) {
                    if (!serverOnline) {
                        console.log("SERVER connected!");
                        serverOnline = true;
                    }
                    private_chan = m.channel;

                    /* Handle messages from the PRIVATE CHANNEL */
                    pubnub.subscribe({
                        channel: private_chan,
                        callback: function(m) {
                            console.log(m.m_type);
                            if (m.m_type === "server_shutdown") {
                                displayError("serverOffline");
                                serverOnline = false;
                                //appInitialized = false;
                                console.log("SERVER shutdown message received");
                                pubnub.unsubscribe({
                                    channel: private_chan,
                                    callback: function() {
                                        initialize_app();
                                    }
                                });
                            }
                            else if(m.m_type === "user_login_success") {
                                console.log("Login Successful!");
                                loggedIn = true;
                                client_username = m.username;
                                historyChannel = m.username + "_historyChannel";

                                pubnub.history({
                                    channel: historyChannel,
                                    callback: function(m){
                                        if(m[0][0] !== undefined){
                                            channellist = m[0][0];
                                        }
                                        
                                        console.log(Object.keys(channellist).length);
                                        for(i = 0; i < Object.keys(channellist).length; i++)
                                        {
                                            //IF CHANGES ARE MADE HERE, COPY THE CODE TO THE "CHAT_INIT" SECTION ASWELL!!!
                                            console.log("Starting new chat with: " + channellist[i].username);
                                            
                                            //Subscribe to the new user channel
                                            pubnub.subscribe({
                                                channel: channellist[i].channel,
                                                connect: function(){
                                                    console.log("Chat started with: " + channellist[i].username);
                                                },
                                                callback: function(m) {
                                                    console.log(m);
                                                    if(m.m_type === "chat_message")
                                                    {
                                                        displayMessage(m.sender, m.text);
                                                    }
                                                }
                                            });
                                        }
                                        
                                        login_attempt_modal.hide();
                                        tinglrNav.pushPage('main_start.html', {animation : 'fade'});
                                        tinglrNav.on('postpush',function(){
                                            populateMainJS();
                                            tinglrNav.off('postpush',function(){
                                                console.log("Removed Handler");
                                            });
                                        });
                                    },
                                    count: 1,
                                    reverse: false
                                });
                            }
                            else if(m.m_type === "user_login_failed") {
                                console.log("Login Failed!");
                                loggedIn = false;
                                client_username = null;
                                login_attempt_modal.hide();
                                login_failed_modal.show();
                            }
                            else if(m.m_type === "user_login_duplicate") {
                                console.log("Login Failed: Duplicate Login!");
                                loggedIn = false;
                                client_username = null;
                                login_attempt_modal.hide();
                                login_failed_duplicate_modal.show();
                            }
                            else if(m.m_type === "user_register_success") {
                                console.log("Registration Successful!");
                                loggedIn = true;
                                client_username = m.username;
                                register_attempt_modal.hide();
                                tinglrNav.pushPage("main_start.html", {animation : 'fade'});
                            }
                            else if(m.m_type === "user_register_duplicate") {
                                console.log("Registration Failed: Duplicate User!");
                                loggedIn = false;
                                client_username = null;
                                register_attempt_modal.hide();
                                register_failed_duplicate_modal.show();
                            }
                            else if(m.m_type === "chat_init") {
                                //IF CHANGES ARE MADE HERE, COPY THE CODE TO THE "LOGIN" SECTION ASWELL!!!
                                console.log("Starting new chat with: " + m.username);
                                
                                //Subscribe to the new user channel
                                pubnub.subscribe({
                                    channel: m.channel,
                                    connect: function(n) { 
                                        console.log("Chat started with: " + m.username);
                                        
                                        ons.notification.alert({
                                            message: "Chat started with " + m.username
                                        });
                                        
                                        channellist.push({
                                            "username" : m.username,
                                            "channel" : m.channel
                                        });
                                        
                                        pubnub.publish({
                                            channel: historyChannel,
                                            message: channellist,
                                            callback: function(){
                                                console.log("Channel List updated!");
                                            }
                                        });
                                        
                                    },
                                    callback: function(m) {
                                        console.log(m);
                                        if(m.m_type === "chat_message")
                                        {
                                            displayMessage(m.sender, m.text);
                                        }
                                    }
                                });
                                
                                /*$("#other_username").html(m.sender);
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
                                })*/
                            } else {
                                //Unknown m_type received
                                console.log("Unknown Message Type - Ignoring Message");
                            }
                        },
                        connect: function() {
                            console.log("Connected to: " + private_chan);
                            
                            //If already logged in, notify server to update channelList
                            if(loggedIn)
                            {
                                verifyLogin = setTimeout(function() {
                                    verify_login()
                                }, 2000);
                            }
                        },
                        presence: function(m) {
                            //console.log("Presence event: " + JSON.stringify(m));
                            if (m.uuid === "SERVER" && m.action === "join") {
                                if(appInitialized){
                                    pubnub.unsubscribe({
                                        channel: global_chan,
                                        callback: function(m) {
                                            console.log("Disconnected from GLOBAL CHANNEL!");
                                            console.log("App Initialized!");
                                            if(!loggedIn)
                                            {
                                                hideError("serverOffline");    
                                            }
                                            appInitialized = true;
                                        }
                                    });
                                } else {
                                    pubnub.unsubscribe({
                                        channel: global_chan,
                                        callback: function(m) {
                                            console.log("Disconnected from GLOBAL CHANNEL!");
                                            console.log("App Initialized!");
                                            hideError("serverOffline");
                                            appInitialized = true;
                                        }
                                    });
                                }
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
                        displayError("serverOffline");
                        serverOnline = false;
                        //appInitialized = false;
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
                    displayError("serverOffline");
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
        console.log("Verifying Server Connection...");
        console.log(appInitialized === true);
        console.log("App initialized: " + appInitialized);
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
                    console.log(m.uuids[0]);
                    
                    //Check for the SERVER [Not required???]
                    for (i = 0; i < m.uuids.length; i++) {
                        if (m.uuids[i] === "SERVER") {
                            hideError("serverOffline");
                            appInitialized = true;
                        }
                    }

                    //If the app is not initialized, then restart the app
                    if (appInitialized === false) {
                        console.log("SERVER offline! Please try again later!");
                        serverOnline = false;
                        displayError("serverOffline");
                        pubnub.unsubscribe({
                            channel: private_chan,
                            callback: function() {
                                appInitialized();
                            }
                        });
                        private_chan = "";
                    } else {
                    //Otherwise disconnect from the global channel and finish initialization
                        pubnub.unsubscribe({
                            channel: global_chan,
                            callback: function(m) {
                                console.log("Disconnected from GLOBAL CHANNEL!");
                                console.log("App Initialized!");
                                hideError("serverOffline");
                                appInitialized = true;
                            }
                        });
                    }
                }
            });
        }
    }
    
    function verify_login() {
        console.log("Sending reconnect message to server.");
        pubnub.publish({
            channel: private_chan,
            message: {
                "m_type" : "user_login_reconnect",
                "uuid" : client_uuid,
                "username" : client_username
            }
        });
    }
}

//Display connection errors to the user
function displayError(error){
    if(appInitialized){
        //Modals
        switch(error) {
            case "serverOffline":
                connection_modal.show();
                login_attempt_modal.hide();
                login_failed_modal.hide();
                login_failed_duplicate_modal.hide();
                login_failed_username_blank_modal.hide();
                login_failed_password_blank_modal.hide();
                login_failed_illegals_modal.hide();
                register_attempt_modal.hide();
                register_failed_password_miss_modal.hide();
                register_failed_username_blank_modal.hide();
                register_failed_username_length_modal.hide();
                register_failed_password_blank_modal.hide();
                register_failed_password_length_modal.hide();
                register_failed_duplicate_modal.hide();
                register_failed_illegals_modal.hide();
                break;
        }    
    } else {
        //Pages
        switch(error) {
            case "serverOffline":
                tinglrNav.pushPage('connection_server_offline.html', {animation : 'fade'});
                break;
        }
    }
}

//Hide connection errors from the user
function hideError(error){
    if(appInitialized){
        //Modal
        switch(error) {
            case "serverOffline":
                connection_modal.hide();
                break;
        }
    } else {
        //Pages
        switch(error) {
            case "serverOffline":
                tinglrNav.pushPage('landingscreen.html', {animation : 'fade'});
                break;
        }
    }
}

/******************************/
/*Initialization Functions End*/
/******************************/

//START OF SCRIPT

//Connect to user database and update userlist
pubnub.history({
     channel: db_chan,
     callback: function(m){
         if(m[0][0].m_type == "db_results"){
            userlist.length = 0;
            for(i = 0; i < m[0][0].usernames.length; i++){
                userlist.push(m[0][0].usernames[i]);
            }
        }
     },
     count: 1,
     reverse: false
});

pubnub.subscribe({
    channel: db_chan,
    callback: function(m){
        if(m.m_type == "db_results"){
            userlist.length = 0;
            for(i = 0; i < m.usernames.length; i++){
                userlist.push(m.usernames[i]);
            }
        }
    }
});



//Start App
initialize_app();

//Prompt the user if they want to connect to another new user
function promptConnectOther(user){
    ons.notification.confirm({
        title: 'Start New Chat',
        message: 'Do you want to start a new chat with ' + user + '?',
        callback: function(result) {
            if(result === 1)
            {
                //Start chat with new user
                console.log("Starting chat with " + user + "..?");
                startNewChat(user);
            }
        }
    });
}

//Start new chat with other user, by sending message to server
function startNewChat(user){
    pubnub.publish({
        channel: private_chan,
        message: {
            "m_type" : "chat_start",
            "uuid" : client_uuid,
            "usernames" : [client_username, user]
        }
    });
}

function sendMessage(text, emotion){
    msg = {
        "m_type": "chat_message",
        "sender": client_username,
        "text": text,
        "emotion" : emotion
    }
    
    pubnub.publish({
        channel: currentChannel,
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

//TEMPORARY CODE FOR USER'S INPUT
//Old code from prototype
/*
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
            "m_type": "user_login",
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
};*/