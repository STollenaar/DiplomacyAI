const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');

let agent;
let cheerio;
let url;
let games = [];
let site;
let tries = 0;

module.exports = {
    init(u, a, c) {
        url = u;
        agent = a;
        cheerio = c;
    },

    updateSite(s) {
        site = s;
    },

    updateGames(g) {
        games = g;
    },

    canMakeMoves() {
        tries = 0;
        console.log(games);
        for (gameID in games) {
            this.checkMove(games[gameID].bigId);
        }
    },

    async checkMove(gameId) {
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
        await page.goto(`${url}board.php?gameID=${gameId}`, { "waitUntil": "load" }).then(async function () {

            const html = await page.content();
            const $ = cheerio.load(html);
            if ($('div.memberUserDetail').text().includes('No orders submitted!') || $('div.memberUserDetail').text().includes('but not ready for next turn')) {
                await module.exports.makeRandomMove(html, gameId, browser, page);
            }
            // await page.close();
        });

        //await browser.close();

    },

    async makeRandomMove(site, gameId, browser, page) {
        const $ = cheerio.load(site);
        $('table.orders td[class="order"]').each(async function () {
            let tr = $(this);
            //removes the default selected option
            const id = tr.children('div').attr('id');
            let loop1 = true;
            //random order
            while (loop1) {
                const order = Math.floor(Math.random() * Math.floor(4));
                if (order === 0) {
                    loop1 = false;
                    continue;
                }

                console.log(tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('value'));
                await page.select(`div#${id} select[ordertype="type"]`, tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('value'));

                if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length) === 1 && await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.children[0].innerHTML) === "") {
                    continue;
                }
                loop1 = false;
                loop2 = true;
                while (loop2) {
                    //setting the orders correctly
                    switch (order) {

                        case 1:
                        case 2:
                            {
                                //get a valid to value
                                const to = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length))) + 1;
                                console.log(`order: ${order}, to: ${to}`);
                                if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.children[0].innerHTML) === "") {
                                    loop2 = false;
                                    await page.select(`div#${id} select[class="orderSegment toTerrID"]`, await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].value, to));
                                }
                                break;
                            }
                        case 3:
                            {
                                //valid to value
                                const to = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length))) + 1;
                                console.log(`order: ${order}, to: ${to}`);
                                if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.children[0].innerHTML) === "") {
                                    loop2 = false;
                                    await page.select(`div#${id} select[class="orderSegment toTerrID"]`, await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].value,to));

                                    loop3 = true;
                                    //trying to get a valid from value and checking if the to value was good enough
                                    while (loop3) {
                                        const from = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, e=> e.length))) + 1;
                                        console.log(`order support move from: ${from}`);
                                        if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length) === 1 && await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.children[0].innerHTML) === "") {
                                            loop2 = true;
                                            break;
                                        }

                                        if (await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, e => e.children[0].innerHTML) === "") {
                                            await page.select(`div#${id} select[class="orderSegment fromTerrID"]`, await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, (e, from) => e.children[from].value, from));
                                            break;
                                        }

                                    }
                                }
                                break;
                            }
                    }
                }
            }

        });

        //readying up
        //await page.$eval('input[name="Ready"]', b =>b.click());






    }
};