const express = require('express');
const app = express();
const simpleGit = require('simple-git')();
const bodyParser = require('body-parser');

app.use(bodyParser.json());

app.post('/pull-github-changes', (req, res) => {
    simpleGit.pull('origin', 'main', (err, update) => {
        if (err) {
            return res.status(500).send('Pull failed');
        }
        res.status(200).send('Pull successful');
    });
});

app.listen(200, () => {
    console.log('Server is listening on port 200');
});
