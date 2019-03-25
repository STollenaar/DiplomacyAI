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
        await page.setViewport({ width: 1200, height: 720 });

        for (let cookies in agent.jar.getCookies(access)) {
            cookies = agent.jar.getCookies(access)[cookies];
            if (cookies !== undefined && cookies.value !== undefined) {
                cookies.url = url;
                //cookies.domain = url;
                await page.setCookie(cookies);
            }
        }


        await page.goto(`${url}board.php?gameID=${gameId}`, { "waitUntil": "load" }).then(async function () {

            const html = await page.content();
            const $ = cheerio.load(html);
            if ($('div.memberUserDetail').text().includes('No orders submitted!')) {
                module.exports.makeRandomMove(html, gameId);
            }
        });

        //await browser.close();


        //await Promise.all([
        //    page.click('#loginSubmit'),
        //    page.waitForNavigation(),
        //]);

        
    },

    makeRandomMove(site, gameID) {
        const $ = cheerio.load(site);

        $('table.orders tr').each(function () {
            let tr = $(this);

            tr.children('div').children('span.orderSegment type').children('select').value = Math.random() * (+3 - +0) + +0;

            switch (tr.children('div').children('span.orderSegment type').children('select').value) {

                case 1:
                    tr.children('div').children('span.orderSegment toTerrID').children('select').value = Math.random() * (+tr.children('div').children('span.orderSegment toTerrID').children('select').length - +0) + +0;
                    break;
                case 2:
                    tr.children('div').children('span.orderSegment toTerrID').children('select').value = Math.random() * (+tr.children('div').children('span.orderSegment toTerrID').children('select').length - +0) + +0;
                    break;
                case 3:
                    tr.children('div').children('span.orderSegment toTerrID').children('select').value = Math.random() * (+tr.children('div').children('span.orderSegment toTerrID').children('select').length - +0) + +0;
                    tr.children('div').children('span.orderSegment fromTerrID').children('select').value = Math.random() * (+tr.children('div').children('span.orderSegment fromTerrID').children('select').length - +0) + +0;
                    break;
            }

        });
        console.log(site);

        agent.post(`${url}board.php?gameID=${gameID}`).type('form').then(function (response) {
            console.log("tried post");
        });

    }
};