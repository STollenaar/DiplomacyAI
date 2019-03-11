const cheerio = require('cheerio');
const request = require('superagent');
const database = require('./database');
const url = 'https://webdiplomacy.net/';
let input = process.openStdin();

let site;





input.addListener("data", function (d) {
    d = d.toString().trim().split(" ");

    switch (d[0]) {
        case "addUser":
            //adds a user to the db
            database.addUser(d[1], d[2]);
            break;
        case "login":
            //login in
            database.getUser(function (r) {
                request.post(`${url}logon.php`).type('form').send({ loginuser: r.username }).send({ loginpass: r.password }).then(function (response) {
                    site = response.text;
                    printUser();
                });
            });
            break;
        case "logout":
            const $ = cheerio.load(site);
            request.get(`${url}logon.php?logoff=on`).then(function (response) {
                site = response.text;
                printUser();
            });
            break;
        case "user":
            printUser();
            break;
    }

});

function printUser() {
    if (site === undefined) {
        console.log("site not set");
        return;
    }

    const $ = cheerio.load(site);
    const user = $('#header-welcome').text();
    console.log(user);
}