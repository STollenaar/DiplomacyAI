let agent;
let cheerio;
let url;
let games = [];
let site;
let move;

module.exports = {

    init(u, a,c, m) {
        url = u;
        agent = a;
        cheerio = c;
        move = m;
    },

    updateSite(s) {
        site = s;
    },

    stateParser(smallId, bigId, index) {
        turl = `${url}/cache/games/${smallId}/${bigId}/${index}-json.map`;
        agent.get(turl).then(function (response) {
            const $ = cheerio.load(response.text);
            let units = JSON.parse(response.text.split(' ')[4].split('(')[1].split(')')[0]);
            let terrs = JSON.parse(response.text.split(' ')[6].split(';')[0]);

            //making custom object map
            let unitMap = new Map();
            for (let u in units) {
                let unit = {};
                unit.countryID = units[u].countryID;
                unit.type = units[u].type;
                unit.terrID = units[u].terrID;
                unitMap.set(u, unit);
            }

            let terrMap = new Map();
            for (let t in terrs) {
                t = terrs[t];
                let terr = {};
                terr.standoff = t.standoff;
                terr.occupiedFromTerrID = t.occupiedFromTerrID;
                terr.unitID = t.unitID;
                terr.ownerCountryID = t.ownerCountryID;
                terrMap.set(t.id, terr);
            }

            info = { unitMap, terrMap };
            console.log(unitMapS);

        });
    },

    gameFinder() {
        //site is set to the profile page
        let $ = cheerio.load(site);
        games = [];
        //going to loop over every game you are in
        $('div.gamelistings-tabs a').each(function () {
            let game = {};
            //gets the main id needed from each game from the open link
            game.bigId = $(this).attr('gameid');
            //quick navigation to that game
            agent.get(`${url}board.php?gameID=${game.bigId}#gamePanel`).then(function (r) {
                const $2 = cheerio.load(r.text); //just loads that game page into cheerio
                game.smallId = $2('#mapImage').attr('src').split('/')[2]; //get the small id from the image src
                games.push(game);//adding to the list
                move.updateGames(games);
                console.log(game);
            });
           
        });
    }
};