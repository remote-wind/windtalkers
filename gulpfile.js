var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();
var package = require('./package.json');
var notifier = require('node-notifier')();
var gutil = plugins.util;
var mochaPhantomJS = require('gulp-mocha-phantomjs');

gulp.task('default', function() {
});

gulp.task('mocha', function(){
    gulp.src('./test/tests.js')
        .pipe(plugins.browserify({
            insertGlobals : true,
            debug : true
        }))
        .pipe(plugins.rename(function(path){
            path.basename += '_browserified'
        }))
        .pipe(gulp.dest('./tmp'));

    gulp.src('TestRunner.html')
        .pipe(mochaPhantomJS(
            {
                reporter: 'spec'
            }
        ))
});

gulp.task('browserify', function(){
    gulp.src('./src/js/windtalkers.js')
        .pipe(plugins.browserify({
            insertGlobals : true,
            debug : process.env.NODE_ENV !== 'production'
        }))
        .pipe(gulp.dest('./build/js'))
});

gulp.task('watch', function(){
    gulp.watch(['./test/**/**.js', './src/js/**/**.js'], ['browserify', 'mocha']);
});


