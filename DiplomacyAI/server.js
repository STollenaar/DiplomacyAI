const url = 'https://webdiplomacy.net/';

const cheerio = require('cheerio');
const request = require('superagent');
const database = require('./database');
const state = require('./state');
let agent = request.agent();
state.init(url, agent, cheerio);


const smallId = '2360';
const bigId = '236023';

let userID = 0;
let input = process.openStdin();

let site;





input.addListener("data", function (d) {
    d = d.toString().trim().split(" ");

    switch (d[0]) {
        case "addUser":
            //adds a user to the db
            database.addUser(d[1], d[2]);
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
    }

});



function login() {
    database.getUser(function (r) {
        agent.post(`${url}logon.php`).type('form').send({ loginuser: r.username }).send({ loginpass: r.password }).then(function (response) {
            const $ = cheerio.load(response.text);
            userID = $('div #header-welcome a').attr('href').split('=')[1];
            //navigates to the user profile
            agent.get(`${url}profile.php?userID=${userID}`).then(function (r) {
                site = r.text;
                state.updateSite(site);
                printUser();
                state.gameFinder();
            });
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