const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');
const pathfinding = require('./pathFinding');

let agent;
let cheerio;
let url;
let games = [];
let database;
let site;
let tries = 0;

module.exports = {
    init(u, a, c, d) {
        url = u;
        agent = a;
        cheerio = c;
        database = d;
    },

    updateSite(s) {
        site = s;
    },

    updateGames(g) {
        games = g;
    },

    async canMakeMoves() {
        tries = 0;
        console.log(games);
        const browser = await puppeteer.launch();
        for (gameID in games) {
            await this.checkMove(games[gameID].bigId, browser);
        }
        console.log("Done checking games");
        // await browser.close();
    },

    async checkMove(gameId, browser) {
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
                //await module.exports.makeRandomMove(html, page);
                await module.exports.makeMove(html, gameId, page);
            }
        });
    },

    async makeRandomMove(site, page) {
        const $ = cheerio.load(site);
        await $('table.orders td[class="order"]').each(async function () {
            let tr = $(this);
            //removes the default selected option
            const id = tr.children('div').attr('id');
            let loop1 = true;
            //random order
            while (loop1) {
                const order = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment type"] select`, e => e.length)));
                console.log(tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('value'));

                if (order === 0 && tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('value') === "Hold") {
                    break;
                }
                await page.select(`div#${id} select[ordertype="type"]`, tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('value'));

                if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length) === 1 && ["", "Convoy"].includes(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.children[0].innerHTML))) {
                    continue;
                } else {
                    loop1 = false;
                    loop2 = true;
                    while (loop2) {
                        //setting the orders correctly
                        switch (order) {

                            case 0:
                            case 1:
                            case 2:
                                {
                                    //get a valid to value
                                    const to = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length)));
                                    console.log(`order: ${order}, to: ${to}`);
                                    if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].innerHTML, to) !== "") {
                                        loop2 = false;
                                        await page.select(`div#${id} span[class="orderSegment toTerrID"] select`, await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].value, to));
                                    }
                                    break;
                                }
                            case 3:
                                {
                                    //valid to value
                                    const to = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length)));
                                    console.log(`order S Move: ${order}, to: ${to}`);
                                    if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].innerHTML, to) !== "") {
                                        loop2 = false;
                                        await page.select(`div#${id} span[class="orderSegment toTerrID"] select`, await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].value, to));

                                        loop3 = true;
                                        //trying to get a valid from value and checking if the to value was good enough
                                        while (loop3) {
                                            const from = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, e => e.length)));
                                            console.log(`order support move from: ${from}`);
                                            if (await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, e => e.length) === 1 && await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, e => e.children[0].innerHTML) === "") {
                                                loop2 = true;
                                                loop3 = false;
                                                break;
                                            } else if (await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, (e, from) => e.children[from].innerHTML, from) !== "") {
                                                await page.select(`div#${id} span[class="orderSegment fromTerrID"] select`, await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, (e, from) => e.children[from].value, from));
                                                break;
                                            }

                                        }
                                    }
                                    break;
                                }
                        }
                    }
                }
            }

        });

        setTimeout(async function () {
            //readying up
            console.log("Readying");
            await page.$eval('input[name="Ready"]', b => b.click());
            await page.close();
        }, 3 * 1000);

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


    async makeMove(site, gameId, page) {
        const $ = cheerio.load(site);
        const countryID = -$('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1);
        let supplies = [];
        await $('table.orders td[class="order"]').each(async function () {
            let tr = $(this);
            const spanWords = tr.children('div').children('span[class="orderSegment orderBegin"]').text();
            const terr = spanWords.slice(spanWords.split('at')[0].length + 3).trim();
            const terrID = (await database.getTerritoryByName(gameId, terr)).ID;
            let finder = new PathFinding(database, agent, url, gameId, terrID, countryID, spanWords.split(' ')[1].trim());
            await finder.init(true);
            supplies.push(await finder.findClosestSupply(terrID, countryID));
            console.log(supplies);
            //   const moveToID = await finder.findPath();
            // console.log(`the AI will try to move the ${spanWords.split(' ')[1].trim()} at ${terr} to ID:${moveToID}, name:${(await database.getTerritoryByID(gameId, moveToID)).name}`);
        });
    }
};