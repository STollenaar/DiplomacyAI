const fs = require('fs');
const cheerio = require('cheerio');
const request = require('superagent');
const database = require('./database');
const state = require('./state');
const game = require('./game');
const pathFinding = require('./pathFinding');
const move = require('./move');

let url;
let config;
let agent = request.agent();

fs.stat('./config.json', function (err, stat) {
    if (err === null) {
        config = require('./config.json');
        url = config[0].Site;

        move.init(url, agent, cheerio, database);
        state.init(url, agent, cheerio, move);
        game.init(url, agent, database);
        login();
    } else if (err.code === 'ENOENT') {
        console.log("Deploying config");
        database.defaultConfig(fs, function () {
            config = require('./config.json');
            url = config[0].Site;

            move.init(url, agent, cheerio, database);
            state.init(url, agent, cheerio, move);
            game.init(url, agent, database);
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
            login();
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
            move.canMakeMoves(d[1]);
            break;

        case "addGame":
            game.gameAdding(d[1]);
            break;

        case "peek":
            state.peek(d[1]);
            break;

        case "path":
            let finder = await new PathFinding(database, agent, url, d[1], d[2], d[3], d[4]);
            console.log("Starting search");
            console.log(await finder.findPath());
            break;
        case "checkMoveDebug":
            let supplies = require(`./datasets/${d[1]}.json`);
            supplies = supplies.sort((a, b) => { return a.distance - b.distance; });
            supplies = move.extract(supplies);
            console.log("RESULTS");
            console.log(supplies);
            break;
    }

});



function login() {
    agent.post(`${url}logon.php`).type('form').send({ loginuser: config[0].Username }).send({ loginpass: config[0].Password }).then(function (response) {
        const $ = cheerio.load(response.text);
        userID = $('div #header-welcome a').attr('href').split('=')[1];
        //navigates to the user profile
        agent.get(`${url}index.php`).then(async function (r) {
            site = r.text;
            state.updateSite(site);
            printUser();
            state.gameFinder();
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