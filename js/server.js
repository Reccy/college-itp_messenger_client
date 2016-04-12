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
var chatLoaded = false; //Used to stop the scroller from going too far when first opening a chat
var selectedEmotionName = "none" //Name of the currently selected emotion

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



/******************/
/*SERVER CODE START/
/******************/

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



/**************************/
/*Initialization Functions*/
/**************************/

/* 
    Initialize the app 
*/
function initialize_app() {
    clearTimeout(verifyTimeout); //Clear the timeout verification
    
    console.log("\n<==========[INITIALIZING APP]==========>");
    console.log("Connecting to GLOBAL CHANNEL");

    //Setup a connection timeout
    verifyTimeout = setTimeout(function() {
        verify_server_connection()
    }, 5000);
    
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
            }
            
            //Connect to the global channel
            connect_to_global();
        }
    });
    
    /*
        Connect to the global channel
    */
    function connect_to_global() {
        console.log("CONNECTING TO GLOBAL!");
        
        //Subscribe to the global channel
        pubnub.subscribe({
            channel: global_chan,
            callback: function(m) {
                console.log("Received message: " + JSON.stringify(m));
                
                //Handle the initial connection callback
                if (m.m_type === "initial_connect" && m.uuid === client_uuid) {
                    
                    //At this point, the server should be online
                    if (!serverOnline) {
                        console.log("SERVER connected!");
                        serverOnline = true;
                    }
                    private_chan = m.channel;

                    //Subscribe to, and handle messages from this user's PRIVATE CHANNEL
                    pubnub.subscribe({
                        channel: private_chan,
                        callback: function(m) {
                            console.log(m.m_type);
                            
                            //MESSAGE TYPE: server_shutdown
                            //DESCRIPTION: Closes all connection and restarts the client.
                            if (m.m_type === "server_shutdown"){
                                displayError("serverOffline");
                                serverOnline = false;
                                console.log("SERVER shutdown message received");
                                pubnub.unsubscribe({
                                    channel: private_chan,
                                    callback: function() {
                                        initialize_app();
                                    }
                                });
                            }
                            //MESSAGE TYPE: user_login_success
                            //DESCRIPTION: Notifies the user of a successful login,
                            //sends the user to the main menu and sets up variables.
                            else if(m.m_type === "user_login_success") {
                                console.log("Login Successful!");
                                loggedIn = true;
                                client_username = m.username;
                                historyChannel = m.username + "_hisChan";
                                
                                //Connects the user to their friends
                                pubnub.history({
                                    channel: historyChannel,
                                    callback: function(m){
                                        
                                        if(m[0][0] !== undefined){
                                            channellist = m[0][0];
                                        }
                                        
                                        console.log(Object.keys(channellist).length);
                                        for(i = 0; i < Object.keys(channellist).length; i++)
                                        {
                                            //PROGRAMMER NOTE: 
                                            //IF CHANGES ARE MADE HERE, COPY THE CODE TO THE "CHAT_INIT" SECTION ASWELL!
                                            console.log("Starting new chat with: " + channellist[i].username);
                                            
                                            //Subscribe to the new user channel
                                            pubnub.subscribe({
                                                channel: channellist[i].channel,
                                                callback: function(m) {
                                                    console.log(m);
                                                    //MESSAGE TYPE: chat_message
                                                    //DESCRIPTION: Display the received message on the chat panel
                                                    if(m.m_type === "chat_message")
                                                    {
                                                        if(m.text != null)
                                                        {
                                                            displayMessage(m.sender, m.text, m.emotion);    
                                                        }
                                                    }
                                                }
                                            });
                                        }
                                        
                                        //Send the user to the main menu
                                        login_attempt_modal.hide();
                                        $("#username_replace").text(client_username);
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
                            //MESSAGE TYPE: user_login_failed
                            //DESCRIPTION: Notifies the user of a failed login
                            else if(m.m_type === "user_login_failed") {
                                console.log("Login Failed!");
                                loggedIn = false;
                                client_username = null;
                                login_attempt_modal.hide();
                                login_failed_modal.show();
                            }
                            //MESSAGE TYPE: user_login_duplicate
                            //DESCRIPTION: Notifies the user of a duplicate user
                            else if(m.m_type === "user_login_duplicate") {
                                console.log("Login Failed: Duplicate Login!");
                                loggedIn = false;
                                client_username = null;
                                login_attempt_modal.hide();
                                login_failed_duplicate_modal.show();
                            }
                            //MESSAGE TYPE: user_register_success
                            //DESCRIPTION: Notifies the user of a successful registration
                            else if(m.m_type === "user_register_success") {
                                console.log("Registration Successful!");
                                loggedIn = true;
                                client_username = m.username;
                                register_attempt_modal.hide();
                                tinglrNav.pushPage("main_start.html", {animation : 'fade'});
                            }
                            //MESSAGE TYPE: user_register_duplicate
                            //DESCRIPTION: Notifies the user of a duplicate registered user
                            else if(m.m_type === "user_register_duplicate") {
                                console.log("Registration Failed: Duplicate User!");
                                loggedIn = false;
                                client_username = null;
                                register_attempt_modal.hide();
                                register_failed_duplicate_modal.show();
                            }
                            //MESSAGE TYPE: chat_init
                            //DESCRIPTION: Initiates a chat with a new friend ^_^
                            else if(m.m_type === "chat_init") {
                                //IF CHANGES ARE MADE HERE, COPY THE CODE TO THE "LOGIN" SECTION ASWELL!
                                console.log("Starting new chat with: " + m.username);
                                
                                //Subscribe to the new user channel
                                pubnub.subscribe({
                                    channel: m.channel,
                                    connect: function(n) { 
                                        console.log("Chat started with: " + m.username);
                                        
                                        //Notify the user of the new chat
                                        ons.notification.alert({
                                            message: "Chat started with " + m.username
                                        });
                                        
                                        //Add the new user/channel pair to the persistant list of channels
                                        channellist.push({
                                            "username" : m.username,
                                            "channel" : m.channel
                                        });
                                        
                                        //If the user is on the search page, remove the friend from the search list
                                        if(tinglrNav.getCurrentPage().page === "search.html")
                                        {
                                            //Removes new friend from the search list
                                            rem = filteredList.indexOf(m.username);
                                            if(rem != -1) {
                                            	filteredList.splice(rem, 1);
                                            }
                                            
                                            $("#search_list").html("");
                                            if(filteredList.length > 0)
                                            {
                                                for(i = 0; i < filteredList.length; i++){
                                                    $("#search_list").html($("#search_list").html() + "<ons-list-item class='list__item ons-list-item-inner list__item--chevron' modifier='chevron' onclick='promptConnectOther($(this).html());'>" + filteredList[i] + "</ons-list-item>");
                                                }
                                            }
                                            else
                                            {
                                                //No results found
                                                $("#search_list").html("<ons-list-item class='list__item ons-list-item-inner'>No Results</ons-list-item>");
                                            }
                                        }
                                        
                                        //Update the persistant channel list
                                        pubnub.publish({
                                            channel: historyChannel,
                                            message: channellist,
                                            callback: function(){
                                                console.log("Channel List updated!");
                                            }
                                        });
                                        
                                        //Populate the main menu
                                        populateMainJS();
                                    },
                                    callback: function(m) {
                                        console.log(m);
                                        //MESSAGE TYPE: chat_message
                                        //DESCRIPTION: Display the received message on the chat panel
                                        if(m.m_type === "chat_message")
                                        {
                                            displayMessage(m.sender, m.text, m.emotion);
                                        }
                                    }
                                });
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
                            console.log("Presence event: " + JSON.stringify(m));
                            
                            //Presence keeps track of the server status
                            if (m.uuid === "SERVER" && m.action === "join" && serverOnline) {
                                if(appInitialized){
                                    pubnub.unsubscribe({
                                        channel: global_chan,
                                        callback: function(m) {
                                            console.log("Disconnected from GLOBAL CHANNEL!");
                                            console.log("App Initialized!");
                                            hideError("serverOffline");
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
                    //MESSAGE TYPE: server_shutdown
                    //DESCRIPTION: Closes all connection and restarts the client.
                } else if (m.m_type === "server_shutdown") {
                    displayError("serverOffline");
                    serverOnline = false;
                    console.log("SERVER shutdown message received");
                    pubnub.unsubscribe({
                        channel: private_chan,
                        callback: function() {
                            initialize_app();
                        }
                    });
                }
            },
            presence: function(m) {
                //Presence keeps track of the server status
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
        console.log("Verifying Server Connection:");
        console.log("App initialized: " + appInitialized);
        //If the app is not initialized...
        if (appInitialized === false) {
            
            /*
                Check who is online on the private channel,
                If the SERVER is connected, the app is
                initialized.
            */
            pubnub.here_now({
                channel: private_chan,
                callback: function(m) {
                    console.log("TYPEOF M " + typeof m);
                    console.log("TYPEOF M.UUIDS " + typeof m.uuids);
                    
                    m.uuids != null ? console.log("NOT NULL") : console.log("IS NULL");
                    
                    if(m.uuids != null)
                    {
                        console.log(m.uuids[0]);
                        
                        //Check for the SERVER
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
                                    initialize_app();
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
                    else
                    {
                        //Fatal Error
                        displayError("fatalError");
                    }
                }
            });
        }
    }
    
    //When the user reconnects from a disconnect,
    //relogin to the server.
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
                fatal_error_modal.hide();
                break;
            case "fatalError":
                fatal_error_modal.show();
                connection_modal.hide();
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
        }    
    } else {
        //Pages
        switch(error) {
            case "serverOffline":
                tinglrNav.pushPage('connection_server_offline.html', {animation : 'fade'});
                break;
            case "fatalError":
                tinglrNav.pushPage('fatal_error.html', {animation : 'fade'});
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

//Set's the users currently set emotion
function setEmotion(emotion){
    //If the user selects the same emotion, return to no emotion
    if(selectedEmotionName === emotion)
    {
        selectedEmotionName = "none";
    } 
    else 
    {
        selectedEmotionName = emotion;
    }
    
    //Highlight the selected emote on the emote bar
    $("#emoteBar *").removeClass("selectedEmote");
    switch(selectedEmotionName)
    {
        case "joy":
            $("#joyBtn").addClass("selectedEmote");
            break;
        case "anger":
            $("#angerBtn").addClass("selectedEmote");
            break;
        case "sad":
            $("#sadBtn").addClass("selectedEmote");
            break;
        case "disgust":
            $("#disgustBtn").addClass("selectedEmote");
            break;
        case "fear":
            $("#fearBtn").addClass("selectedEmote");
            break;
        default:
            break;
    }
    
    console.log("Current Emotion: " + selectedEmotionName);
}

//Sends the message to other user
function sendMessage(text, emotion){
    
    //Message to be sent
    msg = {
        "m_type": "chat_message",
        "sender": client_username,
        "text": text,
        "emotion" : emotion
    }
    
    //Clear the emotion
    setEmotion("none");
    
    //Send the message to the other user
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