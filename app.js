var express=require("express");
var bodyParser=require("body-parser");
var mongoose=require("mongoose");
var passport=require("passport");
var LocalStrategy=require("passport-local");
var methodOverride=require("method-override");
var middleware=require("./middleware");
var flash=require("connect-flash");

var Story=require("./models/story");
var Like=require("./models/like");
var Comment=require("./models/comment");
var User=require("./models/user");

var async=require('async');
var nodemailer=require('nodemailer');
var crypto=require('crypto');

var url= process.env.DATABASEURL;// || "mongodb://localhost/storyDB";
mongoose.connect(url, {useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true});

//APP CONFIG
var app=express();

app.set("view engine","ejs");

app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static(__dirname+"/public"));
app.use(methodOverride("_method"));
app.use(flash());

app.use(require("express-session")({
    secret:"This statement needs to be the secret statement",
    resave: false,
    saveUninitialized: false
}));

//PASSPORT Config
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//MIDDLEWARE
app.use(function(req,res,next){
    res.locals.currentUser=req.user;
    res.locals.error=req.flash("error");
    res.locals.success=req.flash("success");
    res.locals.info=req.flash("info");
    next();
})

app.locals.moment=require('moment');

//=========================================================================
//-------- ROUTES ----------
//=========================================================================

app.get("/",function(req,res){
    res.render("landing");
})

// 1. STORY ROUTES
//INDEX
app.get("/stories",function(req,res){
    const regex = new RegExp(escapeRegex(req.query.search), 'gi');
    Story.find({title:regex}, function (err, stories) {
        if (err) {
            console.log(err);
        }
        else {
            res.render("stories/index", { stories: stories, page: 'home'});
        }
    });
})

function escapeRegex(text) {
    if(text){
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }
};

//NEW
app.get("/stories/new",middleware.isLoggedIn,function(req,res){
    res.render("stories/new");
})

//CREATE
app.post("/stories", middleware.isLoggedIn, function(req,res){
    var title=req.body.title;
    var image=req.body.image;
    var storyBody=req.body.storyBody;
    var author={
        id:req.user._id,
        username:req.user.username
    }
    var newStory = {title:title, image:image, storyBody:storyBody, author:author};
    Story.create(newStory, function (err, newlyCreated) {
        if (err) {
            console.log(err);
            req.flash('error', err.message);
            res.redirect('back');
        } else {
            newlyCreated.reads.push(req.user);
            newlyCreated.save();
            req.flash("info","You added a new story: "+newlyCreated.title);
            res.redirect("/stories");
        }
    });
});

//SHOW
app.get("/stories/:id",middleware.isLoggedIn,function(req,res){
    Story.findById(req.params.id).populate("comments likes").exec(function(err,foundStory){
        if(err || !foundStory){
            req.flash("error","Story not found");
            res.redirect("back");
        } else {
            var found = foundStory.reads.find(foundUser => foundUser._id==req.user.id);
            if(!found){
                foundStory.reads.push(req.user);
                foundStory.save();
            }
            var liked=false;
            var like_id;
            foundStory.likes.forEach(function(like){
                if(req.user){
                    if(like.author.id.equals(req.user._id)){
                        liked=true;
                        like_id=like._id;
                    }
                }
            })
            res.render("stories/show",{specificStory:foundStory,liked:liked,like_id:like_id});
        }
    });
})

//EDIT
app.get("/stories/:id/edit", middleware.checkStoryOwnership, function(req,res){
    Story.findById(req.params.id, function(err, foundStory){
        res.render("stories/edit",{story:foundStory});
    })
})

//UPDATE
app.put("/stories/:id", middleware.checkStoryOwnership, function(req,res){
    Story.findByIdAndUpdate(req.params.id, req.body.story, function (err, updatedStory) {
        if (err) {
            req.flash("error", err.message);
            res.redirect("back");
        }
        else {
            req.flash("info", "You updated " + req.body.story.title);
            res.redirect("/stories/" + req.params.id);
        }
    })
})

//DESTROY or DELETE route
app.delete("/stories/:id", middleware.checkStoryOwnership, function(req,res){
    Story.findByIdAndRemove(req.params.id, function(err, story){
        if(err){
            req.flash("error", err.message);
            return res.redirect("back");
        }
        req.flash("info","You deleted "+story.title);
        res.redirect("/stories");
    })
})

