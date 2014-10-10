# How to contribute to Windtalkers

You will need an advanced knowledge of javascript and a working knowledge of a command line, NPM & git. And a Github account of course.

## Workflow
This app uses the fork & pull strategy:

1. Fork the repository.
2. Unless your contributions are minor bugfixes you should [open a issue](https://github.com/remote-wind/windtalkers/issues) 
detailing the proposed changes. You should then reference the issue in your commit(s) adding the issue number to the commit message (ex: #117).
3. Push to your forked repository
4. Issue a [pull request](https://help.github.com/articles/using-pull-requests/).

## Requirements:
-   Node.js
-   NPM

## Getting started

```
    $ git clone git@github.com:remote-wind/windtalkers.git # OR YOUR forked repo!
    $ cd windtalkers
    $ npm install
    $ gulp watch
```

`$ gulp watch` will automatically concatenate the files, compile SASS and run the test suite. 

## Tests 
The tests are written in Mocha and run in the headless browser [Phantom.js](http://phantomjs.org/).

Tests live in the `/test` directory.

`$ gulp watch` will automatically run the test suite when changes are detected.
`$ gulp mocha` will run the test suite once.
 
You can also open [TestRunner.html](TestRunner.html) to run the tests in your browser of choice (Running the tests in IE may not work!)