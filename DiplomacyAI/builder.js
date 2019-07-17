const _ = require('lodash');
const orderType = ["Build Army", "Build Fleet"];

let cheerio;



module.exports = {
    init(init) {
        cheerio = init.cheerio;
    },

    async makeMove(site, page) {
        const $ = cheerio.load(site);
        await new Promise(async resolve => {
            let results = 0;
            let total = $('table.orders tbody').children().length;

            let territories = $('select[ordertype="toTerrID"] option').map((i, el) => $(el).attr('value')).get();
            territories = territories.filter((item, pos, ar) => ar.indexOf(item) === pos && item !== '');

            for (const el of Array.from($('table.orders td[class="order"]'))) {
                let tr = $(el);
                //removes the default selected option
                const id = tr.children('div').attr('id');
                if (territories.length === 0) {
                    await page.select(`div#${id} select[ordertype="type"]`, 'Wait');
                } else {
                    territories = await module.exports.build(id, territories, page);
                }
                results++;
                if (results === total) {
                    resolve();
                }
            }
        });
        await page.$eval('input[name="Ready"]', b => b.click());
        //await page.close();
    },

    async build(id, territories, page) {
        return new Promise(async resolve => {
            let t = true;
            while (t) {
                const order = Math.floor(Math.random() * orderType.length);
                await page.select(`div#${id} select[ordertype="type"]`, orderType[order]);
                const options = await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => Array.from(e).map(x => x.getAttribute('value')).filter(x => x !== ''));
                if (territories.some(t => options.includes(t))) {
                    const avOptions = _.intersection(territories, options);
                    const to = Math.floor(Math.random() * avOptions.length);
                    await page.select(`div#${id} select[ordertype="toTerrID"]`, avOptions[to]);
                    territories = territories.filter(x => x !== avOptions[to]);
                    resolve(territories);
                    t = false;
                }
            }
        });
    }
};