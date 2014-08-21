var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();
var package = require('./package.json');

gulp.task('default', function() {
  // place code for your default task here
});

gulp.task('browserify', function(){
    gulp.src('src/js/windtalkers.js')
        .pipe(plugins.browserify({
            insertGlobals : true,
            debug : process.env.NODE_ENV !== 'production'
        }))
        .pipe(gulp.dest('./build/js'))
});