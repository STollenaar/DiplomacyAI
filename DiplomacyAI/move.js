const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');
const pathfinding = require('./pathFinding');
const _ = require('lodash');

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

    async canMakeMoves(debug) {
        tries = 0;
        console.log(games);
        const browser = await puppeteer.launch();
        this.browserWSEndpoint = browser.wsEndpoint();
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
                if (await module.exports.makeMove(html, gameId, page, debug)) {
                    await module.exports.makeRandomMove(html, page);
                }
            }
        });

        await page.close();
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


    async makeMove(site, gameId, page, debug) {
        const $ = cheerio.load(site);
        countryID = $('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1);
        const orderLength = $('table.orders tbody').children().length;
        let supplies = [];
        let resolved = 0;
        await new Promise(resolve => {
            $('table.orders td[class="order"]').each(async function (index) {
                let tr = $(this);
                const spanWords = tr.children('div').children('span[class="orderSegment orderBegin"]').text();
                const terr = spanWords.slice(spanWords.split('at')[0].length + 3).trim();
                const terrID = (await database.getTerritoryByName(gameId, terr)).ID;
                let finder = new PathFinding(database, agent, url, gameId, terrID, -countryID, spanWords.split(' ')[1].trim());
                await finder.init(true, page);
                await finder.findClosestSupply(terrID, countryID, index).then((object) => {
                    supplies[index] = object;
                    resolved++;
                    if (resolved === orderLength) {
                        resolve();
                    }
                });
            });
        });
        supplies = supplies.sort((a, b) => { return a.distance - b.distance; });
        if (debug) {
            module.exports.saveDataSet(supplies);
        }
        supplies = module.exports.extract(supplies);
        console.log("RESULTS");
        console.log(supplies);
        resolved = 0;
        if (supplies.length !== 0) {

            await new Promise(resolve => {
                $('table.orders td[class="order"]').each(async function (index) {
                    let tr = $(this);
                    //removes the default selected option
                    let id = tr.children('div').attr('id');

                    //making the move
                    if (supplies[index].distance !== 0) {
                        await page.select(`div#${id} select[ordertype="type"]`, 'Move');
                        await page.select(`div#${id} span[class="orderSegment toTerrID"] select`, String(supplies[index].id));
                    }
                    resolved++;
                    if (resolved === orderLength) {
                        resolve();
                    }
                });
            });
            await page.$eval('input[name="Ready"]', b => b.click());
            //await page.close();
        }
        return supplies.length === 0;
    },

    saveDataSet(dataSet) {
        const fs = require('fs');
        fs.readdir('./datasets/', (err, files) => {
            let name = files.sort((a, b) => parseInt(b.split('t')[1].split('.')[0]) - parseInt(a.split('t')[1].split('.')[0]))[0];
            name = parseInt(name.split('t')[1].split('.')[0]);
            name++;
            let json = JSON.stringify(dataSet);
            fs.writeFile(`./datasets/Variant${name}.json`, json, 'utf8');
        });

    },


    //extracting the best possible choices for each unit to make to get to the closest supply depot
    extract(array) {
        let maxRow = array.map(row => Math.max.apply(Math, row.map(function (o) { return o.distance; }))); //row with the highest distance in it
        let maxD = Math.max.apply(Math, maxRow.map(function (o) { return o; })); //highest total distance
        let maxI = array.length; //amount of indexes I need to work with and need results for

        let results = [];
        for (let i = 0; i <= maxD; i++) {
            let objects = [];
            //dumps the current distance in the array without including already found indexes
            array.forEach((value, index) => objects[index] = value.filter(a => a.distance === i
                && !results.map(o => o.index).includes(a.index)
                && !results.map(o => o.name.split('(')[0].trim()).includes(a.name.split('(')[0].trim())));
            //getting every unique value at the current distance and adding that in the results
            let xor = _.xorBy(...objects, (e) => e.name.split('(')[0].trim());
            //grouping the duplicates
            let countedXor = _.countBy(_.flatten(xor), e => e.index);
            countedXor = Object.keys(countedXor).map(e => { return { "index": parseInt(e), "value": parseInt(countedXor[e]) }; }).filter(e => e.value > 1);
            //removing any duplicate indexes just in case
            countedXor.forEach(e => {
                let xorFil = xor.filter(a => a.index === e.index);
                while (e.value > 1) {
                    let objectToRemove = xorFil[Math.floor(Math.random() * Math.floor(xorFil.length))];
                    xor = xor.filter(a => a.id !== objectToRemove.id);
                    xorFil = xor.filter(a => a.id !== objectToRemove.id);
                    e.value--;
                }
            });
            results = results.concat(xor);

            //maybe set this in a loop such that the result slowly gets filled?
            objects.forEach((value, index) => objects[index] = value.filter(a => !results.map(o => o.index).includes(a.index)));
            objects = objects.filter(e => e.length !== 0);

            //grouping the duplicates
            let counted = _.countBy(_.flatten(objects), e => e.name.split('(')[0].trim());
            counted = Object.keys(counted).map(e => { return { "name": e, "value": counted[e] }; });
            let resDupTotal = [];

            //going over every grouped duplicate and finding the best combination possible
            for (let dup of counted) {
                for (let d = 0; d < dup.value; d++) {
                    let objectCopy = objects;
                    //getting a duplicate from the array
                    let grabbedDup = _.flatten(objectCopy).filter(e => e.name.split('(')[0].trim() === dup.name)[d];
                    //filtering out other duplicates, same as with the normal xor above
                    objectCopy.forEach((value, index) => objectCopy[index] = value.filter(a => a.index === grabbedDup.index || a.name.split('(')[0].trim() === grabbedDup.name.split('(')[0].trim()));
                    objectCopy = objectCopy.filter(e => e.length !== 0);
                    let xorDup = _.xorBy(...objectCopy, (e) => e.name.split('(')[0].trim());
                    //grouping the duplicates
                    let countedXor = _.countBy(_.flatten(xorDup), e => e.index);
                    countedXor = Object.keys(countedXor).map(e => { return { "index": parseInt(e), "value": parseInt(countedXor[e]) }; }).filter(e => e.value > 1);

                    //removing any duplicate indexes just in case same as above
                    countedXor.forEach(e => {
                        let xorFil = xorDup.filter(a => a.index === e.index);
                        while (e.value > 1) {
                            let objectToRemove = xorFil[Math.floor(Math.random() * Math.floor(xorFil.length))];
                            xorDup = xorDup.filter(a => a.id !== objectToRemove.id);
                            xorFil = xorDup.filter(a => a.id !== objectToRemove.id);
                            e.value--;
                        }
                    });

                    //seeing if this results in the duplicate filtering being done
                    if (xorDup.length + results.length + 1 === maxI) {
                        let totalD = xorDup.reduce((tot, e) => tot + e.distance, 0);
                        resDupTotal.push({ 'totalD': totalD, 'entries': xorDup.push(grabbedDup) });
                    } else {
                        //removing from array all results, xorDup and grabbedDub
                        let nextA = [];
                        array.forEach((value, index) => nextA[index] = value.filter(a =>
                            grabbedDup.name.split('(')[0].trim() !== a.name.split('(')[0].trim()
                            && grabbedDup.index !== a.index
                            && !results.map(o => o.index).includes(a.index)
                            && !results.map(o => o.name.split('(')[0].trim()).includes(a.name.split('(')[0].trim())
                            && !xorDup.map(o => o.index).includes(a.index)
                            && !xorDup.map(o => o.name.split('(')[0].trim()).includes(a.name.split('(')[0].trim())));
                        nextA = nextA.filter(e => e.length !== 0);

                        //going recursive
                        let recursionEnd = module.exports.extract(nextA);
                        let totalD = recursionEnd.reduce((tot, e) => tot + e.distance, 0) + xorDup.reduce((tot, e) => tot + e.distance, 0);
                        //adding it all together
                        xorDup.push(grabbedDup);
                        resDupTotal.push({ 'totalD': parseInt(totalD), 'entries': recursionEnd.concat(xorDup) });
                    }
                }
            }
            //finished the results with the duplicates
            if (resDupTotal.length > 0) {
                //sorting the results of the duplicates and adding to the normal result list
                results = results.concat(resDupTotal.sort((a, b) => a.totalD - b.totalD)[0].entries);
            }

            //checking if done and returning is so
            if (results.length === maxI) {
                results = results.sort((a, b) => a.index - b.index);
                return results;
            }
        }
    }
};