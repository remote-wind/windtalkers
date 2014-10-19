"use strict";

var gulp = require('gulp');
var plugins = require('gulp-load-plugins')({ camelize: true }); // will load any "gulp-" modules.

gulp.task('sass', function () {
    gulp.src('./src/styles/*.scss')
        .pipe(plugins.sass())
        .pipe(gulp.dest('./build/css'));
});

gulp.task('browserify', function(){
    gulp.src('./src/js/windtalkers/windtalkers.js')
        .pipe(plugins.plumber())
        .pipe(plugins.browserify({
            insertGlobals : true,
            debug : process.env.NODE_ENV !== 'production',
            paths: ['./node_modules', './src/js']
        }))
        .pipe(gulp.dest('./build/js'))
});

gulp.task('watch', function(){
    gulp.watch(['./src/js/**/**'], ['browserify']);
    gulp.watch(['./src/styles/**/**.scss'], ['sass']);
});