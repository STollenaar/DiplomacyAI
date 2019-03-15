const cheerio = require('cheerio');
const request = require('superagent');
const database = require('./database');
const url = 'https://webdiplomacy.net/';
const smallId = '2360';
const bigId = '236023';
let agent = request.agent();
let userID = 0;
let input = process.openStdin();

let site;





input.addListener("data", function (d) {
    d = d.toString().trim().split(" ");

    switch (d[0]) {
        case "addUser":
            //adds a user to the db
            database.addUser(d[1], d[2]);
            login;
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
                    printUser();
                });
            }
            break;
        case "user":
            //debugs prints the current logged in user
            printUser();
            break;
        case "state":
            turl = `${url}/cache/games/${smallId}/${bigId}`;
            let states = [];
            request.get(turl).then(function (response) {
                const $ = cheerio.load(response.text);
                $('a').each(function () {
                    if ($(this).text().includes('json')) {
                        states.push($(this).text());
                    }
                });
                console.log(states);
            });

            break;
    }

});

function gameFinder() {
    //site is set to the profile page
    let $ = cheerio.load(site);
    let games = [];
    //going to loop over every game you are in
    $('div.enterBarOpen a').each(function () {
        let game = {};
        //gets the main id needed from each game from the open link
        game.bigId = $(this).attr('href').split('=')[1].split('#')[0];
        //quick navigation to that game
        agent.get(`${url}board.php?gameID=${game.bigId}#gamePanel`).then(function (r) {
            const $2 = cheerio.load(r.text); //just loads that game page into cheerio
            game.smallId = $2('#mapImage').attr('src').split('/')[2]; //get the small id from the image src
            console.log(game);
            games.push(game);//adding to the list
        });
    });
    console.log(games);
}

function login(game) {
    database.getUser(function (r) {
        agent.post(`${url}logon.php`).type('form').send({ loginuser: r.username }).send({ loginpass: r.password }).then(function (response) {
            const $ = cheerio.load(response.text);
            userID = $('div #header-welcome a').attr('href').split('=')[1];
            //navigates to the user profile
            agent.get(`${url}profile.php?userID=${userID}`).then(function (r) {
                site = r.text;
                printUser();
                gameFinder();
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