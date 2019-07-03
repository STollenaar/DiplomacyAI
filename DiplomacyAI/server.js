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
                    state.updateSite(site);
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
        case "state":
            //turl = `${url}/cache/games/${smallId}/${bigId}`;
            //let states = [];
            //request.get(turl).then(function (response) {
            //    const $ = cheerio.load(response.text);
            //    $('a').each(function () {
            //        if ($(this).text().includes('json')) {
            //            states.push($(this).text());
            //        }
            //    });
            //    console.log(states);
            //});


            state.stateParser(d[1], d[2], d[3]);
            break;

        case "checkMove":
            game.canMakeMoves(d[1]);
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

    agent.post(`${url}logon.php`).type('form').send({ loginuser: username }).send({ loginpass: password }).then(function (response) {
        const $ = cheerio.load(response.text);
        userID = $('div #header-welcome a').attr('href').split('=')[1];
        //navigates to the user profile
        agent.get(`${url}index.php`).then(async function (r) {
            site = r.text;
            state.updateSite(site);
            printUser();
            let games = await state.gameFinder();
            game.gameCheck(games);
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

function loadConfig() {
    config = require('./config.json');
    url = config.Site;

    let init = { url, agent, cheerio, config, database, fs };

    state.init(init);
    game.init(init);
    login();
}