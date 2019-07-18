const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');

let agent;
let cheerio;
let url;
let database;

module.exports = {

    init(init) {
        url = init.url;
        agent = init.agent;
        cheerio = init.cheerio;
        database = init.database;
    },

    async gameCreate(variantID = 15, name = "BotCreate", password = "HelloWorld", invitedPlayers = "") {

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
            if (total === 0) {
                resolve(games);
            }
            //going to loop over every game you are in
            $('td[class="homeGamesStats"] div div[class*="bar homeGameLinks"] a').each((index, value) => {
                let game = {};
                //gets the main ID needed from each game from the open link
                game.bigId = $(value).attr('href').split('=')[1].split('#')[0];
                //quick navigation to that game
                agent.get(`${url}board.php?gameID=${game.bigId}`).then((r) => {
                    const $2 = cheerio.load(r.text); //just loads that game page into cheerio
                    game.smallId = $2('#mapImage').attr('src').split('/')[2]; //get the small ID from the image src
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
    },

    //adding game data to the db
    async gameCheck(browser) {
        const games = await this.gameFinder();
        await new Promise(async resolve => {
            const $ = cheerio.load((await agent.get(`${url}index.php`)).text);
            const username = $('div #header-welcome a').text().split(' ')[0];

            let gam = (await database.getGames(username)).map(e => e.gameID);

            gam.filter(e => !games.map(e => e.bigId).includes(String(e))).forEach(e => {
                database.removeGame(e, username);
            });

            const total = games.length;
            let links = 0;
            games.forEach(async g => {
                if (!gam.includes(parseInt(g.bigId))) {
                    await this.gameAdding(g.bigId, browser);
                }
                links++;
                if (links === total) {
                    resolve();
                }
            });
        });
        return games;
    },

    async gameAdding(ID, browser) {

        return new Promise(async resolve => {
            const access = CookieAccess(
                url.hostname,
                url.pathname,
                'https:' === url.protocol
            );
            const page = await browser.newPage();

            const $ = cheerio.load((await agent.get(`${url}index.php`)).text);
            const username = $('div #header-welcome a').text().split(' ')[0];

            //cooking inserting
            for (let cookies in agent.jar.getCookies(access)) {
                cookies = agent.jar.getCookies(access)[cookies];
                if (cookies !== undefined && cookies.value !== undefined) {
                    cookies.url = url;
                    await page.setCookie(cookies);
                }
            }

            await page.goto(`${url}board.php?gameID=${ID}`, { "waitUntil": "load" }).then(async () => {
                const $ = cheerio.load(await page.content());
                if ($('span[class="gamePhase"]').text() === "Pre-game") {
                    console.log(`Not adding game ${ID} still in Pre-game`);
                    return;
                }

                console.log(`Found new game ${ID} adding to database`);
                database.addGame(username, ID);
                //creating the mess... aka making a serializable object
                let mess = await page.evaluate(() => {
                    const ar = window.Territories._object;
                    let territories = [];
                    let borders = [];

                    for (let t in ar) {
                        t = ar[t];
                        let terr = {};
                        terr.ID = t.id;
                        terr.name = t.name;
                        terr.type = t.type;
                        terr.supply = t.supply;

                        for (let b in t.CoastalBorders) {
                            b = t.CoastalBorders[b];
                            let border = {};
                            if (b.a === undefined || b.a === null) {
                                continue;
                            }

                            border.ownID = t.id;
                            border.borderID = b.id;
                            border.armyPass = b.a;
                            border.fleetPass = b.f;
                            borders.push(border);
                        }


                        territories.push(terr);
                    }

                    return {
                        t: territories, b: borders
                    };

                });
                for (let t in mess.t) {
                    t = mess.t[t];
                    database.addTerritory(ID, t.ID, t.name, t.type, t.supply);

                }

                for (let b in mess.b) {
                    b = mess.b[b];
                    database.addBorder(ID, b.ownID, b.borderID, b.armyPass, b.fleetPass);
                }
                console.log(`Done parsing data for new game ${ID}`);
            });
            await page.close();
            resolve();
        });
    }
};