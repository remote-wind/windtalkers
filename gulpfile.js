var gulp = require('gulp');
var plugins = require('gulp-load-plugins')({
    camelize: true
});

var package = require('./package.json');

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
    gulp.watch(['./test/**/**.js', './src/js/**/**.js'], ['browserify', 'mocha']);
});