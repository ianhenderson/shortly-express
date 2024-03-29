var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bcrypt = require('bcrypt');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();
app.use(express.cookieParser());
app.use(express.session({secret: 'anystring'}));

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(partials());
  app.use(express.bodyParser())
  app.use(express.static(__dirname + '/public'));
});

var checkUser = function(req, res, pathname){
  new User({sessionId: req.cookies.sessionId}).fetch().then(function(user){
    if (user){
      res.render(pathname);
    } else {
      res.redirect('/login');
    }
  });
};

app.get('/', function(req, res) {
  checkUser(req, res, 'index');
});

app.get('/create', function(req, res) {
  checkUser(req, res, 'index');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/links', function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/signup', function(req, res){
  bcrypt.hash(req.body.password, 8, function(err, hash){
    new User({username: req.body.username, password: hash}).save().then(function(newuser){
      res.redirect('/login');
    });
  });
});

app.post('/login', function(req, res){
  new User({username: req.body.username}).fetch().then(function(found){
    if (!found){
      res.redirect('/login');
    } else {
      bcrypt.compare(req.body.password, found.get('password'), function(err, resp){
        if (!resp){
          res.redirect('/login');
        } else {
          bcrypt.hash(Math.random().toString(), 8, function(err,hash){
            found.set({sessionId: hash}).save().then(function(user){
              res.cookie('sessionId', hash);
              res.redirect('/index');
            });
          });
        }
      });
    }
  });
});

app.post('/logout', function(req, res){
  var token = req.cookies.sessionId;
  new User({sessionId: token}).fetch().then(function(user){
    user.set({sessionId: null}).save().then(function(user){
      res.cookie('sessionId', null);
      res.redirect('/');
    });
  });
});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
