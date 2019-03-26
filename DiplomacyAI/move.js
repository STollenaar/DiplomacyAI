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


        const browser = await puppeteer.launch();
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
        $('table.orders td[class="order"]').each(function () {
            let tr = $(this);
            tr.children('div').children('span[class="orderSegment type"]').children('select').children('option[selected="selected"]').removeAttr('selected');
            const order = Math.floor(Math.random() * Math.floor(3));

            tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('selected', 'selected');
            console.log(tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).text());

            switch (tr.children('div').children('span[class="orderSegment type"]').children('select').children('option[selected="selected"]').index()) {

                case 1:
                    tr.children('div').children('span[class="orderSegment toTerrID"]').children('select').children().eq(Math.floor(Math.random() * Math.floor(tr.children('div').children('span[class="orderSegment toTerrID"]').children('select').length))).attr('selected', 'selected');
                    break;
                case 2:
                    tr.children('div').children('span[class="orderSegment toTerrID"]').children('select').children().eq(Math.floor(Math.random() * Math.floor(tr.children('div').children('span[class="orderSegment toTerrID"]').children('select').length))).attr('selected', 'selected');
                    break;
                case 3:
                    tr.children('div').children('span[class="orderSegment toTerrID"]').children('select').children().eq(Math.floor(Math.random() * Math.floor(tr.children('div').children('span[class="orderSegment toTerrID"]').children('select').length))).attr('selected', 'selected');
                    tr.children('div').children('span[class="orderSegment fromTerrID"]').children('select').children().eq(Math.floor(Math.random() * Math.floor(tr.children('div').children('span[class="orderSegment fromTerrID"]').children('select').length))).attr('selected', 'selected');
                    break;
            }

        });
        const button = $('input[name="Ready"]');
        console.log(button);
        button.click();

        //agent.post(`${url}board.php?gameID=${gameID}`).type('form').then(function (response) {
        //    console.log("tried post");
        //});
    }
};