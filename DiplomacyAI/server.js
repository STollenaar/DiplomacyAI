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

fs.stat('./config.json', function (err, stat) {
    if (err === null) {
        config = require('./config.json')[0];
        url = config.Site;

        state.init(url, agent, cheerio);
        game.init(url, agent, database, config);
        login();
    } else if (err.code === 'ENOENT') {
        console.log("Deploying config");
        database.defaultConfig(fs, function () {
            config = require('./config.json')[0];
            url = config.Site;

            state.init(url, agent, cheerio, move);
            game.init(url, agent, database, config);
        });
    }

});





let userID = 0;
let input = process.openStdin();

let site;





input.addListener("data", async function (d) {
    d = d.toString().trim().split(" ");

    switch (d[0]) {
        case "addUser":
            //adds a user to the config
            database.addUser(d[1], d[2], fs);
            login();
            break;
        case "login":
            //login in
            login(d[1], d[2]);
            break;
        case "logout":
            {
                //logout
                const $ = cheerio.load(site);
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
            supplies = util.extract(supplies);
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