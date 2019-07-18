const fs = require('fs');
const cheerio = require('cheerio');
const request = require('superagent');
const database = require('./database');
const state = require('./state');
const game = require('./game');
const pathFinding = require('./pathFinding');
const util = require('./util');

let url;
let config;
let agent = request.agent();
let input = process.openStdin();
let site;

fs.stat('./config.json', function (err, stat) {
    if (err === null) {
        loadConfig();
    } else if (err.code === 'ENOENT') {
        console.log("Deploying config");
        database.defaultConfig(fs, function () {
            loadConfig();
        });
    }

});




input.addListener("data", async function (d) {
    d = d.toString().trim().split(" ");

    switch (d[0]) {

        case "login":
            //login in
            login(d[1], d[2]);
            break;
        case "logout":
            {
                //logout
                agent.get(`${url}logon.php?logoff=on`).then(function (response) {
                    site = response.text;
                    printUser();
                });
            }
            break;
        case "user":
            //debugs prints the current logged in user
            printUser();
            break;
        case "config":
            configOperations(d);
            break;
        case "checkMove":
            game.canMakeMoves(d[1]);
            break;
        case "createGame":
            state.gameCreate(d[1], d[2], d[3], d[4]);
            break;
        case "peek":
            state.peek(d[1]);
            break;

        case "checkMoveDebug":
            let supplies = require(`./datasets/${d[1]}.json`);
            supplies = supplies.sort((a, b) => { return a.distance - b.distance; });
            supplies = util.extractLowestDistance(supplies);
            console.log("RESULTS");
            console.log(supplies);
            break;

        case "auto":
            if (d[1] === undefined) {
                console.log("Argument is undefined.. please define as start or stop.");
            } else if (d[1] === "start") {
                if (d[2] === undefined) {
                    console.log("Time is undefined.. please define as seconds to wait.");
                } else {
                    game.startAutoCheck(d[2]);
                }
            } else if (d[1] === "stop") {
                game.stopAutoCheck();
            } else {
                console.log("Unkown argument.");
            }
            break;
        case "train":
            if (d[1] === undefined) {
                console.log("Undefined argument please define as start/stop/status");
            } else {
                if (d[1] === "start") {
                    if (d[2] === undefined) {
                        console.log("Unknown amount of maximum times the bot will train");
                    } else if (d[3] === undefined) {
                        console.log("Time is undefined.. please define as seconds to wait.");
                    } else if (d[4] === undefined) {
                        console.log("Unknown opponents to train against, variable live play not supported!!");
                    } else {
                        game.startTraining(d[2], d[3], d.slice(4));
                    }
                } else if (d[1] === "stop") {
                    console.log("Training will stop after the current game is finished.");
                    game.stopTraining();
                } else if (d[1] === "status") {
                    game.statusTraining();
                } else {
                    console.log("Unknown argument");
                }
            }
            break;
    }
});

//simple config operations so you don't have to reload everytime...
async function configOperations(args) {
    if (args[1] === undefined) {
        console.log("Argument is undefined... please define an action [reload/set/add/dump]");
    } else if (args[1].toLowerCase() === "reload") {
        loadConfig();
    } else if (args[1].toLowerCase() === "set") {
        if (args[2] === undefined) {
            console.log("config field undefined.. please define a field");
        } else if (args[3] === undefined) {
            console.log("field value undefined.. please define a field value");
        } else {
            try {
                config[args[2]] = JSON.parse(args.slice(3).join(''));
            } catch (e) {
                config[args[2]] = args.slice(3).join('');
            }
            await database.updateConfig(fs, config);
            loadConfig();
        }
    } else if (args[1].toLowerCase() === "add") {
        if (args[2] === undefined) {
            console.log("config field undefined.. please define a field");
        } else if (!Array.isArray(config[args[2]])) {
            console.log("config field is not an array... please set it as an array");
        } else if (args[3] === undefined) {
            console.log("field value undefined.. please define a field value");
        } else {
            try {
                config[args[2]].push(JSON.parse(args.slice(3).join('')));
            } catch (e) {
                config[args[2]].push(args.slice(3).join(''));
            }
            await database.updateConfig(fs, config);
            loadConfig();
        }
    } else if (args[1].toLowerCase() === "dump") {
        console.log(`///CONFIG DUMP\\\\`);
    }
    else {
        console.log("unknown argument...  please define an action [reload/set/add]");
    }
}


function login(username, password) {
    if (username === undefined) {
        username = config.Username;
    }
    if (password === undefined) {
        password = config.Password;
    }

    agent.post(`${url}logon.php`).type('form').send({ loginuser: username, loginpass: password }).then(function (response) {
        const $ = cheerio.load(response.text);
        userID = $('div #header-welcome a').attr('href').split('=')[1];
        //navigates to the user profile
        agent.get(`${url}index.php`).then(async function (r) {
            site = r.text;
            printUser();
            let games = await state.gameCheck(game.browser);
            game.game = games;
            console.log('Current active games: ', games);
        });
    });
}


function printUser() {
    if (site === undefined) {
        console.log("site not set");
        return;
    }

    const $ = cheerio.load(site);
    const user = $('#header-welcome').text();
    console.log(user);
}

async function loadConfig() {
    config = require('./config.json');
    url = config.Site;

    let init = { url, agent, cheerio, config, database, fs };

    state.init(init);
    init.state = state;
    await game.init(init);
    login();
}