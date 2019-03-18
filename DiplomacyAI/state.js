let agent;
let cheerio;
let url;
let games = [];
let site;

module.exports = {

    init(u, a,c) {
        url = u;
        agent = a;
        cheerio = c;
    },

    updateSite(s) {
        site = s;
    },

    stateParser(smallId, bigId, index) {
        turl = `${url}/cache/games/${smallId}/${bigId}/${index}-json.map`;
        agent.get(turl).then(function (response) {
            const $ = cheerio.load(response.text);
            let units = JSON.parse(response.text.split(' ')[4].split('(')[1].split(')')[0]);
            let terr = JSON.parse(response.text.split(' ')[6].split(';')[0]);

            info = { units, terr };

        });
    },

    gameFinder() {
        //site is set to the profile page
        let $ = cheerio.load(site);
        games = [];
        //going to loop over every game you are in
        $('div.enterBarOpen a').each(function () {
            let game = {};
            //gets the main id needed from each game from the open link
            game.bigId = $(this).attr('href').split('=')[1].split('#')[0];
            //quick navigation to that game
            agent.get(`${url}board.php?gameID=${game.bigId}#gamePanel`).then(function (r) {
                const $2 = cheerio.load(r.text); //just loads that game page into cheerio
                game.smallId = $2('#mapImage').attr('src').split('/')[2]; //get the small id from the image src
                console.log(game);
                games.push(game);//adding to the list
            });
        });
        console.log(games);
    }
};