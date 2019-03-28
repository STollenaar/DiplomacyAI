const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');

let url;
let agent;
let database;

module.exports = {
    //adding game data to the db

    init(u, a, d) {
        url = u;
        agent = a;
        database = d;
    },

    async gameAdding(Id) {
        const access = CookieAccess(
            url.hostname,
            url.pathname,
            'https:' === url.protocol
        );

        const browser = await puppeteer.launch();
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

                    for (let b in t.Borders) {
                        b = t.Borders[b];
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
    }
};