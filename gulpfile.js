"use strict";

var gulp = require('gulp');
var plugins = require('gulp-load-plugins')({
    camelize: true
});

gulp.task('default', function(){
});

gulp.task('mocha', function(){
    gulp.src('./test/tests.js')
        .pipe(plugins.plumber())
        .pipe(plugins.browserify({
            insertGlobals : true,
            debug : true
        }))
        .pipe(plugins.rename(function(path){
            path.basename += '_browserified'
        }))
        .pipe(gulp.dest('./tmp'));

    gulp.src('TestRunner.html')
        .pipe(plugins.plumber())
        .pipe(plugins.mochaPhantomjs(
            {
                reporter: 'spec'
            }
        ));
});


gulp.task('sass', function () {
    gulp.src('./src/styles/*.scss')
        .pipe(plugins.sass())
        .pipe(gulp.dest('./build/css'));
});


gulp.task('browserify', function(){
    gulp.src('./src/js/windtalkers.js')
        .pipe(plugins.plumber())
        .pipe(plugins.browserify({
            insertGlobals : true,
            debug : process.env.NODE_ENV !== 'production'
        }))
        .pipe(gulp.dest('./build/js'))
});

gulp.task('watch', function(){
    gulp.watch(['./TestRunner.html','./test/**/**', './src/js/**/**'], ['browserify', 'mocha']);
    gulp.watch(['./src/styles/*.scss'], ['sass']);
});