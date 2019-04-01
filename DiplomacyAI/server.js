const url = 'https://webdiplomacy.net/';

const fs = require('fs');
const cheerio = require('cheerio');
const request = require('superagent');
const database = require('./database');
const state = require('./state');
const game = require('./game');

const move = require('./move');

let config;


fs.stat('./config.json', function (err, stat) {
    if (err === null) {
        config = require('./config.json');
        login();
    } else if (err.code === 'ENOENT') {
        console.log("Deploying config");
        database.defaultConfig(fs, function () {
            config = require('./config.json');
        });
    }

});


let agent = request.agent();
move.init(url, agent, cheerio);
state.init(url, agent, cheerio, move);
game.init(url, agent, database);


let userID = 0;
let input = process.openStdin();

let site;





input.addListener("data", function (d) {
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
            move.canMakeMoves();
            break;

        case "addGame":
            game.gameAdding(d[1]);
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