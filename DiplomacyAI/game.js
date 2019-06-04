const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');

let url;
let agent;
let database;
let config;

module.exports = {
    //adding game data to the db

    init(u, a, d, c) {
        url = u;
        agent = a;
        database = d;
        config = c;
    },

    async gameCheck(games) {

        const browser = await puppeteer.launch();

        let gam = await database.getGames(config.Username);
        games.forEach(g => {
            if (!gam.includes(g.bigId)) {
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
            console.log("Done parsing data");
        });
        await page.close();
    }
};