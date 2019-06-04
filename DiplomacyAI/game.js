const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const move = require('./move');

let url;
let agent;
let database;
let config;
let browser;

module.exports = {
    //adding game data to the db

    init(u, a, d, c) {
        url = u;
        agent = a;
        database = d;
        config = c;

        move.init(u, a, cheerio, d);
    },

    async gameCheck(games) {

        browser = await puppeteer.launch();

        let gam = (await database.getGames(config.Username)).map(e => e.gameID);
        games.forEach(g => {
            if (!gam.includes(parseInt(g.bigId))) {
                console.log(`Found new game ${g.bigId} adding to database`);
                database.addGame(config.Username, g.bigId);
                this.gameAdding(g.bigId, browser);
            }
        });
    },

    async gameAdding(Id, browser) {
        const access = CookieAccess(
            url.hostname,
            url.pathname,
            'https:' === url.protocol
        );
        const page = await browser.newPage();

        //cooking inserting
        for (let cookies in agent.jar.getCookies(access)) {
            cookies = agent.jar.getCookies(access)[cookies];
            if (cookies !== undefined && cookies.value !== undefined) {
                cookies.url = url;
                await page.setCookie(cookies);
            }
        }

        await page.goto(`${url}/board.php?gameID=${Id}`, { "waitUntil": "load" }).then(async function () {
            //creating the mess... aka making a serializable object
            let mess = await page.evaluate(() => {
                const ar = window.Territories._object;
                let territories = [];
                let borders = [];

                for (let t in ar) {
                    t = ar[t];
                    let terr = {};
                    terr.id = t.id;
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
                database.addTerritory(Id, t.id, t.name, t.type, t.supply);

            }

            for (let b in mess.b) {
                b = mess.b[b];
                database.addBorder(Id, b.ownID, b.borderID, b.armyPass, b.fleetPass);
            }
            console.log(`Done parsing data for new game ${Id}`);
        });
        await page.close();
    },

    async canMakeMoves(debug) {
        tries = 0;
        console.log(games);

        for (gameID in games) {
            await this.checkMove(games[gameID].bigId, browser, debug);
        }
        console.log("Done checking games");
        // await browser.close();
    },

    async checkMove(gameId, browser, debug) {
        const access = CookieAccess(
            url.hostname,
            url.pathname,
            'https:' === url.protocol
        );

        const page = await browser.newPage();

        for (let cookies in agent.jar.getCookies(access)) {
            cookies = agent.jar.getCookies(access)[cookies];
            if (cookies !== undefined && cookies.value !== undefined) {
                cookies.url = url;
                await page.setCookie(cookies);
            }
        }
        await page.goto(`${url}board.php?gameID=${gameId}`, { "waitUntil": "load" }).then(async function () {

            const html = await page.content();
            const $ = cheerio.load(html);
            if ($('div.memberUserDetail').text().includes('No orders submitted!') || $('div.memberUserDetail').text().includes('but not ready for next turn')) {
                if (await move.makeMove(html, gameId, page, debug)) {
                    await move.makeRandomMove(html, page);
                }
            }
        });

        await page.close();
    }
};