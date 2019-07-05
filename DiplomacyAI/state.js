const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');

let agent;
let cheerio;
let url;
let fs;

module.exports = {

    init(init) {
        url = init.url;
        agent = init.agent;
        cheerio = init.cheerio;
        fs = init.fs;
    },

    async gameCreate(variantID, name, password, invitedPlayers) {

        if (invitedPlayers === undefined) {
            invitedPlayers = "";
        }
        if (name === undefined) {
            name = "BotCreate";
        }
        if (password === undefined) {
            password = "HelloWorld";
        }
        if (variantID === undefined) {
            variantID = 15;
        }

        let newGame = {};
        newGame.variantID = variantID;
        newGame.name = name;
        newGame.password = password;
        newGame.passwordcheck = newGame.password;
        newGame.invitedPlayers = invitedPlayers;
        newGame.bet = 5;
        newGame.potType = "Unranked";
        newGame.phaseMinutes = 14400;
        newGame.joinPeriod = 14400;
        newGame.anon = "No";
        newGame.pressType = "Regular";
        newGame.missingPlayerPolicy = "Normal";
        newGame.drawType = "draw-votes-public";
        newGame.minimumReliabilityRating = 0;
        newGame.excusedMissedTurns = 4;

        await agent.post(`${url}gamecreate.php`).type("form").send({ newGame: newGame });
    },

    async gameFinder() {
        //site is set to the profile page
        let $ = cheerio.load((await agent.get(`${url}index.php`)).text);
        let games = [];
        return new Promise(async resolve => {

            //going over the invites and accepting them
            if ($('td[class="homeGamesStats"] div div[class*="bar homeGameLinks"] form[name="gameInvite"]').length > 0) {
                await new Promise(re => {
                    const total = $('td[class="homeGamesStats"] div div[class*="bar homeGameLinks"] form[name="gameInvite"]').length;
                    let links = 0;
                    $('td[class="homeGamesStats"] div div[class*="bar homeGameLinks"] form[name="gameInvite"]').each((index, value) => {
                        let objects = $(value).children('input[name="gameInvitation"]').val();
                        //accepting the invite
                        agent.post(`${url}#`).type('form').send({ gameInvitation: objects, accept: true }).then(async () => {
                            links++;
                            if (links === total) {
                                //resetting the index page
                                $ = cheerio.load((await agent.get(`${url}index.php`)).text);
                                re();
                            }
                        });
                    });
                });
            }

            let links = 0;
            let total = $('td[class="homeGamesStats"] div div[class*="bar homeGameLinks"] a').length;
            //going to loop over every game you are in
            $('td[class="homeGamesStats"] div div[class*="bar homeGameLinks"] a').each((index, value) => {
                let game = {};
                //gets the main id needed from each game from the open link
                game.bigId = $(value).attr('href').split('=')[1].split('#')[0];
                //quick navigation to that game
                agent.get(`${url}board.php?gameID=${game.bigId}`).then((r) => {
                    const $2 = cheerio.load(r.text); //just loads that game page into cheerio
                    game.smallId = $2('#mapImage').attr('src').split('/')[2]; //get the small id from the image src
                    games.push(game);//adding to the list
                    links++;
                    if (links === total) {
                        resolve(games);
                    }
                });
            });
        });
    },

    async peek(gameId) {
        const access = CookieAccess(
            url.hostname,
            url.pathname,
            'https:' === url.protocol
        );


        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        for (let cookies in agent.jar.getCookies(access)) {
            cookies = agent.jar.getCookies(access)[cookies];
            if (cookies !== undefined && cookies.value !== undefined) {
                cookies.url = url;
                await page.setCookie(cookies);
            }
        }
        await page.goto(`${url}board.php?gameID=${gameId}`, { "waitUntil": "load" });
    }
};