//2. COMMENT ROUTES
//NEW
app.get("/stories/:id/comments/new",middleware.isLoggedIn,function(req,res){
    Story.findById(req.params.id, function(err,story){
        if(err){
            console.log(err);
        } else {
            res.render("comments/new", {story: story});
        }
    })
})

//CREATE
app.post("/stories/:id/comments",middleware.isLoggedIn,function(req,res){
    Story.findById(req.params.id, function(err,story){
        if(err){
            console.log(err);
            res.redirect("/stories");
        } else {
            Comment.create(req.body.comment, function(err,comment){
                if(err){
                    console.log(err);
                    res.redirect('/stories/' + stories._id);
                } else {
                    comment.author.id=req.user._id;
                    comment.author.username=req.user.username;
                    comment.save();
                    story.comments.push(comment);
                    story.save();
                    req.flash("info","You added a comment to "+story.title);
                    res.redirect('/stories/' + story._id);
                }
            })
        }
    })
})

//EDIT
app.get("/stories/:id/comments/:comment_id/edit",middleware.checkCommentOwnership,function(req,res){
    Story.findById(req.params.id, function(err,story){
        if(err || !story){
            req.flash("error","Story not found");
            return res.redirect("back");
        }
        Comment.findById(req.params.comment_id,function(err,foundComment){
            if(err){
                res.redirect("back");
            } else {
                res.render("comments/edit",{storyId:req.params.id, comment:foundComment});
            }
        })
    })
})

//UPDATE
app.put("/stories/:id/comments/:comment_id",middleware.checkCommentOwnership,function(req,res){
    var currentStory;
    Story.findById(req.params.id, function(err,story){
        if(err){
            console.log(err);
        } else {
            currentStory=story;
        }
    })
    Comment.findByIdAndUpdate(req.params.comment_id, req.body.comment,function(err,updatedComment){
        if(err){
            res.redirect("back");
        } else {
            req.flash("info","You edited your comment for "+currentStory.title);
            res.redirect("/stories/"+req.params.id);
        }
    })
})

//DELETE or DESTROY
app.delete("/stories/:id/comments/:comment_id",middleware.checkCommentOwnership,function(req,res){
    Story.findById(req.params.id, function(err,story){
        if(err){
            console.log(err);
            res.redirect("back");
        } else {
            Comment.findByIdAndRemove(req.params.comment_id, function(err){
                if(err){
                    res.redirect("back");
                } else {
                    req.flash("info","You deleted your comment for "+story.title);
                    res.redirect("/stories/"+req.params.id);
                }
            })
        }
    })
})

//3. LIKE/DISLIKE ROUTES
//LIKE
app.post("/stories/:id/like",middleware.isLoggedIn,function(req,res){
    Story.findById(req.params.id,function(err,story){
        if(err){
            console.log(err);
            res.redirect("/stories");
        }
        else{
            var author={}
            Like.create(author,function(err,like){
                if(err){
                    console.log(err);
                    res.redirect('/stories/' + story._id);
                }
                else{
                    like.author.id=req.user._id;
                    like.author.username=req.user.username;
                    like.save();
                    story.likes.push(like);
                    story.save();
                    req.flash("info","You liked "+story.title);
                    res.redirect('/stories/' + story._id);
                }
            })
        }
    })
})

//DISLIKE
app.delete("/stories/:id/dislike",middleware.isLoggedIn,function(req,res){
    Story.findById(req.params.id, function (err, story) {
        if (err) {
            console.log(err);
            res.redirect("/stories");
        }
        else {
            Like.findOneAndRemove({'author.id': req.user._id}, function (err, like) {
                if (err) {
                    console.log(err);
                    res.redirect('/stories/' + story._id);
                }
                else {
                    req.flash("info", "You unliked " + story.title);
                    res.redirect('/stories/' + story._id);
                }
            })
        }
    })
})

//AUTHENTICATION ROUTES
// 1. Sign Up Routes
app.get("/register",function(req,res){
    res.render("register",{page:'register'});
})
//sign up logic
app.post("/register",function(req,res){
    var newUser=new User({
            username:req.body.username,
            email:req.body.email,
            firstName:req.body.firstName,
            lastName:req.body.lastName,
            gender:req.body.gender,
            avatar:req.body.avatar
        });
    if(req.body.adminCode === 'secretcode123'){
        newUser.isAdmin=true;
    }
    User.register(newUser,req.body.password,function(err,user){
        if (err) {
            if(err.code=11000){
                err.message='A user with the given email is already registered';
            }
            req.flash("error", err.message);
            res.redirect("/register");
        } else {
            passport.authenticate("local")(req, res, function () {
                req.flash("success", "Successfully signed up!\nWelcome to Stories Web App, " + user.firstName + "!");
                res.redirect("/stories");
            })
        }
    })
})

