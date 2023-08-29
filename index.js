'use strict';
// Modules
const fs = require('fs');
const { URL, URLSearchParams } = require('url');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const WebSocket = require('ws');
const jsonfile = require('jsonfile');

// Config
const config = require('./config.json');

// Runtime vars
var currentlyCommitting = false;
var invalidRaceStates = ["finished", "in_progress", "cancelled"];
var trackedRaceRooms = {};

// State Init
const stateFile = './state.json';
const stateDefault = {
    accessToken: "",
    expiry: 0
};

var state;

if (!fs.existsSync(stateFile)) {
    jsonfile.writeFileSync(stateFile, stateDefault);
    state = stateDefault;
} else {
    state = jsonfile.readFileSync(stateFile);

    if (!("accessToken" in state)) {
        state = stateDefault;
        commitState();
    }       
}


async function checkForNewRaces() {
    const categoryURL = new URL(`/${config["rtgg-game-tag"]}/data`, config["rtgg-host"])

    const res = await axios.get(categoryURL);

    const races = res.data.current_races;

    for (let i = 0; i < races.length; i++) {
        let currentRace = races[i];

        if (currentRace.name in trackedRaceRooms)
            continue;

        if (invalidRaceStates.includes(currentRace.status.value.toLowerCase()))
            continue;

        if (config["rtgg-game-track-categories"].length > 0 && !(config["rtgg-game-track-categories"].includes(currentRace.goal.name)))
            continue;

        if (!config["rtgg-game-track-custom"] && currentRace.goal.custom)
            continue;

        const raceAPIURL = new URL(currentRace.data_url, config["rtgg-host"]);
        const raceInfo = await axios.get(raceAPIURL);

        const raceWSURL = new URL(`${raceInfo.data.websocket_bot_url}?token=${state.accessToken}`, config["rtgg-websocket"]);

        const newRace = new rtggRace(currentRace.name, raceWSURL);

        trackedRaceRooms[currentRace.name] = newRace;
    }

    setTimeout(() => {
        checkForNewRaces();
    },10000);
}

// Race Room Class
class rtggRace {
    constructor(raceName, websocketURL) {
        this.name = raceName;
        this.ws = new WebSocket(websocketURL);
        this.seedURL = null;
        let raceRoom = this;

        this.ws.onopen = function() {
            console.log('WS connection successful: ' + raceRoom.name);
            const introMsg = 'Welcome to Sly Cooper and the Thievious Raccoonus! I am Interpol, your friendly randomizer bot. Type !seed to have me roll a randomizer seed for you.';
            raceRoom.sendMessage(introMsg);
        }

        this.ws.onmessage = function(msg) {
            const data = JSON.parse(msg.data);
            if (data.type == 'race.data') {

                if (invalidRaceStates.includes(data.race.status.value)) {
                    this.close();
                    delete trackedRaceRooms[raceRoom.name];
                }
                return;
            }
            else if (data.type == 'chat.message') {

                if (data.message.is_bot)
                    return;

                if (data.message.is_system)
                    return;

                if (!data.message.message_plain.startsWith("!"))
                    return;

                let command = data.message.message_plain.toLowerCase().trim().split(" ")[0];

                if (command == "!seed") {
                    let parameters = data.message.message_plain.toLowerCase().trim().split(" ");
                    if (raceRoom.seedURL == null || (raceRoom.seedURL != null && parameters.length > 1 && parameters[1].trim().toLowerCase() == "--force")) {
                        var randomSeed = randomizeSeed();

                        var seedURL = `${config["randomizer-web-host"]}/?seed=${randomSeed}`;

                        raceRoom.sendMessage(`Sure! Here is your seed: ${seedURL}`);

                        var raceRoomInfo = JSON.stringify({
                            'action': 'setinfo',
                            'data': {
                              'info': `Seed: ${seedURL}`
                            }
                        });

                        raceRoom.seedURL = seedURL;
                        raceRoom.ws.send(raceRoomInfo);  
                    } else {
                        raceRoom.sendMessage("Sorry, I already created a seed for this race. Please use !seed --force to roll a new one anyway");
                    }
                }
                return;
            }

            if (data.type == 'error') {
                data.errors.forEach(e => console.error(e));
            }
        }
    }

    sendMessage(msg) {
        console.log(msg);
        this.ws.send(JSON.stringify({
            'action': 'message',
            'data': {
                'guid': uuidv4(),
                'message': msg
                
            }
        }));
    }
}

// Access Token Handling
async function getAccessToken() {
    const params = new URLSearchParams({
        client_id: config["bot-client-id"],
        client_secret: config["bot-client-secret"],
        grant_type: 'client_credentials'
    });

    const tokenURL = new URL('/o/token', config["rtgg-host"]);

    let res;

    try {
        res = await axios.post(tokenURL, params);
    } catch(e) {
        console.error("error while getting access token: " + e);
        setTimeout(getAccessToken, 3000);
        state.accessToken = "";
        state.expiry = 0;
    }

    state.accessToken = res.data.access_token;
    state.expiry = res.data.expires_in;

    setTimeout(getAccessToken, (state.expiry * 1000) - 60000);
    commitState();

}

// Helper Functions
function randomizeSeed() {
    var n = Math.random() * (13 - 10) + 10; //Random number between 10 and 13 for length
    return Math.floor(Math.pow(10, n - 1) + Math.random() * (Math.pow(10, n) - Math.pow(10, n - 1) - 1));
}

function commitState() {
    if (!currentlyCommitting) {

        currentlyCommitting = true;

        jsonfile.writeFile(stateFile, state, {
                spaces: 1
            })
            .then(() => {
                currentlyCommitting = false;
            })
            .catch(error => console.error(error));
    }
}

async function loop() {

    if (state.accessToken != undefined && state.accessToken.length > 0) {
  
      try {
       await checkForNewRaces();
      }
      catch(e) {
        console.error(e);
      }
    }
  
    setTimeout(loop, 10000);  
}

//init
async function init() {
    await getAccessToken();
    console.log("Bot up!");

    await loop();
}

init();