//2. Login Routes
app.get("/login",function(req,res){
    res.render("login",{page:'login'});
})
//login logic
app.post("/login",passport.authenticate("local",{
    failureRedirect: "/login",
    failureFlash: true
}),function(req,res){
    req.flash("success","Welcome back, "+req.user.firstName+"!");
    res.redirect("/stories");
})

//3. Logout Routes
app.get("/logout", function(req,res){
    req.logout();
    req.flash("success","You have been successfully logged out!");
    res.redirect("/stories");
})

//4. Forgot Password
app.get('/forgot',function(req,res){
    res.render('users/forgot');
})

app.post('/forgot',function(req,res,next){
    async.waterfall([
        function(done){
            crypto.randomBytes(20, function(err,buf){
                var token=buf.toString('hex');
                done(err,token);
            });
        },
        function(token,done){
            User.findOne({email:req.body.email},function(err,user){
                if(!user){
                    req.flash('error','No account with that email address exist');
                    return res.redirect('/forgot');
                }

                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 3600000;

                user.save(function(err){
                    done(err, token, user);
                });
            });
        },
        function(token,user,done){
            var smtpTransport=nodemailer.createTransport({
                service: 'gmail',
                auth:{
                    user: 'akmishra5514@gmail.com',
                    pass: process.env.GMAILPWD
                }
            });
            var mailOptions={
                to: user.email,
                from: 'akmishra5514@gmail.com',
                subject: 'Story Web App Password Reset',
                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                      'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                      'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                      'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            smtpTransport.sendMail(mailOptions,function(err){
                console.log('Mail sent');
                req.flash('success','An e-mail has been sent to '+ user.email + ' with further instructions.');
                done(err,'done');
            });
        }
    ], function(err){
        if(err){
            return next(err);
        }
        res.redirect('/forgot');
    })
})

app.get('/reset/:token', function(req,res){
    User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires: {$gt: Date.now()}}, function(err,user){
        if(!user){
            req.flash('error','Password reset token is invalid or has expired.');
            return res.redirect('/forgot');
        }
        res.render('users/reset',{token: req.params.token});
    })
})

app.post('/reset/:token', function(req, res) {
    async.waterfall([
      function(done) {
        User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
          if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('back');
          }
          if(req.body.password === req.body.confirm) {
            user.setPassword(req.body.password, function(err) {
              user.resetPasswordToken = undefined;
              user.resetPasswordExpires = undefined;
  
              user.save(function(err) {
                req.logIn(user, function(err) {
                  done(err, user);
                });
              });
            })
          } else {
              req.flash("error", "Passwords do not match.");
              return res.redirect('back');
          }
        });
      },
      function(user, done) {
        var smtpTransport = nodemailer.createTransport({
          service: 'gmail', 
          auth: {
            user: 'akmishra5514@gmail.com',
            pass: process.env.GMAILPWD
          }
        });
        var mailOptions = {
          to: user.email,
          from: 'akmishra5514@gmail.com',
          subject: 'Your password has been changed',
          text: 'Hello,\n\n' +
            'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
        };
        smtpTransport.sendMail(mailOptions, function(err) {
          req.flash('success', 'Success! Your password has been changed.');
          done(err);
        });
      }
    ], function(err) {
      res.redirect('/stories');
    });
  });

//5. User Profile
app.get("/users/:id",middleware.isLoggedIn,function(req,res){
    User.findById(req.params.id,function(err,foundUser){
        if(err){
            req.flash("error","Something went wrong!");
            res.redirect("/stories");
        }
        Story.find().where('author.id').equals(foundUser._id).exec(function(err,stories){
            if(err){
                console.log(err);
                res.redirect("/stories");
            }
            res.render("users/show",{user:foundUser,stories:stories});
        })
    })
})

//SERVER LISTEN
app.listen(process.env.PORT || 3000,function(){
    console.log("The Server has started");
})